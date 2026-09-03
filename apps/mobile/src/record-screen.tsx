import { useEffect, useRef, useState } from "react";
import { computeAirworthiness } from "./airworthiness";
import { queueAction, canEdit } from "./actions";
import { enqueue } from "./mutations";
import { getByAircraft } from "./db";
import { patchLocal, deleteLocal } from "./review-local";
import { recentReadings, validateReading, swipeReveals, readingEditable, readingProvenance, type ReadingRow } from "./review-rules";
import { shortDate } from "./airworthiness";
import type { Aircraft } from "./types";
import { color, text, radius, hit, accentGradient, tabular, display, tint } from "./tokens";

// Log a flight — tab 2.
//
// Recorded standing at the aircraft, often one-handed, outdoors, sometimes with
// oily hands. So: steppers rather than a keyboard, the delta shown live because
// that's the number an owner sanity-checks, and ONE button that commits both the
// meters and the oil. The old screen had two submits labelled "Queue reading"
// and "Queue oil" — an internal word for the offline queue, used as a verb.

// "3+" isn't a quantity — it can't go on a consumption trend, and it can't
// express the half-quart top-up that is the common case. The presets cover the
// usual amounts; "Other" takes any number, including 0.5 and 1.5.
const OIL_PRESETS = [
  { label: "None", quarts: 0 },
  { label: "1 qt", quarts: 1 },
  { label: "2 qt", quarts: 2 },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

export function Record({ aircraft, onQueued }: { aircraft: Aircraft; onQueued: () => Promise<"synced" | "pending"> }) {
  const [prev, setPrev] = useState<{ tach: number | null; hobbs: number | null } | null>(null);
  const [tach, setTach] = useState<number | null>(null);
  const [hobbs, setHobbs] = useState<number | null>(null);
  const [oil, setOil] = useState(0);
  const [oilCustom, setOilCustom] = useState(false);
  const [oilText, setOilText] = useState("");
  // Only one meter is mandatory. Recording BOTH when you only read one writes a
  // reading that asserts the other meter still shows its previous value today —
  // which is false the moment the aircraft has flown.
  const [include, setInclude] = useState({ tach: true, hobbs: true });
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const editable = canEdit(aircraft.id);

  const loadReadings = () =>
    getByAircraft<ReadingRow>("hours_reading", aircraft.id).then((rows) => setReadings(recentReadings(rows)));
  useEffect(() => { loadReadings(); }, [aircraft.id]);

  useEffect(() => {
    computeAirworthiness(aircraft.id)
      .then((d) => {
        const t = d.meters.tach.tach;
        const h = d.meters.hobbs.hobbs;
        setPrev({ tach: t, hobbs: h });
        // Start AT the last reading — you're correcting digits, not typing a
        // number from scratch, and the delta stays visible as you move.
        setTach(t);
        setHobbs(h);
      })
      .catch(() => setPrev({ tach: null, hobbs: null }));
  }, [aircraft.id]);

  const sendTach = include.tach ? tach : null;
  const sendHobbs = include.hobbs ? hobbs : null;
  const oilQuarts = oilCustom ? Number(oilText) : oil;
  const oilValid = !oilCustom || (oilText.trim() !== "" && Number.isFinite(oilQuarts) && oilQuarts > 0);

  const nothingEntered = sendTach == null && sendHobbs == null;
  const unchanged =
    (sendTach == null || sendTach === prev?.tach) &&
    (sendHobbs == null || sendHobbs === prev?.hobbs) &&
    !(oilQuarts > 0);

  async function save() {
    if (!editable || saving) return;
    setSaving(true);
    try {
      const date = todayIso();
      if (sendTach != null || sendHobbs != null) {
        await queueAction({
          aircraftId: aircraft.id,
          type: "reading",
          label: [sendTach != null ? `Tach ${sendTach.toFixed(1)}` : null, sendHobbs != null ? `Hobbs ${sendHobbs.toFixed(1)}` : null].filter(Boolean).join(" · "),
          payload: { date, tach: sendTach, hobbs: sendHobbs },
        });
      }
      if (oilQuarts > 0) {
        await queueAction({
          aircraftId: aircraft.id,
          type: "oil",
          label: `Oil +${oilQuarts} qt`,
          // Recorded against whichever meters were actually read.
          payload: { date, quarts: oilQuarts, tach: sendTach, hobbs: sendHobbs },
        });
      }
      setOil(0);
      setOilCustom(false);
      setOilText("");
      const result = await onQueued();
      setSaved(result === "synced" ? "Saved · synced" : "Saved · waiting for a connection");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h1 style={{ ...text.screenTitle, color: color.ink, margin: 0 }}>Log a flight</h1>
        <span style={{ ...text.meta, color: color.faint, marginLeft: "auto" }}>{aircraft.tail_number}</span>
      </div>
      <div style={{ ...text.secondary, color: color.dim, marginTop: 4, marginBottom: 22 }}>
        Today · {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </div>

      {!editable && (
        <p style={{ ...text.secondary, color: color.warning, marginBottom: 14 }}>
          You have view-only access to this aircraft, so nothing here can be saved.
        </p>
      )}

      <div style={{ background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.panel, padding: "18px 16px", display: "flex", flexDirection: "column", gap: 18 }}>
        <Meter
          label="TACH" value={tach} was={prev?.tach ?? null} onChange={setTach}
          deltaTone={color.success}
          included={include.tach}
          onToggle={() => setInclude((s) => ({ ...s, tach: !s.tach }))}
          canOmit={include.hobbs}
        />
        <div style={{ height: 1, background: color.hairline }} />
        <Meter
          label="HOBBS" value={hobbs} was={prev?.hobbs ?? null} onChange={setHobbs}
          deltaTone={color.faint}
          included={include.hobbs}
          onToggle={() => setInclude((s) => ({ ...s, hobbs: !s.hobbs }))}
          canOmit={include.tach}
        />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.panel, padding: 16, marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ ...text.rowTitle, color: color.ink }}>Oil added</span>
          <span style={{ ...text.meta, color: color.faint, marginLeft: "auto" }}>optional</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {OIL_PRESETS.map((o) => {
            const on = !oilCustom && oil === o.quarts;
            return (
              <button
                key={o.label}
                onClick={() => { setOilCustom(false); setOil(o.quarts); }}
                disabled={!editable}
                style={{
                  flex: 1, minHeight: hit.min, borderRadius: radius.control,
                  background: on ? tint.accent : color.surfaceRaised,
                  border: `1px solid ${on ? color.accent : color.hairline}`,
                  color: on ? color.accent : color.dim,
                  fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: on ? 600 : 500,
                  cursor: editable ? "pointer" : "default",
                }}
              >
                {o.label}
              </button>
            );
          })}
          <button
            onClick={() => { setOilCustom(true); setOil(0); }}
            disabled={!editable}
            style={{
              flex: 1, minHeight: hit.min, borderRadius: radius.control,
              background: oilCustom ? tint.accent : color.surfaceRaised,
              border: `1px solid ${oilCustom ? color.accent : color.hairline}`,
              color: oilCustom ? color.accent : color.dim,
              fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: oilCustom ? 600 : 500,
              cursor: editable ? "pointer" : "default",
            }}
          >
            Other
          </button>
        </div>

        {oilCustom && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              autoFocus
              value={oilText}
              onChange={(e) => setOilText(e.target.value)}
              inputMode="decimal"
              placeholder="0.5"
              aria-label="Quarts added"
              style={{
                flex: 1, minWidth: 0, height: hit.stepper, textAlign: "center",
                background: color.bg, border: `1px solid ${color.hairline}`, borderRadius: 13,
                color: color.ink, fontFamily: display, fontSize: 20, fontWeight: 700, ...tabular,
              }}
            />
            <span style={{ ...text.rowTitle, color: color.dim }}>quarts</span>
          </div>
        )}

        <span style={{ ...text.meta, color: color.faint }}>
          Any amount — half a quart counts. Tracked against the meters you recorded, so it shows
          up on your consumption trend.
        </span>
      </div>

      <button
        onClick={save}
        disabled={saving || !editable || nothingEntered || unchanged || !oilValid}
        style={{
          width: "100%", marginTop: 16, minHeight: hit.primary, borderRadius: 15, border: "none",
          background: accentGradient, color: color.onAccent,
          fontFamily: text.button.fontFamily, fontSize: 16, fontWeight: 600,
          opacity: saving || !editable || nothingEntered || unchanged || !oilValid ? 0.4 : 1,
          cursor: "pointer",
        }}
      >
        {saving ? "Saving…" : "Save to logbook"}
      </button>
      <p style={{ ...text.meta, color: color.faint, textAlign: "center", marginTop: 8 }}>
        {saved ?? "Saves immediately when connected · safely queues offline"}
      </p>

      <RecentReadings
        aircraft={aircraft}
        rows={readings}
        editable={editable}
        onChanged={async () => { await loadReadings(); await onQueued(); }}
      />
    </>
  );
}

