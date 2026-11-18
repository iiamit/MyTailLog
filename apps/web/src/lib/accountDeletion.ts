import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Account deletion (App Store guideline 5.1.1(v); 09 §8 item 10, 05 §8.6).
// Deletes every aircraft the caller owns (rows cascade), their stored files,
// then the auth user (user-scoped rows cascade from auth.users). Aircraft
// shared WITH the caller are not theirs and stay; their squawks keep the
// reporter's name with reported_by set null (0085).

export type DeletionError = { error: string; code: string; status: number };

/** The body must say what it does: `{ "confirm": "DELETE" }` (any case). */
export function parseDeletionRequest(body: unknown): { ok: true } | DeletionError {
  const confirm = body && typeof body === "object" ? (body as { confirm?: unknown }).confirm : undefined;
  if (typeof confirm !== "string" || confirm.trim().toLowerCase() !== "delete") {
    return { error: 'Type "delete" to confirm.', code: "invalid", status: 400 };
  }
  return { ok: true };
}

type Svc = SupabaseClient<Database>;
type StorageCols = { table: "page" | "document" | "squawk_photo" | "hours_reading"; cols: string[] };
const STORED_FILES: StorageCols[] = [
  { table: "page", cols: ["storage_path", "thumbnail_path"] },
  { table: "document", cols: ["storage_path"] },
  { table: "squawk_photo", cols: ["storage_path", "thumbnail_path"] },
  { table: "hours_reading", cols: ["photo_path"] },
];

async function storedPaths(svc: Svc, aircraftIds: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const { table, cols } of STORED_FILES) {
    for (let start = 0; ; start += 500) {
      const { data, error } = await svc.from(table).select(cols.join(", "))
        .in("aircraft_id", aircraftIds).order("id").range(start, start + 499);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Record<string, string | null>[];
      for (const row of rows) for (const c of cols) if (row[c]) paths.push(row[c]!);
      if (rows.length < 500) break;
    }
  }
  return paths;
}

/**
 * Runs with the SERVICE client: call only after the route has authenticated
 * `userId` from the caller's own session.
 */
export async function deleteAccount(
  svc: Svc,
  userId: string,
  removeBlobs: (paths: string[]) => Promise<void>,
): Promise<{ ok: true; deletedAircraft: number } | DeletionError> {
  const { data: owned, error: ownErr } = await svc.from("aircraft").select("id").eq("owner_id", userId);
  if (ownErr) return { error: ownErr.message, code: "server", status: 500 };
  const ids = (owned ?? []).map((a) => a.id);

  // Signed authored entries are immutable (0061 trigger), so the cascade would
  // fail halfway. Refuse up front, before anything is removed.
  const signedChecks = [
    svc.from("log_entry").select("id", { count: "exact", head: true })
      .eq("authored_by", userId).not("authored_signed_at", "is", null),
    ...(ids.length
      ? [svc.from("log_entry").select("id", { count: "exact", head: true })
          .in("aircraft_id", ids).not("authored_signed_at", "is", null)]
      : []),
  ];
  for (const { count, error } of await Promise.all(signedChecks)) {
    if (error) return { error: error.message, code: "server", status: 500 };
    if (count) {
      return {
        error: "This account has logbook entries signed in MyTailLog, which can't be deleted automatically. Email support@mytaillog.com and we'll remove the account.",
        code: "signed_entries",
        status: 409,
      };
    }
  }

  if (ids.length) {
    let paths: string[];
    try {
      paths = await storedPaths(svc, ids);
    } catch (e) {
      return { error: (e as Error).message, code: "server", status: 500 };
    }
    const { error: delErr } = await svc.from("aircraft").delete().in("id", ids);
    if (delErr) return { error: delErr.message, code: "server", status: 500 };
    await removeBlobs(paths);
  }

  const { error: userErr } = await svc.auth.admin.deleteUser(userId);
  if (userErr) return { error: userErr.message, code: "server", status: 500 };
  return { ok: true, deletedAircraft: ids.length };
}
