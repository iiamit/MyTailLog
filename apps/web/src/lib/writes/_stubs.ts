import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { MUTATION_TYPES, type MutationType } from "@/lib/sync/mutations";

// One placeholder per CONTRACT §3 type so the push route dispatches every type
// from day one. Each domain stream replaces its rows in index.ts with the real
// module; anything still pointing here answers "not lifted yet".
//
// The result/ctx shapes below are structurally identical to the ones
// lib/writes/entries.ts (writes-c1) exports — same three variants, same
// fields — so either import works at every call site. Integration may switch
// index.ts to re-export them from ./entries and delete these aliases.

export type Db = SupabaseClient<Database>;
export type WriteCtx = { aircraftId: string; userId: string };
export type WriteResult =
  | { status: "ok"; row: Record<string, unknown> | null }
  | { status: "conflict"; row: Record<string, unknown> }
  | { status: "error"; message: string; httpStatus?: number };

/** The §4 signature. `input: never` so a function typed for its own payload
 *  (`{ entryId: string; ... }`) is assignable; the route casts the validated
 *  payload once at the call. */
export type WriteFn = (supabase: Db, ctx: WriteCtx, input: never, base?: string) => Promise<WriteResult>;

const notLifted =
  (type: MutationType): WriteFn =>
  async () => ({ status: "error", message: `not lifted yet: ${type}`, httpStatus: 501 });

export const stubs: Record<MutationType, WriteFn> = Object.fromEntries(
  MUTATION_TYPES.map((t) => [t, notLifted(t)]),
) as Record<MutationType, WriteFn>;
