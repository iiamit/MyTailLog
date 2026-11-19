import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as visits from "../src/lib/writes/visits";
import * as providers from "../src/lib/writes/providers";
import * as squawks from "../src/lib/writes/squawks";
import * as documents from "../src/lib/writes/documents";
import * as timeChecks from "../src/lib/writes/timeChecks";
import { pickPhotoReading } from "../src/lib/writes/meters";
import { writes, PHASE4_MUTATIONS, type Db } from "../src/lib/writes";
import { computeTimeChecks, isDigitSwap, type TimeCheckInput } from "../src/lib/timeCheck";
import { newLinkToken, isLinkToken, pickLinkInput, linkMailto, linkActive } from "../src/lib/mechanicLink";

// ---------------------------------------------------------------------------
// A small in-memory Supabase stand-in: rows per table, the filters these writes use, and
// can_edit_aircraft answering `editor`. Every insert/update/delete/upsert is recorded.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
function fake(editor: boolean, tables: Record<string, Row[]> = {}) {
  const log: { table: string; op: string; value?: unknown }[] = [];
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let op: { kind: "select" | "update" | "delete" | "insert" | "upsert"; value?: unknown; opts?: { onConflict?: string; ignoreDuplicates?: boolean } } = { kind: "select" };
    const run = () => {
      const hit = () => rows.filter((r) => filters.every((f) => f(r)));
      if (op.kind === "select") return hit();
      if (op.kind === "update") { const h = hit(); h.forEach((r) => Object.assign(r, op.value)); log.push({ table, op: "update", value: op.value }); return h; }
      if (op.kind === "delete") { const h = hit(); h.forEach((r) => rows.splice(rows.indexOf(r), 1)); log.push({ table, op: "delete" }); return h; }
      const list = (Array.isArray(op.value) ? op.value : [op.value]) as Row[];
      const out: Row[] = [];
      for (const v of list) {
        const keys = op.opts?.onConflict?.split(",") ?? ["id"];
        const dup = rows.find((r) => keys.every((k) => v[k] !== undefined && r[k] === v[k]));
        if (dup && op.kind === "upsert" && op.opts?.ignoreDuplicates) continue;
        if (dup) { Object.assign(dup, v); out.push(dup); continue; }
        const row = { id: `gen-${rows.length + 1}`, updated_at: "2026-11-18T10:00:00.000Z", ...v };
        rows.push(row);
        out.push(row);
      }
      log.push({ table, op: op.kind, value: op.value });
      return out;
    };
    const q: Record<string, unknown> = {
      select: () => q, order: () => q, range: () => q, limit: () => q,
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
      neq: (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return q; },
      in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return q; },
      is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return q; },
      not: (k: string, _o: string, v: string) => { filters.push((r) => !String(r[k]).startsWith(v.replace("%", ""))); return q; },
      lt: (k: string, v: string) => { filters.push((r) => String(r[k]) < v); return q; },
      gte: (k: string, v: string) => { filters.push((r) => String(r[k]) >= v); return q; },
      update: (v: unknown) => { op = { kind: "update", value: v }; return q; },
      delete: () => { op = { kind: "delete" }; return q; },
      insert: (v: unknown) => { op = { kind: "insert", value: v }; return q; },
      upsert: (v: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => { op = { kind: "upsert", value: v, opts }; return q; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (x: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    };
    return q;
  };
  const db = { rpc: async () => ({ data: editor }), from } as unknown as Db;
  return { db, log, tables, writes: () => log.filter((l) => l.op !== "select") };
}
const ctx = { aircraftId: "ac", userId: "u" };
const NO_EDIT = { status: "error", message: "You don't have edit access to this aircraft.", httpStatus: 403 };
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---------------------------------------------------------------------------
// RLS-equivalent role rule (09 §5.3): viewers write nothing but a squawk report, a photo on their own squawk.
// ---------------------------------------------------------------------------

