import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { maintenanceNextDue } from "@/lib/maintenance";
import type { SquawkSeverity } from "@/lib/database.types";

// ===========================================================================
// Drain target for the native app's offline ACTION queue.
//
// One endpoint, a batch of actions, applied in order — mirroring how the capture
// queue already works. The alternative was four near-identical routes, each
// re-implementing auth and validation.
//
// IDEMPOTENCY, without a migration: every action carries a client-generated
// UUID, and that UUID becomes the row's primary key (squawk, oil_addition,
// log_entry) or its external_ref (hours_reading). A retry after a lost response
// therefore conflicts with the row it already wrote and does nothing. This
// matters more than usual here: the phone queues offline and drains on a flaky
// cell connection, so "did that POST land?" is the normal case, not the edge.
//
// PERMISSIONS are RLS's job — the client is scoped to the caller's token, so a
// viewer's insert simply matches no policy. Because RLS turns that into a silent
// no-op rather than an error, every write below checks what came back instead of
// assuming success.
// ===========================================================================

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ACTIONS = 100;

type Result = { id: string; ok: boolean; error?: string };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: aircraftId } = await ctx.params;

  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { actions?: unknown } | null;
  const actions = Array.isArray(body?.actions) ? (body.actions as Record<string, unknown>[]) : null;
  if (!actions) return NextResponse.json({ error: "Expected { actions: [...] }." }, { status: 400 });
  if (actions.length > MAX_ACTIONS) {
    return NextResponse.json({ error: `Too many actions (${actions.length} > ${MAX_ACTIONS}).` }, { status: 400 });
  }

  // The device only ever sends actions for aircraft it can edit, but it is the
  // device saying so. Check once, here, against the same function RLS uses.
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: aircraftId });
  if (canEdit !== true) {
    return NextResponse.json({ error: "You don't have permission to edit this aircraft." }, { status: 403 });
  }

  const results: Result[] = [];
  for (const a of actions) {
    const id = str(a.id);
    if (!id) {
      results.push({ id: "", ok: false, error: "Action is missing its id." });
      continue;
    }
    try {
      await apply(supabase, aircraftId, user.id, id, a);
      results.push({ id, ok: true });
    } catch (e) {
      // One bad action must not discard the rest of the queue.
      results.push({ id, ok: false, error: (e as Error).message });
    }
  }

  return NextResponse.json({ results });
}

type Client = Awaited<ReturnType<typeof createSyncClient>>;

async function apply(
  supabase: Client,
  aircraftId: string,
  userId: string,
  id: string,
  a: Record<string, unknown>,
): Promise<void> {
  switch (str(a.type)) {
    case "reading":
      return applyReading(supabase, aircraftId, userId, id, a);
    case "oil":
      return applyOil(supabase, aircraftId, id, a);
    case "squawk":
      return applySquawk(supabase, aircraftId, userId, id, a);
    case "mx_complete":
      return applyMxComplete(supabase, aircraftId, id, a);
    default:
      throw new Error(`Unknown action type: ${String(a.type)}`);
  }
}

/** A meter reading typed at the aircraft. Stored `manual` — a real meter read. */
async function applyReading(
  supabase: Client,
  aircraftId: string,
  userId: string,
  id: string,
  a: Record<string, unknown>,
): Promise<void> {
  const hobbs = num(a.hobbs);
  const tach = num(a.tach);
  if (hobbs == null && tach == null) throw new Error("Enter at least one reading.");
  for (const v of [hobbs, tach]) {
    if (v != null && (!Number.isFinite(v) || v < 0)) throw new Error("Readings must be zero or a positive number.");
  }

  const { data, error } = await supabase
    .from("hours_reading")
    .upsert(
      {
        aircraft_id: aircraftId,
        reading_date: str(a.date) ?? new Date().toISOString().slice(0, 10),
        hobbs,
        tach,
        source: "manual",
        synced_by: userId,
        external_ref: id, // the action UUID — makes a retry a no-op
        updated_at: new Date().toISOString(),
      },
      { onConflict: "aircraft_id,source,external_ref" },
    )
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("You don't have permission to edit this aircraft.");
}

