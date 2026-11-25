"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failMessage } from "@/lib/writes/entries";
import * as oil from "@/lib/writes/oil";
import { writeSession } from "@/lib/v2/session";
import { formNumber } from "@/lib/v2/hours";
import type { ActResult } from "../hours/ActForm";

// W-AIRCRAFT-02 writes: thin wrappers over lib/writes/oil (CONTRACT §4).

export async function addOil(id: string, _p: ActResult, form: FormData): Promise<ActResult> {
  const { supabase, user, ctx } = await writeSession(id);
  if (!user) return { error: "Not signed in." };
  const date = String(form.get("date") ?? "");
  const r = await oil.addTopOff(supabase, ctx, {
    date,
    componentId: String(form.get("componentId") ?? "").trim() || null,
    quarts: Number(form.get("quarts")),
    tach: formNumber(form.get("tach")),
    hobbs: formNumber(form.get("hobbs")),
    notes: String(form.get("notes") ?? "").trim() || null,
  });
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(`/aircraft/${id}/oil`);
  redirect(`/aircraft/${id}/oil?done=oil`);
}

export async function removeOil(id: string, additionId: string, base: string): Promise<ActResult> {
  const { supabase, user, ctx } = await writeSession(id);
  if (!user) return { error: "Not signed in." };
  if (!base) return { error: "Reload the top-off before removing it." };
  const r = await oil.deleteTopOff(supabase, ctx, { additionId }, base);
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(`/aircraft/${id}/oil`);
  return { ok: "Top-off removed." };
}
