import type { Component } from "@/lib/database.types";
import { canEdit, isStale, type Db, type WriteCtx, type WriteResult } from "./entries";
import { isIsoDate, validNumber } from "./meters";

// The ONE implementation of every equipment write (CONTRACT §3 C2, §4):
// installed/removed components and the scan's equipment proposals. `make`
// (manufacturer) drives AD applicability; removing a component is what makes
// its linked ADs no longer applicable. See entries.ts for the rules. Pure
// helpers are tested in apps/web/test/writes-c2.test.ts.

const NO_EDIT = "You don't have edit access to this aircraft.";
const LIFE_UNITS = ["hours", "months", "cycles"] as const;

/** The editable fields of a component (the web form's shape, minus id). */
export type ComponentFields = {
  name: string;
  make: string | null;
  category: string | null;
  part_number: string | null;
  serial_number: string | null;
  install_date: string | null;
  life_limit_value: number | null;
  life_limit_unit: "hours" | "months" | "cycles" | null;
  notes: string | null;
  // The logbook entry that records the installation, if the owner linked one.
  // Optional: absent means "leave whatever is there" — the web form does not
  // offer the link, so a web edit must not clear one the phone made.
  install_entry_id?: string | null;
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const str = (v: unknown, max = 5000): string | null => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);

/** Validate an untrusted component payload at the trust boundary. */
export function pickComponentFields(input: unknown): { fields: ComponentFields } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Component fields are missing." };
  const src = input as Record<string, unknown>;
  const name = typeof src.name === "string" ? src.name.trim() : "";
  if (!name) return { error: "Name is required." };
  if (!validNumber(src.life_limit_value)) return { error: "Life limit must be zero or a positive number." };
  if (src.life_limit_unit != null && !LIFE_UNITS.includes(src.life_limit_unit as never)) {
    return { error: "Life limit is in hours, months or cycles." };
  }
  if (src.install_date != null && !isIsoDate(src.install_date)) return { error: "Installed on must be a date." };
  return {
    fields: {
      name,
      make: str(src.make, 200),
      category: str(src.category, 200),
      part_number: str(src.part_number, 200),
      serial_number: str(src.serial_number, 200),
      install_date: (src.install_date as string | null | undefined) ?? null,
      life_limit_value: (src.life_limit_value as number | null | undefined) ?? null,
      life_limit_unit: (src.life_limit_unit as ComponentFields["life_limit_unit"] | undefined) ?? null,
      notes: str(src.notes),
      ...("install_entry_id" in src
        ? { install_entry_id: typeof src.install_entry_id === "string" && src.install_entry_id ? src.install_entry_id : null }
        : {}),
    },
  };
}

/** How a proposal is matched to an existing component: P/N+S/N when known, else name. */
export const proposalKey = (p: { part_number: string | null; serial_number: string | null; name: string }) =>
  p.part_number || p.serial_number
    ? `ps:${(p.part_number ?? "").toLowerCase().trim()}|${(p.serial_number ?? "").toLowerCase().trim()}`
    : `n:${p.name.trim().toLowerCase()}`;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

async function loadComponent(
  supabase: Db,
  ctx: WriteCtx,
  componentId: string,
  base: string | undefined,
): Promise<{ row: Component } | WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: row, error } = await supabase
    .from("component")
    .select("*")
    .eq("id", componentId)
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!row) return { status: "error", message: "Component not found.", httpStatus: 404 };
  if (isStale(row.updated_at, base)) return { status: "conflict", row };
  return { row };
}

async function patchComponent(
  supabase: Db,
  ctx: WriteCtx,
  componentId: string,
  patch: Partial<Component>,
): Promise<WriteResult> {
  const { data, error } = await supabase
    .from("component")
    .update(patch)
    .eq("id", componentId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Component not found.", httpStatus: 404 };
  return { status: "ok", row: data };
}

/** Add (no id) or edit (id + base) a component. */
export async function upsert(
  supabase: Db,
  ctx: WriteCtx,
  input: { id?: string; component: unknown },
  base?: string,
): Promise<WriteResult> {
  const picked = pickComponentFields(input.component);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  if (input.id) {
    const loaded = await loadComponent(supabase, ctx, input.id, base);
    if ("status" in loaded) return loaded;
    return patchComponent(supabase, ctx, input.id, picked.fields);
  }
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data, error } = await supabase
    .from("component")
    .insert({ aircraft_id: ctx.aircraftId, ...picked.fields })
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  return { status: "ok", row: data };
}

/**
 * Delete a component outright. Three tables reference component(id) ON DELETE
 * SET NULL (ad_compliance.component_id, oil_addition.component_id,
 * oil_analysis.component_id): the owner is erasing the equipment record itself,
 * so those links die with it — an AD stays tracked, just no longer tied to a
 * part. Use {@link markRemoved} for equipment that came off the aircraft.
 */
