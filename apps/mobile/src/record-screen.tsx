import { useEffect, useRef, useState } from "react";
import { computeAirworthiness } from "./airworthiness";
import { queueAction, canEdit } from "./actions";
import type { Aircraft } from "./types";
import { color, text, radius, hit, accentGradient, tabular, display, tint } from "./tokens";

// Log a flight — tab 2.
//
// Recorded standing at the aircraft, often one-handed, outdoors, sometimes with
// oily hands. So: steppers rather than a keyboard, the delta shown live because
// that's the number an owner sanity-checks, and ONE button that commits both the
// meters and the oil. The old screen had two submits labelled "Queue reading"
// and "Queue oil" — an internal word for the offline queue, used as a verb.

const OIL_CHOICES = [
  { label: "None", quarts: 0 },
  { label: "1 qt", quarts: 1 },
  { label: "2 qt", quarts: 2 },
  { label: "3+", quarts: 3 },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

export function Record({ aircraft, onQueued }: { aircraft: Aircraft; onQueued: () => void }) {
  const [prev, setPrev] = useState<{ tach: number | null; hobbs: number | null } | null>(null);
  const [tach, setTach] = useState<number | null>(null);
  const [hobbs, setHobbs] = useState<number | null>(null);
  const [oil, setOil] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const editable = canEdit(aircraft.id);

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

  const nothingEntered = tach == null && hobbs == null;
  const unchanged =
    (tach == null || tach === prev?.tach) && (hobbs == null || hobbs === prev?.hobbs) && oil === 0;

  async function save() {
    if (!editable) return;
    const date = todayIso();
    if (tach != null || hobbs != null) {
      await queueAction({
        aircraftId: aircraft.id,
        type: "reading",
        label: [tach != null ? `Tach ${tach.toFixed(1)}` : null, hobbs != null ? `Hobbs ${hobbs.toFixed(1)}` : null].filter(Boolean).join(" · "),
        payload: { date, tach, hobbs },
      });
    }
    if (oil > 0) {
      await queueAction({
        aircraftId: aircraft.id,
        type: "oil",
        label: `Oil +${oil} qt`,
        payload: { date, quarts: oil, tach, hobbs },
      });
    }
    setOil(0);
    setSaved("Saved · will upload on next sync");
    onQueued();
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
        <Meter label="TACH" value={tach} was={prev?.tach ?? null} onChange={setTach} deltaTone={color.success} />
        <div style={{ height: 1, background: color.hairline }} />
        <Meter label="HOBBS" value={hobbs} was={prev?.hobbs ?? null} onChange={setHobbs} deltaTone={color.faint} />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.panel, padding: 16, marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ ...text.rowTitle, color: color.ink }}>Oil added</span>
          <span style={{ ...text.meta, color: color.faint, marginLeft: "auto" }}>optional</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {OIL_CHOICES.map((o) => {
            const on = oil === o.quarts;
            return (
              <button
                key={o.label}
                onClick={() => setOil(o.quarts)}
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
        </div>
        <span style={{ ...text.meta, color: color.faint }}>
          Tracked against these meters, so it shows up on your consumption trend.
        </span>
      </div>

      <button
        onClick={save}
        disabled={!editable || nothingEntered || unchanged}
        style={{
          width: "100%", marginTop: 16, minHeight: hit.primary, borderRadius: 15, border: "none",
          background: accentGradient, color: color.onAccent,
          fontFamily: text.button.fontFamily, fontSize: 16, fontWeight: 600,
          opacity: !editable || nothingEntered || unchanged ? 0.4 : 1,
          cursor: "pointer",
        }}
      >
        Save to logbook
      </button>
      <p style={{ ...text.meta, color: color.faint, textAlign: "center", marginTop: 8 }}>
        {saved ?? "Saved on your phone now · uploads on next sync"}
      </p>
    </>
  );
}

/**
 * One meter: label + previous value, a stepper row, and the live delta.
 *
 * Step is 0.1 per tap and accelerates on hold — the readings move in tenths and
 * nobody wants forty taps to add four hours.
 */
function Meter({
  label, value, was, onChange, deltaTone,
}: {
  label: string; value: number | null; was: number | null;
  onChange: (v: number) => void; deltaTone: string;
}) {
  const hold = useRef<ReturnType<typeof setInterval> | null>(null);
  const speed = useRef(0);
  // The interval closes over its own running value: reading `value` inside it
  // would capture the first render's number and step from there forever.
  const live = useRef(value ?? was ?? 0);
  live.current = value ?? was ?? 0;

  const delta = was != null && value != null ? Math.round((value - was) * 10) / 10 : null;
  const backwards = delta != null && delta < 0;

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
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: text.meta.fontFamily, fontSize: 11, fontWeight: 600, letterSpacing: "0.09em", color: color.faint }}>
          {label}
        </span>
        <span style={{ ...text.meta, color: color.faint, marginLeft: "auto" }}>
          {was != null ? `was ${was.toFixed(1)}` : "no previous reading"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button aria-label={`${label} down`} style={btn}
          onPointerDown={() => start(-1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>−</button>
        <input
          value={value == null ? "" : value.toFixed(1)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          inputMode="decimal"
          style={{
            flex: 1, minWidth: 0, height: hit.stepper, textAlign: "center",
            background: color.bg, border: `1px solid ${color.hairline}`, borderRadius: 13,
            color: color.ink, fontFamily: display, fontSize: 24, fontWeight: 700, ...tabular,
          }}
        />
        <button aria-label={`${label} up`} style={btn}
          onPointerDown={() => start(1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>+</button>
      </div>

      {delta != null && delta !== 0 && (
        <span style={{ ...text.meta, fontSize: 12, fontWeight: 500, color: backwards ? color.warning : deltaTone }}>
          {delta > 0 ? `+${delta.toFixed(1)} hours this flight` : `${delta.toFixed(1)} hours`}
        </span>
      )}
      {/* A lower value isn't an error — meters get replaced. Say so, keep save enabled. */}
      {backwards && was != null && (
        <span style={{ ...text.meta, color: color.warning, lineHeight: 1.45 }}>
          Lower than the last reading ({was.toFixed(1)}). Meter replaced or rolled over?
        </span>
      )}
    </div>
  );
}
