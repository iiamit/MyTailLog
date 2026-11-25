import type { EngineEvent } from "./contracts";
import { isDate, UUID } from "./validation";
export function observationInput(
  b: Record<string, unknown>,
): Omit<EngineEvent, "aircraft_id" | "created_at" | "updated_at"> {
  if (
    !UUID.test(String(b.id)) ||
    !UUID.test(String(b.component_id)) ||
    !isDate(b.event_date) ||
    !["overhaul", "cylinder_replacement", "compression"].includes(
      String(b.kind),
    )
  )
    throw new Error("Choose an engine, event and valid date.");
  const readings = Array.isArray(b.readings) ? b.readings : [],
    cylinders = Array.isArray(b.cylinders) ? b.cylinders : [];
  if (
    readings.length > 12 ||
    (b.kind === "compression" && !readings.length) ||
    readings.some(
      (r) =>
        !r ||
        !Number.isInteger(r.cylinder) ||
        r.cylinder < 1 ||
        r.cylinder > 12 ||
        !Number.isFinite(r.psi) ||
        !Number.isFinite(r.reference) ||
        r.reference <= 0 ||
        r.reference > 120 ||
        r.psi < 0 ||
        r.psi > r.reference,
    ) ||
    new Set(readings.map((r) => r.cylinder)).size !== readings.length
  )
    throw new Error(
      "Enter each cylinder once, retaining its original test reference pressure.",
    );
  if (cylinders.some((c) => !Number.isInteger(c) || c < 1 || c > 12))
    throw new Error("Cylinder numbers must be 1 to 12.");
  if (b.kind === "cylinder_replacement" && !cylinders.length)
    throw new Error("Specify the replaced cylinders.");
  if (
    b.meter_basis != null &&
    !["tach", "hobbs"].includes(String(b.meter_basis))
  )
    throw new Error("Choose tach or Hobbs.");
  if (
    b.meter_reading != null &&
    (!Number.isFinite(b.meter_reading) || Number(b.meter_reading) < 0)
  )
    throw new Error("Enter a nonnegative meter reading.");
  const ref = (k: string) => {
    if (b[k] == null || b[k] === "") return null;
    if (!UUID.test(String(b[k]))) throw new Error(`Invalid ${k}.`);
    return String(b[k]);
  };
  if (b.notes != null && (typeof b.notes !== "string" || b.notes.length > 4000))
    throw new Error("Notes are too long.");
  return {
    id: String(b.id),
    component_id: String(b.component_id),
    event_date: b.event_date,
    kind: b.kind as EngineEvent["kind"],
    notes: typeof b.notes === "string" ? b.notes : null,
    readings: readings.map((r) => ({
      cylinder: r.cylinder,
      psi: r.psi,
      reference: r.reference,
    })),
    cylinders,
    source_entry_id: ref("source_entry_id"),
    source_page_id: ref("source_page_id"),
    meter_basis: (b.meter_basis ?? null) as EngineEvent["meter_basis"],
    meter_reading: (b.meter_reading ?? null) as number | null,
  };
}
