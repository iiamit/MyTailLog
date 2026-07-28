"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { maintenanceNextDue } from "@/lib/maintenance";
import { STANDARD_ITEMS, DEFAULT_SEED_KINDS } from "@/lib/maintenance";
import { METERS, type Meter } from "@/lib/hobbsTach";

export type MaintenanceInput = {
  id?: string;
  kind: string;
  label: string;
  regulatory: boolean;
  interval_months: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  last_done_hours: number | null;
  notes: string | null;
  /** null = app default (oil → hobbs, everything else → tach). */
  meter: Meter | null;
};

type Result = { ok: true } | { error: string };

function maintenancePath(aircraftId: string) {
  return `/aircraft/${aircraftId}/maintenance`;
}

export async function upsertMaintenanceItem(
  aircraftId: string,
  input: MaintenanceInput,
): Promise<Result> {
  if (!input.label.trim()) return { error: "Label is required." };
  if (input.meter != null && !METERS.includes(input.meter)) return { error: "Unknown meter." };
  const supabase = await createClient();
  const due = maintenanceNextDue(input);
  const row = {
    aircraft_id: aircraftId,
    kind: input.kind || "other",
    label: input.label.trim(),
    regulatory: input.regulatory,
    interval_months: input.interval_months,
    interval_hours: input.interval_hours,
    last_done_date: input.last_done_date,
    last_done_hours: input.last_done_hours,
    next_due_date: due.next_due_date,
    next_due_hours: due.next_due_hours,
    notes: input.notes,
    meter: input.meter,
  };
  const { error } = input.id
    ? await supabase.from("maintenance_item").update(row).eq("id", input.id)
    : await supabase.from("maintenance_item").insert(row);
  if (error) return { error: error.message };
  revalidatePath(maintenancePath(aircraftId));
  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true };
}

export async function deleteMaintenanceItem(
  aircraftId: string,
  id: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("maintenance_item").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(maintenancePath(aircraftId));
  return { ok: true };
}

/** Mark an item done at a date/hours, which recomputes its next-due. */
export async function markMaintenanceDone(
  aircraftId: string,
  id: string,
  date: string | null,
  hours: number | null,
): Promise<Result> {
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("maintenance_item")
    .select("interval_months, interval_hours")
    .eq("id", id)
    .single();
  if (!item) return { error: "Item not found." };
  const due = maintenanceNextDue({
    interval_months: item.interval_months,
    interval_hours: item.interval_hours,
    last_done_date: date,
    last_done_hours: hours,
  });
  const { error } = await supabase
    .from("maintenance_item")
    .update({
      last_done_date: date,
      last_done_hours: hours,
      next_due_date: due.next_due_date,
      next_due_hours: due.next_due_hours,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(maintenancePath(aircraftId));
  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true };
}

/** Seed the common Part 91 recurring items (skips any already present). */
export async function seedStandardItems(
  aircraftId: string,
): Promise<{ ok: true; added: number } | { error: string }> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("maintenance_item")
    .select("kind")
    .eq("aircraft_id", aircraftId);
  const have = new Set((existing ?? []).map((r) => r.kind));

  const toAdd = STANDARD_ITEMS.filter(
    (s) => DEFAULT_SEED_KINDS.includes(s.kind) && !have.has(s.kind),
  ).map((s) => ({
    aircraft_id: aircraftId,
    kind: s.kind,
    label: s.label,
    regulatory: s.regulatory,
    interval_months: s.interval_months,
    interval_hours: s.interval_hours,
  }));

  if (toAdd.length > 0) {
    const { error } = await supabase.from("maintenance_item").insert(toAdd);
    if (error) return { error: error.message };
  }
  revalidatePath(maintenancePath(aircraftId));
  return { ok: true, added: toAdd.length };
}
