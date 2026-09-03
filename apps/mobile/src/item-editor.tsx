import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { enqueue } from "./mutations";
import { getByAircraft } from "./db";
import { replaceLocal, shortDate } from "./airworthiness";
import { validateItem, numOrNull, type ItemFields } from "./status-logic";
import { STANDARD_ITEMS, maintenanceNextDue } from "@/lib/maintenance";
import type { MaintenanceItem } from "@/lib/database.types";
import type { Meter } from "@/lib/hobbsTach";
import type { Aircraft } from "./types";
import { color, text, radius, hit, accentGradient, tint } from "./tokens";

// Create / edit / delete one recurring item. Also home to the small form kit the
// AD and equipment sheets share (Sheet, Field, Chips, EntryPicker) so the three
// look like one app.

export type Queued = () => Promise<"synced" | "pending">;

const METER_OPTIONS: { value: "" | Meter; label: string }[] = [
  { value: "", label: "Default (tach; oil on hobbs)" },
  { value: "tach", label: "Tach" },
  { value: "hobbs", label: "Hobbs" },
  { value: "airframe", label: "Airframe total" },
];

export function ItemEditor({
  aircraft, item, onClose, onQueued, onChanged,
}: {
  aircraft: Aircraft;
  /** null = new item. */
  item: MaintenanceItem | null;
  onClose: () => void;
  onQueued: Queued;
  onChanged: () => void;
}) {
  const [kind, setKind] = useState(item?.kind ?? "other");
  const [label, setLabel] = useState(item?.label ?? "");
  const [regulatory, setRegulatory] = useState(item?.regulatory ?? true);
  const [months, setMonths] = useState(item?.interval_months?.toString() ?? "");
  const [hours, setHours] = useState(item?.interval_hours?.toString() ?? "");
  const [lastDate, setLastDate] = useState(item?.last_done_date ?? "");
  const [lastHours, setLastHours] = useState(item?.last_done_hours?.toString() ?? "");
  const [meter, setMeter] = useState<"" | Meter>(item?.meter ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const fields: ItemFields = {
    kind, label, regulatory,
    interval_months: numOrNull(months), interval_hours: numOrNull(hours),
    last_done_date: lastDate || null, last_done_hours: numOrNull(lastHours),
    notes: notes.trim() || null, meter: meter || null,
  };

  /** Picking a standard kind fills the form the way the web's picker does. */
  function pickKind(k: string) {
    setKind(k);
    const std = STANDARD_ITEMS.find((s) => s.kind === k);
    if (!std || item) return;
    setLabel(std.label);
    setRegulatory(std.regulatory);
    setMonths(std.interval_months?.toString() ?? "");
    setHours(std.interval_hours?.toString() ?? "");
  }

  async function save() {
    const why = validateItem(fields);
    if (why) return setProblem(why);
    setBusy(true);
    try {
      const payload = { ...fields, label: fields.label.trim() };
      if (item) {
        await enqueue("mx.upsert", aircraft.id, { id: item.id, item: payload }, { base: item.updated_at, label: `${payload.label} edited` });
        await replaceLocal("maintenance_item", item.id, { ...item, ...payload, ...maintenanceNextDue(payload) });
      } else {
        // No local row until the server assigns the id — it appears after the
        // next sync, like a squawk added offline.
        await enqueue("mx.upsert", aircraft.id, { item: payload }, { label: `${payload.label} added` });
      }
      onChanged();
      onClose();
      await onQueued();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!item) return;
    setBusy(true);
    try {
      // No table references maintenance_item(id) — nothing to relink.
      await enqueue("mx.delete", aircraft.id, { itemId: item.id }, { base: item.updated_at, label: `${item.label} deleted` });
      await replaceLocal("maintenance_item", item.id, null);
      onChanged();
      onClose();
      await onQueued();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={item ? "Edit item" : "New item"} onClose={busy ? undefined : onClose}>
      <Field label="What">
        <select style={field} value={kind} onChange={(e) => pickKind(e.target.value)}>
          {STANDARD_ITEMS.map((s) => <option key={s.kind} value={s.kind}>{s.label}</option>)}
          <option value="other">Something else</option>
        </select>
      </Field>
      <Field label="Name">
        <input style={field} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Magneto inspection" />
      </Field>
      <Chips
        value={regulatory ? "required" : "advisory"}
        onChange={(v) => setRegulatory(v === "required")}
        options={[["required", "Required by regulation"], ["advisory", "Advisory"]]}
      />
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Every … months"><input style={field} inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="12" /></Field>
        <Field label="Every … hours"><input style={field} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="100" /></Field>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Last done"><input style={field} type="date" value={lastDate} onChange={(e) => setLastDate(e.target.value)} /></Field>
        <Field label="At … hours"><input style={field} inputMode="decimal" value={lastHours} onChange={(e) => setLastHours(e.target.value)} placeholder="4158.0" /></Field>
      </div>
      <Field label="Counts hours on">
        <select style={field} value={meter} onChange={(e) => setMeter(e.target.value as "" | Meter)}>
          {METER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="Notes">
        <textarea style={{ ...field, minHeight: 64, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {problem && <Problem>{problem}</Problem>}
      <SheetButtons
        primary={busy ? "Saving…" : item ? "Save changes" : "Add item"}
        onPrimary={save}
        disabled={busy}
        danger={item ? (confirmDelete ? `Yes, delete ${item.label}` : "Delete this item") : undefined}
        onDanger={item ? (confirmDelete ? remove : () => setConfirmDelete(true)) : undefined}
      />
    </Sheet>
  );
}

// --- Form kit -------------------------------------------------------------------

export function Sheet({ title, tag, onClose, children }: {
  title: string;
  /** A small identifier under the title — an AD number, a part number. Never
   *  the title itself: a bare number tells the owner nothing (Rule 6). */
  tag?: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
        style={{
          width: "100%", maxHeight: "92vh", overflowY: "auto", boxSizing: "border-box",
          background: color.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          border: `1px solid ${color.hairline}`, borderBottom: "none",
          padding: "10px 20px calc(22px + env(safe-area-inset-bottom))",
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: color.hairline, margin: "0 auto 2px" }} />
        <div style={{ ...text.verdict, color: color.ink }}>{title}</div>
        {tag && <div style={{ ...text.meta, fontSize: 10, color: color.faint, marginTop: -8 }}>{tag}</div>}
        {children}
      </div>
    </div>
  );
}

/** 16px — WKWebView zooms anything smaller and leaves the app panned. */
export const field: CSSProperties = {
  width: "100%", boxSizing: "border-box", minHeight: hit.min,
  background: color.bg, border: `1px solid ${color.hairline}`, borderRadius: radius.control,
  padding: "10px 12px", color: color.ink, fontFamily: text.bodyText.fontFamily, fontSize: 16,
};

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: "block", flex: 1, minWidth: 0 }}>
      <span style={{ ...text.meta, fontWeight: 600, color: color.faint, display: "block", marginBottom: 5 }}>{label}</span>
      {children}
      {hint && <span style={{ ...text.meta, color: color.faint, display: "block", marginTop: 4, lineHeight: 1.4 }}>{hint}</span>}
    </label>
  );
}

export function Chips<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[];
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map(([id, label]) => {
        const on = id === value;
        return (
          <button key={id} type="button" onClick={() => onChange(id)} style={{
            flex: 1, minHeight: hit.min, borderRadius: radius.control, padding: "0 12px",
            background: on ? tint.accent : color.surfaceRaised,
            border: `1px solid ${on ? color.accent : color.hairline}`,
            color: on ? color.accent : color.dim,
            fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: on ? 600 : 500, cursor: "pointer",
          }}>{label}</button>
        );
      })}
    </div>
  );
}

