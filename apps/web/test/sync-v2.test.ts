import { test } from "node:test";
import assert from "node:assert/strict";
import { pullV2, pushV2, resolveConflict } from "../src/lib/sync/v2";
import { pullChanges } from "../src/lib/sync/pull";
import { validateMutation } from "../src/lib/sync/mutations";
import { computeStatus, type DueInput } from "../src/lib/due/engine";
import type { Db } from "../src/lib/writes";

// Sync protocol v2 (09 §5): cursors, idempotent push, conflict records, viewer
// writes. A minimal Supabase stand-in answers by table and records writes.

type Row = Record<string, unknown>;
function fake(o: { editor?: boolean; feed?: Row[]; rows?: Record<string, Row[]>; ledger?: Row[]; gap?: Row; ledgerError?: boolean; recordError?: boolean }) {
  const writes: { table: string; op: string; patch: unknown }[] = [];
  const from = (table: string) => {
    let op = "select";
    let patch: unknown = null;
    let gtSeq: number | null = null;
    let inIds: unknown[] | null = null;
    const run = async (single: boolean) => {
      if (op !== "select") writes.push({ table, op, patch });
      let data: unknown = null;
      if (table === "aircraft") data = [{ id: "ac" }];
      else if (table === "change_log") data = (o.feed ?? []).filter((r) => gtSeq == null || (r.seq as number) > gtSeq);
      else if (table === "sync_mutation") data = op === "select" ? o.ledger ?? [] : single ? { id: "m" } : null;
      else if (table === "logbook_gap") data = o.gap ? { ...o.gap, ...(patch as object) } : null;
      else if (table === "squawk" && op !== "select") data = { id: "sq", ...(patch as object) };
      else data = (o.rows?.[table] ?? []).filter((r) => !inIds || inIds.includes(r.id));
      if (single && Array.isArray(data)) data = data[0] ?? null;
      return { data, error: table === "sync_mutation" && op === "select" && o.ledgerError ? { message: "ledger unavailable" } : null };
    };
    const q = {
      select: () => q, eq: () => q, order: () => q, limit: () => q, or: () => q, is: () => q, range: () => q,
      gt: (_c: string, v: number) => ((gtSeq = v), q),
      in: (_c: string, v: unknown[]) => ((inIds = v), q),
      update: (p: unknown) => ((op = "update"), (patch = p), q),
      upsert: (p: unknown) => ((op = "upsert"), (patch = p), q),
      insert: (p: unknown) => ((op = "insert"), (patch = p), q),
      maybeSingle: () => run(true),
      single: () => run(true),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run(false).then(res, rej),
    };
    return q;
  };
  const rpc = async (name: string, args: Row = {}): Promise<{ data: unknown; error: null | { message: string } }> => {
    if (name === "apply_sync_write") return rpc(args.p_operation as string, args.p_arguments as Row);
    if (name === "create_squawk") {
      writes.push({ table: "squawk", op: "insert", patch: args.p_fields });
      return { data: { status: "ok", row: args.p_fields }, error: null };
    }
    if (name === "insert_records") {
      const rows = args.p_rows as Row[];
      writes.push({ table: args.p_table as string, op: "insert", patch: rows });
      return { data: { status: "ok", row: rows[0] ?? null }, error: null };
    }
    if (name === "write_record") {
      const row = o.gap;
      if (!row) return { data: { status: "error", message: "Not found" }, error: null };
      if (row.updated_at !== args.p_base) return { data: { status: "conflict", row }, error: null };
      writes.push({ table: args.p_table as string, op: "update", patch: args.p_patch });
      return { data: { status: "ok", row: { ...row, ...args.p_patch as Row } }, error: null };
    }
    if (name === "record_sync_result") {
      if (o.recordError) return { data: null, error: { message: "receipt unavailable" } };
      const m = args.p_mutation as Row, result = args.p_result as Row;
      const prior = o.ledger?.find((r) => r.id === m.id);
      const resolves = prior?.status === "conflict" && result.status === "ok";
      writes.push({ table: "sync_mutation", op: "upsert", patch: { ...m, ...result,
        ...(resolves ? { resolution: args.p_resolution ?? "keep_mine", resolved_at: "now" } : {}),
      } });
      return { data: result, error: null };
    }
    return { data: o.editor !== false, error: null };
  };
  const db = { from, rpc } as unknown as Db;
  return { db, writes };
}

const change = (seq: number, table = "squawk", row_id = `r${seq}`, op = "U") => ({ seq, table_name: table, row_id, op });

