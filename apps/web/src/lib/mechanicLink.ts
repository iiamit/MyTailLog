import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MechanicLink } from "@/lib/database.types";
import { encryptSecret } from "@/lib/crypto";

type Db = SupabaseClient<Database>;

// ===========================================================================
// Mechanic links (09 §2.8, §4.5 send, §4.12; W-MAINT-03 "Send to mechanic"): an account-free,
// read-only page of chosen squawks or one visit, at /m/<token>. Like record rooms, the recipient
// has no account: /m/* reads through the service client and the checks in this module and in
// app/m/[token] are the boundary. Online only (14-decisions.md D1); MyTailLog never sends it.
// ===========================================================================

export const LINK_DAYS = [7, 30, 90] as const;
export const LINK_DEFAULT_DAYS = 30;
/** 09 §4.14: link creation, 20 per day per aircraft. */
export const LINK_DAILY_CAP = 20;

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TOKEN_RE = /^[0-9A-Za-z]{22}$/;

/** 128 random bits, base62, always 22 characters (09 §2.8). */
export function newLinkToken(): string {
  let n = BigInt(`0x${randomBytes(16).toString("hex")}`);
  let s = "";
  for (let i = 0; i < 22; i++) { s = B62[Number(n % 62n)] + s; n /= 62n; }
  return s;
}
export const hashLinkToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const isLinkToken = (token: string) => TOKEN_RE.test(token);

export function linkUrl(token: string): string {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://mytaillog.com").replace(/\/$/, "");
  return `${origin}/m/${token}`;
}

export function linkActive(link: Pick<MechanicLink, "expires_at" | "revoked_at">, now = new Date()): boolean {
  return !link.revoked_at && new Date(link.expires_at) > now;
}

/** Validate the create body (09 §4.12). Squawk ids are checked against the aircraft by the caller. */
export function pickLinkInput(body: unknown, kind: "squawk" | "visit"):
  | { recipientLabel: string; providerId: string | null; days: number; squawkIds: string[]; includePhotos: boolean; includeReporter: boolean }
  | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Say who the link is for." };
  const b = body as Record<string, unknown>;
  const label = typeof b.recipientLabel === "string" ? b.recipientLabel.trim() : "";
  if (!label || label.length > 80) return { error: "Say who the link is for (up to 80 characters)." };
  const days = b.expiresInDays ?? LINK_DEFAULT_DAYS;
  if (!LINK_DAYS.includes(days as 7)) return { error: "Pick 7, 30 or 90 days." };
  const providerId = typeof b.providerId === "string" && b.providerId ? b.providerId : null;
  let squawkIds: string[] = [];
  if (kind === "squawk") {
    if (!Array.isArray(b.squawkIds) || !b.squawkIds.every((x) => typeof x === "string")) return { error: "Pick the squawks to show." };
    squawkIds = [...new Set(b.squawkIds as string[])];
    if (squawkIds.length < 1 || squawkIds.length > 20) return { error: "Pick 1 to 20 squawks." };
  }
  return { recipientLabel: label, providerId, days: days as number, squawkIds, includePhotos: b.includePhotos !== false, includeReporter: b.includeReporter === true };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

