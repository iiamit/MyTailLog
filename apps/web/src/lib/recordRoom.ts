import { createHash, randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

// ===========================================================================
// Record room: a revocable, expiring read-only link to records the owner chose.
// The recipient has no account, so every /r/* read goes through the service
// client and THIS module is the only authorization boundary (like
// lib/oauth/resource.ts for the API). Every lookup re-checks the room's
// aircraft and selection; nothing here trusts an id from the URL on its own.
//
// shortcut: no per-IP rate limit on /r/*. A token is 32 random bytes, so
// guessing is infeasible; add one if /r/* traffic ever needs throttling.
// ===========================================================================

export type Room = {
  id: string;
  aircraft_id: string;
  label: string;
  include_summary: boolean;
  logbook_ids: string[];
  include_scans: boolean;
  document_ids: string[];
  expires_at: string;
  revoked_at: string | null;
};

export const ROOM_DEFAULT_DAYS = 30;
export const ROOM_MAX_DAYS = 180;

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url, no padding

export const newRoomToken = () => randomBytes(32).toString("base64url");
export const hashRoomToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const isRoomToken = (token: string) => TOKEN_RE.test(token);

export function roomActive(room: Pick<Room, "expires_at" | "revoked_at">, now = new Date()): boolean {
  return !room.revoked_at && new Date(room.expires_at) > now;
}

/** A scan is visible only from a selected logbook of this aircraft, and only if scans are included. */
export function pageAllowed(room: Room, page: { aircraft_id: string; logbook_id: string }): boolean {
  return room.include_scans && page.aircraft_id === room.aircraft_id && room.logbook_ids.includes(page.logbook_id);
}

/** A document is visible only if the owner picked it, not merely because it's on the aircraft. */
export function documentAllowed(room: Room, doc: { id: string; aircraft_id: string }): boolean {
  return doc.aircraft_id === room.aircraft_id && room.document_ids.includes(doc.id);
}

const ROOM_COLS =
  "id, aircraft_id, label, include_summary, logbook_ids, include_scans, document_ids, expires_at, revoked_at";

/** The room for a token, or null when it's malformed, unknown, revoked or expired. Never says which. */
export async function openRoom(token: string): Promise<Room | null> {
  if (!isRoomToken(token)) return null;
  const { data } = await createServiceClient()
    .from("record_room")
    .select(ROOM_COLS)
    .eq("token_hash", hashRoomToken(token))
    .maybeSingle();
  return data && roomActive(data) ? (data as Room) : null;
}

export const ROOM_ENTRY_LIMIT = 500;

/** Confirmed, current entries from the room's logbooks. Unreviewed OCR is never shown. */
export async function roomEntries(room: Room, logbookId: string, q: string) {
  if (!room.logbook_ids.includes(logbookId)) return [];
  let query = createServiceClient()
    .from("log_entry")
    .select("id, page_id, entry_date, tach, hobbs, description, work_performed")
    .eq("aircraft_id", room.aircraft_id)
    .eq("logbook_id", logbookId)
    .eq("owner_confirmed", true)
    .is("authored_superseded_by", null)
    .order("entry_date", { ascending: false, nullsFirst: false })
    // shortcut: newest 500 per logbook; paginate if rooms get used for decades-long books.
    .limit(ROOM_ENTRY_LIMIT);
  const term = q.trim().replace(/[%_,()"\\]/g, " ").slice(0, 80);
  if (term) query = query.or(`description.ilike.%${term}%,work_performed.ilike.%${term}%`);
  const { data } = await query;
  return data ?? [];
}

export async function roomPage(room: Room, pageId: string) {
  const { data } = await createServiceClient()
    .from("page")
    .select("aircraft_id, logbook_id, storage_path, thumbnail_path")
    .eq("id", pageId)
    .maybeSingle();
  return data && pageAllowed(room, data) ? data : null;
}

export async function roomDocument(room: Room, docId: string) {
  const { data } = await createServiceClient()
    .from("document")
    .select("id, aircraft_id, storage_path, file_name, mime_type")
    .eq("id", docId)
    .maybeSingle();
  return data && documentAllowed(room, data) ? data : null;
}

/** Record a view. The IP is stored only as a hash salted per day; the token never is. */
export async function logRoomView(room: Room, path: string, req: { ip: string | null; userAgent: string | null }) {
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = req.ip
    ? createHash("sha256").update(`${req.ip}|${day}|${process.env.ENCRYPTION_KEY ?? ""}`).digest("hex").slice(0, 32)
    : null;
  await createServiceClient()
    .from("record_room_view")
    .insert({ room_id: room.id, path, ip_hash: ipHash, user_agent: req.userAgent?.slice(0, 200) ?? null });
}

export function roomUrl(token: string): string {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://mytaillog.com").replace(/\/$/, "");
  return `${origin}/r/${token}`;
}
