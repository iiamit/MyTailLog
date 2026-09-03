// ===========================================================================
// The mutation catalogue (CONTRACT §3) and the pure half of the push path:
// envelope validation, the base rule, legacy-action translation and the
// "did this already land?" comparison. No I/O, no next/*, no Supabase — the
// phone imports this file too (apps/mobile resolves `@/lib/*` into here), so
// both ends of the wire agree on the same list and the same rules.
// Tested in apps/web/test/sync-mutations.test.ts.
// ===========================================================================

/** Every type the push endpoint accepts. Adding one = one row here + one row
 *  in lib/writes/index.ts. `base`: never (insert), always (update/delete), or
 *  "ifId" (an upsert that updates when the payload carries an id). */
export const MUTATIONS = {
  "entry.create": { base: "never" },
  "entry.update": { base: "always" },
  "entry.confirm": { base: "always" },
  "entry.delete": { base: "always" },
  "entry.merge": { base: "always" },
  "entry.setLinks": { base: "always" },
  "entries.confirmClean": { base: "never" },
  "page.review": { base: "always" },
  "page.reorder": { base: "never" },
  "page.delete": { base: "never" },
  "page.extract": { base: "never", online: true },
  "reading.create": { base: "never" },
  "reading.update": { base: "always" },
  "reading.delete": { base: "always" },
  "meterReset.create": { base: "never" },
  "meterReset.delete": { base: "always" },
  "mx.upsert": { base: "ifId" },
  "mx.delete": { base: "always" },
  "mx.complete": { base: "always" },
  "mx.seedStandard": { base: "never" },
  "ad.upsert": { base: "ifId" },
  "ad.delete": { base: "always" },
  "ad.track": { base: "never" },
  "component.upsert": { base: "ifId" },
  "component.delete": { base: "always" },
  "component.remove": { base: "always" },
  "component.reinstall": { base: "always" },
  "proposals.confirm": { base: "never" },
  "proposals.dismiss": { base: "never" },
  "mx.scan": { base: "never", online: true },
  "equipment.scan": { base: "never", online: true },
  "squawk.create": { base: "never" },
  "squawk.resolve": { base: "always" },
  "squawk.reopen": { base: "always" },
  "squawk.update": { base: "always" },
  "squawk.delete": { base: "always" },
  "oil.create": { base: "never" },
  "oil.delete": { base: "always" },
  "document.update": { base: "always" },
  "document.setEntry": { base: "always" },
  "document.delete": { base: "always" },
  "wb.upsert": { base: "ifId" },
  "wb.delete": { base: "always" },
  "aircraft.enroll": { base: "never", online: true },
  "backup.run": { base: "never", online: true },
} as const satisfies Record<string, { base: "never" | "always" | "ifId"; online?: boolean }>;

export type MutationType = keyof typeof MUTATIONS;
export const MUTATION_TYPES = Object.keys(MUTATIONS) as MutationType[];

export function isMutationType(t: unknown): t is MutationType {
  return typeof t === "string" && Object.prototype.hasOwnProperty.call(MUTATIONS, t);
}

export type Mutation = {
  id: string;
  type: MutationType;
  aircraftId: string;
  payload: Record<string, unknown>;
  base?: string;
};

export type PushResult = {
  id: string;
  status: "ok" | "conflict" | "error";
  row?: Record<string, unknown> | null;
  error?: string;
};

export const MAX_MUTATIONS = 100;

/** Whether this mutation changes an existing row and therefore must carry `base` (§2). */
export function needsBase(type: MutationType, payload: Record<string, unknown>): boolean {
  const rule = MUTATIONS[type].base;
  return rule === "always" || (rule === "ifId" && typeof payload.id === "string" && payload.id !== "");
}

