import { useEffect, useState } from "react";
import { computeAirworthiness, type Airworthiness, type StatusLine } from "./airworthiness";
import { canEdit } from "./actions";
import type { StatusItem } from "@/lib/status";
import { READING_SOURCE_LABEL } from "@/lib/hobbsTach";
import type { Aircraft } from "./types";
import {
  TopBar, Pill, URGENCY_COLOR, URGENCY_LABEL,
  dim, faint, ink, mono, panel, panel2, line, amber, accent,
} from "./ui";

// The screen you open standing at the aircraft: what's due, on what meter, and
// how long you've got — all from the on-device mirror, no signal needed.

export function Status({
  aircraft,
  onBack,
  onComplete,
}: {
  aircraft: Aircraft;
  onBack: () => void;
  onComplete: (item: StatusItem) => void;
}) {
  const [data, setData] = useState<Airworthiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = canEdit(aircraft.id);

  useEffect(() => {
    let live = true;
    computeAirworthiness(aircraft.id)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [aircraft.id]);

  return (
    <>
      <TopBar title={`${aircraft.tail_number} · status`} onBack={onBack} />
      {error && <p style={{ color: "#ff6b6b", fontSize: 13, marginTop: 14 }}>{error}</p>}
      {!data && !error && <p style={{ color: faint, fontSize: 13, marginTop: 14 }}>Working it out…</p>}
      {data && (
        <>
          <Meters data={data} />
          <div style={{ marginTop: 18, color: faint, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
            Airworthiness
          </div>
          {data.lines.length === 0 && (
            <p style={{ color: faint, fontSize: 13, marginTop: 10 }}>
              Nothing tracked yet — add maintenance items on the web app.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {data.lines.map((l) => (
              <Line
                key={`${l.item.source}:${l.item.id}`}
                line={l}
                onComplete={editable && l.item.source === "maintenance" ? () => onComplete(l.item) : undefined}
              />
            ))}
          </div>
          <p style={{ color: faint, fontSize: 11, marginTop: 16, lineHeight: 1.5 }}>
            Computed on device from your last sync. This mirrors your records — it is not a
            substitute for the aircraft logbooks, and the PIC remains responsible for
            airworthiness under 91.7.
          </p>
        </>
      )}
    </>
  );
}

/** Current hobbs/tach with where each came from — provenance, not just a number. */
function Meters({ data }: { data: Airworthiness }) {
  const { tach, hobbs } = data.meters;
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
      <MeterBox label="Tach" value={tach.tach} estimated={tach.estimated} rough={tach.rough} from={tach.from} date={tach.asOf} />
      <MeterBox label="Hobbs" value={hobbs.hobbs} estimated={hobbs.estimated} rough={hobbs.rough} from={hobbs.from} date={hobbs.asOf} />
    </div>
  );
}

function MeterBox({
  label, value, estimated, rough, from, date,
}: {
  label: string;
  value: number | null;
  estimated: boolean;
  rough: boolean;
  from: string | null;
  date: string | null;
}) {
  return (
    <div style={{ flex: 1, background: panel, border: `1px solid ${line}`, borderRadius: 12, padding: "11px 13px" }}>
      <div style={{ color: faint, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ ...mono, fontSize: 21, fontWeight: 700, marginTop: 3, color: value == null ? faint : ink }}>
        {value == null ? "—" : value.toFixed(1)}
      </div>
      {estimated && (
        <div style={{ color: amber, fontSize: 10, marginTop: 3 }}>
          estimated{rough ? " · rough" : ""}
        </div>
      )}
      <div style={{ color: faint, fontSize: 10, marginTop: 3, lineHeight: 1.4 }}>
        {from ? READING_SOURCE_LABEL[from as keyof typeof READING_SOURCE_LABEL] ?? from : "no reading"}
        {date ? ` · ${date}` : ""}
      </div>
    </div>
  );
}

function Line({ line: l, onComplete }: { line: StatusLine; onComplete?: () => void }) {
  const color = URGENCY_COLOR[l.urgency] ?? faint;
  const i = l.item;
  return (
    <div
      style={{
        background: panel2,
        border: `1px solid ${line}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: ink }}>{i.label}</div>
          <div style={{ ...mono, color: dim, fontSize: 11, marginTop: 3 }}>{l.due}</div>
        </div>
        <Pill tone={l.urgency}>{URGENCY_LABEL[l.urgency] ?? l.urgency}</Pill>
      </div>

      <div style={{ ...mono, color: faint, fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>
        {i.regulatory ? "REQUIRED" : "ADVISORY"}
        {i.intervalHours ? ` · every ${i.intervalHours} h on ${i.meter}` : ""}
        {i.intervalMonths ? ` · every ${i.intervalMonths} mo` : ""}
        {i.lastDoneDate ? ` · last ${i.lastDoneDate}` : ""}
      </div>

      {/* The countdown can't be trusted when last-done sits above every reading. */}
      {i.hoursUnreliable && (
        <div style={{ color: amber, fontSize: 11, marginTop: 6 }}>
          ⚠ Hours countdown unreliable — last-done is above the current reading. Check the
          last-done meter on the web app.
        </div>
      )}
      {i.currentEstimated && !i.hoursUnreliable && (
        <div style={{ color: faint, fontSize: 10.5, marginTop: 5 }}>
          counted against an estimated {i.meter}
        </div>
      )}
      {l.projection && !i.hoursUnreliable && (
        <div style={{ color: accent, fontSize: 10.5, marginTop: 5 }}>{l.projection}</div>
      )}
      {i.verifiedReport && (
        <div style={{ color: faint, fontSize: 10.5, marginTop: 5 }}>✓ corroborated by a scanned report</div>
      )}

      {onComplete && (
        <button
          onClick={onComplete}
          style={{
            marginTop: 9,
            background: "transparent",
            color: accent,
            border: `1px solid ${line}`,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Mark done{i.kind === "vor" ? " (91.171)" : ""}
        </button>
      )}
    </div>
  );
}
