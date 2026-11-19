import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, RecordRoom } from "@/lib/database.types";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { hit } from "@/lib/rateLimit";

type Db = SupabaseClient<Database>;

// ===========================================================================
// Record room: a revocable, expiring read-only link to records the owner chose.
// The recipient has no account, so every /r/* read goes through the service
// client and THIS module is the only authorization boundary (like
// lib/oauth/resource.ts for the API). Every lookup re-checks the room's
// aircraft and selection; nothing here trusts an id from the URL on its own.
// v2 (09 §2.12, §4.11; 08 §3.16): audience presets, map cover, extend by 30 days,
// opens counted per browser session.
// ===========================================================================

export type Room = Pick<
  RecordRoom,
  | "id" | "aircraft_id" | "label" | "include_summary" | "logbook_ids" | "include_scans" | "document_ids" | "expires_at"
  | "revoked_at" | "audience" | "cover" | "map_window" | "include_dossier" | "include_squawks" | "include_reporters"
  | "include_gaps_note" | "created_at"
>;
export type Audience = Room["audience"];
export type MapWindow = Room["map_window"];

export const ROOM_DEFAULT_DAYS = 30;
export const ROOM_MAX_DAYS = 180;
/** 08 §3.16 and W-SHARE-01: 14 days is the insurer preset; the rest are the choices on every platform. */
export const ROOM_DAYS = [7, 14, 30, 90, 180] as const;
/** 09 §4.14: record-room creation, 20 per day per aircraft. */
export const ROOM_DAILY_CAP = 20;
/** Requests per minute per visitor on /r/* (hashed IP). Generous for a person, a wall for a scraper. */
export const ROOM_VIEW_RATE = 120;
/** One "open" is one browser within 30 minutes (09 §2.12). */
const SESSION_SECONDS = 1800;
const DAY = 86_400_000;

const PRESET: Record<Audience, { days: number; mapWindow: MapWindow }> = {
  ia: { days: ROOM_DEFAULT_DAYS, mapWindow: "line_ahead" }, // days only when the annual date is unknown
  buyer: { days: 30, mapWindow: "whole_life" },
  insurer: { days: 14, mapWindow: "last_5_years" },
  other: { days: 30, mapWindow: "whole_life" },
};

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

/**
 * The sections a room shows, in the recipient's tab order (W-SHARE-02): the map first, then the owner's choices.
 * Values are what record_room_view.section stores: 'map','summary','dossier','documents','logbook:<id>'.
 */
export function roomSections(room: Room): string[] {
  return [
    ...(room.logbook_ids.length ? ["map"] : []),
    ...(room.include_summary ? ["summary"] : []),
    ...(room.include_dossier ? ["dossier"] : []),
    ...room.logbook_ids.map((id) => `logbook:${id}`),
    ...(room.document_ids.length ? ["documents"] : []),
  ];
}

const ROOM_COLS =
  "id, aircraft_id, label, include_summary, logbook_ids, include_scans, document_ids, expires_at, revoked_at, audience, cover, map_window, include_dossier, include_squawks, include_reporters, include_gaps_note, created_at";

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
/** W-SHARE-02: the Logbooks tab pages 100 at a time, no cap. */
export const ROOM_PAGE_SIZE = 100;

/**
 * Confirmed and signed, current entries from one of the room's logbooks (09 §3.1). Unreviewed text is never shown;
 * a replaced owner note and a superseded authored entry are not current.
 */
export async function roomEntries(room: Room, logbookId: string, q: string, page = 0, size = ROOM_ENTRY_LIMIT) {
  if (!room.logbook_ids.includes(logbookId)) return [];
  let query = createServiceClient()
    .from("log_entry")
    .select("id, page_id, entry_date, tach, hobbs, description, work_performed, trust")
    .eq("aircraft_id", room.aircraft_id)
    .eq("logbook_id", logbookId)
    .in("trust", ["confirmed", "signed"])
    .is("replaced_by_entry_id", null)
    .is("authored_superseded_by", null)
    .order("entry_date", { ascending: false, nullsFirst: false })
    .order("id")
    .range(page * size, page * size + size - 1);
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

type Visitor = { ip: string | null; userAgent: string | null };

/** The visitor of a request: first X-Forwarded-For hop (Cloud Run's front end sets it) and the user agent. */
export function visitorOf(h: { get(name: string): string | null }): Visitor {
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null, userAgent: h.get("user-agent") };
}

