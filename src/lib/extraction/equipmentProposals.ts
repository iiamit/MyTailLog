// ===========================================================================
// Equipment proposal writer — runs equipment extraction over log entries and
// stores the results as PENDING proposals (equipment_proposal) for the owner to
// confirm. Two callers:
//   - page extraction (pipeline): after a page's entries are written, propose
//     equipment from just that page (with known components as context), so new
//     pages keep the equipment list current.
//   - full log scan (equipment page): propose from the whole history.
//
// De-dupes so re-running doesn't pile up duplicates: a proposal is skipped if a
// component OR a pending proposal already covers the same part (by P/N+S/N, else
// name) in the same installed/removed state. Best-effort — callers wrap it so a
// failure never blocks the primary action.
// ===========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  extractEquipmentFromEntries,
  type EquipmentEntryInput,
} from "./equipment";

type Client = SupabaseClient<Database>;

const key = (p: { part_number: string | null; serial_number: string | null; name: string }) =>
  p.part_number || p.serial_number
    ? `ps:${(p.part_number ?? "").toLowerCase().trim()}|${(p.serial_number ?? "").toLowerCase().trim()}`
    : `n:${p.name.trim().toLowerCase()}`;

export async function proposeEquipmentForEntries(
  supabase: Client,
  aircraftId: string,
  entries: EquipmentEntryInput[],
  pageId: string | null,
): Promise<number> {
  if (entries.length === 0) return 0;

  // Known components give the model context and drive dedup.
  const { data: components } = await supabase
    .from("component")
    .select("name, make, part_number, serial_number, is_installed")
    .eq("aircraft_id", aircraftId);
  const known = (components ?? []).map(
    (c) =>
      `${c.name}${c.make ? ` (${c.make})` : ""}${c.part_number ? ` P/N ${c.part_number}` : ""}${c.serial_number ? ` S/N ${c.serial_number}` : ""}${c.is_installed ? "" : " [removed]"}`,
  );

  const proposals = await extractEquipmentFromEntries(entries, {
    knownComponents: pageId ? known : undefined,
  });
  if (proposals.length === 0) return 0;

  // Existing state to dedup against: components + already-pending proposals.
  const { data: pending } = await supabase
    .from("equipment_proposal")
    .select("name, part_number, serial_number, is_installed")
    .eq("aircraft_id", aircraftId);

  const seen = new Set<string>();
  for (const c of components ?? []) seen.add(`${key(c)}|${c.is_installed}`);
  for (const p of pending ?? []) seen.add(`${key(p)}|${p.is_installed}`);

  const rows = proposals
    .filter((p) => p.name?.trim())
    .filter((p) => {
      const k = `${key(p)}|${p.is_installed}`;
      if (seen.has(k)) return false;
      seen.add(k); // also dedup within this batch
      return true;
    })
    .map((p) => ({
      aircraft_id: aircraftId,
      page_id: pageId,
      name: p.name.trim(),
      make: p.make,
      category: p.category,
      part_number: p.part_number,
      serial_number: p.serial_number,
      install_date: p.install_date,
      removal_date: p.removal_date,
      is_installed: p.is_installed,
      action: p.action,
      confidence: p.confidence,
      source: p.source,
    }));

  if (rows.length === 0) return 0;
  const { error } = await supabase.from("equipment_proposal").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}