export async function remove(
  supabase: Db,
  ctx: WriteCtx,
  input: { componentId: string },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadComponent(supabase, ctx, input.componentId, base);
  if ("status" in loaded) return loaded;
  const { data, error } = await supabase
    .from("component")
    .delete()
    .eq("id", input.componentId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("id");
  if (error) return { status: "error", message: error.message };
  if (!data?.length) return { status: "error", message: "Component not found.", httpStatus: 404 };
  return { status: "ok", row: null };
}

/**
 * Mark a component removed on a date (today when absent). Because removing
 * equipment makes its ADs inapplicable, any ad_compliance row linked to this
 * component that is still open/complied is set not_applicable, with the removal
 * date and reason — so the compliance view explains why and when. The returned
 * row is the component plus `ads_updated`, the count the UI reports.
 */
export async function markRemoved(
  supabase: Db,
  ctx: WriteCtx,
  input: { componentId: string; date?: string | null; entryId?: string | null },
  base?: string,
): Promise<WriteResult> {
  const date = input.date || new Date().toISOString().slice(0, 10);
  if (!isIsoDate(date)) return { status: "error", message: "Removed on must be a date.", httpStatus: 400 };
  const loaded = await loadComponent(supabase, ctx, input.componentId, base);
  if ("status" in loaded) return loaded;

  const patched = await patchComponent(supabase, ctx, input.componentId, {
    is_installed: false,
    removal_date: date,
    ...(input.entryId ? { removal_entry_id: input.entryId } : {}),
  });
  if (patched.status !== "ok") return patched;

  // Retire the ADs tied to this equipment (only ones not already resolved).
  const { data: retired, error } = await supabase
    .from("ad_compliance")
    .update({
      status: "not_applicable",
      reason: `Equipment removed: ${loaded.row.name}`,
      status_changed_on: date,
      next_due_date: null,
      next_due_hours: null,
    })
    .eq("component_id", input.componentId)
    .eq("aircraft_id", ctx.aircraftId)
    .in("status", ["open", "complied", "previously_complied"])
    .select("id");
  if (error) return { status: "error", message: error.message };
  return { status: "ok", row: { ...patched.row, ads_updated: retired?.length ?? 0 } };
}

/** Reinstall a previously removed component (does not touch AD statuses). */
export async function reinstall(
  supabase: Db,
  ctx: WriteCtx,
  input: { componentId: string },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadComponent(supabase, ctx, input.componentId, base);
  if ("status" in loaded) return loaded;
  return patchComponent(supabase, ctx, input.componentId, { is_installed: true, removal_date: null, removal_entry_id: null });
}

// ---------------------------------------------------------------------------
// Scan proposals (equipment_proposal — no updated_at, no base)
// ---------------------------------------------------------------------------

const idList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "string" && x) && v.length <= 500 ? (v as string[]) : null;

/**
 * Confirm pending proposals: create/update components from them, de-duped
 * against existing components by {@link proposalKey}, then delete the confirmed
 * proposals. An existing match is updated with newly-known dates or removal
 * state. Returns row `{ added, updated }`.
 */
export async function confirmProposals(
  supabase: Db,
  ctx: WriteCtx,
  input: { proposalIds: unknown },
): Promise<WriteResult> {
  const ids = idList(input.proposalIds);
  if (!ids) return { status: "error", message: "Which proposals?", httpStatus: 400 };
  if (ids.length === 0) return { status: "ok", row: { added: 0, updated: 0 } };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };

  const { data: proposals, error: loadErr } = await supabase
    .from("equipment_proposal")
    .select("*")
    .eq("aircraft_id", ctx.aircraftId)
    .in("id", ids);
  if (loadErr) return { status: "error", message: loadErr.message };
  if (!proposals?.length) return { status: "error", message: "Proposals not found.", httpStatus: 404 };

  const { data: existing } = await supabase
    .from("component")
    .select("id, name, part_number, serial_number")
    .eq("aircraft_id", ctx.aircraftId);
  const byKey = new Map((existing ?? []).map((r) => [proposalKey(r), r.id]));

  let added = 0;
  let updated = 0;
  for (const p of proposals) {
    const payload = {
      name: p.name.trim(),
      make: p.make,
      category: p.category,
      part_number: p.part_number,
      serial_number: p.serial_number,
      install_date: p.install_date,
      removal_date: p.removal_date,
      is_installed: p.is_installed,
    };
    const existingId = byKey.get(proposalKey(p));
    if (existingId) {
      const r = await patchComponent(supabase, ctx, existingId, payload);
      if (r.status !== "ok") return r;
      updated++;
    } else {
      const { data: inserted, error } = await supabase
        .from("component")
        .insert({ aircraft_id: ctx.aircraftId, ...payload })
        .select("id")
        .maybeSingle();
      if (error) return { status: "error", message: error.message };
      if (!inserted) return { status: "error", message: NO_EDIT, httpStatus: 403 };
      byKey.set(proposalKey(p), inserted.id);
      added++;
    }
  }

  const { error: delErr } = await supabase
    .from("equipment_proposal")
    .delete()
    .eq("aircraft_id", ctx.aircraftId)
    .in("id", ids);
  if (delErr) return { status: "error", message: delErr.message };
  return { status: "ok", row: { added, updated } };
}

/** Dismiss (delete) pending proposals without importing them. Returns row `{ dismissed }`. */
export async function dismissProposals(
  supabase: Db,
  ctx: WriteCtx,
  input: { proposalIds: unknown },
): Promise<WriteResult> {
  const ids = idList(input.proposalIds);
  if (!ids) return { status: "error", message: "Which proposals?", httpStatus: 400 };
  if (ids.length === 0) return { status: "ok", row: { dismissed: 0 } };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data, error } = await supabase
    .from("equipment_proposal")
    .delete()
    .eq("aircraft_id", ctx.aircraftId)
    .in("id", ids)
    .select("id");
  if (error) return { status: "error", message: error.message };
  return { status: "ok", row: { dismissed: data?.length ?? 0 } };
}
