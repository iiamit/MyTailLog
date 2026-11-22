"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failMessage } from "@/lib/writes/entries";
import * as equipment from "@/lib/writes/equipment";
import { writeSession } from "@/lib/v2/session";
import type { ActionState } from "./ActionForm";

const base = (id: string) => `/aircraft/${id}/equipment`;
const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};

function done(aircraftId: string, query: string): never {
  revalidatePath(base(aircraftId));
  revalidatePath(`/aircraft/${aircraftId}/maintenance/ads`);
  redirect(`${base(aircraftId)}?${query}`);
}

/** Equipment form (W-AIRCRAFT-03): create without `id`, edit with it. Validation lives in the write. */
export async function saveComponent(aircraftId: string, componentId: string | null, _renderedBase: string | null, _p: ActionState, f: FormData): Promise<ActionState> {
  const renderedBase = str(f, "base");
  if (componentId && !renderedBase) return { error: "Reload this equipment before editing it." };
  const { supabase, ctx } = await writeSession(aircraftId);
  const life = str(f, "life_limit_value");
  const r = await equipment.upsert(supabase, ctx, {
    id: componentId ?? undefined,
    component: {
      name: str(f, "name") ?? "",
      make: str(f, "make"),
      category: str(f, "category"),
      part_number: str(f, "part_number"),
      serial_number: str(f, "serial_number"),
      install_date: str(f, "install_date"),
      install_entry_id: str(f, "install_entry_id"),
      life_limit_value: life == null ? null : Number(life),
      life_limit_unit: str(f, "life_limit_unit"),
      notes: str(f, "notes"),
    },
  }, renderedBase ?? undefined);
  if (r.status !== "ok") return { error: failMessage(r) };
  done(aircraftId, `part=${componentId ?? r.row?.id ?? ""}&done=saved`);
}

/** Mark removed: a date in a proper field and the removal entry; linked ADs become not applicable from that date. */
export async function markRemoved(aircraftId: string, componentId: string, renderedBase: string, _p: ActionState, f: FormData): Promise<ActionState> {
  if (!renderedBase) return { error: "Reload this equipment before marking it removed." };
  const date = str(f, "removal_date");
  if (!date) return { error: "Enter the date it came out." };
  const { supabase, ctx } = await writeSession(aircraftId);
  const r = await equipment.markRemoved(supabase, ctx, { componentId, date, entryId: str(f, "removal_entry_id") }, renderedBase);
  if (r.status !== "ok") return { error: failMessage(r) };
  done(aircraftId, `part=${componentId}&done=removed&n=${Number(r.row?.ads_updated ?? 0)}`);
}

export async function reinstallComponent(aircraftId: string, componentId: string, renderedBase: string) {
  const { supabase, ctx } = await writeSession(aircraftId);
  if (!renderedBase) redirect(`${base(aircraftId)}?error=1`);
  const r = await equipment.reinstall(supabase, ctx, { componentId }, renderedBase);
  if (r.status !== "ok") redirect(`${base(aircraftId)}?error=1`);
  done(aircraftId, `part=${componentId}&done=reinstalled`);
}

export async function deleteComponent(aircraftId: string, componentId: string, renderedBase: string) {
  const { supabase, ctx } = await writeSession(aircraftId);
  if (!renderedBase) redirect(`${base(aircraftId)}?error=1`);
  const r = await equipment.remove(supabase, ctx, { componentId }, renderedBase);
  if (r.status !== "ok") redirect(`${base(aircraftId)}?error=1`);
  done(aircraftId, "done=deleted");
}

/** "Add it" / "Not equipment" for one proposal (`one`) or the ticked ones (`ids`). */
async function answer(aircraftId: string, f: FormData, add: boolean) {
  const one = str(f, "one");
  const ids = one ? [one] : f.getAll("ids").map(String).filter(Boolean);
  if (!ids.length) redirect(base(aircraftId));
  const { supabase, ctx } = await writeSession(aircraftId);
  const r = add
    ? await equipment.confirmProposals(supabase, ctx, { proposalIds: ids })
    : await equipment.dismissProposals(supabase, ctx, { proposalIds: ids });
  if (r.status !== "ok") redirect(`${base(aircraftId)}?error=1`);
  done(aircraftId, add ? `done=added&n=${Number(r.row?.added ?? 0) + Number(r.row?.updated ?? 0)}` : `done=dismissed&n=${ids.length}`);
}

export async function addProposals(aircraftId: string, f: FormData) {
  return answer(aircraftId, f, true);
}

export async function dismissProposals(aircraftId: string, f: FormData) {
  return answer(aircraftId, f, false);
}
