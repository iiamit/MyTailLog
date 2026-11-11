import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const validToken = (url: string) => {
  const token = new URL(url).searchParams.get("token") ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token) ? token : null;
};

function page(message: string, action?: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyTailLog setup emails</title>
    <main style="max-width:500px;margin:12vh auto;padding:28px;font:16px/1.5 Arial,sans-serif;color:#172235">
      <div style="color:#1766ad;font-size:20px;font-weight:bold;margin-bottom:22px">▲ MyTailLog</div>
      <h1 style="font-size:25px">${message}</h1>
      ${action ? `<p>This stops setup tips only. Maintenance reminders keep their own setting in your profile.</p><form method="post" action="${action}"><button style="background:#1766ad;color:#fff;border:0;border-radius:7px;padding:12px 17px;font:inherit">Unsubscribe</button></form>` : ""}
      <p><a href="https://mytaillog.com/profile">Back to MyTailLog</a></p>
    </main></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

// GET is confirmation only: email security scanners often open links.
export async function GET(req: Request) {
  const token = validToken(req.url);
  if (!token) return page("This link is invalid.", undefined, 400);
  return page("Stop MyTailLog setup emails?", `/api/onboarding/unsubscribe?token=${token}`);
}

// Also accepts the RFC 8058 one-click POST from mail clients.
export async function POST(req: Request) {
  const token = validToken(req.url);
  if (!token) return page("This link is invalid.", undefined, 400);
  try {
    const { data, error } = await createServiceClient().rpc("unsubscribe_onboarding_email", { p_token: token });
    if (error) throw error;
    return page(data ? "You’re unsubscribed from setup emails." : "This link is no longer valid.", undefined, data ? 200 : 404);
  } catch (error) {
    console.error(`[onboarding] unsubscribe failed: ${(error as Error).message}`);
    return page("We couldn’t update your preference. Please try again.", undefined, 500);
  }
}
