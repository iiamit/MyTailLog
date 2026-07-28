import { createHash, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { syncUserHours } from "@/lib/mfbSync";
import { sendEmail } from "@/lib/email";
import { getCurrentMeters } from "@/lib/aircraftHours";
import { buildStatusItems, type StatusItem } from "@/lib/status";
import { dueText } from "@/lib/compliance";
import {
  resolveAlerts,
  isDueForReminder,
  dueSignature,
  itemKey,
} from "@/lib/reminders";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Preferences } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Service = SupabaseClient<Database>;
type Aircraft = {
  id: string;
  tail_number: string;
  enrollment_hobbs: number | null;
  enrollment_tach: number | null;
  enrollment_airframe: number | null;
  enrollment_date: string | null;
};

// Re-sync a connection when it's never synced or older than ~23h (leaves slack
// so a job that runs at a slightly-drifting daily time still fires each day).
const SYNC_STALE_MS = 23 * 60 * 60 * 1000;
const SITE = "https://mytaillog.com";

/**
 * Daily scheduled job (Cloud Scheduler → Bearer CRON_SECRET). Two best-effort
 * passes over all users via the service-role client:
 *   1. Sync MyFlightBook hours for each connected user, at most once/day.
 *   2. Email due-maintenance/AD reminders, deduped per due-cycle via reminder_log.
 * One user's failure never aborts the run.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "CRON_SECRET not configured" }, 500);
  if (!timingSafeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let supabase: Service;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const emailById = await loadUserEmails(supabase);

  const usersSynced = await runSync(supabase, emailById);
  const emailsSent = await runReminders(supabase, emailById);

  return json({ usersSynced, emailsSent });
}

// --- Sync pass -------------------------------------------------------------

async function runSync(supabase: Service, emailById: Map<string, string>): Promise<number> {
  const { data: conns } = await supabase
    .from("mfb_connection")
    .select("user_id, access_token, last_synced_at")
    .not("access_token", "is", null);

  const cutoff = Date.now() - SYNC_STALE_MS;
  let usersSynced = 0;
  for (const c of conns ?? []) {
    if (!c.access_token) continue;
    if (c.last_synced_at && new Date(c.last_synced_at).getTime() > cutoff) continue;
    try {
      const aircraft = await accessibleAircraft(supabase, c.user_id, emailById.get(c.user_id));
      const result = await syncUserHours(supabase, c.user_id, aircraft);
      if (result) usersSynced += 1;
      // Stamp only on a clean run so an MFB outage is retried next day.
      await supabase
        .from("mfb_connection")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("user_id", c.user_id);
    } catch (e) {
      console.error(`[cron] sync failed for user ${c.user_id}: ${(e as Error).message}`);
    }
  }
  return usersSynced;
}

// --- Reminder pass ---------------------------------------------------------

async function runReminders(supabase: Service, emailById: Map<string, string>): Promise<number> {
  const { data: profiles } = await supabase.from("profile").select("id, preferences");
  let emailsSent = 0;
  for (const p of profiles ?? []) {
    const prefs = (p.preferences ?? {}) as Preferences;
    if (!prefs.notify_due) continue; // master off → no emails at all
    const email = emailById.get(p.id);
    if (!email) continue;
    try {
      if (await remindUser(supabase, p.id, email, prefs)) emailsSent += 1;
    } catch (e) {
      console.error(`[cron] reminder failed for user ${p.id}: ${(e as Error).message}`);
    }
  }
  return emailsSent;
}

type DueRow = { item: StatusItem; currentHours: number | null };
type AircraftGroup = { tail: string; aircraftId: string; rows: DueRow[] };

async function remindUser(
  supabase: Service,
  userId: string,
  email: string,
  prefs: Preferences,
): Promise<boolean> {
  const alerts = resolveAlerts(prefs);
  const aircraft = await accessibleAircraft(supabase, userId, email);
  if (aircraft.length === 0) return false;

  // Already-sent (item_key|due_signature) pairs for this user.
  const { data: logs } = await supabase
    .from("reminder_log")
    .select("item_key, due_signature")
    .eq("user_id", userId);
  const alreadySent = new Set((logs ?? []).map((l) => `${l.item_key}|${l.due_signature}`));

  const today = new Date();
  const groups: AircraftGroup[] = [];
  const toLog: { item_key: string; due_signature: string; aircraft_id: string }[] = [];

  for (const ac of aircraft) {
    const [{ data: items }, { data: ads }] = await Promise.all([
      supabase.from("maintenance_item").select("*").eq("aircraft_id", ac.id),
      supabase
        .from("ad_compliance")
        .select("id, reference, kind, next_due_date, next_due_hours, status, verified_report_page_id, verified_at")
        .eq("aircraft_id", ac.id)
        .eq("recurring", true)
        .not("status", "in", "(not_applicable,superseded)"),
    ]);

    const { tach: ct, hobbs: ch, airframe: ca, baselineFor, toTotalHours } = await getCurrentMeters(supabase, ac.id, {
      hobbs: ac.enrollment_hobbs,
      tach: ac.enrollment_tach,
      airframe: ac.enrollment_airframe,
      date: ac.enrollment_date,
    });

    const rows: DueRow[] = [];
    for (const s of buildStatusItems(items ?? [], ads ?? [], {
      tach: ct.tach,
      hobbs: ch.hobbs,
      airframe: ca.airframe,
      tachEstimated: ct.estimated,
      hobbsEstimated: ch.estimated,
      baselineFor,
      toTotalHours,
    })) {
      // Don't remind off an untrustworthy hours countdown (last-done meter mismatch).
      if (s.hoursUnreliable) continue;
      // Each item is judged on its own meter (oil on hobbs, 100-hr on tach).
      if (!isDueForReminder(s, s.currentForItem, alerts, today)) continue;
      const key = itemKey(s);
      const sig = dueSignature(s);
      if (alreadySent.has(`${key}|${sig}`)) continue;
      rows.push({ item: s, currentHours: s.currentForItem });
      toLog.push({ item_key: key, due_signature: sig, aircraft_id: ac.id });
    }
    if (rows.length) groups.push({ tail: ac.tail_number, aircraftId: ac.id, rows });
  }

  if (toLog.length === 0) return false; // never send an empty email

  const ok = await sendEmail({
    to: email,
    subject: reminderSubject(groups),
    html: reminderHtml(groups),
  });
  if (!ok) return false; // don't log as sent if delivery failed → retry next run

  await supabase.from("reminder_log").insert(
    toLog.map((t) => ({
      user_id: userId,
      aircraft_id: t.aircraft_id,
      item_key: t.item_key,
      due_signature: t.due_signature,
    })),
  );
  return true;
}

// --- Shared helpers --------------------------------------------------------

/**
 * Aircraft this user may write to, resolved WITHOUT a JWT (service role bypasses
 * RLS): rows they own, plus rows shared to their email. Mirrors the
 * has_aircraft_access choke point from 0015_multi_user.sql.
 */
