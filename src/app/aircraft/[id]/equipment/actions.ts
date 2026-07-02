"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Installed/removed equipment. `make` (manufacturer) drives AD applicability;
// removing a component is what makes its linked ADs no longer applicable. All
// mutations run under the caller's session, so RLS scopes them to the owner.
export type ComponentInput = {
  id?: string;
  name: string;
  make: string | null;
  category: string | null;
  part_number: string | null;
  serial_number: string | null;
  install_date: string | null;
  life_limit_value: number | null;
  life_limit_unit: "hours" | "months" | "cycles" | null;
  notes: string | null;
};

type Result = { ok: true } | { error: string };

function equipmentPath(aircraftId: string) {
  return `/aircraft/${aircraftId}/equipment`;
}

export async function upsertComponent(
  aircraftId: string,
  input: ComponentInput,
): Promise<Result> {
  if (!input.name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const row = {
    aircraft_id: aircraftId,
    name: input.name.trim(),
    make: input.make,
    category: input.category,
    part_number: input.part_number,
    serial_number: input.serial_number,
    install_date: input.install_date,
    life_limit_value: input.life_limit_value,
    life_limit_unit: input.life_limit_unit,
    notes: input.notes,
  };
  const { error } = input.id
    ? await supabase.from("component").update(row).eq("id", input.id)
    : await supabase.from("component").insert(row);
  if (error) return { error: error.message };
  revalidatePath(equipmentPath(aircraftId));
  return { ok: true };
}

export async function deleteComponent(
  aircraftId: string,
  id: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("component").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(equipmentPath(aircraftId));
  return { ok: true };
}

/**
 * Mark a component removed on a date. Because removing equipment makes its ADs
 * inapplicable, any ad_compliance row linked to this component that is still
 * open/complied is set not_applicable, with the removal date and reason — so
 * the compliance view explains why and when each became inapplicable. Returns
 * how many AD records were updated so the UI can report it.
 */
export async function removeComponent(
  aircraftId: string,
  id: string,
  removalDate: string | null,
): Promise<{ ok: true; adsUpdated: number } | { error: string }> {
  const supabase = await createClient();
  const date = removalDate || new Date().toISOString().slice(0, 10);

  const { data: comp } = await supabase
    .from("component")
    .select("id, aircraft_id, name")
    .eq("id", id)
    .single();
  if (!comp || comp.aircraft_id !== aircraftId) return { error: "Component not found." };

  const { error: compError } = await supabase
    .from("component")
    .update({ is_installed: false, removal_date: date })
    .eq("id", id);
  if (compError) return { error: compError.message };

  // Retire the ADs tied to this equipment (only ones not already resolved).
  const { data: linked } = await supabase
    .from("ad_compliance")
    .select("id")
    .eq("component_id", id)
    .in("status", ["open", "complied", "previously_complied"]);
  const ids = (linked ?? []).map((r) => r.id);
  if (ids.length > 0) {
    await supabase
      .from("ad_compliance")
      .update({
        status: "not_applicable",
        reason: `Equipment removed: ${comp.name}`,
        status_changed_on: date,
        next_due_date: null,
        next_due_hours: null,
      })
      .in("id", ids);
  }

  revalidatePath(equipmentPath(aircraftId));
  revalidatePath(`/aircraft/${aircraftId}/compliance`);
  return { ok: true, adsUpdated: ids.length };
}

// A log-derived equipment proposal the owner has confirmed for import.
export type ConfirmedProposal = {
  name: string;
  make: string | null;
  category: string | null;
  part_number: string | null;
  serial_number: string | null;
  install_date: string | null;
  removal_date: string | null;
  is_installed: boolean;
};

/**
 * Import confirmed, log-derived equipment. De-dupes against existing components
 * by (part_number+serial_number) or name, so re-scanning doesn't create
 * duplicates — an existing match is updated with any newly-known dates/removal.
 */
export async function applyEquipmentProposals(
  aircraftId: string,
  proposals: ConfirmedProposal[],
): Promise<{ ok: true; added: number; updated: number } | { error: string }> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("component")
    .select("id, name, part_number, serial_number")
    .eq("aircraft_id", aircraftId);
  const rows = existing ?? [];

  const key = (p: { part_number: string | null; serial_number: string | null; name: string }) =>
    p.part_number || p.serial_number
      ? `ps:${(p.part_number ?? "").toLowerCase()}|${(p.serial_number ?? "").toLowerCase()}`
      : `n:${p.name.trim().toLowerCase()}`;
  const byKey = new Map(rows.map((r) => [key(r), r.id]));

  let added = 0;
  let updated = 0;
  for (const p of proposals) {
    if (!p.name.trim()) continue;
    const existingId = byKey.get(key(p));
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
    if (existingId) {
      const { error } = await supabase.from("component").update(payload).eq("id", existingId);
      if (error) return { error: error.message };
      updated++;
    } else {
      const { error } = await supabase
        .from("component")
        .insert({ aircraft_id: aircraftId, ...payload });
      if (error) return { error: error.message };
      added++;
    }
  }

  revalidatePath(equipmentPath(aircraftId));
  return { ok: true, added, updated };
}

/** Reinstall a previously removed component (does not touch AD statuses). */
export async function reinstallComponent(
  aircraftId: string,
  id: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("component")
    .update({ is_installed: true, removal_date: null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(equipmentPath(aircraftId));
  return { ok: true };
}
