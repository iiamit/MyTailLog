import { useEffect, useMemo, useState } from "react";
import { getByAircraft } from "./db";
import { oilConsumption, type OilAdditionInput } from "@/lib/oilConsumption";
import { KEY_METALS, elementLabel } from "@/lib/oilElements";
import { shortDate } from "./airworthiness";
import type { Aircraft } from "./types";
import { color, text, radius, tabular, display, tint } from "./tokens";

// Oil, the two ways it tells you something: how fast the engine drinks it
// (hours per quart, from the top-off log) and what is in it when it comes out
// (spectrographic wear metals, from the lab report).
//
// Read-only. The arithmetic is @/lib/oilConsumption, the SAME function the web
// app runs, because a phone and a browser disagreeing about a burn rate on an
// engine is exactly the kind of thing that makes someone pull a good cylinder.

type Addition = OilAdditionInput & { id: string };

type Sample = {
  id: string;
  sample_date: string;
  lab: string | null;
  oil_hours: number | null;
  engine_hours: number | null;
  elements_ppm: Record<string, number> | null;
  universal_averages: Record<string, number> | null;
  lab_comments: string | null;
  excluded_from_averages: boolean;
};

export function OilRecords({ aircraft }: { aircraft: Aircraft }) {
  const [additions, setAdditions] = useState<Addition[] | null>(null);
  const [samples, setSamples] = useState<Sample[] | null>(null);

  useEffect(() => {
    let live = true;
    getByAircraft<Addition>("oil_addition", aircraft.id).then((r) => live && setAdditions(r));
    getByAircraft<Sample>("oil_analysis_sample", aircraft.id).then((r) => {
      if (live) setSamples([...r].sort((a, b) => b.sample_date.localeCompare(a.sample_date)));
    });
    return () => { live = false; };
  }, [aircraft.id]);

  // ponytail: no tach↔hobbs bridge on the phone — oilConsumption then measures
  // on whichever meter has two usable readings and says which. Pass the bridge
  // once the mirror carries one.
  const burn = useMemo(() => oilConsumption(additions ?? [], null), [additions]);

  if (!additions || !samples) return <p style={{ ...text.secondary, color: color.faint }}>Loading…</p>;

  return (
    <>
      <div style={{ ...text.sectionLabel, color: color.faint, marginBottom: 10 }}>How much it drinks</div>

      {burn.avgHoursPerQuart == null ? (
        <p style={{ ...text.secondary, color: color.faint, lineHeight: 1.5 }}>
          {additions.length === 0
            ? "No oil added yet. Log a top-off with the tach reading and the burn rate builds itself."
            : "Not enough top-offs with a meter reading yet — two carrying the same meter is the minimum."}
        </p>
      ) : (
        <>
          <div style={{ background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: "15px 16px" }}>
            <div style={{ ...text.meta, color: color.faint }}>Average</div>
            <div style={{ fontFamily: display, fontSize: 28, fontWeight: 700, color: color.ink, ...tabular, marginTop: 2 }}>
              {burn.avgHoursPerQuart.toFixed(1)}
              <span style={{ ...text.meta, color: color.faint, fontWeight: 400 }}> hours per quart</span>
            </div>
            <div style={{ ...text.meta, color: color.faint, marginTop: 6, lineHeight: 1.45 }}>
              Measured on the {burn.meter}. Higher is healthier.
              {burn.excluded > 0
                ? ` ${burn.excluded} top-off${burn.excluded === 1 ? "" : "s"} left out — no ${burn.meter} reading on ${burn.excluded === 1 ? "it" : "them"}.`
                : ""}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {[...burn.points].reverse().slice(0, 12).map((p, i) => (
              <div
                key={`${p.date}-${i}`}
                style={{
                  display: "flex", alignItems: "baseline", gap: 10,
                  background: color.surface, border: `1px solid ${color.hairline}`,
                  borderRadius: radius.row, padding: "11px 14px",
                }}
              >
                <span style={{ ...text.rowTitle, fontWeight: 500, color: color.ink, ...tabular }}>
                  {p.hoursPerQuart.toFixed(1)} h/qt
                </span>
                <span style={{ ...text.meta, color: color.faint, marginLeft: "auto", ...tabular }}>
                  {p.date ? shortDate(p.date) : "undated"} · {p.quarts} qt over {p.hours.toFixed(1)} h
                  {p.estimated ? " · estimated" : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ ...text.sectionLabel, color: color.faint, margin: "22px 0 10px" }}>What the lab found</div>
      {samples.length === 0 ? (
        <p style={{ ...text.secondary, color: color.faint, lineHeight: 1.5 }}>
          No oil analysis on file. Scan a lab report on the web app and the wear metals trend here.
        </p>
      ) : (
        <MetalsTable samples={samples} />
      )}
    </>
  );
}

/**
 * The last few samples side by side, key wear metals down the left.
 *
 * A table, not a chart: what an owner reads an oil report for is "is iron
 * climbing", and four numbers in a row answers that on a phone better than a
 * 300px line chart with axes nobody can label at that size.
 */
function MetalsTable({ samples }: { samples: Sample[] }) {
  const shown = samples.slice(0, 4); // newest first
  const latest = shown[0];
  const universal = latest?.universal_averages ?? null;

  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 300 }}>
          <thead>
            <tr>
              <th style={{ ...text.meta, color: color.faint, textAlign: "left", padding: "0 8px 8px 0", fontWeight: 600 }}>
                ppm
              </th>
              {shown.map((s) => (
                <th key={s.id} style={{ ...text.meta, color: color.faint, textAlign: "right", padding: "0 0 8px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {shortDate(s.sample_date)}
                </th>
              ))}
              {universal && (
                <th style={{ ...text.meta, color: color.faint, textAlign: "right", padding: "0 0 8px 8px", fontWeight: 600 }}>
                  fleet
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {KEY_METALS.map((metal) => {
              const value = latest?.elements_ppm?.[metal];
              const norm = universal?.[metal];
              // Colour is never the only signal — the fleet column is right there.
              const high = value != null && norm != null && value > norm * 1.5;
              return (
                <tr key={metal} style={{ borderTop: `1px solid ${color.hairline}` }}>
                  <td style={{ ...text.secondary, color: color.dim, padding: "9px 8px 9px 0" }}>
                    {elementLabel(metal)}
                  </td>
                  {shown.map((s, i) => (
                    <td
                      key={s.id}
                      style={{
                        ...text.secondary, ...tabular, textAlign: "right", padding: "9px 0 9px 8px",
                        color: i === 0 ? (high ? color.warning : color.ink) : color.faint,
                        fontWeight: i === 0 ? 600 : 400,
                      }}
                    >
                      {s.elements_ppm?.[metal] ?? "—"}
                    </td>
                  ))}
                  {universal && (
                    <td style={{ ...text.secondary, ...tabular, textAlign: "right", padding: "9px 0 9px 8px", color: color.faint }}>
                      {norm ?? "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {latest?.lab_comments && (
        <div
          style={{
            marginTop: 12, background: tint.accent, border: `1px solid ${tint.accentBorder}`,
            borderRadius: radius.card, padding: "13px 15px",
          }}
        >
          <div style={{ ...text.meta, color: color.faint }}>
            {latest.lab ?? "The lab"} · {shortDate(latest.sample_date)}
            {latest.oil_hours != null ? ` · ${latest.oil_hours} h on the oil` : ""}
          </div>
          <div style={{ ...text.secondary, color: color.ink, marginTop: 6, lineHeight: 1.5, textWrap: "pretty" }}>
            {latest.lab_comments}
          </div>
        </div>
      )}
    </>
  );
}
