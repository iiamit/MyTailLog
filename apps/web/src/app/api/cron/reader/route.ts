import { json, cronDenied } from "@/lib/cronAuth";
import { readQueuedPages } from "@/lib/extraction/queue";

// The reader worker (09 §3.9.1, §6 "every minute"): reads queued pages and
// retries allowance waits whose time has come. Bearer CRON_SECRET, like the
// other scheduled jobs; schedule it every minute in Cloud Scheduler.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = cronDenied(req);
  if (denied) return denied;
  try {
    return json({ ok: true, ...(await readQueuedPages()) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Reader failed." }, 500);
  }
}
