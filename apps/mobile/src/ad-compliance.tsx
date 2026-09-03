import { useState } from "react";
import { enqueue } from "./mutations";
import { patchLocal, shortDate } from "./airworthiness";
import { adStatusLine, numOrNull } from "./status-logic";
import { API_BASE } from "./supabase";
import { computeNextDue, AD_STATUS_LABEL } from "@/lib/compliance";
import type { AdCompliance, AdKind, AdReference, AdStatus, Component } from "@/lib/database.types";
import type { Aircraft } from "./types";
import { color, text, radius, hit, tint, semantic } from "./tokens";
import { Sheet, Field, Chips, Problem, SheetButtons, EntryPicker, field, type Queued } from "./item-editor";

// Airworthiness Directives — the list and the "record compliance" sheet.
//
// The AD's official text lives in ad_reference, which only reaches the phone
// once migration 0058 adds it to the feed. Until then (and for ADs never looked
// up) the row shows what the owner typed and a link to read it on the web.

const STATUSES = Object.keys(AD_STATUS_LABEL) as AdStatus[];

export function AdList({
  aircraft, ads, refs, components, currentTach, editable, onQueued, onChanged,
}: {
  aircraft: Aircraft;
  ads: AdCompliance[];
  refs: AdReference[];
  components: Component[];
  currentTach: number | null;
  editable: boolean;
  onQueued: Queued;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<AdCompliance | null | "new">(null);
  const refById = new Map(refs.map((r) => [r.id, r]));
  const refByNumber = new Map(refs.map((r) => [r.ad_number?.toLowerCase(), r]));
  const refFor = (a: AdCompliance) =>
    (a.ad_reference_id && refById.get(a.ad_reference_id)) || refByNumber.get(a.reference.toLowerCase()) || null;

  const judged = ads
    .map((a) => ({ a, line: adStatusLine(a, currentTach) }))
    .sort((x, y) => rank(x.line.urgency, x.line.open) - rank(y.line.urgency, y.line.open) || x.a.reference.localeCompare(y.a.reference));

  return (
    <>
      {editable && (
        <button onClick={() => setOpen("new")} style={addButton}>+ Track an AD or service bulletin</button>
      )}
      {judged.length === 0 && (
        <p style={{ ...text.secondary, color: color.faint, lineHeight: 1.5 }}>
          No directives tracked yet. Add the ones that apply to this airframe, engine and propeller, or let the web app find them in your logs.
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {judged.map(({ a, line }) => {
          const sem = line.urgency === "overdue" ? semantic.grounded : line.urgency === "due_soon" ? semantic.due : null;
          const wordColor = sem ? sem.color : line.open ? color.warning : a.status === "complied" || a.status === "previously_complied" ? color.success : color.faint;
          const ref = refFor(a);
          return (
            <button key={a.id} onClick={() => setOpen(a)} style={{
              textAlign: "left", background: color.surface, border: `1px solid ${sem ? sem.border : color.hairline}`,
              borderRadius: radius.row, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer", minHeight: hit.min,
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ ...text.meta, fontWeight: 600, color: color.dim, background: color.surfaceRaised, borderRadius: 5, padding: "2px 6px" }}>{a.kind.toUpperCase()}</span>
                <span style={{ ...text.rowTitle, color: color.ink, minWidth: 0, flex: 1 }}>{a.reference}</span>
                <span style={{ ...text.countdown, color: wordColor, whiteSpace: "nowrap" }}>{line.word}</span>
              </div>
              {(ref?.title || a.title) && (
                <span style={{ ...text.secondary, color: color.dim, lineHeight: 1.4 }}>{ref?.title ?? a.title}</span>
              )}
              <span style={{ ...text.meta, color: color.faint }}>{line.detail}{a.method ? ` · ${a.method}` : ""}</span>
            </button>
          );
        })}
      </div>

      {open && (
        <AdSheet
          aircraft={aircraft}
          record={open === "new" ? null : open}
          reference={open === "new" ? null : refFor(open)}
          components={components}
          editable={editable}
          onClose={() => setOpen(null)}
          onQueued={onQueued}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function rank(u: string, open: boolean): number {
  return u === "overdue" ? 0 : u === "due_soon" ? 1 : open ? 2 : u === "upcoming" ? 3 : 4;
}

const today = () => new Date().toISOString().slice(0, 10);

export function AdSheet({
  aircraft, record, reference, components, editable, onClose, onQueued, onChanged,
}: {
  aircraft: Aircraft;
  record: AdCompliance | null;
  reference: AdReference | null;
  components: Component[];
  editable: boolean;
  onClose: () => void;
  onQueued: Queued;
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<AdKind>(record?.kind ?? "ad");
  const [ref, setRef] = useState(record?.reference ?? "");
  const [title, setTitle] = useState(record?.title ?? "");
  const [status, setStatus] = useState<AdStatus>(record?.status ?? "complied");
  const [recurring, setRecurring] = useState(record?.recurring ?? false);
  const [months, setMonths] = useState(record?.interval_months?.toString() ?? "");
  const [hours, setHours] = useState(record?.interval_hours?.toString() ?? "");
  const [date, setDate] = useState(record?.complied_date ?? (record ? "" : today()));
  const [atHours, setAtHours] = useState(record?.complied_hours?.toString() ?? "");
  const [method, setMethod] = useState(record?.method ?? "");
  const [entryId, setEntryId] = useState(record?.reference_entry_id ?? "");
  const [componentId, setComponentId] = useState(record?.component_id ?? "");
  const [reason, setReason] = useState(record?.reason ?? "");
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const complied = status === "complied" || status === "previously_complied";
  const retired = status === "not_applicable" || status === "superseded";

  async function save() {
    if (!ref.trim()) return setProblem("Enter the AD or SB number.");
    if (complied && !date) return setProblem("When was it complied with?");
    const im = numOrNull(months), ih = numOrNull(hours), ch = numOrNull(atHours);
    if ([im, ih, ch].some((n) => n != null && !Number.isFinite(n))) return setProblem("Hours and months must be numbers.");
    setBusy(true);
    try {
      // AdComplianceFields = the web's AdInput, plus the entry that documents
      // the compliance (the ad_compliance.reference_entry_id column).
      const fields = {
        kind, reference: ref.trim(), title: title.trim() || null, applicability: record?.applicability ?? null,
        recurring, interval_hours: ih, interval_months: im, status, method: method.trim() || null,
        complied_date: complied ? date || null : null, complied_hours: complied ? ch : null,
        notes: notes.trim() || null,
        reason: retired ? reason.trim() || null : null,
        status_changed_on: retired ? record?.status_changed_on ?? today() : null,
        component_id: componentId || null,
        reference_entry_id: entryId || null,
      };
      if (record) {
        await enqueue("ad.upsert", aircraft.id, { id: record.id, record: fields }, { base: record.updated_at, label: `${kind.toUpperCase()} ${fields.reference} updated` });
        await patchLocal("ad_compliance", record.id, { ...record, ...fields, ...computeNextDue(fields) });
      } else if (status === "open" && !method.trim() && !entryId) {
        // Nothing but the number: just start tracking it. The id is ours, so the
        // row can show up on the phone before it has synced.
        const id = crypto.randomUUID();
        await enqueue("ad.track", aircraft.id, { id, reference: fields.reference, kind }, { id, label: `${kind.toUpperCase()} ${fields.reference} tracked` });
        await patchLocal("ad_compliance", id, {
          ...fields, id, aircraft_id: aircraft.id, next_due_date: null, next_due_hours: null,
          ad_reference_id: null, verified_report_page_id: null, verified_at: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
      } else {
        await enqueue("ad.upsert", aircraft.id, { record: fields }, { label: `${kind.toUpperCase()} ${fields.reference} recorded` });
      }
      onChanged();
      onClose();
      await onQueued();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!record) return;
    setBusy(true);
    try {
      // Nothing references ad_compliance(id) — the row simply goes.
      await enqueue("ad.delete", aircraft.id, { recordId: record.id }, { base: record.updated_at, label: `${record.kind.toUpperCase()} ${record.reference} removed` });
      await patchLocal("ad_compliance", record.id, null);
      onChanged();
      onClose();
      await onQueued();
    } finally {
      setBusy(false);
    }
  }

  const webUrl = `${API_BASE}/aircraft/${aircraft.id}/compliance`;

  return (
    <Sheet title={record ? `${record.kind.toUpperCase()} ${record.reference}` : "Track a directive"} onClose={busy ? undefined : onClose}>
      {record && (
        <div style={{ background: color.surfaceRaised, border: `1px solid ${color.hairline}`, borderRadius: radius.row, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 5 }}>
          {reference ? (
            <>
              <span style={{ ...text.rowTitle, color: color.ink }}>{reference.title ?? record.reference}</span>
              {reference.effective_date && <span style={{ ...text.meta, color: color.faint }}>Effective {shortDate(reference.effective_date)}{reference.citation ? ` · ${reference.citation}` : ""}</span>}
              {reference.abstract && <span style={{ ...text.meta, color: color.dim, lineHeight: 1.45 }}>{reference.abstract.slice(0, 400)}{reference.abstract.length > 400 ? "…" : ""}</span>}
            </>
          ) : (
            <span style={{ ...text.meta, color: color.faint, lineHeight: 1.45 }}>
              The official text isn&apos;t on this phone. It&apos;s looked up and kept on the web app.
            </span>
          )}
          {navigator.onLine ? (
            <a href={webUrl} target="_blank" rel="noreferrer" style={{ ...text.secondary, fontWeight: 600, color: color.accent, minHeight: 32, display: "inline-flex", alignItems: "center" }}>
              Read the full directive on the web ›
            </a>
          ) : (
            <span style={{ ...text.meta, color: color.faint }}>Reading the full text needs a connection.</span>
          )}
        </div>
      )}

      {!record && (
        <>
          <Chips value={kind} onChange={setKind} options={[["ad", "Airworthiness Directive"], ["sb", "Service Bulletin"]]} />
          <Field label="Number"><input style={field} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 2023-04-08" autoFocus /></Field>
          <Field label="Subject"><input style={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What it concerns" /></Field>
        </>
      )}

      <Field label="Status">
        <select style={field} value={status} onChange={(e) => setStatus(e.target.value as AdStatus)}>
          {STATUSES.map((s) => <option key={s} value={s}>{AD_STATUS_LABEL[s]}</option>)}
        </select>
      </Field>

      {complied && (
        <>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Complied on"><input style={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="At … hours (tach)"><input style={field} inputMode="decimal" value={atHours} onChange={(e) => setAtHours(e.target.value)} placeholder="4158.0" /></Field>
          </div>
          <Field label="How it was complied with" hint="The method the mechanic wrote — inspected, replaced, terminating action…">
            <input style={field} value={method} onChange={(e) => setMethod(e.target.value)} />
          </Field>
          <EntryPicker aircraftId={aircraft.id} value={entryId} onChange={setEntryId} label="Logbook entry that records it" />
        </>
      )}

      <Chips value={recurring ? "yes" : "no"} onChange={(v) => setRecurring(v === "yes")} options={[["no", "One-time"], ["yes", "Recurring"]]} />
      {recurring && (
        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Every … months"><input style={field} inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} /></Field>
          <Field label="Every … hours"><input style={field} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        </div>
      )}

      {retired && (
        <Field label="Why" hint="Shown on the status page so the reason survives the next annual.">
          <input style={field} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Equipment removed 4 Mar 2025" />
        </Field>
      )}

      {components.length > 0 && (
        <Field label="Related equipment" hint="Removing that equipment marks this directive as no longer applicable.">
          <select style={field} value={componentId} onChange={(e) => setComponentId(e.target.value)}>
            <option value="">None</option>
            {components.map((c) => <option key={c.id} value={c.id}>{c.name}{c.make ? ` (${c.make})` : ""}{c.is_installed ? "" : " — removed"}</option>)}
          </select>
        </Field>
      )}

      <Field label="Notes"><textarea style={{ ...field, minHeight: 56, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

      {!editable && <Problem>You have view-only access to this aircraft, so this can&apos;t be saved.</Problem>}
      {problem && <Problem>{problem}</Problem>}
      {editable && (
        <SheetButtons
          primary={busy ? "Saving…" : record ? "Save" : "Start tracking"}
          onPrimary={save}
          disabled={busy}
          danger={record ? (confirmDelete ? "Yes, remove this record" : "Remove from this aircraft") : undefined}
          onDanger={record ? (confirmDelete ? remove : () => setConfirmDelete(true)) : undefined}
        />
      )}
    </Sheet>
  );
}

const addButton: React.CSSProperties = {
  width: "100%", minHeight: hit.min, marginBottom: 12, borderRadius: radius.control,
  background: tint.accent, border: `1px solid ${tint.accentBorder}`, color: color.accent,
  fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600, cursor: "pointer",
};
