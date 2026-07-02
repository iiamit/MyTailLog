// ===========================================================================
// Equipment extraction from historical log entries.
//
// The equipment list is derived PRIMARILY from the logbooks: this reads the
// already-extracted entry text in chronological order and reconstructs the
// components installed and removed over the aircraft's life. It consolidates
// the timeline — an install followed by a later removal of the same part
// becomes one component with both dates — so the result is a proposed equipment
// list the owner confirms. Manual entry is the secondary path.
//
// Uses structured outputs so the response matches the schema exactly. This is a
// text-only pass (no image), so it's cheap relative to page extraction.
// ===========================================================================

import { getAnthropic, EXTRACTION_MODEL } from "./anthropic";

export const EQUIPMENT_SCHEMA_VERSION = 1;

export type EquipmentEntryInput = {
  entry_id: string;
  date: string | null;
  logbook: string; // airframe/engine/prop/avionics label
  text: string; // description + work_performed + parts, joined
};

export type EquipmentProposal = {
  name: string;
  make: string | null;
  category: string | null; // airframe | engine | prop | avionics | other
  part_number: string | null;
  serial_number: string | null;
  install_date: string | null; // YYYY-MM-DD
  removal_date: string | null; // YYYY-MM-DD, null if still installed
  is_installed: boolean;
  action: "installed" | "removed" | "present"; // what the logs show for this item
  confidence: number; // 0..1
  source: string; // short quote/reference from the logs supporting this
};

const PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "Component name, e.g. \"Left magneto\", \"Vacuum pump\", \"GI-275 (pilot)\"." },
    make: { type: ["string", "null"], description: "Manufacturer if stated, e.g. Garmin, Dukes, Slick." },
    category: {
      type: ["string", "null"],
      description: "Which system it belongs to: one of airframe, engine, prop, avionics, or other (null if unclear).",
    },
    part_number: { type: ["string", "null"] },
    serial_number: { type: ["string", "null"] },
    install_date: { type: ["string", "null"], description: "Install date YYYY-MM-DD if known." },
    removal_date: { type: ["string", "null"], description: "Removal date YYYY-MM-DD if the logs show it was later removed/replaced." },
    is_installed: { type: "boolean", description: "True if this component appears to be currently installed (installed and not later removed)." },
    action: { type: "string", description: "What the logs indicate for this item — exactly one of: \"installed\", \"removed\", or \"present\" (present = simply inspected/complied, not a new install or removal)." },
    confidence: { type: "number", description: "0 to 1 confidence in this component and its dates." },
    source: { type: "string", description: "A short quote or reference from the entries that supports this (for the owner to verify)." },
  },
  required: [
    "name", "make", "category", "part_number", "serial_number",
    "install_date", "removal_date", "is_installed", "action", "confidence", "source",
  ],
} as const;

const EQUIPMENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    components: { type: "array", items: PROPOSAL_SCHEMA },
  },
  required: ["components"],
} as const;

const SYSTEM_PROMPT = `You reconstruct an aircraft's installed-equipment list from its maintenance logbook entries.

You are given maintenance entries in chronological order (oldest first). Identify discrete physical COMPONENTS and ACCESSORIES that were installed on or removed from the aircraft over time, and produce a consolidated current + historical equipment list.

What counts as equipment: serialized or part-numbered components and accessories with a lifecycle — magnetos, vacuum/fuel/hydraulic pumps, alternators/generators, starters, actuators, gyros/attitude indicators, transponders, radios/nav/comm units, GPS/EFIS displays (e.g. Garmin GI-275, GTX transponders), ELTs, propellers, cylinders, turbochargers, exhaust systems, autopilot servos, batteries.

What to EXCLUDE: routine consumables and hardware — oil, oil filters, spark plugs, gaskets, O-rings, seals, hoses, belts, light bulbs, tires, brake pads, fluids, cleaning. Do not list these as equipment.

Rules:
- Consolidate the timeline: if a part is installed and later removed/replaced, output ONE component with both install_date and removal_date. If it was installed and never removed, is_installed=true with removal_date null. Match a removal to its prior install by part/serial number or clear description.
- Capture part_number and serial_number exactly as written when present.
- Set make (manufacturer) when stated or clearly implied by the product name (e.g. "Garmin GI-275" -> make "Garmin").
- Use the entry dates for install_date/removal_date. If a date is unknown, use null.
- Set confidence per component and put a short supporting quote from the logs in "source" so the owner can verify.
- Do not invent equipment. Only list what the entries actually describe. It is better to omit an uncertain item than to fabricate one.`;

export async function extractEquipmentFromEntries(
  entries: EquipmentEntryInput[],
): Promise<EquipmentProposal[]> {
  if (entries.length === 0) return [];
  const client = getAnthropic();

  const transcript = entries
    .map(
      (e) =>
        `[${e.entry_id}] ${e.date ?? "undated"} · ${e.logbook}\n${e.text.trim()}`,
    )
    .join("\n\n");

  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: EQUIPMENT_JSON_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Maintenance entries in chronological order:\n\n${transcript}\n\nReconstruct the consolidated equipment list following the schema.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Equipment scan was declined by the safety system.");
  }
  const text = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: { components?: EquipmentProposal[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Equipment scan returned malformed data.");
  }
  return Array.isArray(parsed.components) ? parsed.components : [];
}