/** Oil added at the airplane — feeds the consumption trend. */
async function applyOil(
  supabase: Client,
  aircraftId: string,
  id: string,
  a: Record<string, unknown>,
): Promise<void> {
  const quarts = num(a.quarts);
  if (quarts == null || !Number.isFinite(quarts) || quarts <= 0) {
    throw new Error("Quarts must be a positive number.");
  }
  const { error } = await supabase.from("oil_addition").upsert(
    {
      id, // client UUID as the PK → replay-safe
      aircraft_id: aircraftId,
      added_date: str(a.date) ?? new Date().toISOString().slice(0, 10),
      quarts,
      hobbs: num(a.hobbs),
      tach: num(a.tach),
      notes: str(a.notes),
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

/** A defect noticed on the ramp. */
async function applySquawk(
  supabase: Client,
  aircraftId: string,
  userId: string,
  id: string,
  a: Record<string, unknown>,
): Promise<void> {
  const description = str(a.description)?.trim();
  if (!description) throw new Error("Describe the squawk.");
  // Anything unrecognised falls back to `low` rather than being rejected: the
  // squawk itself is the thing worth keeping, and the enum is only low/med/high
  // (0043) — a client sending something else must not lose the report.
  const severity = str(a.severity);
  const { error } = await supabase.from("squawk").upsert(
    {
      id,
      aircraft_id: aircraftId,
      description,
      severity: isSeverity(severity) ? severity : "low",
      status: "open",
      reported_by: userId,
      reporter_name: str(a.reporter_name),
      reported_at: str(a.reported_at) ?? new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

/**
 * Mark a maintenance item done — the VOR check being the reason this exists.
 *
 * Two writes, deliberately. Resetting the counter (`last_done_date` +
 * recomputed next-due) is the app's bookkeeping; but 91.171(d) requires the
 * person making a VOR check to record the DATE, PLACE and BEARING ERROR and
 * sign it. A checkbox that only moved a due-date would leave the owner
 * non-compliant while telling them they were fine — so when the caller supplies
 * that detail we also write a real log_entry, which exports and prints like any
 * other maintenance record.
 *
 * next_due_date comes from the SAME maintenanceNextDue() the web uses, so the
 * calendar-month rule can't drift between the two.
 */
async function applyMxComplete(
  supabase: Client,
  aircraftId: string,
  id: string,
  a: Record<string, unknown>,
): Promise<void> {
  const itemId = str(a.item_id);
  if (!itemId) throw new Error("Which item?");
  const date = str(a.date) ?? new Date().toISOString().slice(0, 10);
  const hours = num(a.hours);

  const { data: item, error: readError } = await supabase
    .from("maintenance_item")
    .select("id, kind, interval_months, interval_hours")
    .eq("id", itemId)
    .eq("aircraft_id", aircraftId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!item) throw new Error("That item isn't on this aircraft.");

  const next = maintenanceNextDue({
    kind: item.kind,
    interval_months: item.interval_months,
    interval_hours: item.interval_hours,
    last_done_date: date,
    last_done_hours: hours,
  });

  const { data: updated, error } = await supabase
    .from("maintenance_item")
    .update({
      last_done_date: date,
      last_done_hours: hours,
      next_due_date: next.next_due_date,
      next_due_hours: next.next_due_hours,
    })
    .eq("id", itemId)
    .eq("aircraft_id", aircraftId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new Error("You don't have permission to edit this aircraft.");

  // The legal record, when the caller gave us enough to write one.
  const logbookId = str(a.logbook_id);
  const description = str(a.description)?.trim();
  if (logbookId && description) {
    const { error: entryError } = await supabase.from("log_entry").upsert(
      {
        id, // action UUID → one entry per action, however many retries
        aircraft_id: aircraftId,
        logbook_id: logbookId,
        entry_date: date,
        tach: num(a.tach),
        hobbs: num(a.hobbs),
        description,
        work_performed: str(a.work_performed),
        signature_name: str(a.signature_name),
        owner_confirmed: true,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (entryError) throw new Error(entryError.message);
  }
}

function isSeverity(v: string | null): v is SquawkSeverity {
  return v === "low" || v === "medium" || v === "high";
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
