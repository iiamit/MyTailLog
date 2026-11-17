import { useEffect, useRef, useState } from "react";
import { runReviewWrite, resumableWrite } from "./review-write";
import { enqueue } from "./mutations";
import { patchLocal, insertLocal } from "./review-local";
import { getByAircraft } from "./db";
import type { Logbook } from "./types";
import { logbookLabel } from "@/lib/logbooks";
import { Sheet, Stepper, sheetInput, sheetPrimary, sheetCancel } from "./record-screen";
import { toForm, entryDraftChanged, validateEntry, fieldChip, type EntryForm, type ReviewEntry } from "./review-rules";
import { color, text, tint, radius, hit } from "./tokens";

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
  const [selectedLogbookId, setSelectedLogbookId] = useState(entry?.logbook_id ?? logbookId);
  const [logbooks, setLogbooks] = useState<Logbook[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const pendingRefresh = useRef<(() => Promise<void>) | null>(null);
  const [draftId] = useState(() => crypto.randomUUID());
  const [discard, setDiscard] = useState(false);
  const [initial] = useState(() => ({ form: toForm(entry), logbook: entry?.logbook_id ?? logbookId }));
  const discardRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (discard) discardRef.current?.focus(); }, [discard]);
  const [showScan, setShowScan] = useState(false);
  const focusRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => { focusRef.current?.focus(); }, []);
  useEffect(() => {
    void getByAircraft<Logbook>("logbook", aircraftId).then((rows) =>
      setLogbooks(rows.filter((book) => book.type !== "other")));
  }, [aircraftId]);

  const set = (k: keyof EntryForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k: "tach" | "hobbs" | "airframe") => (form[k] === "" ? null : Number(form[k]));

  function requestClose() {
    if (saving) return;
    if (!saved && entryDraftChanged(initial.form, form, initial.logbook, selectedLogbookId)) setDiscard(true);
    else onClose();
  }

  async function save() {
    if (saving) return;
    const v = validateEntry(form);
    if ("error" in v) { setError(v.error); return; }
    setSaving(true);
    setError(null);
    try {
      const result = await runReviewWrite(
        async () => {
          if (pendingRefresh.current) return; // Finish the original local update without queuing twice.
          if (entry) {
            await enqueue("entry.update", aircraftId, { entryId: entry.id, fields: { ...v.fields, logbook_id: selectedLogbookId } }, { base: entry.updated_at });
          } else {
            await enqueue("entry.create", aircraftId, { id: draftId, logbookId: selectedLogbookId, pageId, fields: v.fields }, { id: draftId });
          }
          pendingRefresh.current = resumableWrite([async () => {
            if (entry) {
              await patchLocal<ReviewEntry>("log_entry", aircraftId, entry.id, { ...v.fields, logbook_id: selectedLogbookId, owner_confirmed: true });
            } else {
              await insertLocal<ReviewEntry>("log_entry", {
                id: draftId, aircraft_id: aircraftId, logbook_id: selectedLogbookId, page_id: pageId, ...v.fields,
                confidence: null, field_confidence: null, field_boxes: null, owner_confirmed: true,
                is_continuation: false, entry_index: null, updated_at: new Date().toISOString(),
              });
            }
          }, async () => { await onSaved(); }]);
        },
        async () => { await pendingRefresh.current!(); },
      );
      setSaved(result.queued);
      if (result.error) setError(result.error);
      else onClose();
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
    <Sheet title={entry ? "Edit this entry" : "Add an entry the extractor missed"} onClose={saving ? undefined : requestClose}>
      {discard && <div role="alert" style={{ ...text.secondary, color: color.warning }}>
        <p>Your changes have not been saved. Discard this draft?</p>
        <button ref={discardRef} type="button" onClick={() => setDiscard(false)} style={sheetCancel}>Keep editing</button>
        <button type="button" onClick={onClose} style={sheetCancel}>Discard changes</button>
      </div>}
      <fieldset disabled={saving || saved || discard} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "block" }}>
        {label("Entry category", "logbook_id")}
        <select value={selectedLogbookId} onChange={(e) => setSelectedLogbookId(e.target.value)} style={sheetInput}>
          {logbooks.map((book) => <option key={book.id} value={book.id}>{logbookLabel(book.type, book.title)}</option>)}
        </select>
        <span style={{ ...text.sectionLabel, color: color.faint }}>The scanned page stays in its original book.</span>
      </label>
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
            style={{ width: "100%", minHeight: hit.min, background: "transparent", border: "none", padding: 0, color: color.dim, textAlign: "left", fontFamily: text.rowTitle.fontFamily, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
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

      </fieldset>
      {error && <p role="alert" style={{ ...text.secondary, color: color.danger, margin: 0 }}>{error}</p>}
      <button onClick={save} disabled={saving || discard} style={{ ...sheetPrimary, opacity: saving || discard ? 0.4 : 1 }}>
        {saving ? "Saving…" : saved ? "Reload saved entry" : entry ? "Save changes" : "Add entry"}
      </button>
      <button onClick={requestClose} disabled={saving} style={sheetCancel}>{saved ? "Close" : "Cancel"}</button>
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
