import { useEffect, useRef, useState } from "react";
import { enqueue } from "./mutations";
import { patchLocal, insertLocal } from "./review-local";
import { Sheet, Stepper, sheetInput, sheetPrimary, sheetCancel } from "./record-screen";
import { toForm, validateEntry, fieldChip, type EntryForm, type ReviewEntry } from "./review-rules";
import { color, text, tint, radius } from "./tokens";

// The entry editor sheet. Opened from a card in the review pane with the tapped
// field focused, or blank for "Add an entry the extractor missed". The raw
// transcription of the page sits under the text fields so a doubtful word can
// be checked against what the scanner actually read, without leaving the sheet.
//
// Writes go through enqueue() only; the local mirror is patched right after so
// the card behind the sheet shows the edit the moment it closes.

export type EntryEditorProps = {
  aircraftId: string;
  logbookId: string;
  pageId: string | null;
  ocrText: string | null;
  /** null = a new entry. */
  entry: ReviewEntry | null;
  focus?: keyof EntryForm;
  onClose: () => void;
  /** After the write is queued and mirrored. */
  onSaved: () => Promise<void> | void;
};

const TEXT_FIELDS: { key: keyof EntryForm; label: string; multiline?: boolean; hint?: string }[] = [
  { key: "description", label: "What was done", multiline: true },
  { key: "work_performed", label: "Details", multiline: true },
  { key: "parts", label: "Parts" },
  { key: "signature_name", label: "Signed by" },
  { key: "mechanic_cert_number", label: "Certificate number" },
  { key: "ad_refs", label: "Airworthiness directives", hint: "Separate with commas" },
  { key: "sb_refs", label: "Service bulletins", hint: "Separate with commas" },
];

export function EntryEditor({ aircraftId, logbookId, pageId, ocrText, entry, focus, onClose, onSaved }: EntryEditorProps) {
  const [form, setForm] = useState<EntryForm>(() => toForm(entry));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const focusRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => { focusRef.current?.focus(); }, []);

  const set = (k: keyof EntryForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k: "tach" | "hobbs" | "airframe") => (form[k] === "" ? null : Number(form[k]));

  async function save() {
    const v = validateEntry(form);
    if ("error" in v) { setError(v.error); return; }
    setSaving(true);
    try {
      if (entry) {
        await enqueue("entry.update", aircraftId, { entryId: entry.id, fields: v.fields }, { base: entry.updated_at });
        // Editing implicitly confirms — the server does the same.
        await patchLocal<ReviewEntry>("log_entry", aircraftId, entry.id, { ...v.fields, owner_confirmed: true });
      } else {
        const id = crypto.randomUUID();
        await enqueue("entry.create", aircraftId, { id, logbookId, pageId, fields: v.fields }, { id });
        const now = new Date().toISOString();
        await insertLocal<ReviewEntry>("log_entry", {
          id, aircraft_id: aircraftId, logbook_id: logbookId, page_id: pageId, ...v.fields,
          confidence: null, field_confidence: null, field_boxes: null, owner_confirmed: true,
          is_continuation: false, entry_index: null, updated_at: now,
        });
      }
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const label = (s: string, key: string) => (
    <span style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
      <span style={{ ...text.sectionLabel, color: color.faint }}>{s}</span>
      {fieldChip(entry?.field_confidence, key) && <CheckChip />}
    </span>
  );

  return (
    <Sheet title={entry ? "Edit this entry" : "Add an entry the extractor missed"} onClose={saving ? undefined : onClose}>
      <label style={{ display: "block" }}>
        {label("Date", "entry_date")}
        <input
          type="date"
          value={form.entry_date}
          onChange={(e) => set("entry_date")(e.target.value)}
          ref={(el) => { if (focus === "entry_date") focusRef.current = el; }}
          style={sheetInput}
        />
      </label>

      <Stepper label="TACH" value={num("tach")} onChange={(n) => set("tach")(String(n))} onClear={() => set("tach")("")} />
      <Stepper label="HOBBS" value={num("hobbs")} onChange={(n) => set("hobbs")(String(n))} onClear={() => set("hobbs")("")} />
      <Stepper label="AIRFRAME TOTAL" value={num("airframe")} onChange={(n) => set("airframe")(String(n))} onClear={() => set("airframe")("")} />

      {TEXT_FIELDS.map((f) => (
        <label key={f.key} style={{ display: "block" }}>
          {label(f.label, f.key)}
          {f.multiline ? (
            <textarea
              value={form[f.key]}
              onChange={(e) => set(f.key)(e.target.value)}
              ref={(el) => { if (focus === f.key) focusRef.current = el; }}
              style={{ ...sheetInput, minHeight: 84, resize: "vertical" }}
            />
          ) : (
            <input
              value={form[f.key]}
              onChange={(e) => set(f.key)(e.target.value)}
              placeholder={f.hint}
              autoCapitalize={f.key.endsWith("_refs") ? "characters" : undefined}
              ref={(el) => { if (focus === f.key) focusRef.current = el; }}
              style={sheetInput}
            />
          )}
        </label>
      ))}

      {ocrText && (
        <div style={{ background: color.bg, border: `1px solid ${color.hairline}`, borderRadius: radius.control, padding: "10px 12px" }}>
          <button
            onClick={() => setShowScan((s) => !s)}
            style={{ width: "100%", minHeight: 32, background: "transparent", border: "none", padding: 0, color: color.dim, textAlign: "left", fontFamily: text.rowTitle.fontFamily, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
          >
            {showScan ? "▾" : "▸"} What the scanner read
          </button>
          {showScan && (
            <pre style={{ ...text.bodyText, color: color.dim, margin: "8px 0 0", whiteSpace: "pre-wrap", fontFamily: text.bodyText.fontFamily, userSelect: "text" }}>
              {ocrText}
            </pre>
          )}
        </div>
      )}

      {error && <p style={{ ...text.secondary, color: color.danger, margin: 0 }}>{error}</p>}
      <button onClick={save} disabled={saving} style={{ ...sheetPrimary, opacity: saving ? 0.4 : 1 }}>
        {saving ? "Saving…" : entry ? "Save changes" : "Add entry"}
      </button>
      <button onClick={onClose} style={sheetCancel}>Cancel</button>
    </Sheet>
  );
}

/** The one chip: the scanner wasn't sure of this field. */
export function CheckChip() {
  return (
    <span style={{ ...text.chip, color: color.warning, background: tint.warning, border: `1px solid ${tint.warningBorder}`, borderRadius: 6, padding: "2px 6px", minHeight: 0, lineHeight: 1.4 }}>
      Check this
    </span>
  );
}
