import { useState } from "react";
import { enqueue } from "./mutations";
import { patchLocal } from "./airworthiness";
import type { Meter } from "@/lib/hobbsTach";
import type { Aircraft } from "./types";
import { color, text } from "./tokens";
import { Sheet, Field, Problem, SheetButtons, field } from "./item-editor";

// A reading below the last one is either a mis-key or a replaced meter. Only the
// owner knows which — so ask, and if it was replaced, write the meter_reset row
// that keeps every hour countdown honest across the swap (0046).
//
// Wiring: the record screen calls detectBackwardsReading() before saving; when
// it returns a prior, it shows this prompt and saves the reading after "Meter
// replaced" or "It's right, save it". See the PR's Requests for review UI.

export function MeterResetPrompt({
  aircraft, meter, prior, next, date, onDecided,
}: {
  aircraft: Aircraft;
  meter: Meter;
  /** What the meter read before — the reading this one fell below. */
  prior: number;
  /** The new, lower reading. */
  next: number;
  date: string;
  /** "reset" → a meter_reset was queued; "reading" → save as-is; "cancel" → don't save. */
  onDecided: (choice: "reset" | "reading" | "cancel") => void;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const label = meter === "hobbs" ? "Hobbs" : meter === "tach" ? "Tach" : "Airframe total";

  async function replaced() {
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      await enqueue("meterReset.create", aircraft.id, { id, meter, date, prior, next }, { id, label: `${label} meter replaced at ${prior.toFixed(1)}` });
      // Our id, so the mirror can hold the row now and the countdowns re-anchor
      // before the sync.
      await patchLocal("meter_reset", id, {
        id, aircraft_id: aircraft.id, meter, reset_date: date, prior_value: prior, new_value: next,
        notes: notes.trim() || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      onDecided("reset");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Lower than the last reading (${prior.toFixed(1)})`} onClose={busy ? undefined : () => onDecided("cancel")}>
      <p style={{ ...text.secondary, color: color.dim, margin: 0, lineHeight: 1.5 }}>
        The {label.toLowerCase()} read {prior.toFixed(1)} last time and {next.toFixed(1)} now. Was the meter replaced?
        If so, the hours before the swap stay on every countdown; if it just rolled over or a digit slipped, say so.
      </p>
      <Field label="Notes (optional)">
        <input style={field} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. New Hobbs fitted at annual" />
      </Field>
      {!Number.isFinite(next) && <Problem>That reading isn&apos;t a number.</Problem>}
      <SheetButtons primary={busy ? "Saving…" : "Meter replaced — start it here"} onPrimary={replaced} disabled={busy} />
      <button onClick={() => onDecided("reading")} disabled={busy} style={{
        minHeight: 44, background: "transparent", border: "none", color: color.accent,
        fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600, cursor: "pointer",
      }}>
        It&apos;s right as typed — save the reading
      </button>
    </Sheet>
  );
}
