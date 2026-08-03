import { createHash, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { getBlob, blobSize } from "@/lib/storage";
import { collectBackupData } from "@/lib/backup/collect";
import { buildServerArchive } from "@/lib/backup/serverArchive";
import { getProvider, type BackupProvider } from "@/lib/backup/providers";
import {
  dayOfMonthFor,
  formatBytes,
  maxArchiveBytes,
  nextRunAt,
  redactSecrets,
  remotePath,
  type BackupFrequency,
} from "@/lib/backup/schedule";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { sendEmail } from "@/lib/email";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Service = SupabaseClient<Database>;
type Due = Database["public"]["Functions"]["backup_due_runs"]["Returns"][number];

// Its OWN route and its OWN Cloud Scheduler job. api/cron/daily is already at
// its time budget (see the ADS-B deadline comment there) and a full archive
// upload would starve the reminder emails.
const DEADLINE_MS = 240_000;
// How long a claim is honoured before another tick may retry it. Longer than any
// single archive can take, so a running upload is never duplicated.
const LEASE_MINUTES = 60;
// Blob size lookups are network round trips; a small pool keeps the pre-flight
// measurement from dominating the run on a 300-page aircraft.
const SIZE_CONCURRENCY = 8;
const SITE = "https://mytaillog.com";

/**
 * Nightly scheduled backup sweep (Cloud Scheduler → Bearer CRON_SECRET).
 *
 * Takes the schedules whose next_run_at has passed, oldest first, and works
 * through them until the time budget is spent — monthly cadence means a one-day
 * slip is invisible, so whatever is left is simply tomorrow's problem. Each
 * destination is claimed with a lease and wrapped in its own try/catch, exactly
 * as runSync/runReminders isolate one user's failure from the rest.
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

  return json(await runBackups(supabase, Date.now()));
}

async function runBackups(supabase: Service, started: number) {
  const { data: due, error } = await supabase.rpc("backup_due_runs", {
    p_now: new Date().toISOString(),
  });
  if (error) return { error: error.message, uploaded: 0, failed: 0, skipped: 0 };

  let uploaded = 0;
  let failed = 0;
  let skipped = 0;
  const unconfigured = new Set<string>();

  for (const d of due ?? []) {
    if (Date.now() - started > DEADLINE_MS) {
      console.warn(`[backup] deadline reached — ${due!.length} due, leaving the rest for tomorrow`);
      break;
    }

    // A provider whose CLIENT_ID/SECRET aren't provisioned skips ITS
    // destinations and leaves the others alone — one unconfigured provider must
    // not stop a user's other backup. One line per provider, same as the ADS-B
    // sweep without OpenSky credentials.
    const provider = getProvider(d.provider);
    if (!provider) {
      if (!unconfigured.has(d.provider)) {
        unconfigured.add(d.provider);
        console.log(`[backup] ${d.provider} credentials not configured — skipping its destinations`);
      }
      continue;
    }

    // Someone else (a retry, an overlapping tick) already has this one.
    const { data: claimed } = await supabase.rpc("claim_backup_schedule", {
      p_schedule_id: d.schedule_id,
      p_lease_minutes: LEASE_MINUTES,
    });
    if (!claimed) continue;

    const outcome = await runDestination(supabase, provider, d);
    uploaded += outcome.uploaded;
    failed += outcome.failed;
    skipped += outcome.skipped;

    const day = d.day_of_month ?? dayOfMonthFor(d.user_id);
    const { data: fails } = await supabase.rpc("complete_backup_schedule", {
      p_schedule_id: d.schedule_id,
      p_next_run_at: nextRunAt(d.frequency as BackupFrequency, day),
      p_failed: outcome.failed + outcome.skipped > 0,
    });

    // A backup that quietly stopped six months ago is worse than none, because
    // the user believed they had one. Two strikes → tell them.
    if ((fails ?? 0) >= 2) await notifyFailing(supabase, d.user_id, fails ?? 0, outcome.lastError);
  }

  return { uploaded, failed, skipped };
}

type Outcome = { uploaded: number; failed: number; skipped: number; lastError: string | null };

async function runDestination(
  supabase: Service,
  provider: BackupProvider,
  d: Due,
): Promise<Outcome> {
  const out: Outcome = { uploaded: 0, failed: 0, skipped: 0, lastError: null };

  let token: string;
  try {
    token = await validAccessToken(supabase, provider, d);
  } catch (e) {
    // No usable token: record ONE failed run so the reason is visible in the UI
    // rather than the schedule silently doing nothing every month.
    out.failed += 1;
    out.lastError = redactSecrets((e as Error).message);
    const { data: runId } = await supabase.rpc("start_backup_run", {
      p_schedule_id: d.schedule_id,
      p_user_id: d.user_id,
      p_aircraft_id: null,
    });
    if (runId) await finish(supabase, runId, "failed", null, null, out.lastError);
    return out;
  }

  const limit = maxArchiveBytes();
  // Opaque provider state (a Drive folder id). Resolved on the first aircraft
  // and reused for the rest of this run, then persisted once.
  let state = d.folder_path;

  for (const ac of await aircraftFor(supabase, d)) {
    const { data: runId } = await supabase.rpc("start_backup_run", {
      p_schedule_id: d.schedule_id,
      p_user_id: d.user_id,
      p_aircraft_id: ac.id,
    });
    if (!runId) continue;

    try {
      const collected = await collectBackupData(supabase, ac.id);
      const bytes = await totalBlobBytes(collected.blobs.map((b) => b.storagePath));
      // Logged on EVERY run: we need the real size distribution before deciding
      // whether the resumable two-phase upload (phase 4) is worth building.
      console.log(
        `[backup] ${ac.tail_number}: ${collected.blobs.length} blobs, ${bytes} bytes (limit ${limit})`,
      );

      if (bytes > limit) {
        // A defined, reported failure beats a mystery timeout at 3am.
        out.skipped += 1;
        await finish(supabase, runId, "skipped_too_large", bytes, null, null);
        continue;
      }

      const archive = buildServerArchive(collected, getBlob);
      const path = remotePath(collected.tail, archive.filename);
      try {
        const up = await provider.upload(token, path, archive.stream, state);
        await archive.result; // surfaces a build-side failure
        out.uploaded += 1;
        await finish(supabase, runId, "ok", up.bytes, up.path, null);
        // The folder the provider resolved (Drive) or nothing (Dropbox). Only
        // written when it actually changed — the user may have deleted the
        // folder, in which case the adapter made a new one.
        if (up.state !== undefined && up.state !== state) {
          state = up.state;
          await supabase.rpc("set_backup_folder", {
            p_destination_id: d.destination_id,
            p_folder_path: state,
          });
        }
      } catch (e) {
        archive.stream.destroy();
        throw e;
      }
    } catch (e) {
      out.failed += 1;
      // backup_run.error is browser-readable by design, and a provider 401 body
      // can quote the token straight back at us.
      out.lastError = redactSecrets((e as Error).message);
      console.error(`[backup] ${ac.tail_number} failed: ${out.lastError}`);
      await finish(supabase, runId, "failed", null, null, out.lastError);
    }
  }
  return out;
}

function finish(
  supabase: Service,
  runId: string,
  status: string,
  bytes: number | null,
  remotePathValue: string | null,
  error: string | null,
) {
  return supabase.rpc("finish_backup_run", {
    p_run_id: runId,
    p_status: status,
    p_bytes: bytes,
    p_remote_path: remotePathValue,
    p_error: error,
  });
}

/** Sum the aircraft's stored blob bytes. Missing blobs count as zero — the
 *  archive builder skips them too. */
async function totalBlobBytes(paths: string[]): Promise<number> {
  let next = 0;
  let total = 0;
  await Promise.all(
    Array.from({ length: Math.min(SIZE_CONCURRENCY, paths.length) }, async () => {
      while (next < paths.length) {
        total += (await blobSize(paths[next++])) ?? 0;
      }
    }),
  );
  return total;
}

/** The schedule's aircraft, or every aircraft the user OWNS when it's null. */
async function aircraftFor(supabase: Service, d: Due) {
  const q = supabase.from("aircraft").select("id, tail_number");
  const { data } = d.aircraft_id
    ? await q.eq("id", d.aircraft_id)
    : await q.eq("owner_id", d.user_id);
  return data ?? [];
}

/**
 * A usable access token, refreshing and persisting when the stored one has
 * expired. Access tokens are short-lived everywhere (Dropbox ~4 h, Google 1 h),
 * so a monthly job refreshes on essentially every run.
 *
 * Only the ACCESS token is written back: a refresh may not reissue a refresh
 * token (Google never does, Dropbox only on first consent), so the stored one
 * must survive. If a refresh starts failing for Google, the likeliest cause is
 * an OAuth app still in "Testing" publishing status — those refresh tokens
 * expire after 7 days, which a monthly job hits every single time.
 */
async function validAccessToken(supabase: Service, provider: BackupProvider, d: Due): Promise<string> {
  const access = decryptSecret(d.access_cipher);
  const refresh = decryptSecret(d.refresh_cipher);
  const expired = d.expires_at != null && new Date(d.expires_at).getTime() - 60_000 < Date.now();
  if (access && !expired) return access;
  if (!refresh) throw new Error("The cloud backup connection has expired — reconnect it from Profile.");

  const tokens = await provider.refresh(refresh);
  await supabase.rpc("set_backup_tokens", {
    p_destination_id: d.destination_id,
    p_access_cipher: encryptSecret(tokens.accessToken),
    p_expires_at: tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
      : null,
  });
  return tokens.accessToken;
}

async function notifyFailing(
  supabase: Service,
  userId: string,
  failures: number,
  lastError: string | null,
): Promise<void> {
  const { data: profile } = await supabase.from("profile").select("email").eq("id", userId).single();
  if (!profile?.email) return;

  // The most recent outcome decides the wording: "too large" is a first-class
  // result with its own fix, not an error.
  const { data: runs } = await supabase
    .from("backup_run")
    .select("status, bytes")
    .eq("user_id", userId)
    .neq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1);
  const last = runs?.[0];

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const reason =
    last?.status === "skipped_too_large"
      ? `Your records add up to about ${formatBytes(last.bytes)}, which is more than the scheduled backup can move in one run. Download the .zip from the aircraft's Export page instead.`
      : `The last error was: ${esc(lastError ?? "unknown")}`;

  await sendEmail({
    to: profile.email,
    subject: "MyTailLog: your cloud backup isn't running",
    html: `<!doctype html><html><body style="margin:0;background:#f8fafc;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:24px;">
        <h2 style="margin:0 0 8px;font-size:18px;color:#0f172a;">Your scheduled backup has failed ${failures} times in a row</h2>
        <p style="margin:0 0 16px;font-size:14px;color:#475569;">${reason}</p>
        <p style="margin:0 0 16px;font-size:14px;color:#475569;">
          Nothing has been deleted anywhere — we only ever add files. Check the connection on your
          <a href="${SITE}/profile" style="color:#2563eb;">MyTailLog profile</a>.
        </p>
        <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;">
          You're receiving this because you set up cloud backups. Turn them off in your profile anytime.
        </p>
      </div>
    </body></html>`,
  });
}

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
