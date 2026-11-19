"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeSession } from "@/lib/v2/session";
import { failMessage } from "@/lib/writes/entries";
import * as entries from "@/lib/writes/entries";
import * as gaps from "@/lib/writes/gaps";
import * as pages from "@/lib/writes/pages";
import * as meters from "@/lib/writes/meters";
import { EXPLAIN_STATUSES, type ExplainStatus } from "@/lib/v2/records";
import type { Meter } from "@/lib/hobbsTach";

export type FormState = { error?: string } | null;

const base = (id: string) => `/aircraft/${id}/maintenance/records-check`;
function done(id: string, msg: string): never {
  revalidatePath(`/v2/aircraft/${id}`, "layout");
  revalidatePath(`/aircraft/${id}`, "layout");
  redirect(`${base(id)}?done=${encodeURIComponent(msg)}`);
}
const fail = (id: string, msg: string): never => redirect(`${base(id)}?error=${encodeURIComponent(msg)}`);

/** "Explain the gap" (`gap.setStatus` with a note). */
export async function explainGap(aircraftId: string, gapId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const status = String(form.get("status") ?? "") as ExplainStatus;
  if (!EXPLAIN_STATUSES.includes(status)) return { error: "Pick what explains the gap." };
  const { supabase, user, ctx } = await writeSession(aircraftId);
  if (!user) return { error: "Not signed in." };
  const r = await gaps.setStatus(supabase, ctx, { gapId, status, note: String(form.get("note") ?? "").trim() || null });
  if (r.status !== "ok") return { error: failMessage(r) };
  done(aircraftId, status === "dismissed" ? "Settled. It won't be drawn on the map." : "Noted. The gap stays on the map with your note.");
}

/** Undo on a settled gap: it is open again. */
export async function reopenGap(aircraftId: string, gapId: string) {
  const { supabase, ctx } = await writeSession(aircraftId);
  const r = await gaps.setStatus(supabase, ctx, { gapId, status: "open" });
  if (r.status !== "ok") fail(aircraftId, failMessage(r));
  done(aircraftId, "The gap is open again.");
}

export async function deleteDuplicatePage(aircraftId: string, pageId: string) {
  const { supabase, ctx } = await writeSession(aircraftId);
  const r = await pages.deletePages(supabase, ctx, { pageIds: [pageId] });
  if (r.status !== "ok") fail(aircraftId, failMessage(r));
  if (!Number(r.status === "ok" ? r.row?.deleted : 0)) fail(aircraftId, "That page is already gone.");
  done(aircraftId, "Duplicate page deleted.");
}

export async function deleteDuplicateEntry(aircraftId: string, entryId: string) {
  const { supabase, ctx } = await writeSession(aircraftId);
  const r = await entries.remove(supabase, ctx, { entryId });
  if (r.status !== "ok") fail(aircraftId, failMessage(r));
  done(aircraftId, "Duplicate entry deleted.");
}

/**
 * A flagged reading: "Use {value}" writes the corrected figure, "Clear {field}" nulls a copied meter, "Keep"
 * leaves it and stops flagging it (`meters.resolveHoursFlag` stamps hours_reviewed_at in every case).
 */
export async function fixReading(aircraftId: string, source: meters.HoursSource, readingId: string, field: Meter, form: FormData) {
  const how = String(form.get("how") ?? "");
  const { supabase, ctx } = await writeSession(aircraftId);
  const value = Number(form.get("value"));
  const input =
    how === "use" ? { source, readingId, field, value }
    : how === "clear" ? { source, readingId, field, value: null }
    : { source, readingId };
  if (how === "use" && !(Number.isFinite(value) && value > 0)) fail(aircraftId, "Enter a positive number.");
  const r = await meters.resolveHoursFlag(supabase, ctx, input);
  if (r.status !== "ok") fail(aircraftId, failMessage(r));
  done(aircraftId, how === "use" ? `Reading changed to ${value}.` : how === "clear" ? `Cleared the ${field}.` : "Kept as it is.");
}
