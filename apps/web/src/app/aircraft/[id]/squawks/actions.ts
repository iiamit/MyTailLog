"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SquawkSeverity } from "@/lib/database.types";
import { failMessage, type WriteResult } from "@/lib/writes/entries";
import * as squawks from "@/lib/writes/squawks";

// Thin wrappers over lib/writes/squawks (CONTRACT §4): auth, call, revalidate.

type Result = { ok: true } | { error: string };
const path = (aircraftId: string) => `/aircraft/${aircraftId}/squawks`;

async function run(aircraftId: string, fn: (supabase: Awaited<ReturnType<typeof createClient>>, userId: string) => Promise<WriteResult>): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const r = await fn(supabase, user.id);
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(path(aircraftId));
  return { ok: true };
}

/** Report a squawk. Anyone with access (incl. a read-only pilot) may report. */
export async function addSquawk(
  aircraftId: string,
  input: { description: string; severity: SquawkSeverity },
): Promise<Result> {
  return run(aircraftId, (supabase, userId) => squawks.create(supabase, { aircraftId, userId }, input));
}

/** Resolve a squawk — editors only. */
export async function resolveSquawk(aircraftId: string, id: string, resolutionNotes?: string): Promise<Result> {
  return run(aircraftId, (supabase, userId) =>
    squawks.resolve(supabase, { aircraftId, userId }, { squawkId: id, resolutionNotes }),
  );
}

export async function reopenSquawk(aircraftId: string, id: string): Promise<Result> {
  return run(aircraftId, (supabase, userId) => squawks.reopen(supabase, { aircraftId, userId }, { squawkId: id }));
}

export async function deleteSquawk(aircraftId: string, id: string): Promise<Result> {
  return run(aircraftId, (supabase, userId) => squawks.remove(supabase, { aircraftId, userId }, { squawkId: id }));
}
