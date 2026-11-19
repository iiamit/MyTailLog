import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { createRoom, roomJson, roomOpens, roomUrl, ROOM_LIST_COLS, type Room } from "@/lib/recordRoom";
import { decryptSecret } from "@/lib/crypto";
import { loadDueInput } from "@/lib/due/load";
import { computeStatus } from "@/lib/due/engine";

// Record rooms (09 §4.11). Owner only; online only and never queued (14-decisions.md D1).
//   GET  → [{ id, label, audience, cover, mapWindow, includes, url, createdAt, expiresAt, revokedAt, active, opens, lastOpenedAt }]
//   POST { label, audience, mapWindow?, cover?, includeSummary, includeDossier, logbookIds, includeScans, documentIds,
//          includeSquawks, includeReporters, includeGapsNote?, expiresInDays?: 7|14|30|90|180, expiresAt? }
//        → { id, url, qrPayload, expiresAt }; 403 not_owner; 429 rate_limited { retryAfter }.
// RLS (room_owner_all) already limits reads to the owner: editors and viewers get an empty list.
export const runtime = "nodejs";

async function auth(req: Request) {
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}
const noStore = { "Cache-Control": "private, no-store" };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await auth(req);
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const r = await createRoom(supabase, {
    aircraftId: id, userId: user.id, body,
    // IA preset: open until the annual's due date + 14 days (09 §2.12).
    annualDue: async () => {
      const loaded = await loadDueInput(supabase, id, user.id);
      if (!loaded) return null;
      return computeStatus(loaded.input, loaded.today).items.find((i) => i.kind === "annual")?.calendar?.dueDate ?? null;
    },
  });
  if ("error" in r) {
    return NextResponse.json(
      { error: r.error, code: r.code, ...(r.retryAfter ? { retryAfter: r.retryAfter } : {}) },
      { status: r.status, headers: r.retryAfter ? { "Retry-After": String(r.retryAfter) } : undefined },
    );
  }
  return NextResponse.json(r, { headers: noStore });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await auth(req);
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const { data: rooms, error } = await supabase.from("record_room").select(ROOM_LIST_COLS)
    .eq("aircraft_id", id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Couldn't load the links.", code: "failed" }, { status: 500 });
  const roomIds = (rooms ?? []).map((r) => r.id);
  const { data: views } = roomIds.length
    ? await supabase.from("record_room_view").select("room_id, session_key, section, created_at").in("room_id", roomIds)
    : { data: [] as { room_id: string; session_key: string | null; section: string | null; created_at: string }[] };
  return NextResponse.json((rooms ?? []).map((r) => {
    const token = decryptSecret(r.token_enc);
    return roomJson(r as Room, token ? roomUrl(token) : null, roomOpens((views ?? []).filter((v) => v.room_id === r.id)));
  }), { headers: noStore });
}
