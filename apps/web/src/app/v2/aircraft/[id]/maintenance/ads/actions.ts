"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AdKind, AdStatus } from "@/lib/database.types";
import type { FaaAd } from "@/lib/faa/federalRegister";
import { todayIn } from "@/lib/mapModel";
import { writeSession } from "@/lib/v2/session";
import { failMessage } from "@/lib/writes/entries";
import * as compliance from "@/lib/writes/compliance";

export type FormState = { error?: string } | null;

const path = (aircraftId: string) => `/aircraft/${aircraftId}/maintenance/ads`;

function done(aircraftId: string, query: string): never {
  revalidatePath(path(aircraftId));
  revalidatePath(`/aircraft/${aircraftId}/status`);
  redirect(`${path(aircraftId)}?${query}`);
}

const text = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (f: FormData, k: string) => {
  const v = text(f, k);
  return v == null ? null : Number(v);
};

/** The AD editor (W-MAINT-01): create, or edit keeping the compliance history fields it does not show. */
export async function saveAd(aircraftId: string, adId: string | null, renderedBase: string | null, _prev: FormState, f: FormData): Promise<FormState> {
  const { supabase, ctx } = await writeSession(aircraftId);
  if (adId && !renderedBase) return { error: "Reload this AD before editing it." };
  const kind = text(f, "kind") as AdKind | null;
  const reference = text(f, "reference");
  const status = text(f, "status") as AdStatus | null;
  const recurring = f.get("recurring") === "on";
  const intervalHours = recurring ? num(f, "interval_hours") : null;
  const intervalMonths = recurring ? num(f, "interval_months") : null;
  const reason = text(f, "reason");
  if (!kind) return { error: "Pick AD or SB." };
  if (!reference) return { error: "Enter the AD or SB number." };
  if (!status) return { error: "Pick a status." };
  const nums = [intervalHours, intervalMonths, num(f, "complied_hours")];
  if (nums.some((n) => n != null && !(Number.isFinite(n) && n >= 0))) return { error: "Intervals and hours are zero or more." };
  if (recurring && intervalHours == null && intervalMonths == null) return { error: "A recurring AD needs an interval: hours, months, or both." };
  if (status === "not_applicable" && !reason) return { error: "Say why it does not apply." };

  let kept = { method: null as string | null, complied_date: null as string | null, complied_hours: null as number | null };
  if (adId) {
    const { data: row } = await supabase.from("ad_compliance").select("method, complied_date, complied_hours").eq("id", adId).eq("aircraft_id", aircraftId).maybeSingle();
    if (row) kept = row;
  } else {
    kept = { method: text(f, "method"), complied_date: text(f, "complied_date"), complied_hours: num(f, "complied_hours") };
  }
  const sideline = status === "not_applicable" || status === "superseded";
  const record = {
    kind, reference, status, recurring,
    title: text(f, "title"),
    applicability: text(f, "applicability"),
    notes: text(f, "notes"),
    interval_hours: intervalHours,
    interval_months: intervalMonths,
    reason: sideline ? reason : null,
    status_changed_on: sideline ? text(f, "status_changed_on") : null,
    component_id: text(f, "component_id"),
    ...kept,
  };
  const r = await compliance.upsert(supabase, ctx, { id: adId ?? undefined, record }, renderedBase ?? undefined);
  if (r.status !== "ok") return { error: failMessage(r) };
  const id = adId ?? String((r.row as { id?: string } | null)?.id ?? "");
  done(aircraftId, `ad=${id}&saved=${adId ? "edit" : "new"}`);
}

/**
 * Record compliance (W-MAINT-01): adds an item_completion and moves the record's last compliance forward. The
 * previous compliance stays in the history: a record with no completion rows yet gets its stored compliance
 * written as one first, because the engine reads completions over the stored pair once any exist.
 */
export async function recordCompliance(aircraftId: string, adId: string, renderedBase: string, _prev: FormState, f: FormData): Promise<FormState> {
  const { supabase, user, ctx } = await writeSession(aircraftId);
  if (!user) return { error: "Not signed in." };
  const date = text(f, "date");
  const hours = num(f, "hours");
  const entryId = text(f, "entry");
  const { data: profile } = await supabase.from("profile").select("time_zone").eq("id", user.id).maybeSingle();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIn(profile?.time_zone)) return { error: "Pick a date on or before today." };
  if (hours != null && !(Number.isFinite(hours) && hours >= 0)) return { error: "Intervals and hours are zero or more." };

  const r = await compliance.recordCompliance(supabase, ctx, { recordId: adId, date, hours, entryId, method: text(f, "method") }, renderedBase);
  if (r.status !== "ok") return { error: failMessage(r) };
  done(aircraftId, `ad=${adId}&saved=record`);
}

export async function stopTracking(aircraftId: string, adId: string, renderedBase: string) {
  const { supabase, ctx } = await writeSession(aircraftId);
  const { data: ad } = await supabase.from("ad_compliance").select("kind, reference").eq("id", adId).maybeSingle();
  if (!renderedBase) done(aircraftId, `ad=${adId}&error=Reload%20this%20AD%20before%20removing%20it.`);
  const r = await compliance.remove(supabase, ctx, { recordId: adId }, renderedBase);
  if (r.status !== "ok") done(aircraftId, `ad=${adId}&error=${encodeURIComponent(failMessage(r))}`);
  done(aircraftId, `stopped=${encodeURIComponent(ad ? `${ad.kind.toUpperCase()} ${ad.reference}` : "the AD")}`);
}

/** "Track it" on a reference found in the logs: an Open record, selected with the editor open. */
export async function trackReference(aircraftId: string, kind: AdKind, reference: string) {
  const { supabase, ctx } = await writeSession(aircraftId);
  const r = await compliance.track(supabase, ctx, { kind, reference });
  if (r.status !== "ok") done(aircraftId, `error=${encodeURIComponent(failMessage(r))}`);
  done(aircraftId, `ad=${(r.row as { id: string }).id}&panel=edit`);
}

/** Federal Register result looked up in the browser (GPO blocks our egress), saved as the AD's official record. */
export async function saveReference(aircraftId: string, adId: string, ad: FaaAd, renderedBase: string): Promise<{ error?: string }> {
  const { supabase, ctx } = await writeSession(aircraftId);
  if (!renderedBase) return { error: "Reload this AD before linking its reference." };
  const r = await compliance.saveAdReference(supabase, ctx, { complianceId: adId, ad }, renderedBase);
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(path(aircraftId));
  return {};
}

/** FAA DRS fallback, server-side. */
export async function lookupDrs(aircraftId: string, adId: string, renderedBase: string): Promise<{ error?: string; found?: boolean }> {
  const { supabase, ctx } = await writeSession(aircraftId);
  if (!renderedBase) return { error: "Reload this AD before linking its reference." };
  const r = await compliance.enrichViaDRS(supabase, ctx, { complianceId: adId }, renderedBase);
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(path(aircraftId));
  return { found: (r.row as { found?: boolean } | null)?.found === true };
}
