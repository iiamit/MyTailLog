import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Page } from "@/lib/database.types";
import { createServiceClient } from "@/lib/supabase/service";
import { extractPage } from "./pipeline";
import { prepareAi, reserveAiCall, releaseAiReservation, runWithAiContext, logAiUsage } from "./aiContext";
import { batchComplete, pageReadSummary, readingDoneCopy, MAX_READ_ATTEMPTS, type EntryForLook, type PageForProgress } from "./queueRules";

// ===========================================================================
// The server reading queue (09 §3.9.1). Pages uploaded into the queue are read
// here — no open tab or phone needed — by the same extractPage the extract
// route uses. A worker run claims pages atomically (claim_reading_pages, 0086),
// charges each to the uploader's rolling-24-hour allowance, parks the page as
// `waiting_allowance` with a retry time when that is spent, retries a failed
// read once, then closes the scan batch with one notification.
// Triggered by /api/cron/reader every minute. Not kicked from upload requests:
// a read can outlive the request, and a killed read waits 15 minutes for reclaim.
// ===========================================================================

type Svc = SupabaseClient<Database>;
const DAY_MS = 24 * 60 * 60 * 1000;
/** 09 §3.9.1: at most 4 pages read at once per user. shortcut: the cap is per worker run (so per user too); a fleet of uploaders shares it. */
const CONCURRENCY = 4;
const PARK_WHEN_UNCONFIGURED_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// The worker
// ---------------------------------------------------------------------------

/** When the payer's oldest call in the window ages out (09 §3.9.1 retry_after). */
async function nextFreeAt(svc: Svc, userId: string): Promise<string> {
  const { data } = await svc.from("ai_usage").select("created_at").eq("user_id", userId)
    .gt("created_at", new Date(Date.now() - DAY_MS).toISOString()).order("created_at", { ascending: true }).limit(1);
  const oldest = data?.[0]?.created_at ? Date.parse(data[0].created_at) : Date.now();
  return new Date(Math.max(oldest + DAY_MS, Date.now() + 60_000)).toISOString();
}

async function payerOf(svc: Svc, page: Page): Promise<string | null> {
  if (page.queued_by) return page.queued_by;
  if (page.batch_id) {
    const { data } = await svc.from("scan_batch").select("created_by").eq("id", page.batch_id).maybeSingle();
    if (data?.created_by) return data.created_by;
  }
  const { data } = await svc.from("aircraft").select("owner_id").eq("id", page.aircraft_id).maybeSingle();
  return data?.owner_id ?? null;
}

/** Not an attempt: the page waits for allowance (or for AI to be configured) and keeps its tries. */
async function park(svc: Svc, page: Page, readAfter: string) {
  await svc.from("page").update({ extraction_status: "waiting_allowance", read_after: readAfter, read_attempts: Math.max(0, page.read_attempts - 1) }).eq("id", page.id);
}

type Outcome = "read" | "failed" | "retry" | "waiting";

async function readOne(svc: Svc, page: Page): Promise<Outcome> {
  if (page.read_attempts > MAX_READ_ATTEMPTS) {
    // Claimed again after a worker died mid-read, twice. Stop retrying.
    await svc.from("page").update({ extraction_status: "failed", extraction_error: "Reading this page stopped before it finished. Try reading it again." }).eq("id", page.id);
    return "failed";
  }
  const payer = await payerOf(svc, page);
  if (!payer) {
    await svc.from("page").update({ extraction_status: "failed", extraction_error: "No one to read this page for." }).eq("id", page.id);
    return "failed";
  }
  const gate = await prepareAi(svc, payer);
  if ("error" in gate) {
    await park(svc, page, gate.status === 429 ? await nextFreeAt(svc, payer) : new Date(Date.now() + PARK_WHEN_UNCONFIGURED_MS).toISOString());
    return "waiting";
  }
  const reservation = await reserveAiCall(payer, gate.ownKey, gate.provider);
  if (!reservation) {
    await park(svc, page, await nextFreeAt(svc, payer));
    return "waiting";
  }
  try {
    await runWithAiContext(
      { provider: gate.provider, apiKey: gate.apiKey, onUsage: (u) => logAiUsage(payer, "extract", u, gate.ownKey) },
      () => extractPage(svc, page),
    );
    const [{ data: entries }, { data: after }] = await Promise.all([
      svc.from("log_entry").select("entry_date, tach, hobbs, is_continuation, field_confidence").eq("page_id", page.id),
      svc.from("page").select("unread_rotated_content").eq("id", page.id).maybeSingle(),
    ]);
    await svc.from("page").update(pageReadSummary((entries ?? []) as EntryForLook[], after?.unread_rotated_content === true)).eq("id", page.id);
    return "read";
  } catch {
    // extractPage marked the page failed with its message; a first failure goes back in the queue.
    if (page.read_attempts < MAX_READ_ATTEMPTS) {
      await svc.from("page").update({ extraction_status: "queued" }).eq("id", page.id);
      return "retry";
    }
    return "failed";
  } finally {
    await releaseAiReservation(reservation);
  }
}