test("viewers are refused every phase 4 write, and nothing is written", async () => {
  const seed = () => ({
    planned_visit: [{ id: "v", aircraft_id: "ac", status: "planned", week_of: "2026-12-07", visit_date: null, updated_at: "2026-11-18T10:00:00.000Z" }],
    service_provider: [{ id: "p", aircraft_id: "ac", name: "M. Torres", kind: "mechanic", is_default: false, updated_at: "2026-11-18T10:00:00.000Z" }],
    document: [{ id: "d", aircraft_id: "ac", type: "insurance", updated_at: "2026-11-18T10:00:00.000Z" }],
    squawk: [{ id: "s", aircraft_id: "ac", reported_by: "someone-else" }],
    squawk_photo: [{ id: "ph", aircraft_id: "ac", squawk_id: "s", created_by: "someone-else", updated_at: "2026-11-18T10:00:00.000Z" }],
    log_entry: [{ id: "e", aircraft_id: "ac" }],
  });
  const base = "2026-11-18T10:00:00.000Z";
  const calls: [string, (db: Db) => Promise<unknown>][] = [
    ["visit.create", (db) => visits.create(db, ctx, { id: "v2", weekOf: "2026-12-07", itemKeys: [] })],
    ["visit.update", (db) => visits.update(db, ctx, { visitId: "v", notes: "x" }, base)],
    ["visit.setStatus", (db) => visits.setStatus(db, ctx, { visitId: "v", status: "in_shop" }, base)],
    ["visitSuggestion.dismiss", (db) => visits.dismissSuggestion(db, ctx, { id: "x", suggestionKey: "0123456789abcdef" })],
    ["provider.upsert", (db) => providers.upsert(db, ctx, { fields: { name: "AeroCheck", kind: "avionics_shop" } })],
    ["provider.delete", (db) => providers.remove(db, ctx, { providerId: "p" }, base)],
    ["document.setExpiry", (db) => documents.setExpiry(db, ctx, { documentId: "d", trackExpiry: true, expiresOn: "2027-01-01" }, base)],
    ["timeCheck.dismiss", (db) => timeChecks.dismiss(db, ctx, { id: "t", component: "engine", entryId: "e", written: 1, calculated: 2, action: "agree" })],
    ["squawkPhoto.delete (someone else's)", (db) => squawks.removePhoto(db, ctx, { photoId: "ph" }, base)],
  ];
  for (const [name, call] of calls) {
    const f = fake(false, seed());
    assert.deepEqual(await call(f.db), NO_EDIT, name);
    assert.equal(f.writes().length, 0, `${name} wrote`);
  }
  const f = fake(false, seed());
  const photo = await squawks.addPhoto(f.db, ctx, { id: "photo-0001", squawkId: "s", blobId: "photo-0001" });
  assert.equal(photo.status, "error", "a viewer cannot add a photo to someone else's squawk");
  assert.equal(f.writes().length, 0);
});

test("viewers may report a squawk and add a photo to their own", async () => {
  const f = fake(false, { profile: [{ id: "u", full_name: "Pat Viewer" }] });
  const r = await squawks.create(f.db, ctx, { id: "sq-1", description: "Left brake soft", severity: "medium", photoBlobIds: ["blob-0001"] });
  assert.equal(r.status, "ok");
  const photo = f.tables.squawk_photo[0];
  assert.equal(photo.storage_path, "ac/squawks/sq-1/blob-0001.jpg");
  assert.equal(photo.created_by, "u");
  // A retry is a no-op (same photo id).
  assert.equal((await squawks.addPhoto(f.db, ctx, { id: "blob-0001", squawkId: "sq-1", blobId: "blob-0001" })).status, "ok");
  assert.equal(f.tables.squawk_photo.length, 1);
  // Unsafe ids never reach a storage path.
  assert.equal((await squawks.addPhoto(f.db, ctx, { id: "../../x", squawkId: "sq-1", blobId: "../../etc" })).status, "error");
});

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

