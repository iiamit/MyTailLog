import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Page } from "@/lib/database.types";
import { createServiceClient } from "@/lib/supabase/service";
import { withJobLease } from "@/lib/jobLease";
import { extractPage } from "./pipeline";
import { prepareAi, reserveAiCall, releaseAiReservation, runWithAiContext, logAiUsage } from "./aiContext";
import { pageReadSummary, MAX_READ_ATTEMPTS, type EntryForLook } from "./queueRules";

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
    const [{ data: entries }, { data: after }, { data: pendingDoc }] = await Promise.all([
      svc.from("log_entry").select("entry_date, tach, hobbs, is_continuation, field_confidence").eq("page_id", page.id),
      svc.from("page").select("unread_rotated_content").eq("id", page.id).maybeSingle(),
      svc.from("scanned_document").select("id").eq("page_id", page.id).eq("applied", false).in("doc_type", ["ad_report", "weight_balance"]).maybeSingle(),
    ]);
    const summary = pageReadSummary((entries ?? []) as EntryForLook[], after?.unread_rotated_content === true);
    const { error: summaryError } = await svc.from("page").update({ ...summary, needs_look: summary.needs_look || !!pendingDoc }).eq("id", page.id);
    if (summaryError) throw new Error(summaryError.message);
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
  return await withJobLease(svc, `reading-notice:${batchId}`, async () => {
    const { data: completed, error } = await svc.rpc("complete_reading_batch", { p_batch_id: batchId });
    if (error) throw new Error(`complete_reading_batch: ${error.message}`);
    const { data: batch, error: readError } = await svc.from("scan_batch")
      .select("aircraft_id, created_by, completed_at, notified_at").eq("id", batchId).maybeSingle();
    if (readError) throw readError;
    if (!batch?.completed_at || batch.notified_at) return completed;
    if (batch.created_by) {
      const { data: notice, error: noticeError } = await svc.from("notification").select("title, body, deep_link")
        .eq("user_id", batch.created_by).eq("kind", "reading_done").contains("payload", { batchId }).limit(1).maybeSingle();
      if (noticeError) throw noticeError;
      if (!notice) throw new Error("Reading finished without its inbox message.");
      const { data: devices, error: devicesError } = await svc.from("device_token").select("token, platform").eq("user_id", batch.created_by);
      if (devicesError) throw devicesError;
      if (devices?.length) {
        const { sendToDevices } = await import("@/app/api/push/devices");
        const result = await sendToDevices(devices, { title: notice.title, body: notice.body, data: { deepLink: notice.deep_link } });
        if (result.dead.length) {
          const { error } = await svc.from("device_token").delete().in("token", result.dead);
          if (error) throw error;
        }
        if (result.sent === 0 && devices.length > result.dead.length) throw new Error(result.error ?? "Reading notification push was not accepted.");
      }
    }
    const { error: stampError } = await svc.from("scan_batch").update({ notified_at: new Date().toISOString() }).eq("id", batchId);
    if (stampError) throw stampError;
    return completed;
  }) ?? false;
}

/** Resume batches even when the last page finished in a process that died before completion. */
async function recoverBatchNotices(svc: Svc, deadline: number): Promise<void> {
  let after: string | undefined;
  for (;;) {
    let query = svc.from("scan_batch").select("id").is("notified_at", null).order("id").limit(100);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) throw error;
    for (const batch of data ?? []) {
      if (Date.now() >= deadline) return;
      try { await completeBatch(svc, batch.id); }
      catch (error) { console.error("Reading notice will retry", { batchId: batch.id, error: error instanceof Error ? error.name : "unknown" }); }
    }
    if (!data || data.length < 100) break;
    after = data[data.length - 1].id;
  }
}

/**
 * One worker run: claim, read, repeat until the queue is empty or the time
 * budget is spent. Safe to run concurrently (claims skip locked rows).
 */
export async function readQueuedPages(budgetMs = 240_000): Promise<Record<Outcome, number>> {
  const svc = createServiceClient();
  const started = Date.now();
  await recoverBatchNotices(svc, started + budgetMs);
  const tally: Record<Outcome, number> = { read: 0, failed: 0, retry: 0, waiting: 0 };
  while (Date.now() - started < budgetMs) {
    const { data: claimed, error } = await svc.rpc("claim_reading_pages", { p_limit: CONCURRENCY });
    if (error) throw new Error(`claim_reading_pages: ${error.message}`);
    if (!claimed?.length) break;
    const outcomes = await Promise.all(claimed.map((p) => readOne(svc, p).catch(() => "retry" as const)));
    outcomes.forEach((o) => tally[o]++);
    const batches = new Set(claimed.filter((p, i) => p.batch_id && (outcomes[i] === "read" || outcomes[i] === "failed")).map((p) => p.batch_id!));
    for (const b of batches) {
      try { await completeBatch(svc, b); }
      catch (error) { console.error("Reading notice will retry", { batchId: b, error: error instanceof Error ? error.name : "unknown" }); }
    }
  }
  return tally;
}
