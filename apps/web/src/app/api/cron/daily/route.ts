import { advanceVisits } from "@/lib/writes/visits";
import { createServiceClient } from "@/lib/supabase/service";
import { createHash } from "node:crypto";
import { syncUserHours } from "@/lib/mfbSync";
import { sendEmail } from "@/lib/email";
import { runOnboardingEmails } from "@/lib/onboardingEmails";
import { loadDueInput } from "@/lib/due/load";
import { computeStatus } from "@/lib/due/engine";
import { todayIn, type MapInput } from "@/lib/mapModel";
import {
  resolveAlerts, dueReminders, pendingFor, openChannels,
  type Channel, type LeadOverride, type Reminder, type SentRow,
} from "@/lib/reminders";
import { composeAircraft, composePush, phrase, type Composed } from "@/lib/notifications";
import { json, cronDenied } from "@/lib/cronAuth";
import { sendToDevices } from "../../push/devices";
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
 * Daily scheduled job (Cloud Scheduler → Bearer CRON_SECRET). Three best-effort
 * passes over all users via the service-role client:
 *   1. Sync MyFlightBook hours for each connected user, at most once/day.
 *   2. Email due-maintenance/AD reminders, deduped per due-cycle via reminder_log,
 *      and send the same reminder to any registered device (see pushReminder).
 *   3. Send contextual setup emails once per milestone, with a separate opt-out.
 * One user's failure never aborts the run.
 *
 * The ADS-B sweep used to run here. It moved to GitHub Actions
 * because OpenSky blackholes Google Cloud egress — see the header of
 * app/api/cron/adsb/route.ts for the measurements.
 */