test("visit rules: transitions, Monday weeks, day inside the week, item keys", () => {
  assert.ok(visits.canMoveVisit("planned", "in_shop") && visits.canMoveVisit("planned", "cancelled"));
  assert.ok(!visits.canMoveVisit("planned", "done") && !visits.canMoveVisit("planned", "awaiting_records"));
  assert.ok(visits.canMoveVisit("in_shop", "awaiting_records") && visits.canMoveVisit("in_shop", "done"));
  assert.ok(visits.canMoveVisit("awaiting_records", "done") && visits.canMoveVisit("awaiting_records", "cancelled"));
  assert.ok(!visits.canMoveVisit("done", "planned") && !visits.canMoveVisit("cancelled", "planned"));
  assert.ok("error" in visits.pickVisitFields({ weekOf: "2026-12-08" }), "a Tuesday");
  assert.ok("fields" in visits.pickVisitFields({ weekOf: "2026-12-07", visitDate: "2026-12-13" }));
  assert.ok("error" in visits.pickVisitFields({ weekOf: "2026-12-07", visitDate: "2026-12-14" }));
  assert.ok("error" in visits.pickVisitFields({ notes: "x".repeat(2001) }));
  assert.ok("error" in visits.pickItemKeys(["mx:not-a-uuid"]));
  assert.deepEqual(visits.pickItemKeys([`mx:${U(1)}`, `mx:${U(1)}`, `squawk:${U(2)}`]), { keys: [`mx:${U(1)}`, `squawk:${U(2)}`] });
});

test("visit.create: items must be on the aircraft and in no other open visit; retries are no-ops", async () => {
  const tables = () => ({
    maintenance_item: [{ id: U(1), aircraft_id: "ac" }, { id: U(2), aircraft_id: "ac" }],
    planned_visit: [{ id: "old", aircraft_id: "ac", status: "planned", week_of: "2026-11-30" }],
    planned_visit_item: [{ id: "pvi", aircraft_id: "ac", visit_id: "old", item_key: `mx:${U(2)}`, done_completion_id: null }],
  });
  const foreign = fake(true, tables());
  const r1 = await visits.create(foreign.db, ctx, { id: "v1", weekOf: "2026-12-07", itemKeys: [`mx:${U(9)}`] });
  assert.equal(r1.status, "error");
  const busy = fake(true, tables());
  const r2 = await visits.create(busy.db, ctx, { id: "v1", weekOf: "2026-12-07", itemKeys: [`mx:${U(2)}`] });
  assert.deepEqual(r2, { status: "error", message: "This item is already in the visit for the week of 2026-11-30.", httpStatus: 409 });
  const ok = fake(true, tables());
  const r3 = await visits.create(ok.db, ctx, { id: "v1", weekOf: "2026-12-07", itemKeys: [`mx:${U(1)}`], fromSuggestionKey: "0123456789abcdef" });
  assert.equal(r3.status, "ok");
  assert.equal(ok.tables.planned_visit.find((v) => v.id === "v1")?.status, "planned");
  assert.deepEqual(ok.tables.planned_visit_item.filter((i) => i.visit_id === "v1").map((i) => i.item_key), [`mx:${U(1)}`]);
  await visits.create(ok.db, ctx, { id: "v1", weekOf: "2026-12-07", itemKeys: [`mx:${U(1)}`] });
  assert.equal(ok.tables.planned_visit.filter((v) => v.id === "v1").length, 1);
});

test("visit.setStatus: base checked, illegal moves refused, closing returns undone items to suggestions", async () => {
  const seed = () => ({
    planned_visit: [{ id: "v", aircraft_id: "ac", status: "in_shop", week_of: "2026-12-07", updated_at: "2026-11-18T10:00:00.000Z" }],
    planned_visit_item: [
      { id: "a", aircraft_id: "ac", visit_id: "v", item_key: `mx:${U(1)}`, done_completion_id: "c1" },
      { id: "b", aircraft_id: "ac", visit_id: "v", item_key: `mx:${U(2)}`, done_completion_id: null },
    ],
  });
  assert.equal((await visits.setStatus(fake(true, seed()).db, ctx, { visitId: "v", status: "done" }, "2026-11-18T09:00:00.000Z")).status, "conflict");
  const back = await visits.setStatus(fake(true, seed()).db, ctx, { visitId: "v", status: "planned" as "done" }, "2026-11-18T10:00:00.000Z");
  assert.equal(back.status, "error");
  const f = fake(true, seed());
  const r = await visits.setStatus(f.db, ctx, { visitId: "v", status: "done" }, "2026-11-18T10:00:00.000Z");
  assert.equal(r.status, "ok");
  assert.deepEqual(f.tables.planned_visit_item.map((i) => i.id), ["a"], "the done item stays as the visit's record");
  const again = await visits.setStatus(f.db, ctx, { visitId: "v", status: "cancelled" }, "2026-11-18T10:00:00.000Z");
  assert.deepEqual(again, { status: "error", message: "This visit is closed.", httpStatus: 409 });
});

