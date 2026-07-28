import { API_BASE } from "./supabase";

// Mirror of the server's pull response (see src/lib/sync/changes.ts + the
// /api/sync/pull route). Kept minimal here; this becomes the shared package.
export type SyncChange =
  | { table: string; op: "upsert"; id: string; seq: number; row: Record<string, unknown> }
  | { table: string; op: "delete"; id: string; seq: number };

export type PullPage = { changes: SyncChange[]; nextCursor: number; hasMore: boolean };

/**
 * Drain /api/sync/pull from `cursor` to the tip, following pagination. Returns
 * every change plus the final cursor. In-memory for this first slice — the next
 * pass applies these into on-device SQLite and persists the cursor.
 */
export async function pullAll(
  accessToken: string,
  cursor = 0,
  onProgress?: (soFar: number) => void,
): Promise<{ changes: SyncChange[]; cursor: number }> {
  const all: SyncChange[] = [];
  let cur = cursor;
  for (;;) {
    const res = await fetch(`${API_BASE}/api/sync/pull?cursor=${cur}&limit=1000`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`pull failed: ${res.status} ${body}`);
    }
    const page = (await res.json()) as PullPage;
    all.push(...page.changes);
    cur = page.nextCursor;
    onProgress?.(all.length);
    if (!page.hasMore) break;
  }
  return { changes: all, cursor: cur };
}
