import { useState } from "react";
import { enqueue } from "./mutations";
import { replaceLocal, shortDate } from "./airworthiness";
import { numOrNull } from "./status-logic";
import type { Component, EquipmentProposal } from "@/lib/database.types";
import type { Aircraft } from "./types";
import { color, text, radius, hit, tint } from "./tokens";
import { Sheet, Field, Problem, SheetButtons, EntryPicker, field, type Queued } from "./item-editor";

// Installed equipment — what's on the aircraft drives which ADs apply.
//
// A component is never just deleted from the record when it comes off: it is
// marked removed on a date (linked to the entry that documents the removal), so
// its ADs retire with a reason instead of vanishing.

type LifeUnit = "hours" | "months" | "cycles";

export function EquipmentList({
  aircraft, components, proposals, editable, onQueued, onChanged,
}: {
  aircraft: Aircraft;
  components: Component[];
  proposals: EquipmentProposal[];
  editable: boolean;
  onQueued: Queued;
  onChanged: () => void;
}) {
  const [sheet, setSheet] = useState<{ kind: "edit"; c: Component | null } | { kind: "remove"; c: Component } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const installed = components.filter((c) => c.is_installed).sort((a, b) => a.name.localeCompare(b.name));
  const removed = components.filter((c) => !c.is_installed).sort((a, b) => (b.removal_date ?? "").localeCompare(a.removal_date ?? ""));

  async function decide(p: EquipmentProposal, verb: "confirm" | "dismiss") {
    setBusy(p.id);
    try {
      await enqueue(verb === "confirm" ? "proposals.confirm" : "proposals.dismiss", aircraft.id, { proposalIds: [p.id] }, { label: `${p.name} ${verb === "confirm" ? "added to equipment" : "not added"}` });
      // The proposal row goes either way; the component it becomes arrives on sync.
      await replaceLocal("equipment_proposal", p.id, null);
      onChanged();
      await onQueued();
    } finally {
      setBusy(null);
    }
  }

  async function reinstall(c: Component) {
    setBusy(c.id);
    try {
      await enqueue("component.reinstall", aircraft.id, { componentId: c.id }, { base: c.updated_at, label: `${c.name} reinstalled` });
      await replaceLocal("component", c.id, { ...c, is_installed: true, removal_date: null, removal_entry_id: null });
      onChanged();
      await onQueued();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {proposals.length > 0 && (
        <>
          <div style={{ ...text.sectionLabel, color: color.faint, marginBottom: 8 }}>Found in your logs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {proposals.map((p) => (
              <div key={p.id} style={{ background: color.surface, border: `1px solid ${tint.accentBorder}`, borderRadius: radius.row, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ ...text.rowTitle, color: color.ink }}>{p.name}</span>
                <span style={{ ...text.meta, color: color.faint }}>{describe(p)}{p.is_installed ? "" : " · removed"}</span>
                {editable && (
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button disabled={busy === p.id} onClick={() => decide(p, "confirm")} style={chipButton(true)}>Add to equipment</button>
                    <button disabled={busy === p.id} onClick={() => decide(p, "dismiss")} style={chipButton(false)}>Not on this aircraft</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {editable && <button onClick={() => setSheet({ kind: "edit", c: null })} style={addButton}>+ Record an installation</button>}

      {installed.length === 0 && proposals.length === 0 && (
        <p style={{ ...text.secondary, color: color.faint, lineHeight: 1.5 }}>
          Nothing recorded yet. Add the engine, propeller and avionics that are on the aircraft, or let the web app propose them from your logs.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {installed.map((c) => (
          <button key={c.id} onClick={() => setSheet({ kind: "edit", c })} style={row}>
            <span style={{ ...text.rowTitle, color: color.ink }}>{c.name}</span>
            <span style={{ ...text.meta, color: color.faint }}>{describe(c)}{c.install_date ? ` · installed ${shortDate(c.install_date)}` : ""}</span>
            {c.life_limit_value != null && <span style={{ ...text.meta, color: color.dim }}>Life limit {c.life_limit_value} {c.life_limit_unit}</span>}
          </button>
        ))}
      </div>

      {removed.length > 0 && (
        <>
          <div style={{ ...text.sectionLabel, color: color.faint, margin: "18px 0 8px" }}>Removed</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {removed.map((c) => (
              <div key={c.id} style={{ ...row, opacity: 0.75 }}>
                <span style={{ ...text.rowTitle, color: color.dim }}>{c.name}</span>
                <span style={{ ...text.meta, color: color.faint }}>{describe(c)}{c.removal_date ? ` · removed ${shortDate(c.removal_date)}` : ""}</span>
                {editable && (
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button disabled={busy === c.id} onClick={() => reinstall(c)} style={chipButton(true)}>Reinstalled</button>
                    <button onClick={() => setSheet({ kind: "edit", c })} style={chipButton(false)}>Edit</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {sheet?.kind === "edit" && (
        <ComponentSheet aircraft={aircraft} component={sheet.c} editable={editable} onClose={() => setSheet(null)}
          onRemove={sheet.c ? () => setSheet({ kind: "remove", c: sheet.c as Component }) : undefined}
          onQueued={onQueued} onChanged={onChanged} />
      )}
      {sheet?.kind === "remove" && (
        <RemoveSheet aircraft={aircraft} component={sheet.c} onClose={() => setSheet(null)} onQueued={onQueued} onChanged={onChanged} />
      )}
    </>
  );
}

function describe(c: { make: string | null; category: string | null; part_number: string | null; serial_number: string | null }): string {
  return [c.category, c.make, c.part_number ? `P/N ${c.part_number}` : null, c.serial_number ? `S/N ${c.serial_number}` : null]
    .filter(Boolean).join(" · ") || "no details";
}

const today = () => new Date().toISOString().slice(0, 10);

function ComponentSheet({
  aircraft, component, editable, onClose, onRemove, onQueued, onChanged,
}: {
  aircraft: Aircraft; component: Component | null; editable: boolean;
  onClose: () => void; onRemove?: () => void; onQueued: Queued; onChanged: () => void;
}) {
  const c = component;
  const [name, setName] = useState(c?.name ?? "");
  const [make, setMake] = useState(c?.make ?? "");
  const [category, setCategory] = useState(c?.category ?? "");
  const [pn, setPn] = useState(c?.part_number ?? "");
  const [sn, setSn] = useState(c?.serial_number ?? "");
  const [installDate, setInstallDate] = useState(c?.install_date ?? (c ? "" : today()));
  const [entryId, setEntryId] = useState(c?.install_entry_id ?? "");
  const [lifeValue, setLifeValue] = useState(c?.life_limit_value?.toString() ?? "");
  const [lifeUnit, setLifeUnit] = useState<LifeUnit>(c?.life_limit_unit ?? "hours");
  const [notes, setNotes] = useState(c?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setProblem("Give the equipment a name.");
    const life = numOrNull(lifeValue);
    if (life != null && (!Number.isFinite(life) || life <= 0)) return setProblem("The life limit must be a number above zero.");
    setBusy(true);
    try {
      // ComponentFields = the web's ComponentInput, plus the entry that documents
      // the installation (the component.install_entry_id column).
      const fields = {
        name: name.trim(), make: make.trim() || null, category: category.trim() || null,
        part_number: pn.trim() || null, serial_number: sn.trim() || null,
        install_date: installDate || null, install_entry_id: entryId || null,
        life_limit_value: life, life_limit_unit: life != null ? lifeUnit : null, notes: notes.trim() || null,
      };
      if (c) {
        await enqueue("component.upsert", aircraft.id, { id: c.id, component: fields }, { base: c.updated_at, label: `${fields.name} edited` });
        await replaceLocal("component", c.id, { ...c, ...fields });
      } else {
        await enqueue("component.upsert", aircraft.id, { component: fields }, { label: `${fields.name} installed` });
      }
      onChanged();
      onClose();
      await onQueued();
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!c) return;
    setBusy(true);
    try {
      // ad_compliance.component_id, oil_addition.component_id and
      // oil_analysis_sample.component_id all reference component(id) ON DELETE
      // SET NULL — those records survive, unlinked. Use "Removed" to keep the
      // history; delete is for a component that was never on this aircraft.
      await enqueue("component.delete", aircraft.id, { componentId: c.id }, { base: c.updated_at, label: `${c.name} deleted` });
      await replaceLocal("component", c.id, null);
      onChanged();
      onClose();
      await onQueued();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={c ? c.name : "Record an installation"} onClose={busy ? undefined : onClose}>
      <Field label="Name"><input style={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engine, Garmin GTN 650" autoFocus={!c} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Manufacturer"><input style={field} value={make} onChange={(e) => setMake(e.target.value)} placeholder="Lycoming" /></Field>
        <Field label="Type"><input style={field} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="engine, prop, avionics…" /></Field>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Part number"><input style={field} value={pn} onChange={(e) => setPn(e.target.value)} /></Field>
        <Field label="Serial number"><input style={field} value={sn} onChange={(e) => setSn(e.target.value)} /></Field>
      </div>
      <Field label="Installed on"><input style={field} type="date" value={installDate} onChange={(e) => setInstallDate(e.target.value)} /></Field>
      <EntryPicker aircraftId={aircraft.id} value={entryId} onChange={setEntryId} label="Logbook entry that records the installation" />
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <Field label="Life limit"><input style={field} inputMode="decimal" value={lifeValue} onChange={(e) => setLifeValue(e.target.value)} placeholder="none" /></Field>
        <Field label="Counted in">
          <select style={field} value={lifeUnit} onChange={(e) => setLifeUnit(e.target.value as LifeUnit)}>
            <option value="hours">hours</option><option value="months">months</option><option value="cycles">cycles</option>
          </select>
        </Field>
      </div>
      <Field label="Notes"><textarea style={{ ...field, minHeight: 56, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

      {!editable && <Problem>You have view-only access to this aircraft, so this can&apos;t be saved.</Problem>}
      {problem && <Problem>{problem}</Problem>}
      {editable && (
        <>
          {c?.is_installed && onRemove && (
            <button onClick={onRemove} style={{ ...chipButton(false), minHeight: hit.min, flex: "none" }}>Removed from the aircraft…</button>
          )}
          <SheetButtons
            primary={busy ? "Saving…" : c ? "Save" : "Add to equipment"}
            onPrimary={save}
            disabled={busy}
            danger={c ? (confirmDelete ? `Yes, delete ${c.name}` : "Delete — it was never on this aircraft") : undefined}
            onDanger={c ? (confirmDelete ? del : () => setConfirmDelete(true)) : undefined}
          />
        </>
      )}
    </Sheet>
  );
}

function RemoveSheet({ aircraft, component: c, onClose, onQueued, onChanged }: {
  aircraft: Aircraft; component: Component; onClose: () => void; onQueued: Queued; onChanged: () => void;
}) {
  const [date, setDate] = useState(today());
  const [entryId, setEntryId] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await enqueue("component.remove", aircraft.id, { componentId: c.id, date, entryId: entryId || undefined }, { base: c.updated_at, label: `${c.name} removed` });
      await replaceLocal("component", c.id, { ...c, is_installed: false, removal_date: date, removal_entry_id: entryId || null });
      onChanged();
      onClose();
      await onQueued();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Remove ${c.name}`} onClose={busy ? undefined : onClose}>
      <p style={{ ...text.secondary, color: color.dim, margin: 0, lineHeight: 1.5 }}>
        Any directive tied to this equipment stops applying from this date, with the reason recorded.
        The record stays — use Delete only for something that was never on this aircraft.
      </p>
      <Field label="Removed on"><input style={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <EntryPicker aircraftId={aircraft.id} value={entryId} onChange={setEntryId} label="Logbook entry that records the removal" />
      <SheetButtons primary={busy ? "Saving…" : "Mark removed"} onPrimary={save} disabled={busy || !date} />
    </Sheet>
  );
}

const row: React.CSSProperties = {
  textAlign: "left", background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.row,
  padding: "12px 14px", display: "flex", flexDirection: "column", gap: 5, cursor: "pointer", minHeight: hit.min,
};

const addButton: React.CSSProperties = {
  width: "100%", minHeight: hit.min, marginBottom: 12, borderRadius: radius.control,
  background: tint.accent, border: `1px solid ${tint.accentBorder}`, color: color.accent,
  fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600, cursor: "pointer",
};

const chipButton = (primary: boolean): React.CSSProperties => ({
  flex: 1, minHeight: hit.min, borderRadius: radius.control, padding: "0 12px",
  background: primary ? tint.accent : color.surfaceRaised,
  border: `1px solid ${primary ? color.accent : color.hairline}`,
  color: primary ? color.accent : color.dim,
  fontFamily: text.rowTitle.fontFamily, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
});