test("visit completion: ticks the item, links the completion, closes an awaiting-records visit when all are done", async () => {
  const f = fake(true, {
    planned_visit: [{ id: "v", aircraft_id: "ac", status: "awaiting_records" }],
    planned_visit_item: [
      { id: "a", aircraft_id: "ac", visit_id: "v", item_key: `mx:${U(1)}`, done_completion_id: null },
      { id: "s", aircraft_id: "ac", visit_id: "v", item_key: `squawk:${U(3)}`, done_completion_id: null },
    ],
    item_completion: [{ id: "c1", aircraft_id: "ac", visit_id: null }],
  });
  await visits.recordVisitCompletion(f.db, "ac", `mx:${U(1)}`, "c1");
  assert.equal(f.tables.planned_visit_item[0].done_completion_id, "c1");
  assert.equal(f.tables.item_completion[0].visit_id, "v");
  assert.equal(f.tables.planned_visit[0].status, "done", "squawks riding along don't hold the visit open");
});

test("daily job: planned visits move to awaiting records the day after their day (or Friday)", () => {
  const rows = [
    { id: "a", aircraft_id: "ac", status: "planned" as const, week_of: "2026-11-09", visit_date: null },
    { id: "b", aircraft_id: "ac", status: "planned" as const, week_of: "2026-11-16", visit_date: null },
    { id: "c", aircraft_id: "ac", status: "planned" as const, week_of: "2026-11-16", visit_date: "2026-11-17" },
    { id: "d", aircraft_id: "ac", status: "in_shop" as const, week_of: "2026-11-02", visit_date: null },
  ];
  assert.deepEqual(visits.overduePlannedVisits(rows, "2026-11-18").map((v) => v.id), ["a", "c"]);
  assert.deepEqual(visits.overduePlannedVisits(rows, "2026-11-21").map((v) => v.id), ["a", "b", "c"]);
});

// ---------------------------------------------------------------------------
// Providers, documents, readings
// ---------------------------------------------------------------------------

test("provider.upsert: validated fields, one default per kind, edits checked against base", async () => {
  assert.ok("error" in providers.pickProviderFields({ name: "", kind: "mechanic" }));
  assert.ok("error" in providers.pickProviderFields({ name: "X", kind: "plumber" }));
  assert.ok("error" in providers.pickProviderFields({ name: "X", kind: "mechanic", email: "nope" }));
  assert.deepEqual(providers.pickProviderFields({ name: " AeroCheck ", kind: "avionics_shop", airport: "kbed" }), { fields: { name: "AeroCheck", kind: "avionics_shop", airport: "KBED" } });
  const f = fake(true, { service_provider: [{ id: "old", aircraft_id: "ac", name: "Old", kind: "mechanic", is_default: true, updated_at: "2026-11-18T10:00:00.000Z" }] });
  const r = await providers.upsert(f.db, ctx, { id: "new", fields: { name: "M. Torres", kind: "mechanic", isDefault: true } });
  assert.equal(r.status, "ok");
  assert.deepEqual(f.tables.service_provider.map((p) => [p.id, p.is_default]), [["old", false], ["new", true]]);
  const stale = await providers.upsert(f.db, ctx, { id: "old", fields: { phone: "555" } }, "2026-11-18T09:00:00.000Z");
  assert.equal(stale.status, "conflict");
});

test("provider proposals: a signer on two confirmed entries, never AI-read ones or known shops", () => {
  const e = (name: string, cert: string | null, trust = "confirmed", date = "2024-01-01") =>
    ({ signature_name: name, mechanic_cert_number: cert, entry_date: date, trust, replaced_by_entry_id: null });
  const out = providers.providerProposals([
    e("M. Torres", "A&P 3667012"), e("M. Torres", "A&P 3667012", "signed", "2025-03-01"),
    e("Only Once", "1"), e("AI Read", "2", "ai_read"), e("AI Read", "2", "ai_read"),
    e("AeroCheck Instruments", "CRS AC2Y441L"), e("AeroCheck Instruments", "CRS AC2Y441L"),
  ], [{ name: "AeroCheck Instruments", cert_number: null }]);
  assert.deepEqual(out, [{ name: "M. Torres", certNumber: "A&P 3667012", entries: 2, lastDate: "2025-03-01" }]);
});

