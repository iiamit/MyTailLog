import { createHmac, timingSafeEqual } from "node:crypto";

const key = () => {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("Print token secret is not configured");
  return secret;
};

export function issueEntryPrintToken(entryId: string, userId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ entryId, userId, expires: now + 10 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", key()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyEntryPrintToken(token: string, entryId: string, now = Date.now()): boolean {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = createHmac("sha256", key()).update(payload).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.entryId === entryId && typeof data.userId === "string" && data.userId.length > 0 &&
      typeof data.expires === "number" && data.expires > now && data.expires <= now + 10 * 60_000;
  } catch { return false; }
}