// ---- Recent readings ----------------------------------------------------------
// The last 30 readings, because a mis-keyed tach is noticed AFTER the save, at
// the aircraft, and fixing it should not wait for a laptop. Tap to edit; swipe
// left to delete. Every write carries the row's updated_at as `base`.

function RecentReadings({
  aircraft, rows, editable, onChanged,
}: {
  aircraft: Aircraft; rows: ReadingRow[]; editable: boolean; onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<ReadingRow | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  // iOS fires a click right after touchend, so a swipe would also open the
  // editor. The gesture that moved the row swallows the click that follows it.
  const swiped = useRef(false);

  if (rows.length === 0) return null;

  async function remove(r: ReadingRow) {
    await enqueue("reading.delete", aircraft.id, { readingId: r.id }, { base: r.updated_at, label: "Meter reading deleted" });
    await deleteLocal("hours_reading", r.id);
    setRevealed(null);
    await onChanged();
  }

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ ...text.sectionLabel, color: color.faint, marginBottom: 8 }}>Recent readings</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => {
          const open = revealed === r.id;
          // Only a hand-entered reading can be changed — the server scopes both
          // writes to source='manual', so offering it elsewhere would show an
          // edit that quietly comes back "not found".
          const mine = editable && readingEditable(r);
          const from = readingProvenance(r);
          return (
            <div key={r.id} style={{ position: "relative", borderRadius: radius.row, overflow: "hidden" }}>
              {mine && (
                <button
                  onClick={() => remove(r)}
                  aria-label="Delete this reading"
                  style={{
                    position: "absolute", top: 0, bottom: 0, right: 0, width: 96, border: "none",
                    background: color.danger, color: color.onAccent,
                    fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              )}
              <div
                onTouchStart={(e) => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; swiped.current = false; }}
                onTouchEnd={(e) => {
                  const t = e.changedTouches[0];
                  if (!touch.current || !t || !mine) return;
                  const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
                  if (swipeReveals(dx, dy)) { setRevealed(r.id); swiped.current = true; }
                  else if (dx > 30 && open) { setRevealed(null); swiped.current = true; }
                  touch.current = null;
                }}
                onClick={() => {
                  if (swiped.current) { swiped.current = false; return; }
                  if (open) setRevealed(null);
                  else if (mine) setEditing(r);
                }}
                style={{
                  position: "relative", background: color.surface, border: `1px solid ${color.hairline}`,
                  borderRadius: radius.row, padding: "11px 14px", minHeight: hit.min, boxSizing: "border-box",
                  display: "flex", alignItems: "center", gap: 12, cursor: mine ? "pointer" : "default",
                  transform: open ? "translateX(-96px)" : "none", transition: "transform .18s ease",
                }}
              >
                <span style={{ ...text.rowTitle, color: color.ink, ...tabular }}>
                  {[r.tach != null ? `Tach ${r.tach.toFixed(1)}` : null, r.hobbs != null ? `Hobbs ${r.hobbs.toFixed(1)}` : null].filter(Boolean).join(" · ") || "No meters"}
                </span>
                <span style={{ ...text.meta, color: color.faint, marginLeft: "auto", textAlign: "right" }}>
                  {shortDate(r.reading_date)}
                  {from && <span style={{ display: "block" }}>{from}</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {editable && <p style={{ ...text.meta, color: color.faint, marginTop: 8 }}>Tap a reading to correct it · swipe left to delete</p>}

      {editing && (
        <ReadingEditor
          reading={editing}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            await enqueue("reading.update", aircraft.id, { readingId: editing.id, ...payload }, {
              base: editing.updated_at,
              label: [payload.tach != null ? `Tach ${payload.tach.toFixed(1)}` : null, payload.hobbs != null ? `Hobbs ${payload.hobbs.toFixed(1)}` : null].filter(Boolean).join(" · "),
            });
            await patchLocal<ReadingRow>("hours_reading", aircraft.id, editing.id, { reading_date: payload.date, tach: payload.tach, hobbs: payload.hobbs });
            setEditing(null);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function ReadingEditor({
  reading, onClose, onSave,
}: {
  reading: ReadingRow; onClose: () => void;
  onSave: (p: { date: string; tach: number | null; hobbs: number | null }) => Promise<void>;
}) {
  const [date, setDate] = useState(reading.reading_date ?? "");
  const [tach, setTach] = useState<number | null>(reading.tach);
  const [hobbs, setHobbs] = useState<number | null>(reading.hobbs);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Sheet title="Correct this reading" onClose={saving ? undefined : onClose}>
      <label style={{ display: "block" }}>
        <span style={{ ...text.sectionLabel, color: color.faint, display: "block", marginBottom: 6 }}>Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={sheetInput} />
      </label>
      <Stepper label="TACH" value={tach} onChange={setTach} onClear={() => setTach(null)} />
      <Stepper label="HOBBS" value={hobbs} onChange={setHobbs} onClear={() => setHobbs(null)} />
      {error && <p style={{ ...text.secondary, color: color.danger, margin: 0 }}>{error}</p>}
      <button
        onClick={async () => {
          const v = validateReading({ date, tach, hobbs });
          if ("error" in v) { setError(v.error); return; }
          setSaving(true);
          try { await onSave(v.payload); } finally { setSaving(false); }
        }}
        disabled={saving}
        style={{ ...sheetPrimary, opacity: saving ? 0.4 : 1 }}
      >
        {saving ? "Saving…" : "Save correction"}
      </button>
      <button onClick={onClose} style={sheetCancel}>Cancel</button>
    </Sheet>
  );
}

// Shared sheet chrome — the entry editor uses the same pieces.
export const sheetInput: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", minHeight: hit.stepper, background: color.bg,
  border: `1px solid ${color.hairline}`, borderRadius: 13, padding: "10px 13px",
  // iOS zooms focused controls below 16px and leaves the whole webview panned afterward.
  color: color.ink, fontFamily: text.rowTitle.fontFamily, fontSize: 16,
};
export const sheetPrimary: React.CSSProperties = {
  minHeight: hit.stepper, borderRadius: 14, border: "none", background: accentGradient,
  color: color.onAccent, fontFamily: text.button.fontFamily, fontSize: 16, fontWeight: 600, cursor: "pointer",
};
export const sheetCancel: React.CSSProperties = {
  minHeight: hit.min, background: "transparent", border: "none", color: color.faint,
  fontFamily: text.rowTitle.fontFamily, fontSize: 14, cursor: "pointer",
};

/** Bottom sheet — the same shape the squawk composer uses. */
export function Sheet({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box",
          background: color.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          border: `1px solid ${color.hairline}`, padding: "14px 16px calc(16px + env(safe-area-inset-bottom))",
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ ...text.rowTitle, color: color.ink }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

/**
 * One meter: label + previous value, a stepper row, and the live delta.
 *
 * Step is 0.1 per tap and accelerates on hold — the readings move in tenths and
 * nobody wants forty taps to add four hours.
 */
function Meter({
  label, value, was, onChange, deltaTone, included, onToggle, canOmit,
}: {
  label: string; value: number | null; was: number | null;
  onChange: (v: number) => void; deltaTone: string;
  included: boolean;
  onToggle: () => void;
  /** The other meter is being recorded, so this one may be left out. */
  canOmit: boolean;
}) {
  const delta = was != null && value != null ? Math.round((value - was) * 10) / 10 : null;
  const backwards = delta != null && delta < 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: text.meta.fontFamily, fontSize: 11, fontWeight: 600, letterSpacing: "0.09em", color: color.faint }}>
          {label}
        </span>
        <span style={{ ...text.meta, color: color.faint, marginLeft: "auto" }}>
          {was != null ? `was ${was.toFixed(1)}` : "no previous reading"}
        </span>
        {/* Only one meter is mandatory. Omitting is better than saving a number
            you didn't read — that would assert this meter still shows its old
            value today. Can't omit both. */}
        {(included ? canOmit : true) && (
          <button
            onClick={onToggle}
            style={{
              background: "transparent", border: "none", padding: "4px 0 4px 10px",
              color: included ? color.faint : color.accent,
              fontFamily: text.meta.fontFamily, fontSize: 11.5, fontWeight: 600,
              cursor: "pointer", minHeight: 32,
            }}
          >
            {included ? "Not this time" : "Record this"}
          </button>
        )}
      </div>

      <div style={{ opacity: included ? 1 : 0.35, pointerEvents: included ? "auto" : "none" }}>
        <Stepper label={label} value={value} fallback={was} onChange={onChange} />
      </div>

      {!included && (
        <span style={{ ...text.meta, color: color.faint }}>Not recorded this time.</span>
      )}
      {included && delta != null && delta !== 0 && (
        <span style={{ ...text.meta, fontSize: 12, fontWeight: 500, color: backwards ? color.warning : deltaTone }}>
          {delta > 0 ? `+${delta.toFixed(1)} hours this flight` : `${delta.toFixed(1)} hours`}
        </span>
      )}
      {/* A lower value isn't an error — meters get replaced. Say so, keep save enabled. */}
      {included && backwards && was != null && (
        <span style={{ ...text.meta, color: color.warning, lineHeight: 1.45 }}>
          Lower than the last reading ({was.toFixed(1)}). Meter replaced or rolled over?
        </span>
      )}
    </div>
  );
}

/**
 * The −/value/+ row on its own, shared with the reading and entry editors.
 *
 * Step is 0.1 per tap and accelerates on hold — the readings move in tenths and
 * nobody wants forty taps to add four hours. `fallback` is where stepping starts
 * when there is no value yet; `onClear` (optional) offers "leave blank".
 */
export function Stepper({
  label, value, fallback = null, onChange, onClear,
}: {
  label: string; value: number | null; fallback?: number | null;
  onChange: (v: number) => void; onClear?: () => void;
}) {
  const hold = useRef<ReturnType<typeof setInterval> | null>(null);
  const speed = useRef(0);
  // The interval closes over its own running value: reading `value` inside it
  // would capture the first render's number and step from there forever.
  const live = useRef(value ?? fallback ?? 0);
  live.current = value ?? fallback ?? 0;

  function step(dir: 1 | -1, by: number) {
    const next = Math.max(0, Math.round((live.current + dir * by) * 10) / 10);
    live.current = next;
    onChange(next);
  }

  function start(dir: 1 | -1) {
    step(dir, 0.1);
    speed.current = 0;
    hold.current = setInterval(() => {
      speed.current += 1;
      // Accelerate: tenths, then whole hours once you've clearly committed.
      step(dir, speed.current > 18 ? 1 : 0.1);
    }, 90);
  }
  function stop() {
    if (hold.current) clearInterval(hold.current);
    hold.current = null;
  }
  useEffect(() => stop, []);

  const btn: React.CSSProperties = {
    width: hit.stepper, height: hit.stepper, flex: "0 0 auto",
    background: color.surfaceRaised, border: `1px solid ${color.hairline}`,
    borderRadius: 13, color: color.dim, fontSize: 20, cursor: "pointer",
    display: "grid", placeItems: "center",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {onClear && (
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ fontFamily: text.meta.fontFamily, fontSize: 11, fontWeight: 600, letterSpacing: "0.09em", color: color.faint }}>{label}</span>
          {value != null && (
            <button onClick={onClear} style={{ marginLeft: "auto", background: "transparent", border: "none", padding: "4px 0 4px 10px", color: color.accent, fontFamily: text.meta.fontFamily, fontSize: 11.5, fontWeight: 600, cursor: "pointer", minHeight: 32 }}>
              Leave blank
            </button>
          )}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button aria-label={`${label} down`} style={btn}
          onPointerDown={() => start(-1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>−</button>
        <input
          value={value == null ? "" : value.toFixed(1)}
          placeholder={onClear ? "not recorded" : undefined}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          inputMode="decimal"
          aria-label={label}
          style={{
            flex: 1, minWidth: 0, height: hit.stepper, textAlign: "center",
            background: color.bg, border: `1px solid ${color.hairline}`, borderRadius: 13,
            color: color.ink, fontFamily: display, fontSize: 24, fontWeight: 700, ...tabular,
          }}
        />
        <button aria-label={`${label} up`} style={btn}
          onPointerDown={() => start(1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>+</button>
      </div>
    </div>
  );
}
