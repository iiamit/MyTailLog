"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AdKind } from "@/lib/database.types";
import type { FaaAd } from "@/lib/faa/federalRegister";
import { failMessage, type WriteCtx, type WriteResult } from "@/lib/writes/entries";
import * as compliance from "@/lib/writes/compliance";
import type { AdComplianceFields } from "@/lib/writes/compliance";

// Thin wrappers over lib/writes/compliance (CONTRACT §4): session, the write,
// then revalidate. The rules and the validation live in the lib module.

export type AdInput = AdComplianceFields & { id?: string };

type Result = { ok: true } | { error: string };

function compliancePath(aircraftId: string) {
  return `/aircraft/${aircraftId}/compliance`;
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
  revalidatePath(compliancePath(aircraftId));
  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true };
}

/** Add or update an AD/SB record. */
export async function upsertAdRecord(aircraftId: string, input: AdInput): Promise<Result> {
  const { id, ...record } = input;
  const { supabase, ctx } = await session(aircraftId);
  return finish(aircraftId, await compliance.upsert(supabase, ctx, { id, record }));
}

export async function deleteAdRecord(aircraftId: string, id: string): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  return finish(aircraftId, await compliance.remove(supabase, ctx, { recordId: id }));
}

/**
 * Save a Federal Register AD (looked up in the browser — GPO 403s our egress
 * IP) as the official reference for a compliance record.
 */
export async function saveAdReference(
  aircraftId: string,
  complianceId: string,
  frAd: FaaAd,
): Promise<{ ok: true; found: true } | { error: string }> {
  const { supabase, ctx } = await session(aircraftId);
  const r = await compliance.saveAdReference(supabase, ctx, { complianceId, ad: frAd });
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(compliancePath(aircraftId));
  return { ok: true, found: true };
}

/** Legacy fallback when the Federal Register has no match (pre-1994 ADs): FAA DRS, server-side. */
export async function enrichViaDRS(
  aircraftId: string,
  complianceId: string,
): Promise<{ ok: true; found: boolean } | { error: string }> {
  const { supabase, ctx } = await session(aircraftId);
  const r = await compliance.enrichViaDRS(supabase, ctx, { complianceId });
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(compliancePath(aircraftId));
  return { ok: true, found: r.row?.found === true };
}

/** Start tracking an AD/SB number found in the logs — creates an open record. */
export async function trackRef(aircraftId: string, kind: AdKind, reference: string): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  const r = await compliance.track(supabase, ctx, { kind, reference });
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(compliancePath(aircraftId));
  return { ok: true };
}