/** Needs the network right now — the push endpoint cannot run it later. */
export function isOnlineOnly(type: MutationType): boolean {
  return (MUTATIONS[type] as { online?: boolean }).online === true;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** `{ mutations: [...] }`, at most MAX_MUTATIONS. */
export function validateEnvelope(body: unknown): { mutations: unknown[] } | { error: string } {
  if (!isObject(body) || !Array.isArray(body.mutations)) return { error: "Expected { mutations: [...] }." };
  if (body.mutations.length > MAX_MUTATIONS) {
    return { error: `Too many changes in one batch (${body.mutations.length} > ${MAX_MUTATIONS}).` };
  }
  return { mutations: body.mutations };
}

/** One mutation at the trust boundary: shape, known type, and the base rule. */
export function validateMutation(raw: unknown): { ok: Mutation } | { error: string; id: string } {
  const id = isObject(raw) && typeof raw.id === "string" ? raw.id : "";
  if (!isObject(raw)) return { error: "Change is not an object.", id };
  if (!id) return { error: "Change is missing its id.", id };
  if (!isMutationType(raw.type)) return { error: `Unknown change type: ${String(raw.type)}.`, id };
  if (typeof raw.aircraftId !== "string" || !raw.aircraftId) return { error: "Change is missing its aircraft.", id };
  const payload = isObject(raw.payload) ? raw.payload : {};
  const base = typeof raw.base === "string" && raw.base ? raw.base : undefined;
  if (base !== undefined && Number.isNaN(Date.parse(base))) return { error: "The change's timestamp is unreadable.", id };
  if (needsBase(raw.type, payload) && !base) {
    return { error: "This change doesn't say which version it was based on, so it can't be applied safely.", id };
  }
  if (isOnlineOnly(raw.type)) {
    return { error: "This needs a live connection — try it again from the app while online.", id };
  }
  return { ok: { id, type: raw.type, aircraftId: raw.aircraftId, payload, base } };
}

// ---------------------------------------------------------------------------
// Legacy actions (POST /api/aircraft/[id]/actions) → §3 mutations.
// Phones in the field send these for one more release. The phone's own
// queueAction() uses the same translation, so old screens and old builds land
// on the same write functions.
// ---------------------------------------------------------------------------

export type LegacyResult = { id: string; ok: boolean; error?: string };

export function translateLegacy(aircraftId: string, a: Record<string, unknown>): { ok: Mutation } | { error: string; id: string } {
  const id = typeof a.id === "string" ? a.id : "";
  if (!id) return { error: "Action is missing its id.", id };
  const base = typeof a.base === "string" && a.base ? a.base : undefined;
  switch (a.type) {
    case "reading":
      return { ok: { id, type: "reading.create", aircraftId, payload: { id, date: a.date, tach: a.tach, hobbs: a.hobbs } } };
    case "oil":
      return {
        ok: {
          id,
          type: "oil.create",
          aircraftId,
          payload: { id, date: a.date, quarts: a.quarts, tach: a.tach, hobbs: a.hobbs, notes: a.notes },
        },
      };
    case "squawk":
      return {
        ok: {
          id,
          type: "squawk.create",
          aircraftId,
          payload: { id, description: a.description, severity: a.severity, reportedAt: a.reported_at, reporterName: a.reporter_name },
        },
      };
    case "mx_complete":
      return {
        ok: {
          id,
          type: "mx.complete",
          aircraftId,
          payload: {
            itemId: a.item_id,
            date: a.date,
            hours: a.hours,
            description: a.description,
            signature: a.signature_name,
            logbookId: a.logbook_id,
            // Beyond the §3 shape: what the old build records for the 91.171(d)
            // entry. `entryId` keeps the action id as the entry's key (replay-safe).
            entryId: id,
            workPerformed: a.work_performed,
            tach: a.tach,
            hobbs: a.hobbs,
          },
          // An old build sends no base → LWW, as today (documented hazard).
          base,
        },
      };
    default:
      return { error: `Unknown action type: ${String(a.type)}`, id };
  }
}

export function toLegacyResult(r: PushResult): LegacyResult {
  if (r.status === "ok") return { id: r.id, ok: true };
  return { id: r.id, ok: false, error: r.status === "conflict" ? "Someone else changed this just now." : r.error };
}

// ---------------------------------------------------------------------------
// Mine vs theirs. Used by the push route to recognise a retry whose first
// attempt landed (the response was lost on a cell connection, the row now
// carries the phone's own values and a newer updated_at), and by the phone's
// yours/theirs screen to highlight what differs.
// ---------------------------------------------------------------------------

const ID_KEY = /(^id$|Id$|Ids$|_id$)/;
const NESTED = ["fields", "item", "record", "component"];
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * Payload keys whose column is NOT the snake_case of the key: a real column
 * name, or `null` for a key that lands on some OTHER row entirely.
 *
 * A missing entry here is not cosmetic. The key becomes invisible to the
 * comparison below, so alreadyApplied() can call a real conflict "already
 * applied" and throw the owner's edit away while reporting success, and the
 * phone's yours/theirs screen renders an empty table under the words
 * "Highlighted lines differ." Add a row whenever a §3 payload uses a short name.
 */
const COLUMN_ALIAS: Partial<Record<MutationType, Record<string, string | null>>> = {
  "reading.update": { date: "reading_date" },
  "entry.confirm": { confirmed: "owner_confirmed" },
  "component.remove": { date: "removal_date" },
  // Only the two dates land on maintenance_item; the rest describes the log
  // entry markDone writes alongside it, which is a different row.
  "mx.complete": {
    date: "last_done_date", hours: "last_done_hours",
    description: null, workPerformed: null, tach: null, hobbs: null, signature: null,
  },
  "squawk.resolve": { resolvedAt: "resolved_at" },
};

/** The row-shaped fields a payload sets, keyed by column name. Identifiers of
 *  the target row are not "mine" — they say which row, not what it holds.
 *  Pass `type` wherever it is known: it is what maps `date` onto the column
 *  the type actually writes. */
export function mineFields(payload: Record<string, unknown>, type?: MutationType): Record<string, unknown> {
  const inner = NESTED.map((k) => payload[k]).find(isObject);
  const src = inner ?? payload;
  const alias: Record<string, string | null> = (type && COLUMN_ALIAS[type]) ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (ID_KEY.test(k) || v === undefined) continue;
    const col = k in alias ? alias[k] : snake(k);
    if (col === null) continue; // written to another row — not comparable here
    out[col] = v;
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Columns the payload sets to a value different from the server row's. Only
 *  columns the row actually has count — a payload key the row lacks is not a
 *  difference, it's a shape the comparison can't see. */
export function changedFields(payload: Record<string, unknown>, row: Record<string, unknown>, type?: MutationType): string[] {
  const mine = mineFields(payload, type);
  return Object.keys(mine).filter((k) => k in row && !same(mine[k], row[k]));
}

/**
 * A conflict whose row already holds every value the payload sets is a retry
 * of a write that landed: return ok instead of asking the owner to choose
 * between two identical versions. Needs at least one comparable column — a
 * payload the row can't be compared against stays a conflict.
 * ponytail: value comparison stands in for a mutation ledger; add a
 * `sync_mutation(id)` table if a type ever needs exact replay detection.
 */
export function alreadyApplied(payload: Record<string, unknown>, row: Record<string, unknown>, type?: MutationType): boolean {
  const mine = mineFields(payload, type);
  const keys = Object.keys(mine);
  // Every field the payload sets must be visible on the row. If even one is
  // not, this cannot tell "my retry landed" from "their edit and mine touched
  // different columns", and getting that wrong discards the owner's change
  // while answering ok (CONTRACT §2: nothing is silently overwritten).
  if (keys.length === 0 || keys.some((k) => !(k in row))) return false;
  return keys.every((k) => same(mine[k], row[k]));
}
