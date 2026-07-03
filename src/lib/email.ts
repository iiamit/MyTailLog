// ===========================================================================
// Transactional email via the Resend HTTP API (no SDK, no new dependency).
// Best-effort: a missing key or an API failure logs and returns false so the
// caller (the daily cron) never crashes on a delivery problem.
// ===========================================================================

const FROM = "MyTailLog <noreply@mytaillog.com>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[email] RESEND_API_KEY not set — skipping send");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend failed (${res.status}): ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[email] Resend request error: ${(e as Error).message}`);
    return false;
  }
}