test("pull: the cursor is the max seq returned and never moves backwards", async () => {
  const { db } = fake({ feed: [change(5), change(9), change(12, "squawk", "r5")], rows: { squawk: [{ id: "r5" }, { id: "r9" }] } });
  const page = await pullChanges(db, "u", 4, 500);
  assert.ok(!("error" in page));
  assert.equal(page.nextCursor, 12);
  assert.equal(page.hasMore, false);
  // r5 collapsed to its latest change; the feed stays in seq order.
  assert.deepEqual(page.changes.map((c) => [c.id, c.seq, c.op]), [["r9", 9, "upsert"], ["r5", 12, "upsert"]]);
  const empty = await pullChanges(fake({ feed: [] }).db, "u", 12, 500);
  assert.ok(!("error" in empty) && empty.nextCursor === 12, "an empty page keeps the cursor");
});

test("pull: a row the caller can no longer see comes back as a delete", async () => {
  const page = await pullChanges(fake({ feed: [change(3)], rows: { squawk: [] } }).db, "u", 0, 500);
  assert.ok(!("error" in page));
  assert.equal(page.changes[0].op, "delete");
});

test("pull v2: a cursor older than retained history gets 410 resync_required; cursor 0 is the rebuild", async () => {
  const { db } = fake({ feed: [change(50)], rows: { squawk: [{ id: "r50" }] } });
  const stale = await pullV2(db, "u", 10, 500, 40);
  assert.equal(stale.status, 410);
  assert.equal((stale.body as { code: string }).code, "resync_required");
  const rebuild = await pullV2(db, "u", 0, 500, 40);
  assert.equal(rebuild.status, 200);
  assert.ok("serverTime" in rebuild.body && "minAppVersion" in rebuild.body);
  assert.equal((await pullV2(db, "u", 40, 500, 40)).status, 200, "the retained boundary itself is served");
});

const gap = { id: "g", aircraft_id: "ac", status: "open", note: null, updated_at: "2026-11-18T10:00:00.000Z" };
const setGap = (id: string, base: string) => ({ id, type: "gap.setStatus", aircraftId: "ac", payload: { gapId: "g", status: "dismissed" }, base });

test("push v2: duplicate IDs and failed receipt reads run no writes", async () => {
  const repeated = fake({ gap });
  assert.equal((await pushV2(repeated.db, "u", { mutations: [setGap("same", gap.updated_at), setGap("same", gap.updated_at)] })).status, 400);
  assert.deepEqual(repeated.writes, []);
  const unavailable = fake({ gap, ledgerError: true });
  assert.equal((await pushV2(unavailable.db, "u", { mutations: [setGap("one", gap.updated_at)] })).status, 500);
  assert.deepEqual(unavailable.writes, []);
});

test("push v2: a receipt write failure is retryable instead of acknowledging a lost response", async () => {
  const f = fake({ gap, recordError: true });
  assert.equal((await pushV2(f.db, "u", { mutations: [setGap("one", gap.updated_at)] })).status, 500);
});

test("push v2: replay returns its acknowledged row and refuses an ID reused for other data", async () => {
  const m = setGap("one", gap.updated_at);
  const row = { ...gap, status: "dismissed", updated_at: "next" };
  const f = fake({ ledger: [{ id: m.id, status: "ok", request: m, response: { id: m.id, status: "ok", row } }] });
  const replay = await pushV2(f.db, "u", { mutations: [m] });
  assert.deepEqual((replay.body as { results: Row[] }).results[0].row, row);
  const reused = await pushV2(f.db, "u", { mutations: [{ ...m, payload: { ...m.payload, status: "open" } }] });
  assert.equal((reused.body as { results: Row[] }).results[0].status, "error");
  assert.deepEqual(f.writes, []);
});

test("push v2: a mutation id that already landed answers ok without writing again", async () => {
  const { db, writes } = fake({ gap, ledger: [{ id: "m1", status: "ok", resolved_at: null }] });
  const r = await pushV2(db, "u", { mutations: [setGap("m1", gap.updated_at)] });
  assert.equal(r.status, 200);
  assert.deepEqual((r.body as { results: unknown[] }).results, [{ id: "m1", status: "ok", row: null, replayed: true }]);
  assert.equal(writes.filter((w) => w.table === "logbook_gap").length, 0);
});

test("push v2: a stale base is a conflict, recorded in the ledger, and nothing is written", async () => {
  const { db, writes } = fake({ gap: { ...gap, status: "no_pages_exist" } });
  const r = await pushV2(db, "u", { mutations: [setGap("m2", "2026-11-18T09:00:00.000Z")] });
  const [res] = (r.body as { results: { status: string; code?: string; row?: Row }[] }).results;
  assert.equal(res.status, "conflict");
  assert.equal(res.code, "conflict");
  assert.equal(res.row?.status, "no_pages_exist", "the server row comes back for the yours/theirs screen");
  assert.equal(writes.filter((w) => w.table === "logbook_gap").length, 0);
  const ledger = writes.find((w) => w.table === "sync_mutation")!.patch as Row;
  assert.equal(ledger.status, "conflict");
  assert.equal(ledger.id, "m2");
  assert.ok(!("resolved_at" in ledger));
});