async function accessibleAircraft(
  supabase: Service,
  userId: string,
  email: string | undefined,
): Promise<Aircraft[]> {
  const byId = new Map<string, Aircraft>();

  const { data: owned } = await supabase
    .from("aircraft")
    .select("id, tail_number, enrollment_hobbs, enrollment_tach, enrollment_airframe, enrollment_date")
    .eq("owner_id", userId);
  for (const a of owned ?? []) byId.set(a.id, a);

  if (email) {
    const { data: shares } = await supabase
      .from("aircraft_share")
      .select("aircraft_id")
      .ilike("invited_email", email);
    const ids = (shares ?? []).map((s) => s.aircraft_id).filter((id) => !byId.has(id));
    if (ids.length) {
      const { data: shared } = await supabase
        .from("aircraft")
        .select("id, tail_number, enrollment_hobbs, enrollment_tach, enrollment_airframe, enrollment_date")
        .in("id", ids);
      for (const a of shared ?? []) byId.set(a.id, a);
    }
  }
  return [...byId.values()];
}

/** userId → email, from Supabase Auth (admin). ponytail: pages of 1000; the
 *  loop covers larger user bases without change. */
async function loadUserEmails(supabase: Service): Promise<Map<string, string>> {
  // Read from profile (kept in sync with auth.users by triggers) rather than the
  // GoTrue admin API — the secret key grants DB access but not admin.listUsers.
  const map = new Map<string, string>();
  const { data } = await supabase.from("profile").select("id, email");
  for (const p of data ?? []) if (p.email) map.set(p.id, p.email);
  return map;
}

// --- Email content ---------------------------------------------------------

function reminderSubject(groups: AircraftGroup[]): string {
  const count = groups.reduce((n, g) => n + g.rows.length, 0);
  const tails = groups.map((g) => g.tail).join(", ");
  return `MyTailLog: ${count} maintenance item${count === 1 ? "" : "s"} due — ${tails}`;
}

function reminderHtml(groups: AircraftGroup[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sections = groups
    .map((g) => {
      const rows = g.rows
        .map(({ item, currentHours }) => {
          const due = dueText(item.nextDueDate, item.nextDueHours, currentHours) ?? "due";
          const tag = item.source === "ad" ? " (AD)" : "";
          return `<tr>
            <td style="padding:6px 0;color:#0f172a;">${esc(item.label)}${tag}</td>
            <td style="padding:6px 0;text-align:right;color:#b45309;white-space:nowrap;">${esc(due)}</td>
          </tr>`;
        })
        .join("");
      return `<div style="margin:0 0 20px;">
        <h3 style="margin:0 0 6px;font-size:16px;color:#0f172a;">
          <a href="${SITE}/aircraft/${g.aircraftId}/status" style="color:#0f172a;text-decoration:none;">${esc(g.tail)}</a>
        </h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>
        <a href="${SITE}/aircraft/${g.aircraftId}/status" style="font-size:13px;color:#2563eb;">View status →</a>
      </div>`;
    })
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f8fafc;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:24px;">
      <h2 style="margin:0 0 4px;font-size:18px;color:#0f172a;">Maintenance coming due</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;">
        These items are within your reminder window (or overdue). MyTailLog is an index and
        decision-support tool — confirm anything you rely on against the physical logbooks.
      </p>
      ${sections}
      <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;">
        You’re receiving this because reminders are on in your
        <a href="${SITE}/profile" style="color:#94a3b8;">MyTailLog profile</a>. Turn them off there anytime.
      </p>
    </div>
  </body></html>`;
}

// --- Utilities -------------------------------------------------------------

/** Constant-time string compare. SHA-256 both sides first so the buffers are
 *  always equal length (no length leak) and crypto.timingSafeEqual can't throw. */
function timingSafeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return cryptoTimingSafeEqual(ha, hb);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
