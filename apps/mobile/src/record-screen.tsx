import { useEffect, useState } from "react";
import { computeAirworthiness } from "./airworthiness";
import { queueAction, canEdit } from "./actions";
import type { Aircraft } from "./types";
import { TopBar, dim, faint, mono, panel, line, accent, amber, input, primary } from "./ui";

// Post-flight, standing at the aircraft, usually with no signal: type what the
// meters actually read, and log any oil you put in. Both queue offline.

const today = () => new Date().toISOString().slice(0, 10);

export function Record({
  aircraft,
  onBack,
  onQueued,
}: {
  aircraft: Aircraft;
  onBack: () => void;
  onQueued: () => void;
}) {
  const [current, setCurrent] = useState<{ tach: number | null; hobbs: number | null } | null>(null);
  const [tach, setTach] = useState("");
  const [hobbs, setHobbs] = useState("");
  const [date, setDate] = useState(today());
  const [quarts, setQuarts] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const editable = canEdit(aircraft.id);

  useEffect(() => {
    computeAirworthiness(aircraft.id)
      .then((d) => {
        setCurrent({ tach: d.meters.tach.tach, hobbs: d.meters.hobbs.hobbs });
        // Prefilled so you correct digits rather than typing a number from
        // scratch — and so a transposed reading is visible against the last one.
        if (d.meters.tach.tach != null) setTach(d.meters.tach.tach.toFixed(1));
        if (d.meters.hobbs.hobbs != null) setHobbs(d.meters.hobbs.hobbs.toFixed(1));
      })
      .catch(() => setCurrent({ tach: null, hobbs: null }));
  }, [aircraft.id]);

  const nTach = tach.trim() === "" ? null : Number(tach);
  const nHobbs = hobbs.trim() === "" ? null : Number(hobbs);
  const bad = (v: number | null) => v != null && (!Number.isFinite(v) || v < 0);

  // A reading BELOW the last one is either a meter replacement or a typo. Both
  // are worth stopping for: silently accepting it drags every hours countdown
  // backwards, and the owner won't see why.
  const backwards: string[] = [];
  if (current) {
    if (nTach != null && current.tach != null && nTach < current.tach) backwards.push("tach");
    if (nHobbs != null && current.hobbs != null && nHobbs < current.hobbs) backwards.push("hobbs");
  }

  const readingInvalid = (nTach == null && nHobbs == null) || bad(nTach) || bad(nHobbs);

  async function saveReading() {
    await queueAction({
      aircraftId: aircraft.id,
      type: "reading",
      label: [nTach != null ? `Tach ${nTach}` : null, nHobbs != null ? `Hobbs ${nHobbs}` : null]
        .filter(Boolean)
        .join(" · "),
      payload: { date, tach: nTach, hobbs: nHobbs },
    });
    setSaved("Reading queued.");
    onQueued();
  }

  async function saveOil() {
    const q = Number(quarts);
    if (!Number.isFinite(q) || q <= 0) return;
    await queueAction({
      aircraftId: aircraft.id,
      type: "oil",
      label: `Oil +${q} qt`,
      payload: { date, quarts: q, tach: nTach, hobbs: nHobbs },
    });
    setQuarts("");
    setSaved("Oil addition queued.");
    onQueued();
  }

  return (
    <>
      <TopBar title={`${aircraft.tail_number} · record`} onBack={onBack} />

      {!editable && (
        <p style={{ color: amber, fontSize: 13, marginTop: 14 }}>
          You have view-only access to this aircraft, so nothing here can be saved.
        </p>
      )}

      <Section label="Meter reading">
        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Tach" value={tach} onChange={setTach} was={current?.tach} />
          <Field label="Hobbs" value={hobbs} onChange={setHobbs} was={current?.hobbs} />
        </div>
        <label style={{ display: "block", marginTop: 10 }}>
          <span style={{ color: faint, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>Date</span>
          <input style={{ ...input, width: "100%", marginTop: 5 }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        {backwards.length > 0 && (
          <p style={{ color: amber, fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
            ⚠ That {backwards.join(" and ")} is <strong>lower</strong> than the last recorded
            reading. If the meter was replaced, record the replacement on the web app first —
            otherwise every hours countdown will read low.
          </p>
        )}

        <button
          onClick={saveReading}
          disabled={!editable || readingInvalid}
          style={{ ...primary, width: "100%", marginTop: 12, opacity: !editable || readingInvalid ? 0.4 : 1 }}
        >
          Queue reading
        </button>
      </Section>

      <Section label="Oil added">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <label style={{ flex: 1 }}>
            <span style={{ color: faint, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>Quarts</span>
            <input
              style={{ ...input, width: "100%", marginTop: 5 }}
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              placeholder="1"
              value={quarts}
              onChange={(e) => setQuarts(e.target.value)}
            />
          </label>
          <button
            onClick={saveOil}
            disabled={!editable || !(Number(quarts) > 0)}
            style={{ ...primary, flex: 1, opacity: !editable || !(Number(quarts) > 0) ? 0.4 : 1 }}
          >
            Queue oil
          </button>
        </div>
        <p style={{ color: faint, fontSize: 11, marginTop: 8 }}>
          Recorded against the meters above, so it lands on the consumption trend.
        </p>
      </Section>

      {saved && <p style={{ color: accent, fontSize: 13, marginTop: 14 }}>{saved} It uploads on the next sync.</p>}
    </>
  );
}

function Field({
  label, value, onChange, was,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  was: number | null | undefined;
}) {
  return (
    <label style={{ flex: 1 }}>
      <span style={{ color: faint, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      <input
        style={{ ...input, ...mono, width: "100%", marginTop: 5 }}
        type="number"
        inputMode="decimal"
        step="0.1"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span style={{ color: faint, fontSize: 10.5, display: "block", marginTop: 4 }}>
        {was == null ? "no reading yet" : `was ${was.toFixed(1)}`}
      </span>
    </label>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18, background: panel, border: `1px solid ${line}`, borderRadius: 12, padding: "13px 14px" }}>
      <div style={{ color: dim, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}
