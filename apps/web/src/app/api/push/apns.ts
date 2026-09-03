import { createSign } from "node:crypto";
import { connect, constants, type ClientHttp2Session } from "node:http2";

// ===========================================================================
// APNs, directly.
//
// Apple's push endpoint is HTTP/2-only and `fetch()` in Node is HTTP/1.1, so
// this uses node:http2. Everything else it needs — an ES256 JWT signed with the
// .p8 key — is twenty lines of node:crypto, which is why there is no push
// library in package.json.
//
// Configuration (Secret Manager → apps/web/apphosting.yaml; see TESTFLIGHT.md):
//   APNS_KEY_ID     the 10-character key id from App Store Connect
//   APNS_TEAM_ID    the 10-character Apple team id
//   APNS_KEY        the contents of the AuthKey_XXXXXXXXXX.p8 file
//   APNS_BUNDLE_ID  com.mytaillog.app — the apns-topic
//   APNS_ENV        "production" (default; TestFlight and the App Store) or
//                   "sandbox" (a build run from Xcode onto a cable-attached
//                   device — a sandbox token on the production host answers
//                   400 BadDeviceToken and vice versa)
//
// Absent config is not an error: sendPush() reports "not configured" and the
// cron logs one line and carries on, exactly as the backup sweep does.
// ===========================================================================

export type PushMessage = { title: string; body: string; data?: Record<string, string> };

/** Which tokens Apple rejected as dead, so the caller can delete them. */
export type PushOutcome = { sent: number; dead: string[]; error?: string };

const HOSTS = { production: "api.push.apple.com", sandbox: "api.sandbox.push.apple.com" } as const;

// Apple rate-limits token generation and accepts a token for an hour. Reuse one
// for 45 minutes — comfortably inside both limits.
const TOKEN_TTL_MS = 45 * 60 * 1000;
let cached: { jwt: string; at: number } | null = null;

type Config = { keyId: string; teamId: string; key: string; topic: string; host: string };

function config(): Config | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const key = process.env.APNS_KEY;
  const topic = process.env.APNS_BUNDLE_ID;
  if (!keyId || !teamId || !key || !topic) return null;
  const env = process.env.APNS_ENV === "sandbox" ? "sandbox" : "production";
  // Secret Manager keeps newlines, but a value pasted through a shell may carry
  // literal \n instead; both have to produce a usable PEM.
  return { keyId, teamId, key: key.replace(/\\n/g, "\n"), topic, host: HOSTS[env] };
}

const b64url = (s: string | Buffer) =>
  Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function providerToken(c: Config): string {
  if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.jwt;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: c.keyId }));
  const payload = b64url(JSON.stringify({ iss: c.teamId, iat: Math.floor(Date.now() / 1000) }));
  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  // JWS wants the raw r‖s pair, not the DER structure OpenSSL emits by default.
  const sig = signer.sign({ key: c.key, dsaEncoding: "ieee-p1363" });
  const jwt = `${header}.${payload}.${b64url(sig)}`;
  cached = { jwt, at: Date.now() };
  return jwt;
}

/**
 * Send one message to many device tokens over a single HTTP/2 connection.
 *
 * A token Apple reports as gone (410 Unregistered, or 400 BadDeviceToken —
 * which is also what a token from the other APNs environment looks like) comes
 * back in `dead` for the caller to delete. Any other failure is counted but not
 * fatal: a notification is a courtesy, and the reminder email already went.
 */
export async function sendPush(tokens: string[], msg: PushMessage): Promise<PushOutcome> {
  if (tokens.length === 0) return { sent: 0, dead: [] };
  const c = config();
  if (!c) return { sent: 0, dead: [], error: "APNs is not configured" };

  let session: ClientHttp2Session;
  try {
    session = connect(`https://${c.host}`);
  } catch (e) {
    return { sent: 0, dead: [], error: (e as Error).message };
  }
  // Without this an unreachable APNs takes the whole cron down with it.
  const failed = new Promise<never>((_, reject) => session.once("error", reject));

  const body = JSON.stringify({
    aps: { alert: { title: msg.title, body: msg.body }, sound: "default", "thread-id": "due" },
    ...(msg.data ?? {}),
  });

  const out: PushOutcome = { sent: 0, dead: [] };
  try {
    const results = await Promise.race([
      Promise.all(tokens.map((t) => sendOne(session, c, t, body))),
      failed,
    ]);
    for (const r of results) {
      if (r.ok) out.sent += 1;
      else if (r.dead) out.dead.push(r.token);
    }
  } catch (e) {
    out.error = (e as Error).message;
  } finally {
    session.close();
  }
  return out;
}

function sendOne(
  session: ClientHttp2Session,
  c: Config,
  token: string,
  body: string,
): Promise<{ token: string; ok: boolean; dead: boolean }> {
  return new Promise((resolve) => {
    const req = session.request({
      [constants.HTTP2_HEADER_METHOD]: "POST",
      [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
      authorization: `bearer ${providerToken(c)}`,
      "apns-topic": c.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      // A reminder that arrives a day late is noise; let Apple drop it.
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 12 * 60 * 60),
    });
    let status = 0;
    let text = "";
    req.setTimeout(10_000, () => req.close());
    req.on("response", (h) => {
      status = Number(h[constants.HTTP2_HEADER_STATUS]) || 0;
    });
    req.on("data", (d: Buffer) => {
      text += d.toString();
    });
    req.on("error", () => resolve({ token, ok: false, dead: false }));
    req.on("end", () => resolve({ token, ok: status === 200, dead: isDead(status, text) }));
    req.end(body);
  });
}

/** Apple's two "this token will never work again" answers. */
function isDead(status: number, body: string): boolean {
  if (status === 410) return true;
  return status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(body);
}

// --- Copy -------------------------------------------------------------------

/** What one aircraft contributes to a notification: its tail and what's due. */
export type PushGroup = { tail: string; labels: string[] };

/**
 * The lock-screen wording. Owner's language: no counts of "items" without
 * naming them where they fit, no dates, no jargon. Tested in
 * apps/web/test/push-alert.test.ts.
 */
export function pushAlert(groups: PushGroup[]): PushMessage | null {
  const total = groups.reduce((n, g) => n + g.labels.length, 0);
  if (total === 0) return null;
  const noun = total === 1 ? "1 item" : `${total} items`;

  if (groups.length === 1) {
    const g = groups[0];
    return { title: `${g.tail} — ${noun} coming due`, body: list(g.labels) };
  }
  return {
    title: `${noun} coming due`,
    body: groups.map((g) => `${g.tail}: ${g.labels.length}`).join(" · "),
  };
}

function list(labels: string[]): string {
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} and ${labels.length - 3} more`;
}