test("push v2: re-pushing a conflicted change with the new base lands and closes the record", async () => {
  const { db, writes } = fake({ gap, ledger: [{ id: "m2", status: "conflict", resolved_at: null }] });
  const r = await pushV2(db, "u", { mutations: [{ ...setGap("m2", gap.updated_at), resolution: "keep_both" }] });
  assert.equal((r.body as { results: { status: string }[] }).results[0].status, "ok");
  const ledger = writes.find((w) => w.table === "sync_mutation")!.patch as Row;
  assert.equal(ledger.status, "ok");
  assert.equal(ledger.resolution, "keep_both");
  assert.ok(ledger.resolved_at);
});

test("push v2: a viewer's edit is refused with viewer_read_only; a viewer may still report a squawk", async () => {
  const { db, writes } = fake({ editor: false, gap });
  const r = await pushV2(db, "u", {
    mutations: [setGap("m3", gap.updated_at), { id: "m4", type: "squawk.create", aircraftId: "ac", payload: { id: "sq", description: "Left brake soft" } }],
  });
  const [edit, squawk] = (r.body as { results: { status: string; code?: string; error?: string }[] }).results;
  assert.deepEqual([edit.status, edit.code, edit.error], ["error", "viewer_read_only", "You don't have edit access to this aircraft."]);
  assert.equal(squawk.status, "ok");
  assert.equal(writes.filter((w) => w.table === "logbook_gap").length, 0);
  assert.equal(writes.filter((w) => w.table === "squawk").length, 1);
});

test("push v2: a malformed envelope is a 400 with a code; a bad mutation fails alone", async () => {
  assert.equal((await pushV2(fake({}).db, "u", { nope: 1 })).status, 400);
  const r = await pushV2(fake({ gap }).db, "u", { mutations: [{ id: "x", type: "made.up", aircraftId: "ac" }, setGap("m5", gap.updated_at)] });
  const results = (r.body as { results: { status: string; code?: string }[] }).results;
  assert.deepEqual(results.map((x) => [x.status, x.code ?? null]), [["error", "invalid"], ["ok", null]]);
});

test("conflict resolve: only take_theirs or discard are reported; keeping yours is a re-push", async () => {
  assert.equal((await resolveConflict(fake({}).db, "u", "m2", "keep_mine")).status, 400);
  assert.equal((await resolveConflict(fake({}).db, "u", "m2", "take_theirs")).status, 200);
});

test("the phase 3 capture types are queueable, need no base, and are not online-only", () => {
  for (const type of ["page.register", "batch.create", "page.duplicateDecision"]) {
    assert.ok("ok" in validateMutation({ id: "m", type, aircraftId: "ac", payload: {} }), type);
  }
});

test("unconfirmed gate: pages waiting in the reading queue and their AI-read entries move nothing", () => {
  const input: DueInput = {
    aircraft: { id: "ac", tail_number: "N734DM" },
    logbook: [{ id: "lb", type: "airframe" }],
    maintenance_item: [{ id: "mx-annual", kind: "annual", label: "Annual", regulatory: true, interval_months: 12, interval_hours: null, last_done_date: "2025-12-01", last_done_hours: null }],
    item_completion: [{ id: "c0", maintenance_item_id: "mx-annual", ad_compliance_id: null, log_entry_id: null, done_date: "2025-12-01", done_hours: null }],
    log_entry: [],
    hours_reading: [],
  };
  const queued: DueInput = {
    ...input,
    page: [
      { id: "p1", logbook_id: "lb", page_sequence: 1, extraction_status: "queued" },
      { id: "p2", logbook_id: "lb", page_sequence: 2, extraction_status: "waiting_allowance" },
    ],
    log_entry: [{ id: "ai", logbook_id: "lb", page_id: "p2", entry_date: "2026-11-01", tach: 2300, trust: "ai_read" }],
    item_completion: [...input.item_completion!, { id: "c", maintenance_item_id: "mx-annual", ad_compliance_id: null, log_entry_id: "ai", done_date: "2026-11-01", done_hours: 2300 }],
  };
  const a = computeStatus(input, "2026-11-18");
  const b = computeStatus(queued, "2026-11-18");
  assert.deepEqual(b.items.map((i) => [i.key, i.status, i.lastDone]), a.items.map((i) => [i.key, i.status, i.lastDone]));
  assert.deepEqual(b.meters, a.meters);
});