/** IP hashed with a per-day salt and the server secret: a day's views group together, the IP is never stored. */
export function ipHashOf(ip: string | null, now = new Date()): string | null {
  if (!ip) return null;
  const day = now.toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${day}|${process.env.ENCRYPTION_KEY ?? ""}`).digest("hex").slice(0, 32);
}

/** sha256(ip_hash || user_agent || floor(epoch / 1800)) (09 §2.12): one browser in one 30-minute window. */
export function sessionKeyOf(ipHash: string | null, userAgent: string | null, now = new Date()): string {
  const bucket = Math.floor(now.getTime() / 1000 / SESSION_SECONDS);
  return createHash("sha256").update(`${ipHash ?? ""}|${userAgent ?? ""}|${bucket}`).digest("hex").slice(0, 32);
}

/** Seconds to wait when this visitor has made too many /r/* requests this minute, else null. */
export function roomRateLimited(v: Visitor): number | null {
  return hit(`room:${ipHashOf(v.ip) ?? "unknown"}`, ROOM_VIEW_RATE, 60_000);
}

/** Record a view, unless it is the owner previewing their own link (W-SHARE-01). The IP is stored only as a hash salted per day; the token never is. */
export async function logRoomView(room: Room, path: string, v: Visitor, section: string | null = null) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (user) {
    const { data: ac } = await createServiceClient().from("aircraft").select("owner_id").eq("id", room.aircraft_id).maybeSingle();
    if (ac?.owner_id === user.id) return;
  }
  const ipHash = ipHashOf(v.ip);
  const userAgent = v.userAgent?.slice(0, 200) ?? null;
  await createServiceClient().from("record_room_view").insert({
    room_id: room.id, path: path.slice(0, 300), ip_hash: ipHash, user_agent: userAgent,
    session_key: sessionKeyOf(ipHash, userAgent), section,
  });
}

export function roomUrl(token: string): string {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://mytaillog.com").replace(/\/$/, "");
  return `${origin}/r/${token}`;
}

// --- Owner side (09 §4.11): create, list, extend, rename, revoke, opens -----------

export type RoomInput = {
  label: string;
  audience: Audience;
  cover: Room["cover"];
  mapWindow: MapWindow;
  includeSummary: boolean;
  includeDossier: boolean;
  includeScans: boolean;
  includeSquawks: boolean;
  includeReporters: boolean;
  includeGapsNote: boolean;
  logbookIds: string[];
  documentIds: string[];
  days: number | null;
  expiresAt: string | null;
};

const AUDIENCES: Audience[] = ["ia", "buyer", "insurer", "other"];
const WINDOWS: MapWindow[] = ["whole_life", "line_ahead", "last_5_years"];
const ids = (v: unknown, max: number) =>
  Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string") ? [...new Set(v as string[])] : null;

/** Validate the create body (09 §4.11). Ids are checked against the aircraft by the caller. */
export function pickRoomInput(body: unknown): RoomInput | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Say who the link is for." };
  const b = body as Record<string, unknown>;
  const label = typeof b.label === "string" ? b.label.trim() : "";
  if (!label || label.length > 80) return { error: "Say who the link is for (up to 80 characters)." };
  const audience = (b.audience ?? "other") as Audience;
  if (!AUDIENCES.includes(audience)) return { error: "Pick who the link is for: your IA, a buyer, an insurer or someone else." };
  const mapWindow = (b.mapWindow ?? PRESET[audience].mapWindow) as MapWindow;
  if (!WINDOWS.includes(mapWindow)) return { error: "Pick what the link opens on." };
  const cover = (b.cover ?? "map") as Room["cover"];
  if (cover !== "map" && cover !== "summary") return { error: "The cover is the map or the summary." };
  const logbookIds = ids(b.logbookIds ?? [], 50);
  const documentIds = ids(b.documentIds ?? [], 500);
  if (!logbookIds || !documentIds) return { error: "Logbooks and documents are lists of ids." };
  let days: number | null = null;
  let expiresAt: string | null = null;
  if (b.expiresInDays != null) {
    if (!ROOM_DAYS.includes(b.expiresInDays as 7)) return { error: "Pick 7, 14, 30, 90 or 180 days." };
    days = b.expiresInDays as number;
  } else if (b.expiresAt != null) {
    if (typeof b.expiresAt !== "string" || Number.isNaN(Date.parse(b.expiresAt))) return { error: "The end date isn't a date." };
    expiresAt = b.expiresAt;
  }
  const flag = (k: string, dflt = false) => (typeof b[k] === "boolean" ? (b[k] as boolean) : dflt);
  const includeSquawks = flag("includeSquawks");
  return {
    label, audience, cover, mapWindow, logbookIds, documentIds, days, expiresAt,
    includeSummary: flag("includeSummary"), includeDossier: flag("includeDossier"), includeScans: flag("includeScans"),
    includeSquawks, includeReporters: includeSquawks && flag("includeReporters"), includeGapsNote: flag("includeGapsNote", true),
  };
}

/**
 * When the link ends (09 §2.12, 08 §3.16). A chosen date must fall within 180 days; the IA preset with no choice
 * ends 14 days after the annual is due (at most 180 days), or 30 days when the annual date is unknown or past.
 */
export function roomExpiry(input: Pick<RoomInput, "audience" | "days" | "expiresAt">, now: Date, annualDue: string | null): string | { error: string } {
  const max = now.getTime() + ROOM_MAX_DAYS * DAY;
  if (input.expiresAt) {
    const t = Date.parse(input.expiresAt.length === 10 ? `${input.expiresAt}T23:59:59Z` : input.expiresAt);
    if (t <= now.getTime() || t > max) return { error: "Pick an end date within the next 180 days." };
    return new Date(t).toISOString();
  }
  if (input.days) return new Date(now.getTime() + input.days * DAY).toISOString();
  if (input.audience === "ia" && annualDue) {
    const t = Math.min(Date.parse(`${annualDue}T23:59:59Z`) + 14 * DAY, max);
    if (t > now.getTime()) return new Date(t).toISOString();
  }
  return new Date(now.getTime() + PRESET[input.audience].days * DAY).toISOString();
}

type Fail = { error: string; code: string; status: number; retryAfter?: number };

/** The aircraft when the caller owns it (record rooms are owner only, 08 §3.16), else a 403/404. */
async function ownedAircraft(supabase: Db, aircraftId: string, userId: string): Promise<{ id: string; tail_number: string } | Fail> {
  const { data } = await supabase.from("aircraft").select("id, tail_number, owner_id").eq("id", aircraftId).maybeSingle();
  if (!data) return { error: "Aircraft not found.", code: "not_found", status: 404 };
  if (data.owner_id !== userId) return { error: "Only the owner can make or change record room links.", code: "not_owner", status: 403 };
  return data;
}

/**
 * Make a link as the signed-in owner. Every id it names is re-checked against the aircraft; the token is returned
 * once here and kept encrypted so the owner can copy it again from the list.
 */
export async function createRoom(
  supabase: Db,
  o: { aircraftId: string; userId: string; body: unknown; annualDue?: () => Promise<string | null> },
): Promise<{ id: string; url: string; qrPayload: string; expiresAt: string } | Fail> {
  const owned = await ownedAircraft(supabase, o.aircraftId, o.userId);
  if ("error" in owned) return owned;
  const input = pickRoomInput(o.body);
  if ("error" in input) return { error: input.error, code: "invalid", status: 400 };

  const since = new Date(Date.now() - DAY).toISOString();
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [{ data: recent }, { data: books }, { data: docs }] = await Promise.all([
    supabase.from("record_room").select("created_at").eq("aircraft_id", o.aircraftId).gte("created_at", since).order("created_at"),
    supabase.from("logbook").select("id").eq("aircraft_id", o.aircraftId).in("id", input.logbookIds.length ? input.logbookIds : none),
    supabase.from("document").select("id").eq("aircraft_id", o.aircraftId).in("id", input.documentIds.length ? input.documentIds : none),
  ]);
  if ((recent ?? []).length >= ROOM_DAILY_CAP) {
    const retryAfter = Math.max(1, Math.ceil((Date.parse(recent![0].created_at) + DAY - Date.now()) / 1000));
    return { error: "That's 20 links today for this aircraft. Try again tomorrow.", code: "rate_limited", status: 429, retryAfter };
  }
  if ((books ?? []).length !== input.logbookIds.length || (docs ?? []).length !== input.documentIds.length)
    return { error: "One of those logbooks or documents isn't on this aircraft.", code: "invalid", status: 400 };
  if (!input.includeSummary && !input.includeDossier && !input.logbookIds.length && !input.documentIds.length && !input.includeSquawks)
    return { error: "Include at least one thing to share.", code: "invalid", status: 400 };

  const needsAnnual = input.audience === "ia" && !input.days && !input.expiresAt;
  const expiresAt = roomExpiry(input, new Date(), needsAnnual && o.annualDue ? await o.annualDue() : null);
  if (typeof expiresAt !== "string") return { error: expiresAt.error, code: "invalid", status: 400 };

  const token = newRoomToken();
  const { data: row, error } = await supabase.from("record_room").insert({
    aircraft_id: o.aircraftId, created_by: o.userId, label: input.label,
    token_hash: hashRoomToken(token), token_enc: encryptSecret(token),
    audience: input.audience, cover: input.cover, map_window: input.mapWindow,
    include_summary: input.includeSummary, include_dossier: input.includeDossier, include_scans: input.includeScans,
    include_squawks: input.includeSquawks, include_reporters: input.includeReporters, include_gaps_note: input.includeGapsNote,
    logbook_ids: input.logbookIds, document_ids: input.documentIds, expires_at: expiresAt,
  }).select("id").maybeSingle();
  if (error || !row) return { error: "Couldn't make the link. Try again.", code: "failed", status: 500 };
  const url = roomUrl(token);
  return { id: row.id, url, qrPayload: url, expiresAt };
}

/** PATCH body (09 §4.11): `{ extendDays?: 30, revoke?: true, label? }`. */
export async function updateRoom(
  supabase: Db,
  o: { aircraftId: string; roomId: string; userId: string; body: unknown },
): Promise<{ id: string; label: string; expiresAt: string; revokedAt: string | null } | Fail> {
  const owned = await ownedAircraft(supabase, o.aircraftId, o.userId);
  if ("error" in owned) return owned;
  const b = (o.body && typeof o.body === "object" ? o.body : {}) as Record<string, unknown>;
  if (b.extendDays == null && b.revoke !== true && b.label == null) return { error: "Nothing to change.", code: "invalid", status: 400 };
  if (b.extendDays != null && b.extendDays !== 30) return { error: "Links extend 30 days at a time.", code: "invalid", status: 400 };
  const label = b.label == null ? null : typeof b.label === "string" ? b.label.trim() : "";
  if (label === "" || (label && label.length > 80)) return { error: "Say who the link is for (up to 80 characters).", code: "invalid", status: 400 };

  const { data: room } = await supabase.from("record_room").select("id, label, expires_at, revoked_at, created_at")
    .eq("id", o.roomId).eq("aircraft_id", o.aircraftId).maybeSingle();
  if (!room) return { error: "Link not found.", code: "not_found", status: 404 };

  const patch: Partial<RecordRoom> = {};
  if (label) patch.label = label;
  if (b.extendDays === 30) {
    if (room.revoked_at) return { error: "This link was revoked. Make a new one.", code: "conflict", status: 409 };
    const next = extendedExpiry(room, new Date());
    if (!next) return { error: "A link can stay open at most 180 days from when it was made.", code: "conflict", status: 409 };
    patch.expires_at = next;
  }
  if (b.revoke === true && !room.revoked_at) patch.revoked_at = new Date().toISOString();
  if (Object.keys(patch).length) {
    const { error } = await supabase.from("record_room").update(patch).eq("id", o.roomId).eq("aircraft_id", o.aircraftId);
    if (error) return { error: "Couldn't change the link. Try again.", code: "failed", status: 500 };
  }
  const merged = { ...room, ...patch };
  return { id: room.id, label: merged.label, expiresAt: merged.expires_at, revokedAt: merged.revoked_at };
}

/** 30 more days from now or the current end, whichever is later, capped at 180 days from creation (D18). Null at the cap. */
export function extendedExpiry(room: Pick<Room, "expires_at" | "created_at">, now: Date): string | null {
  const cap = Date.parse(room.created_at) + ROOM_MAX_DAYS * DAY;
  const current = Date.parse(room.expires_at);
  if (current >= cap - 60_000) return null;
  return new Date(Math.min(Math.max(current, now.getTime()) + 30 * DAY, cap)).toISOString();
}

export type RoomOpen = { openedAt: string; lastAt: string; sections: string[] };

/**
 * Views grouped into opens, newest first (09 §2.12): one per session key; rows written before 0080 have no key and
 * count one open each. Sections keep the order they were first viewed.
 */
export function roomOpens(rows: { session_key: string | null; section: string | null; created_at: string }[]): RoomOpen[] {
  const groups = new Map<string, RoomOpen>();
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  sorted.forEach((r, i) => {
    const key = r.session_key ?? `legacy:${i}`;
    const g = groups.get(key) ?? { openedAt: r.created_at, lastAt: r.created_at, sections: [] };
    g.lastAt = r.created_at;
    if (r.section && !g.sections.includes(r.section)) g.sections.push(r.section);
    groups.set(key, g);
  });
  return [...groups.values()].sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0));
}

/** The list row (09 §4.11 GET). */
export function roomJson(room: Room, url: string | null, opens: RoomOpen[]) {
  return {
    id: room.id, label: room.label, audience: room.audience, cover: room.cover, mapWindow: room.map_window,
    includes: {
      summary: room.include_summary, dossier: room.include_dossier, logbookIds: room.logbook_ids, scans: room.include_scans,
      documentIds: room.document_ids, squawks: room.include_squawks, reporters: room.include_reporters, gapsNote: room.include_gaps_note,
    },
    url, createdAt: room.created_at, expiresAt: room.expires_at, revokedAt: room.revoked_at,
    active: roomActive(room), opens: opens.length, lastOpenedAt: opens.map((x) => x.lastAt).sort().at(-1) ?? null,
  };
}

export const ROOM_LIST_COLS = `${ROOM_COLS}, token_enc`;
