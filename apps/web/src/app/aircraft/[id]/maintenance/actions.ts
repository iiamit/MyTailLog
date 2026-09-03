"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { failMessage, type WriteCtx, type WriteResult } from "@/lib/writes/entries";
import * as maintenance from "@/lib/writes/maintenance";
import type { MaintenanceItemFields } from "@/lib/writes/maintenance";

// Thin wrappers over lib/writes/maintenance (CONTRACT §4): session, the write,
// then revalidate. The rules and the validation live in the lib module.

export type MaintenanceInput = MaintenanceItemFields & { id?: string };

type Result = { ok: true } | { error: string };

function revalidateMaintenance(aircraftId: string) {
  revalidatePath(`/aircraft/${aircraftId}/maintenance`);
  revalidatePath(`/aircraft/${aircraftId}`);
}

async function session(aircraftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, ctx: { aircraftId, userId: user?.id ?? "" } as WriteCtx };
}

function finish(aircraftId: string, r: WriteResult): Result {
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidateMaintenance(aircraftId);
  return { ok: true };
}

export async function upsertMaintenanceItem(aircraftId: string, input: MaintenanceInput): Promise<Result> {
  const { id, ...item } = input;
  const { supabase, ctx } = await session(aircraftId);
  return finish(aircraftId, await maintenance.upsert(supabase, ctx, { id, item }));
}

export async function deleteMaintenanceItem(aircraftId: string, id: string): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  return finish(aircraftId, await maintenance.remove(supabase, ctx, { itemId: id }));
}

/** Mark an item done at a date/hours, which recomputes its next-due. */
export async function markMaintenanceDone(
  aircraftId: string,
  id: string,
  date: string | null,
  hours: number | null,
): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  return finish(aircraftId, await maintenance.markDone(supabase, ctx, { itemId: id, date, hours }));
}

/** Seed the common Part 91 recurring items (skips any already present). */
export async function seedStandardItems(
  aircraftId: string,
): Promise<{ ok: true; added: number } | { error: string }> {
  const { supabase, ctx } = await session(aircraftId);
  const r = await maintenance.seedStandard(supabase, ctx);
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidateMaintenance(aircraftId);
  return { ok: true, added: Number(r.row?.added ?? 0) };
}
