import type { RegistryRecord } from "@/lib/faa/registry";

export type DetailsField = "make" | "model" | "serial_number" | "year";
export type RegistryRow = { label: string; theirs: string; field?: DetailsField; differs: boolean };

type Ours = { make: string | null; model: string | null; serial_number: string | null; year: number | null };

// Registry text is uppercase and spaced differently ("CESSNA", "172N"); compare letters and digits only.
const norm = (s: string | number | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * The FAA registry leaf (W-AIRCRAFT-05): each registry value, and whether it disagrees with the owner's details.
 * A field the owner left blank counts as differing so "Use the registry's" can fill it.
 */
export function registryRows(ours: Ours, rec: RegistryRecord): { rows: RegistryRow[]; agree: number; compared: number } {
  const cmp = (label: string, field: DetailsField, theirs: string | number | null): RegistryRow | null =>
    theirs == null || theirs === "" ? null : { label, field, theirs: String(theirs), differs: norm(ours[field]) !== norm(theirs) };
  const info = (label: string, theirs: string | null): RegistryRow | null => (theirs ? { label, theirs, differs: false } : null);
  const compared = [
    cmp("Serial number", "serial_number", rec.serialNumber),
    cmp("Manufacturer", "make", rec.make),
    cmp("Model", "model", rec.model),
    cmp("Year", "year", rec.year),
  ].filter((r): r is RegistryRow => r !== null);
  const rows = [
    ...compared,
    info("Engine", [rec.engineMake, rec.engineModel].filter(Boolean).join(" ") || null),
    info("Mode S code", rec.modeSCodeHex ? `${rec.modeSCodeHex.toUpperCase()} (hex)` : null),
    info("Registered to", rec.registrantName),
    info("Status", rec.status),
  ].filter((r): r is RegistryRow => r !== null);
  return { rows, agree: compared.filter((r) => !r.differs).length, compared: compared.length };
}

/** The delete confirmation: the typed tail must match, ignoring case and surrounding spaces. */
export const tailMatches = (typed: string, tail: string) => typed.trim().toUpperCase() === tail.trim().toUpperCase() && tail.trim() !== "";
