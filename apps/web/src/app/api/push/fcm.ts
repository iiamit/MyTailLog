import { GoogleAuth } from "google-auth-library";
import type { PushMessage, PushOutcome } from "./apns";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const auth = new GoogleAuth({ scopes: [SCOPE] });

/** Only a confirmed unregistered token is safe to remove. */
export function isUnregistered(status: number, body: unknown): boolean {
  if (status !== 404 || !body || typeof body !== "object") return false;
  const error = (body as { error?: { details?: Array<{ errorCode?: string }> } }).error;
  return error?.details?.some((d) => d.errorCode === "UNREGISTERED") ?? false;
}

/** Send the same due reminder to Android, using the server's Google identity. */
export async function sendFcm(tokens: string[], msg: PushMessage): Promise<PushOutcome> {
  if (tokens.length === 0) return { sent: 0, dead: [] };
  const project = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) return { sent: 0, dead: [], error: "FCM project is not configured" };

  let accessToken: string | null | undefined;
  try {
    accessToken = await auth.getAccessToken();
  } catch (e) {
    return { sent: 0, dead: [], error: `FCM credentials: ${(e as Error).message}` };
  }
  if (!accessToken) return { sent: 0, dead: [], error: "FCM credentials are unavailable" };

  const outcome: PushOutcome = { sent: 0, dead: [] };
  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`;
  for (const token of tokens) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: {
          token,
          notification: { title: msg.title, body: msg.body },
          android: { ttl: "43200s", priority: "HIGH", notification: { channel_id: "due" } },
          ...(msg.data ? { data: msg.data } : {}),
        } }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        outcome.sent++;
      } else {
        const body: unknown = await res.json().catch(() => null);
        if (isUnregistered(res.status, body)) outcome.dead.push(token);
        else outcome.error ??= `FCM answered ${res.status}`;
      }
    } catch (e) {
      outcome.error ??= `FCM request failed: ${(e as Error).message}`;
    }
  }
  return outcome;
}