/** Close a batch whose pages are all read or failed: once, with one notification (09 §3.9.1, 14 D7). */
export async function completeBatch(svc: Svc, batchId: string): Promise<boolean> {
  const { data: batch } = await svc.from("scan_batch").select("id, aircraft_id, expected_pages, created_by, completed_at").eq("id", batchId).maybeSingle();
  if (!batch || batch.completed_at) return false;
  const { data: pages } = await svc.from("page").select("id, extraction_status, needs_look, duplicate_of_page_id").eq("batch_id", batchId);
  if (!batchComplete((pages ?? []) as PageForProgress[], batch.expected_pages)) return false;
  // The conditional update is the lock: two workers finishing the last pages together notify once.
  const { data: won } = await svc.from("scan_batch").update({ completed_at: new Date().toISOString() })
    .eq("id", batchId).is("completed_at", null).select("id").maybeSingle();
  if (!won || !batch.created_by) return Boolean(won);

  const readIds = (pages ?? []).filter((p) => p.extraction_status === "extracted").map((p) => p.id);
  const { count } = readIds.length
    ? await svc.from("log_entry").select("id", { count: "exact", head: true }).in("page_id", readIds).eq("owner_confirmed", false)
    : { count: 0 };
  const copy = readingDoneCopy(readIds.length, count ?? 0);
  const deepLink = `mytaillog://aircraft/${batch.aircraft_id}/logbooks/review?batch=${batchId}`;
  await svc.from("notification").insert({
    user_id: batch.created_by, aircraft_id: batch.aircraft_id, kind: "reading_done", ...copy, deep_link: deepLink,
    actions: [{ id: "review", label: "Review" }], payload: { batchId, needsLook: (pages ?? []).filter((p) => p.needs_look).length },
  });
  try {
    const { data: devices } = await svc.from("device_token").select("token, platform").eq("user_id", batch.created_by);
    if (devices?.length) {
      const { sendToDevices } = await import("@/app/api/push/devices");
      const result = await sendToDevices(devices, { ...copy, data: { deepLink } });
      if (result.dead.length) await svc.from("device_token").delete().in("token", result.dead);
    }
  } catch (e) {
    console.error("reading_done push failed", e);
  }
  await svc.from("scan_batch").update({ notified_at: new Date().toISOString() }).eq("id", batchId);
  return true;
}

/**
 * One worker run: claim, read, repeat until the queue is empty or the time
 * budget is spent. Safe to run concurrently (claims skip locked rows).
 */
export async function readQueuedPages(budgetMs = 240_000): Promise<Record<Outcome, number>> {
  const svc = createServiceClient();
  const started = Date.now();
  const tally: Record<Outcome, number> = { read: 0, failed: 0, retry: 0, waiting: 0 };
  while (Date.now() - started < budgetMs) {
    const { data: claimed, error } = await svc.rpc("claim_reading_pages", { p_limit: CONCURRENCY });
    if (error) throw new Error(`claim_reading_pages: ${error.message}`);
    if (!claimed?.length) break;
    const outcomes = await Promise.all(claimed.map((p) => readOne(svc, p).catch(() => "retry" as const)));
    outcomes.forEach((o) => tally[o]++);
    const batches = new Set(claimed.filter((p, i) => p.batch_id && (outcomes[i] === "read" || outcomes[i] === "failed")).map((p) => p.batch_id!));
    for (const b of batches) await completeBatch(svc, b);
  }
  return tally;
}
