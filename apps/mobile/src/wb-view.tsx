import { useEffect, useState } from "react";
import { getByAircraft } from "./db";
import { usefulLoad, staleWBChanges, type EquipChange } from "@/lib/weightBalance";
import { shortDate } from "./airworthiness";
import type { Aircraft } from "./types";
import { color, text, radius, tint, tabular, display } from "./tokens";

// Weight & balance, offline. The "W" of AROW: an inspector asks for the current
// weighing and you are standing on a taxiway with no signal.
//
// Read-only on the phone by design — a W&B revision comes off a signed sheet
// from the person who did the weighing, and typing one into a phone in a hangar
// is not how that record should be made. Editing stays on the web.

type WBRow = {
  id: string;
  revision_date: string;
  empty_weight: number | null;
  empty_weight_arm: number | null;
  empty_weight_moment: number | null;
  max_gross_weight: number | null;
  method: "weighed" | "computed" | null;
  reference: string | null;
  reason: string | null;
  notes: string | null;
};

type ComponentRow = {
  name: string;
  install_date: string | null;
  removal_date: string | null;
};

export function WeightBalance({ aircraft }: { aircraft: Aircraft }) {
  const [rows, setRows] = useState<WBRow[] | null>(null);
  const [changes, setChanges] = useState<EquipChange[]>([]);

  useEffect(() => {
    let live = true;
    getByAircraft<WBRow>("weight_balance", aircraft.id).then((r) => {
      if (live) setRows([...r].sort((a, b) => b.revision_date.localeCompare(a.revision_date)));
    });
    getByAircraft<ComponentRow>("component", aircraft.id).then((r) => {
      if (!live) return;
      const out: EquipChange[] = [];
      for (const c of r) {
        if (c.install_date) out.push({ name: c.name, date: c.install_date, kind: "install" });
        if (c.removal_date) out.push({ name: c.name, date: c.removal_date, kind: "removal" });
      }
      setChanges(out);
    });
    return () => { live = false; };
  }, [aircraft.id]);

  if (!rows) return <p style={{ ...text.secondary, color: color.faint }}>Loading…</p>;

  const current = rows[0] ?? null;
  const load = current ? usefulLoad(current.empty_weight, current.max_gross_weight) : null;
  // Equipment fitted or removed since the last weighing may not be in the
  // numbers above it — a records gap worth naming, not a calculation.
  const stale = staleWBChanges(current?.revision_date ?? null, changes);

  if (!current) {
    return (
      <p style={{ ...text.secondary, color: color.faint, lineHeight: 1.5 }}>
        No weight &amp; balance on file. Add the current weighing on the web app and it will be here next sync.
      </p>
    );
  }

  return (
    <>
      <div style={{ background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: "15px 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ ...text.cardTitle, color: color.ink }}>Current weighing</span>
          <span style={{ ...text.meta, color: color.faint, marginLeft: "auto" }}>
            {shortDate(current.revision_date)}
            {current.method ? ` · ${current.method === "weighed" ? "weighed" : "computed"}` : ""}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
          <Figure label="Empty weight" value={current.empty_weight} unit="lbs" />
          <Figure label="Useful load" value={load} unit="lbs" />
          <Figure label="CG arm" value={current.empty_weight_arm} unit="in" dp={2} />
          <Figure label="Max gross" value={current.max_gross_weight} unit="lbs" />
        </div>

        {current.empty_weight_moment != null && (
          <div style={{ ...text.meta, color: color.faint, marginTop: 12 }}>
            Moment {current.empty_weight_moment}
          </div>
        )}
        {current.reference && (
          <div style={{ ...text.meta, color: color.faint, marginTop: 4 }}>Ref {current.reference}</div>
        )}
        {current.reason && (
          <div style={{ ...text.secondary, color: color.dim, marginTop: 10, lineHeight: 1.45 }}>{current.reason}</div>
        )}
        {current.notes && (
          <div style={{ ...text.secondary, color: color.dim, marginTop: 6, lineHeight: 1.45 }}>{current.notes}</div>
        )}
      </div>

      {stale.length > 0 && (
        <div
          style={{
            marginTop: 12, background: tint.warning, border: `1px solid ${tint.warningBorder}`,
            borderRadius: radius.card, padding: "13px 15px",
          }}
        >
          <div style={{ ...text.cardTitle, color: color.warning }}>
            Equipment changed since this weighing
          </div>
          <div style={{ ...text.meta, color: color.dim, marginTop: 4, lineHeight: 1.45 }}>
            Their weight may not be in the figures above. Worth a fresh computation before you load to gross.
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {stale.slice(0, 8).map((c, i) => (
              <div key={`${c.name}-${c.date}-${i}`} style={{ ...text.secondary, color: color.ink }}>
                {c.kind === "install" ? "Fitted" : "Removed"} {c.name}
                <span style={{ ...text.meta, color: color.faint }}> · {shortDate(c.date)}</span>
              </div>
            ))}
            {stale.length > 8 && (
              <div style={{ ...text.meta, color: color.faint }}>…and {stale.length - 8} more</div>
            )}
          </div>
        </div>
      )}

      {rows.length > 1 && (
        <>
          <div style={{ ...text.sectionLabel, color: color.faint, margin: "20px 0 10px" }}>Earlier revisions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.slice(1).map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex", alignItems: "baseline", gap: 10,
                  background: color.surface, border: `1px solid ${color.hairline}`,
                  borderRadius: radius.row, padding: "12px 14px",
                }}
              >
                <span style={{ ...text.rowTitle, fontWeight: 500, color: color.ink }}>{shortDate(r.revision_date)}</span>
                <span style={{ ...text.meta, color: color.faint, marginLeft: "auto", ...tabular }}>
                  {r.empty_weight != null ? `${r.empty_weight} lbs` : "—"}
                  {r.empty_weight_arm != null ? ` · arm ${r.empty_weight_arm}` : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Figure({
  label, value, unit, dp = 1,
}: {
  label: string;
  value: number | null;
  unit: string;
  dp?: number;
}) {
  return (
    <div>
      <div style={{ ...text.meta, color: color.faint }}>{label}</div>
      <div style={{ fontFamily: display, fontSize: 21, fontWeight: 700, color: color.ink, ...tabular, marginTop: 2 }}>
        {value == null ? "—" : Number(value.toFixed(dp))}
        {value != null && <span style={{ ...text.meta, color: color.faint, fontWeight: 400 }}> {unit}</span>}
      </div>
    </div>
  );
}
