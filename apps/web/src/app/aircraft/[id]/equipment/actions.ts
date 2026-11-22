"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { failMessage, type WriteCtx, type WriteResult } from "@/lib/writes/entries";
import * as equipment from "@/lib/writes/equipment";
import type { ComponentFields } from "@/lib/writes/equipment";

// Thin wrappers over lib/writes/equipment (CONTRACT §4): session, the write,
// then revalidate. The rules and the validation live in the lib module.

export type ComponentInput = ComponentFields & { id?: string; base?: string };

type Result = { ok: true } | { error: string };

function equipmentPath(aircraftId: string) {
  return `/aircraft/${aircraftId}/equipment`;
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
  revalidatePath(equipmentPath(aircraftId));
  return { ok: true };
}

export async function upsertComponent(aircraftId: string, input: ComponentInput): Promise<Result> {
  const { id, base, ...component } = input;
  if (id && !base) return { error: "Reload this equipment before editing it." };
  const { supabase, ctx } = await session(aircraftId);
  return finish(aircraftId, await equipment.upsert(supabase, ctx, { id, component }, base));
}

export async function deleteComponent(aircraftId: string, id: string, base: string): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  if (!base) return { error: "Reload this equipment before deleting it." };
  return finish(aircraftId, await equipment.remove(supabase, ctx, { componentId: id }, base));
}

/** Mark a component removed on a date; its open ADs become not applicable.
 *  Returns how many AD records were updated so the UI can report it. */
export async function removeComponent(
  aircraftId: string,
  id: string,
  removalDate: string | null,
  base: string,
): Promise<{ ok: true; adsUpdated: number } | { error: string }> {
  const { supabase, ctx } = await session(aircraftId);
  if (!base) return { error: "Reload this equipment before marking it removed." };
  const r = await equipment.markRemoved(supabase, ctx, { componentId: id, date: removalDate }, base);
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(equipmentPath(aircraftId));
  revalidatePath(`/aircraft/${aircraftId}/compliance`);
  return { ok: true, adsUpdated: Number(r.row?.ads_updated ?? 0) };
}

/** Confirm pending equipment proposals: components are created/updated from them. */
export async function confirmProposals(
  aircraftId: string,
  proposalIds: string[],
): Promise<{ ok: true; added: number; updated: number } | { error: string }> {
  const { supabase, ctx } = await session(aircraftId);
  const r = await equipment.confirmProposals(supabase, ctx, { proposalIds });
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(equipmentPath(aircraftId));
  return { ok: true, added: Number(r.row?.added ?? 0), updated: Number(r.row?.updated ?? 0) };
}

/** Dismiss (delete) pending equipment proposals without importing them. */
export async function dismissProposals(aircraftId: string, proposalIds: string[]): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  return finish(aircraftId, await equipment.dismissProposals(supabase, ctx, { proposalIds }));
}

/** Reinstall a previously removed component (does not touch AD statuses). */
export async function reinstallComponent(aircraftId: string, id: string, base: string): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  if (!base) return { error: "Reload this equipment before reinstalling it." };
  return finish(aircraftId, await equipment.reinstall(supabase, ctx, { componentId: id }, base));
}
