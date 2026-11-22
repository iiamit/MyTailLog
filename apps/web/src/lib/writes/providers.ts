import { replayRpc } from "./replay";
import { writeRecord } from "./conditional";
import type { ServiceProvider, ShopKind } from "@/lib/database.types";
import { canEdit, isStale, type Db, type WriteCtx, type WriteResult } from "./entries";

// Shops and mechanics (09 §2.4, §5.3 `provider.upsert`, `provider.delete`; W-MAINT-06). Created by
// the owner or proposed from confirmed entries, never created by themselves. `email` only prefills
// the owner's own mail client; MyTailLog never sends to it.

const NO_EDIT = "You don't have edit access to this aircraft.";
const KINDS: ShopKind[] = ["mechanic", "avionics_shop", "prop_shop", "engine_shop"];
type ProviderFields = Pick<ServiceProvider, "name" | "kind" | "cert_number" | "airport" | "email" | "phone" | "is_default">;

const text = (v: unknown, max: number): string | null | { error: true } => {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || v.trim().length > max) return { error: true };
  return v.trim() || null;
};

/** Validate `{name, kind, certNumber?, airport?, email?, phone?, isDefault?}`. Partial when `partial`. */
export function pickProviderFields(input: unknown, partial = false): { fields: Partial<ProviderFields> } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Shop details are missing." };
  const src = input as Record<string, unknown>;
  const out: Partial<ProviderFields> = {};
  if ("name" in src || !partial) {
    const n = typeof src.name === "string" ? src.name.trim() : "";
    if (!n || n.length > 120) return { error: "Give the shop or mechanic a name (up to 120 characters)." };
    out.name = n;
  }
  if ("kind" in src || !partial) {
    if (!KINDS.includes(src.kind as ShopKind)) return { error: "Pick what kind of shop it is." };
    out.kind = src.kind as ShopKind;
  }
  const fields: [keyof ProviderFields, string, number, string][] = [
    ["cert_number", "certNumber", 40, "The certificate number is too long."],
    ["airport", "airport", 8, "Use the airport's identifier, like KBED."],
    ["email", "email", 200, "That email address doesn't look right."],
    ["phone", "phone", 40, "That phone number is too long."],
  ];
  for (const [col, key, max, msg] of fields) {
    if (!(key in src)) continue;
    const v = text(src[key], max);
    if (v && typeof v === "object") return { error: msg };
    (out as Record<string, unknown>)[col] = col === "airport" && v ? v.toUpperCase() : v;
  }
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return { error: "That email address doesn't look right." };
  if ("isDefault" in src) out.is_default = src.isDefault === true;
  return { fields: out };
}

/** `provider.upsert`: edit when the id exists (base checked), else add (the id, when given, is the idempotency key). */
export async function upsert(
  supabase: Db,
  ctx: WriteCtx,
  input: { id?: string; fields: unknown },
  base?: string,
): Promise<WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: existing } = input.id
    ? await supabase.from("service_provider").select("*").eq("id", input.id).maybeSingle()
    : { data: null };
  if (existing && existing.aircraft_id !== ctx.aircraftId) return { status: "error", message: "Shop not found.", httpStatus: 404 };
  const picked = pickProviderFields(input.fields, !!existing);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  if (existing && isStale(existing.updated_at, base)) return { status: "conflict", row: existing };

  const { data, error } = await replayRpc(supabase, ctx, "save_service_provider", {
    p_aircraft: ctx.aircraftId, p_id: existing?.id ?? input.id ?? crypto.randomUUID(),
    p_base: existing?.updated_at ?? null, p_fields: picked.fields,
  });
  return error ? { status: "error", message: error.message } : data as WriteResult;
}

/** `provider.delete` (base). Items and visits that used it fall back to the default for their kind (FKs set null). */
export async function remove(supabase: Db, ctx: WriteCtx, input: { providerId: string }, base?: string): Promise<WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: row } = await supabase.from("service_provider").select("*").eq("id", input.providerId).eq("aircraft_id", ctx.aircraftId).maybeSingle();
  if (!row) return { status: "error", message: "Shop not found.", httpStatus: 404 };
  if (isStale(row.updated_at, base)) return { status: "conflict", row };
  return writeRecord(supabase, ctx, "service_provider", input.providerId, row.updated_at, null);
}

// ---------------------------------------------------------------------------
// Proposals from confirmed entries (09 §2.4): shown, never created by themselves.
// ---------------------------------------------------------------------------

export type ProposalEntry = {
  signature_name: string | null; mechanic_cert_number: string | null; entry_date: string | null;
  trust: string; replaced_by_entry_id: string | null;
};
export type ProviderProposal = { name: string; certNumber: string | null; entries: number; lastDate: string | null };

const normCert = (c: string | null) => (c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const normName = (n: string) => n.trim().replace(/\s+/g, " ").toLowerCase();

/** A distinct (signer, certificate) on ≥ 2 confirmed entries that no provider already names. */
export function providerProposals(entries: ProposalEntry[], providers: Pick<ServiceProvider, "name" | "cert_number">[]): ProviderProposal[] {
  const known = new Set(providers.flatMap((p) => [`n:${normName(p.name)}`, ...(normCert(p.cert_number) ? [`c:${normCert(p.cert_number)}`] : [])]));
  const groups = new Map<string, ProviderProposal>();
  for (const e of entries) {
    if (e.trust === "ai_read" || e.replaced_by_entry_id || !e.signature_name?.trim()) continue;
    const key = `${normName(e.signature_name)}|${normCert(e.mechanic_cert_number)}`;
    const g = groups.get(key) ?? { name: e.signature_name.trim(), certNumber: e.mechanic_cert_number?.trim() || null, entries: 0, lastDate: null };
    g.entries++;
    if (e.entry_date && (!g.lastDate || e.entry_date > g.lastDate)) g.lastDate = e.entry_date;
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.entries >= 2 && !known.has(`n:${normName(g.name)}`) && !(g.certNumber && known.has(`c:${normCert(g.certNumber)}`)))
    .sort((a, b) => b.entries - a.entries || (b.lastDate ?? "").localeCompare(a.lastDate ?? "") || a.name.localeCompare(b.name));
}
