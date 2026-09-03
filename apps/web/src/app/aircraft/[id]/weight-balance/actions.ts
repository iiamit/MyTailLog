"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { failMessage, type WriteResult } from "@/lib/writes/entries";
import * as weightBalance from "@/lib/writes/weightBalance";

// Thin wrappers over lib/writes/weightBalance (CONTRACT §4).

export type WBInput = {
  id?: string;
  revision_date: string;
  empty_weight: number | null;
  empty_weight_arm: number | null;
  empty_weight_moment: number | null;
  max_gross_weight: number | null;
  method: "weighed" | "computed" | null;
  reference: string | null;
  reason: string | null;
  notes: string | null;
};

type Result = { ok: true } | { error: string };

async function run(
  aircraftId: string,
  fn: (supabase: Awaited<ReturnType<typeof createClient>>, userId: string) => Promise<WriteResult>,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const r = await fn(supabase, user.id);
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(`/aircraft/${aircraftId}/weight-balance`);
  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true };
}

export async function upsertWeightBalance(aircraftId: string, input: WBInput): Promise<Result> {
  const { id, ...fields } = input;
  return run(aircraftId, (supabase, userId) => weightBalance.upsert(supabase, { aircraftId, userId }, { id, fields }));
}

export async function deleteWeightBalance(aircraftId: string, id: string): Promise<Result> {
  return run(aircraftId, (supabase, userId) => weightBalance.remove(supabase, { aircraftId, userId }, { wbId: id }));
}
