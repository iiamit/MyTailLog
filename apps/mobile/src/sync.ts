import { API_BASE } from "./supabase";
import type { SyncChange, PullPage } from "./types";

export type { SyncChange, PullPage };

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
