// ===========================================================================
// Maintenance-event extraction from log entries.
//
// Detects completions of recurring inspections/maintenance in the entry text —
// annual, transponder/pitot-static, ELT, VOR, 100-hour, oil change, and
// advisory TBO/overhaul — so the forecast's last-done dates stay current from
// the logs. Text-only pass, structured outputs. The caller advances each
// maintenance item's last-done to the latest detected date and recomputes
// next-due.
// ===========================================================================

import { generateAi } from "./ai";

// Kinds must line up with STANDARD_ITEMS in src/lib/maintenance.ts.
export type MaintenanceEvent = {
  kind: string; // annual | transponder | pitot_static | elt | vor | hundred_hour | oil_change | engine_tbo | prop_overhaul | other
  label: string;
  date: string | null; // YYYY-MM-DD
  hours: number | null; // aircraft hours (tach/hobbs) at completion, if given
  confidence: number;
  source: string;
};

export type MaintenanceEntryInput = {
  entry_id: string;
  date: string | null;
  text: string;
};

const EVENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      description:
        'Which recurring item was completed. Use exactly one of: "annual", "transponder", "pitot_static", "elt", "vor", "hundred_hour", "oil_change", "engine_tbo", "prop_overhaul", or "other".',
    },
    label: { type: "string", description: "Short human label, e.g. \"Annual inspection\"." },
    date: { type: ["string", "null"], description: "Completion date YYYY-MM-DD (usually the entry date)." },
    hours: { type: ["number", "null"], description: "Aircraft hours (tach or hobbs / total time) at completion, if stated." },
    confidence: { type: "number", description: "0 to 1." },
    source: { type: "string", description: "Short supporting quote from the entry." },
  },
  required: ["kind", "label", "date", "hours", "confidence", "source"],
} as const;

const MAINTENANCE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { events: { type: "array", items: EVENT_SCHEMA } },
  required: ["events"],
} as const;

const SYSTEM_PROMPT = `You identify completions of recurring aircraft maintenance and inspections in logbook entries, so a maintenance forecast can track when each was last done.

Recognize and classify these recurring items when an entry shows one was performed/complied with:
- "annual": annual inspection (14 CFR 91.409).
- "hundred_hour": 100-hour inspection.
- "transponder": transponder test/inspection (91.413).
- "pitot_static": pitot-static / altimeter / static system test (91.411).
- "elt": ELT inspection or battery (91.207).
- "vor": VOR operational check (91.171).
- "oil_change": engine oil and filter change.
- "engine_tbo": engine overhaul / reaching TBO.
- "prop_overhaul": propeller overhaul.
- "other": another recurring inspection worth tracking.

Rules:
- Only emit an event when the entry indicates the item was actually PERFORMED or COMPLIED WITH (not merely referenced or due). "Complied with Annual Inspection", "transponder checked IAW 91.413", "changed oil and filter" -> events. "next annual due" alone -> no event.
- Use the entry's date for date, and capture the aircraft hours (tach or total time) if the entry states them.
- One event per completion. If a single annual entry lists several sub-items (transponder, pitot-static, ELT done during the annual), emit each as its own event.
- Do not fabricate. Set confidence and include a short supporting quote.`;

// Entries per request. A whole logbook (hundreds of entries) can't go in one
// call: the JSON response would exceed max_tokens and truncate mid-array. We
// batch and merge — fine because callers only need the latest event per kind.
const BATCH_SIZE = 40;

async function extractBatch(
  entries: MaintenanceEntryInput[],
): Promise<MaintenanceEvent[]> {
  const transcript = entries
    .map((e) => `[${e.entry_id}] ${e.date ?? "undated"}\n${e.text.trim()}`)
    .join("\n\n");

  const response = await generateAi({
    modelKind: "text",
    maxOutputTokens: 16000,
    systemPrompt: SYSTEM_PROMPT,
    jsonSchema: MAINTENANCE_JSON_SCHEMA,
    content: [{ type: "text", text: `Maintenance entries:\n\n${transcript}\n\nList the recurring-maintenance completions following the schema.` }],
  });

  if (response.stopReason === "refusal") return [];
  const text = response.text;
  try {
    const parsed = JSON.parse(text) as { events?: MaintenanceEvent[] };
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    // Truncated/invalid JSON (e.g. stop_reason max_tokens). Don't lose the whole
    // scan — a smaller batch on retry will parse.
    return [];
  }
}

export async function extractMaintenanceFromEntries(
  entries: MaintenanceEntryInput[],
): Promise<MaintenanceEvent[]> {
  if (entries.length === 0) return [];

  const all: MaintenanceEvent[] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    try {
      all.push(...(await extractBatch(batch)));
    } catch {
      // one bad batch shouldn't sink the whole scan
    }
  }
  return all;
}
