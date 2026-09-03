"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { failMessage, type WriteResult } from "@/lib/writes/entries";
import * as oil from "@/lib/writes/oil";

// Thin wrappers over lib/writes/oil (CONTRACT §4).

export type OilTopOffInput = {
  added_date: string;
  quarts: number;
  hobbs: number | null;
  tach: number | null;
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
  revalidatePath(`/aircraft/${aircraftId}/oil-analysis`);
  return { ok: true };
}

export async function addOilTopOff(aircraftId: string, input: OilTopOffInput): Promise<Result> {
  return run(aircraftId, (supabase, userId) =>
    oil.addTopOff(supabase, { aircraftId, userId }, { ...input, date: input.added_date }),
  );
}

export async function deleteOilTopOff(aircraftId: string, id: string): Promise<Result> {
  return run(aircraftId, (supabase, userId) => oil.deleteTopOff(supabase, { aircraftId, userId }, { additionId: id }));
}
