"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failMessage } from "@/lib/writes/entries";
import * as weightBalance from "@/lib/writes/weightBalance";
import { writeSession } from "@/lib/v2/session";
import type { ActionState } from "../equipment/ActionForm";

const base = (id: string) => `/aircraft/${id}/weight-balance`;

/** Revision form (W-AIRCRAFT-04). validateWB checks the numbers and works out the third of weight, arm and moment. */
export async function saveRevision(aircraftId: string, wbId: string | null, _p: ActionState, f: FormData): Promise<ActionState> {
  if (wbId && !f.get("base")) return { error: "Reload the revision before editing it." };
  const { supabase, ctx } = await writeSession(aircraftId);
  const fields = Object.fromEntries(
    ["revision_date", "empty_weight", "empty_weight_arm", "empty_weight_moment", "max_gross_weight", "method", "reference", "reason", "notes"].map((k) => [
      k,
      String(f.get(k) ?? "").trim() || null,
    ]),
  );
  const r = await weightBalance.upsert(supabase, ctx, { id: wbId, fields }, String(f.get("base") ?? "") || undefined);
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(base(aircraftId));
  redirect(`${base(aircraftId)}?revision=${wbId ?? r.row?.id ?? ""}&done=saved`);
}

export async function deleteRevision(aircraftId: string, wbId: string, expectedBase: string) {
  const { supabase, ctx } = await writeSession(aircraftId);
  if (!expectedBase) redirect(`${base(aircraftId)}?done=error`);
  const r = await weightBalance.remove(supabase, ctx, { wbId }, expectedBase);
  revalidatePath(base(aircraftId));
  redirect(`${base(aircraftId)}?done=${r.status === "ok" ? "deleted" : "error"}`);
}