export function Problem({ children }: { children: ReactNode }) {
  return <p style={{ ...text.secondary, color: color.warning, margin: 0, lineHeight: 1.45 }}>{children}</p>;
}

export function SheetButtons({ primary, onPrimary, disabled, danger, onDanger }: {
  primary: string; onPrimary: () => void; disabled?: boolean; danger?: string; onDanger?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      <button onClick={onPrimary} disabled={disabled} style={{
        minHeight: hit.primary, borderRadius: 15, border: "none", background: accentGradient, color: color.onAccent,
        fontFamily: text.button.fontFamily, fontSize: 16, fontWeight: 600, cursor: "pointer", opacity: disabled ? 0.4 : 1,
      }}>{primary}</button>
      {danger && onDanger && (
        <button onClick={onDanger} disabled={disabled} style={{
          minHeight: hit.min, borderRadius: radius.control, background: "transparent",
          border: `1px solid ${tint.dangerBorder}`, color: color.danger,
          fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600, cursor: "pointer",
        }}>{danger}</button>
      )}
    </div>
  );
}

type EntryLite = { id: string; entry_date: string | null; description: string | null };

/** Link a record to the logbook entry that documents it. Newest first. */
export function EntryPicker({ aircraftId, value, onChange, label = "Logbook entry" }: {
  aircraftId: string; value: string; onChange: (id: string) => void; label?: string;
}) {
  const [entries, setEntries] = useState<EntryLite[]>([]);
  useEffect(() => {
    getByAircraft<EntryLite>("log_entry", aircraftId).then((rows) =>
      setEntries(rows.sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? "")).slice(0, 300)),
    );
  }, [aircraftId]);
  return (
    <Field label={label}>
      <select style={field} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not linked</option>
        {entries.map((e) => (
          <option key={e.id} value={e.id}>
            {e.entry_date ? shortDate(e.entry_date) : "undated"} · {(e.description ?? "").slice(0, 48) || "no description"}
          </option>
        ))}
      </select>
    </Field>
  );
}