test("document.setExpiry: defaults by type, bounds, the owner's date only", async () => {
  assert.deepEqual(documents.pickExpiry({ trackExpiry: true, expiresOn: "2027-01-10" }, "insurance"),
    { fields: { track_expiry: true, expires_on: "2027-01-10", renews_every_months: 12, remind_lead_days: null } });
  assert.equal((documents.pickExpiry({ trackExpiry: true }, "registration") as { fields: { renews_every_months: number } }).fields.renews_every_months, 84);
  assert.ok("error" in documents.pickExpiry({ trackExpiry: true, remindLeadDays: 400 }, "other"));
  assert.ok("error" in documents.pickExpiry({ trackExpiry: true, expiresOn: "Jan 2027" }, "other"));
  const f = fake(true, { document: [{ id: "d", aircraft_id: "ac", type: "radio_license", updated_at: "2026-11-18T10:00:00.000Z" }] });
  const r = await documents.setExpiry(f.db, ctx, { documentId: "d", trackExpiry: true }, "2026-11-18T10:00:00.000Z");
  assert.equal(r.status, "ok");
  assert.equal(f.tables.document[0].renews_every_months, 120);
  assert.equal(f.tables.document[0].expires_on, null, "tracked without a date shows as no record, never a computed date");
});

test("reading.create (extended): a tach photo keeps what the phone read and where the photo is", () => {
  assert.deepEqual(pickPhotoReading("ac", {}, 2165.3), { source: "manual", photo_path: null, ocr_value: null, ocr_confidence: null, ocr_candidates: null, owner_edited: false });
  const r = pickPhotoReading("ac", { source: "tach_photo", ocrValue: 2165.8, ocrConfidence: 0.91, photoBlobId: "r-00000001" }, 2165.3);
  assert.ok(!("error" in r));
  assert.equal(r.photo_path, "ac/meters/r-00000001.jpg");
  assert.equal(r.owner_edited, true, "saved value differs from the photo's");
  assert.ok("error" in pickPhotoReading("ac", { source: "adsb_estimate" as "manual" }, 1), "estimates never come in this way");
  assert.ok("error" in pickPhotoReading("ac", { source: "tach_photo", ocrConfidence: 2 }, 1));
  assert.ok("error" in pickPhotoReading("ac", { source: "tach_photo", photoBlobId: "../x" }, 1));
});

// ---------------------------------------------------------------------------
// Time checks (09 §3.10)
// ---------------------------------------------------------------------------

const tcInput = (o: Partial<TimeCheckInput> = {}): TimeCheckInput => ({
  maintenance_item: [{ id: "tbo", kind: "engine_tbo" }],
  item_completion: [{ maintenance_item_id: "tbo", log_entry_id: "e-oh", done_date: "2005-03-01", done_hours: 755.9 }],
  log_entry: [
    { id: "e-oh", logbook_id: "lb-e", page_id: null, entry_date: "2005-03-01", tach: 755.9, trust: "confirmed", replaced_by_entry_id: null, stated_times: null },
    { id: "e-1", logbook_id: "lb-e", page_id: "pg-6", entry_date: "2025-12-03", tach: 2097.6, trust: "confirmed", replaced_by_entry_id: null,
      stated_times: [{ component: "engine", basis: "SMOH", value: 1324.7 }] },
    { id: "e-2", logbook_id: "lb-e", page_id: null, entry_date: "2024-12-03", tach: 2050, trust: "confirmed", replaced_by_entry_id: null,
      stated_times: [{ component: "engine", basis: "SMOH", value: 1294.6 }] },
  ],
  logbook: [{ id: "lb-e", type: "engine", title: null }],
  page: [{ id: "pg-6", logbook_id: "lb-e", page_sequence: 6 }],
  meter_reset: [],
  time_check_dismissal: [],
  ...o,
});

