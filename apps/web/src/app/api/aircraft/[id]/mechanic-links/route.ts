import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { createLink, linkUrl } from "@/lib/mechanicLink";
import { tryDecryptSecret } from "@/lib/crypto";

// Mechanic links (09 §4.12). Online only and never queued (14-decisions.md D1).
//   POST { kind: 'squawk', squawkIds, recipientLabel, providerId?, expiresInDays: 7|30|90, includePhotos, includeReporter }
//        → { id, url, expiresAt, mailto }; 403 viewer_read_only for viewers.
//   GET  → [{ id, kind, squawkIds, visitId, recipientLabel, providerId, url, expiresAt, revokedAt, createdAt, opens, lastOpenedAt }]
// RLS (mlink_manage) limits both to the owner and editors; viewers see an empty list.
export const runtime = "nodejs";

async function auth(req: Request) {
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await auth(req);
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body && typeof body === "object" && "kind" in body && body.kind !== "squawk")
    return NextResponse.json({ error: "Send a visit from its own page.", code: "invalid" }, { status: 400 });
  const r = await createLink(supabase, { aircraftId: id, userId: user.id, kind: "squawk", body });
  if ("error" in r) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json(r);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await auth(req);
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const { data: links, error } = await supabase.from("mechanic_link")
    .select("id, kind, squawk_ids, visit_id, recipient_label, provider_id, token_enc, include_photos, include_reporter, expires_at, revoked_at, created_at")
    .eq("aircraft_id", id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message, code: "failed" }, { status: 500 });
  const ids = (links ?? []).map((l) => l.id);
  const { data: views } = ids.length
    ? await supabase.from("mechanic_link_view").select("link_id, created_at").in("link_id", ids)
    : { data: [] as { link_id: string; created_at: string }[] };
  return NextResponse.json((links ?? []).map((l) => {
    const mine = (views ?? []).filter((v) => v.link_id === l.id).map((v) => v.created_at).sort();
    const token = tryDecryptSecret(l.token_enc);
    return {
      id: l.id, kind: l.kind, squawkIds: l.squawk_ids, visitId: l.visit_id, recipientLabel: l.recipient_label, providerId: l.provider_id,
      includePhotos: l.include_photos, includeReporter: l.include_reporter, url: token ? linkUrl(token) : null,
      expiresAt: l.expires_at, revokedAt: l.revoked_at, createdAt: l.created_at, opens: mine.length, lastOpenedAt: mine.at(-1) ?? null,
    };
  }), { headers: { "Cache-Control": "private, no-store" } });
}