/** A prefilled mailto: for the owner's own mail client (09 §4.5): subject and the list, then the link. */
export function linkMailto(o: { tail: string; to?: string | null; url: string; weekOf?: string; lines: string[] }): string {
  const subject = o.weekOf ? `${o.tail} visit, week of ${shortDate(o.weekOf)}` : `${o.tail} squawks`;
  const body = [...o.lines.map((l) => `- ${l}`), "", o.url].join("\n");
  return `mailto:${o.to ? encodeURIComponent(o.to) : ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

type Created = { id: string; url: string; expiresAt: string; mailto: string };
type Fail = { error: string; code: string; status: number };

/**
 * Make a squawk or visit link as the signed-in caller (RLS mlink_manage: editors only). Everything the
 * link names is re-checked against the aircraft; the token is returned once here and kept encrypted
 * so the owner can copy it again from the list.
 */
export async function createLink(
  supabase: Db,
  o: { aircraftId: string; userId: string; kind: "squawk" | "visit"; visitId?: string; body: unknown },
): Promise<Created | Fail> {
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: o.aircraftId });
  if (canEdit !== true) return { error: "You don't have edit access to this aircraft.", code: "viewer_read_only", status: 403 };
  const input = pickLinkInput(o.body, o.kind);
  if ("error" in input) return { error: input.error, code: "invalid", status: 400 };

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ data: aircraft }, { count }, provider] = await Promise.all([
    supabase.from("aircraft").select("tail_number").eq("id", o.aircraftId).maybeSingle(),
    supabase.from("mechanic_link").select("id", { count: "exact", head: true }).eq("aircraft_id", o.aircraftId).gte("created_at", since),
    input.providerId
      ? supabase.from("service_provider").select("id, email").eq("id", input.providerId).eq("aircraft_id", o.aircraftId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!aircraft) return { error: "Aircraft not found.", code: "not_found", status: 404 };
  if ((count ?? 0) >= LINK_DAILY_CAP) return { error: "That's 20 links today for this aircraft. Try again tomorrow.", code: "rate_limited", status: 429 };
  if (input.providerId && !provider.data) return { error: "That shop isn't on this aircraft.", code: "invalid", status: 400 };

  let lines: string[];
  let weekOf: string | undefined;
  if (o.kind === "squawk") {
    const { data: squawks } = await supabase.from("squawk").select("id, description").eq("aircraft_id", o.aircraftId).in("id", input.squawkIds);
    if ((squawks ?? []).length !== input.squawkIds.length) return { error: "One of those squawks isn't on this aircraft.", code: "invalid", status: 400 };
    lines = squawks!.map((s) => s.description);
  } else {
    const { data: visit } = await supabase.from("planned_visit").select("id, week_of, status").eq("id", o.visitId ?? "").eq("aircraft_id", o.aircraftId).maybeSingle();
    if (!visit) return { error: "Visit not found.", code: "not_found", status: 404 };
    if (visit.status === "cancelled") return { error: "This visit was cancelled.", code: "invalid", status: 409 };
    const { data: items } = await supabase.from("planned_visit_item").select("item_key").eq("visit_id", visit.id);
    lines = await itemLabels(supabase, o.aircraftId, (items ?? []).map((i) => i.item_key));
    weekOf = visit.week_of;
  }

  const token = newLinkToken();
  const expiresAt = new Date(Date.now() + input.days * 86_400_000).toISOString();
  const { data: row, error } = await supabase.from("mechanic_link").insert({
    aircraft_id: o.aircraftId, kind: o.kind, squawk_ids: input.squawkIds, visit_id: o.kind === "visit" ? o.visitId! : null,
    recipient_label: input.recipientLabel, provider_id: input.providerId, token_hash: hashLinkToken(token), token_enc: encryptSecret(token),
    include_photos: input.includePhotos, include_reporter: input.includeReporter, expires_at: expiresAt, created_by: o.userId,
  }).select("id").maybeSingle();
  if (error || !row) return { error: error?.message ?? "Couldn't make the link.", code: "failed", status: 500 };
  const url = linkUrl(token);
  return { id: row.id, url, expiresAt, mailto: linkMailto({ tail: aircraft.tail_number, to: provider.data?.email, url, weekOf, lines }) };
}

/** Owner-readable names for visit item keys ("Transponder check", "AD 2011-10-09", a squawk's text). */
export async function itemLabels(supabase: Db, aircraftId: string, keys: string[]): Promise<string[]> {
  const ids = (p: string) => keys.filter((k) => k.startsWith(`${p}:`)).map((k) => k.slice(p.length + 1));
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [mx, ad, sq] = await Promise.all([
    supabase.from("maintenance_item").select("id, label").eq("aircraft_id", aircraftId).in("id", ids("mx").length ? ids("mx") : none),
    supabase.from("ad_compliance").select("id, kind, reference").eq("aircraft_id", aircraftId).in("id", ids("ad").length ? ids("ad") : none),
    supabase.from("squawk").select("id, description").eq("aircraft_id", aircraftId).in("id", ids("squawk").length ? ids("squawk") : none),
  ]);
  const names = new Map<string, string>([
    ...(mx.data ?? []).map((r) => [`mx:${r.id}`, r.label] as [string, string]),
    ...(ad.data ?? []).map((r) => [`ad:${r.id}`, `${r.kind.toUpperCase()} ${r.reference}`] as [string, string]),
    ...(sq.data ?? []).map((r) => [`squawk:${r.id}`, `Squawk: ${r.description}`] as [string, string]),
  ]);
  return keys.map((k) => names.get(k)).filter((n): n is string => !!n);
}

/** The live link for a token through the service client, or null (malformed, unknown, revoked or ended — never says which). */
export async function openLink(svc: Db, token: string): Promise<MechanicLink | null> {
  if (!isLinkToken(token)) return null;
  const { data } = await svc.from("mechanic_link").select("*").eq("token_hash", hashLinkToken(token)).maybeSingle();
  return data && linkActive(data) ? data : null;
}

/** A photo is visible only through a link that includes photos and names its squawk (or a visit that holds it). */
export async function linkPhoto(svc: Db, link: MechanicLink, photoId: string) {
  if (!link.include_photos) return null;
  const { data: photo } = await svc.from("squawk_photo").select("id, squawk_id, aircraft_id, storage_path, thumbnail_path")
    .eq("id", photoId).eq("aircraft_id", link.aircraft_id).maybeSingle();
  if (!photo) return null;
  if (link.kind === "squawk") return link.squawk_ids.includes(photo.squawk_id) ? photo : null;
  const { data: held } = await svc.from("planned_visit_item").select("id")
    .eq("visit_id", link.visit_id ?? "").eq("item_key", `squawk:${photo.squawk_id}`).maybeSingle();
  return held ? photo : null;
}

export function viewIpHash(ip: string | null): string | null {
  if (!ip) return null;
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${day}|${process.env.ENCRYPTION_KEY ?? ""}`).digest("hex").slice(0, 32);
}