test("time checks: written against calculated, digit swap, newest first", () => {
  const checks = computeTimeChecks(tcInput());
  assert.deepEqual(checks.map((c) => [c.entryId, c.written, c.calculated, c.result, c.difference, c.digitSwap]), [
    ["e-1", 1324.7, 1341.7, "apart", -17, false],
    ["e-2", 1294.6, 1294.1, "agree", 0.5, false],
  ]);
  assert.equal(checks[0].pageRef?.label, "Engine p. 6");
  assert.ok(isDigitSwap(1324.7, 1342.7) && !isDigitSwap(1324.7, 1341.7) && !isDigitSwap(12.5, 12.5));
});

test("time checks: a dismissal holds only while both values are unchanged; AI-read entries never count", () => {
  const dismissed = tcInput({ time_check_dismissal: [{ component: "engine", log_entry_id: "e-1", written_value: 1324.7, calculated_value: 1341.7 }] });
  assert.equal(computeTimeChecks(dismissed)[0].dismissed, true);
  const moved = tcInput({ time_check_dismissal: [{ component: "engine", log_entry_id: "e-1", written_value: 1324.7, calculated_value: 1340 }] });
  assert.equal(computeTimeChecks(moved)[0].dismissed, false);
  const ai = tcInput();
  ai.log_entry = ai.log_entry.map((e) => (e.id === "e-1" ? { ...e, trust: "ai_read" } : e));
  assert.deepEqual(computeTimeChecks(ai).map((c) => c.entryId), ["e-2"]);
  assert.deepEqual(computeTimeChecks(tcInput({ item_completion: [] })), [], "no overhaul, no check");
});

// ---------------------------------------------------------------------------
// Mechanic links and the catalogue
// ---------------------------------------------------------------------------

test("mechanic links: 128-bit base62 tokens, 7/30/90 days, 1–20 squawks, a mailto for the owner's client", () => {
  const tokens = new Set(Array.from({ length: 50 }, newLinkToken));
  assert.equal(tokens.size, 50);
  assert.ok([...tokens].every(isLinkToken));
  assert.ok(!isLinkToken("../../etc/passwd") && !isLinkToken("a".repeat(43)));
  assert.ok("error" in pickLinkInput({ recipientLabel: "M. Torres", squawkIds: ["s"], expiresInDays: 14 }, "squawk"));
  assert.ok("error" in pickLinkInput({ recipientLabel: "", squawkIds: ["s"] }, "squawk"));
  assert.ok("error" in pickLinkInput({ recipientLabel: "M. Torres", squawkIds: [] }, "squawk"));
  assert.deepEqual(pickLinkInput({ recipientLabel: " M. Torres ", squawkIds: ["s", "s"] }, "squawk"),
    { recipientLabel: "M. Torres", providerId: null, days: 30, squawkIds: ["s"], includePhotos: true, includeReporter: false });
  const m = linkMailto({ tail: "N734DM", to: "shop@example.com", url: "https://mytaillog.com/m/x", weekOf: "2026-12-07", lines: ["Oil change"] });
  assert.ok(m.startsWith("mailto:shop%40example.com?subject=N734DM%20visit%2C%20week%20of%20Dec%207&body="));
  assert.ok(decodeURIComponent(m).includes("- Oil change\n\nhttps://mytaillog.com/m/x"));
  assert.ok(!linkActive({ expires_at: "2026-01-01T00:00:00Z", revoked_at: null }));
  assert.ok(!linkActive({ expires_at: "2999-01-01T00:00:00Z", revoked_at: "2026-01-01T00:00:00Z" }));
});

test("phase 4 catalogue: every type has a write, and the Kotlin mirror lists it with the same base rule", () => {
  const kt = readFileSync(new URL("../../core/domain/src/commonMain/kotlin/com/mytaillog/core/domain/Mutations.kt", import.meta.url), "utf8");
  const fn: Record<string, string> = { never: "never", always: "always", ifId: "ifId" };
  for (const [type, { base }] of Object.entries(PHASE4_MUTATIONS)) {
    assert.equal(typeof writes[type as keyof typeof writes], "function", type);
    assert.match(kt, new RegExp(`${fn[base]}\\([^)]*"${type.replace(".", "\\.")}"`), `${type} as ${base} in Mutations.kt`);
  }
});
