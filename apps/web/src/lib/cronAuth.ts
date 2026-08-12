import { createHash, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";

/** JSON response helper shared by the cron routes. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Constant-time compare. Hashing first means unequal lengths are compared
 * safely — cryptoTimingSafeEqual throws on a length mismatch, and that throw
 * would itself leak the length.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return cryptoTimingSafeEqual(ha, hb);
}

/**
 * Bearer CRON_SECRET gate for the scheduled endpoints. Returns null when the
 * caller is authorized, or the Response to send back when it isn't.
 *
 * Lives here rather than in one route because there are now two callers: Cloud
 * Scheduler (the daily job) and the GitHub Actions ADS-B sweep. One copy of an
 * auth check is the only number that can't drift.
 */
export function cronDenied(req: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "CRON_SECRET not configured" }, 500);
  if (!timingSafeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}