export async function POST(req: Request) {
  const denied = cronDenied(req);
  if (denied) return denied;

  let supabase: Service;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const emailById = await loadUserEmails(supabase);

  const usersSynced = await runSync(supabase, emailById);
  const emailsSent = await runReminders(supabase, emailById);

  let onboardingSent = 0;
  try {
    onboardingSent = await runOnboardingEmails(supabase);
  } catch (error) {
    // A missing migration or delivery issue must not interrupt other daily work.
    console.error(`[cron] onboarding failed: ${(error as Error).message}`);
  }

  // Planned visits whose week has passed wait for their records (09 §2.5). UTC day, as the rest of this job.
  let visitsAwaitingRecords = 0;
  try {
    visitsAwaitingRecords = await advanceVisits(supabase, new Date().toISOString().slice(0, 10));
  } catch (error) {
    console.error(`[cron] visits failed: ${(error as Error).message}`);
  }

  // View log trim (09 §6): weekly, Sundays UTC, drop record-room and mechanic-link views older than 2 years.
  let viewsTrimmed = 0;
  if (new Date().getUTCDay() === 0) {
    const before = new Date(Date.now() - 730 * 86_400_000).toISOString();
    for (const table of ["record_room_view", "mechanic_link_view"] as const) {
      const { count, error } = await supabase.from(table).delete({ count: "exact" }).lt("created_at", before);
      if (error) console.error(`[cron] ${table} trim failed: ${error.message}`);
      else viewsTrimmed += count ?? 0;
    }
    // The inbox keeps 90 days (08 §3.17).
    const { error } = await supabase.from("notification").delete().lt("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString());
    if (error) console.error(`[cron] notification trim failed: ${error.message}`);
  }

  return json({ usersSynced, emailsSent, onboardingSent, visitsAwaitingRecords, viewsTrimmed });
}

// --- Sync pass -------------------------------------------------------------

async function runSync(supabase: Service, emailById: Map<string, string>): Promise<number> {
  // Credentials live in a private schema (0047); this RPC returns the users who
  // hold a live token (already filtered to access_token not null).
  const { data: conns } = await supabase.rpc("mfb_conns_to_sync");

  const cutoff = Date.now() - SYNC_STALE_MS;
  let usersSynced = 0;
  for (const c of conns ?? []) {
    if (c.last_synced_at && new Date(c.last_synced_at).getTime() > cutoff) continue;
    try {
      const aircraft = await accessibleAircraft(supabase, c.user_id, emailById.get(c.user_id));
      const result = await syncUserHours(supabase, c.user_id, aircraft);
      // A failed refresh or partial write must remain eligible for the next run.
      if (!result || result.errors.length) continue;
      const { error } = await supabase.rpc("stamp_mfb_synced", { p_user_id: c.user_id });
      if (error) throw error;
      usersSynced += 1;
    } catch (e) {
      console.error(`[cron] sync failed for user ${c.user_id}: ${(e as Error).message}`);
    }
  }
  return usersSynced;
}

// --- Reminder pass ---------------------------------------------------------
//
// 09 §3.11 / 14-decisions.md D7. Due items come from the due engine (computeStatus),
// so the unconfirmed gate holds: an entry read by AI and not yet confirmed moves no
// reminder. Per user: an in-app notification per aircraft, at most one email digest
// and at most one push per local day, pushes held back in quiet hours (the next run
// outside them sends what is still pending). Every send is logged per channel in
// reminder_log; its unique key (0091) is the once-per-cycle rule.

type Loaded = { tail: string; input: MapInput; overrides: Map<string, LeadOverride> };
type Group = { aircraftId: string; tail: string; today: string; reminders: Reminder[]; visits: Map<string, string>; sent: SentRow[] };

async function runReminders(supabase: Service, emailById: Map<string, string>): Promise<number> {
  const { data: profiles } = await supabase.from("profile").select("id, preferences, time_zone");
  const byAircraft = new Map<string, Promise<Loaded | null>>();
  let emailsSent = 0;
  for (const p of profiles ?? []) {
    try {
      const prefs = (p.preferences ?? {}) as Preferences;
      if (await remindUser(supabase, byAircraft, p.id, emailById.get(p.id), prefs, p.time_zone ?? null)) emailsSent += 1;
    } catch (e) {
      console.error(`[cron] reminder failed for user ${p.id}: ${(e as Error).message}`);
    }
  }
  return emailsSent;
}

/** The engine's rows for one aircraft, read once per run and shared by every user who sees it. */
function loadAircraft(supabase: Service, cache: Map<string, Promise<Loaded | null>>, ac: Aircraft, userId: string): Promise<Loaded | null> {
  let p = cache.get(ac.id);
  if (!p) {
    p = (async () => {
      const [loaded, { data: mx }] = await Promise.all([
        loadDueInput(supabase, ac.id, userId),
        supabase.from("maintenance_item").select("id, remind_lead_days, remind_lead_hours").eq("aircraft_id", ac.id),
      ]);
      if (!loaded) return null;
      const overrides = new Map<string, LeadOverride>();
      for (const m of mx ?? []) overrides.set(`mx:${m.id}`, { days: m.remind_lead_days, hours: m.remind_lead_hours });
      for (const d of loaded.input.document ?? []) overrides.set(`doc:${d.id}`, { days: d.remind_lead_days ?? null });
      return { tail: ac.tail_number, input: loaded.input, overrides };
    })();
    cache.set(ac.id, p);
  }
  return p;
}

async function remindUser(
  supabase: Service,
  cache: Map<string, Promise<Loaded | null>>,
  userId: string,
  email: string | undefined,
  prefs: Preferences,
  tz: string | null,
): Promise<boolean> {
  const alerts = resolveAlerts(prefs);
  const aircraft = await accessibleAircraft(supabase, userId, email);
  if (aircraft.length === 0) return false;

  const [{ data: logs, error: logsError }, { data: snoozes, error: snoozeError }] = await Promise.all([
    supabase.from("reminder_log").select("aircraft_id, item_key, due_signature, kind, channel, nth, sent_at").eq("user_id", userId),
    supabase.from("reminder_snooze").select("aircraft_id, item_key, due_signature, until_at").eq("user_id", userId),
  ]);
  if (logsError) throw logsError;
  if (snoozeError) throw snoozeError;
  // v1 keyed maintenance items 'maint:<id>' and sent its email and push together.
  const sent: (SentRow & { aircraft_id: string })[] = (logs ?? []).flatMap((l) =>
    l.item_key.startsWith("maint:")
      ? (["email", "push", "in_app"] as const).map((channel) => ({ ...l, item_key: `mx:${l.item_key.slice(6)}`, channel }))
      : [l],
  );

  const now = new Date();
  const today = todayIn(tz, now);
  const groups: Group[] = [];
  for (const ac of aircraft) {
    const loaded = await loadAircraft(supabase, cache, ac, userId);
    if (!loaded) continue;
    const snap = computeStatus(loaded.input, today);
    const mine = sent.filter((s) => s.aircraft_id === ac.id);
    const reminders = dueReminders(snap, alerts, {
      sent: mine,
      snoozes: (snoozes ?? []).filter((s) => s.aircraft_id === ac.id),
      now,
      leadOverride: loaded.overrides,
    });
    const visits = new Map(snap.visits.planned.filter((v) => v.id).map((v) => [v.id!, v.weekOf]));
    if (reminders.length) groups.push({ aircraftId: ac.id, tail: loaded.tail, today, reminders, visits, sent: mine });
  }
  if (groups.length === 0) return false;

  const pending = (channel: Channel) =>
    groups.map((g) => ({ ...g, reminders: pendingFor(g.reminders, channel, g.sent) })).filter((g) => g.reminders.length);
  const log = async (channel: Channel, gs: Group[]) => {
    const { error } = await supabase.from("reminder_log").insert(gs.flatMap((g) => g.reminders.map((r) => ({
      user_id: userId, aircraft_id: g.aircraftId, item_key: r.itemKey, due_signature: r.dueSignature,
      kind: r.kind, channel, nth: r.nth, visit_id: r.visit?.id ?? null,
    }))));
    // 23505: a concurrent run logged the same send; the unique key already holds the rule.
    if (error && error.code !== "23505") throw error;
  };
  const compose = (gs: Group[]) => gs.map((g) => composeAircraft({ id: g.aircraftId, tail: g.tail }, g.reminders, g.today, g.visits));

  // Inbox: every reminder lands there (08 §3.17), one notification per aircraft.
  const inbox = pending("in_app");
  if (inbox.length) {
    const rows = compose(inbox).map((c, i) => ({
      user_id: userId, aircraft_id: inbox[i].aircraftId, kind: c.kind, title: c.title.slice(0, 140), body: c.body.slice(0, 600),
      deep_link: c.deepLink, actions: c.actions, payload: c.payload,
    }));
    const { error } = await supabase.from("notification").insert(rows);
    if (error) throw error;
    await log("in_app", inbox);
  }

  // notify_due stays the master switch for email and push, as in v1.
  const open = openChannels(alerts, sent, { tz, now, notifyDue: prefs.notify_due === true, hasEmail: !!email });
  let emailed = false;
  const mail = open.includes("email") ? pending("email") : [];
  if (email && mail.length) {
    const composed = compose(mail);
    emailed = await sendEmail({
      to: email,
      subject: composed.length === 1 ? `MyTailLog: ${composed[0].title}` : `MyTailLog: reminders for ${mail.map((g) => g.tail).join(", ")}`,
      html: reminderHtml(mail, composed),
      idempotencyKey: createHash("sha256")
        .update(`${userId}:${mail.flatMap((g) => g.reminders.map((r) => `${r.itemKey}|${r.dueSignature}|${r.kind}|${r.nth}`)).sort().join(",")}`)
        .digest("hex"),
    });
    // Not logged when delivery failed, so the next run tries again.
    if (emailed) await log("email", mail);
  }

  if (open.includes("push")) {
    const toPush = pending("push");
    if (toPush.length) await pushReminder(supabase, userId, toPush, compose(toPush), log);
  }
  return emailed;
}

// --- Push pass -------------------------------------------------------------
//
// The same reminders on the lock screen, at most once a day (D7). Logged only when a
// device took it, so a user with no device yet, or a push service that failed, gets
// the pending reminders on a later run instead of losing them.

/** Best-effort: a failed push never fails the reminder run. */
async function pushReminder(
  supabase: Service,
  userId: string,
  groups: Group[],
  composed: Composed[],
  log: (channel: Channel, gs: Group[]) => Promise<void>,
): Promise<void> {
  const alert = composePush(composed);
  if (!alert) return;
  try {
    const { data } = await supabase.from("device_token").select("token, platform").eq("user_id", userId);
    const devices = data ?? [];
    if (devices.length === 0) return;

    const result = await sendToDevices(devices, alert);
    if (result.error) console.error(`[cron] push for user ${userId}: ${result.error}`);
    // A device that was deleted, restored, or reinstalled hands back a token
    // its push service will never accept again. Drop it or retry every night.
    if (result.dead.length) await supabase.from("device_token").delete().in("token", result.dead);
    if (result.sent > 0) await log("push", groups);
  } catch (e) {
    console.error(`[cron] push failed for user ${userId}: ${(e as Error).message}`);
  }
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

function reminderHtml(groups: Group[], composed: Composed[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sections = groups
    .map((g, i) => {
      const url = `${SITE}/aircraft/${g.aircraftId}/status`;
      const lines = g.reminders.length === 1 ? [composed[i].body] : g.reminders.map((r) => phrase(r, g.today));
      const rows = lines.map((line) => `<tr><td style="padding:6px 0;color:#0f172a;">${esc(line)}</td></tr>`).join("");
      return `<div style="margin:0 0 20px;">
        <h3 style="margin:0 0 6px;font-size:16px;color:#0f172a;">
          <a href="${url}" style="color:#0f172a;text-decoration:none;">${esc(composed[i].title)}</a>
        </h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>
        <a href="${url}" style="font-size:13px;color:#2563eb;">View status →</a>
      </div>`;
    })
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f8fafc;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:24px;">
      <h2 style="margin:0 0 4px;font-size:18px;color:#0f172a;">What the records show is coming due</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;">
        Built only from entries you confirmed. An "about" date is projected from your recent
        flying; the hours figure is what comes due. The logbooks remain the record.
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
