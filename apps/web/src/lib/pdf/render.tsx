import path from "node:path";
import type * as ReactPdf from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { layoutMap } from "@/ui/map/map-layout";
import type { DossierModel, SummaryModel } from "@/lib/share/model";

// ===========================================================================
// Server-side PDF of the maintenance summary (W-SHARE-04) and the pre-buy dossier (W-SHARE-03), light paper only.
// Rendered in-process by @react-pdf/renderer: no headless browser, so it runs on App Hosting's Cloud Run image as is.
// It draws the same view models as the screens (lib/share/model.ts) and the map from the same pure layout
// (ui/map/map-layout.ts) the RouteMap uses, with the print rules of 10-line-map.md §13: no window, no today, 4 pt
// lines, 9 pt labels, a footnote number on every gap and major stop resolving to a page citation.
// react-pdf is ESM-only and imported on first use, so this module also loads under tsx's CommonJS test runner.
// ===========================================================================

type RP = typeof ReactPdf;
let P: RP;
let fontsReady = false;

const C = {
  ink: "#15171b", ink2: "#454a52", ink3: "#636973", rule: "#d9dad5", leaf2: "#f4f4f1", alarm: "#c42e15",
  line: { airframe: "#23318f", engine: "#a8326b", prop: "#4a4f57", avionics: "#0f7fa6", other: "#8a8f97" } as Record<string, string>,
};
const W = 532; // US Letter content width at 40 pt margins

async function lib(): Promise<RP> {
  if (!P) P = await import("@react-pdf/renderer");
  if (!fontsReady) {
    const dir = path.join(process.cwd(), "src/lib/pdf/fonts");
    P.Font.register({ family: "Franklin", fonts: [{ src: path.join(dir, "LibreFranklin-400.ttf") }, { src: path.join(dir, "LibreFranklin-600.ttf"), fontWeight: 600 }] });
    P.Font.register({ family: "Literata", src: path.join(dir, "Literata-400.ttf") });
    P.Font.register({ family: "Mono", src: path.join(dir, "JetBrainsMono-400.ttf") });
    P.Font.registerHyphenationCallback((w) => [w]);
    fontsReady = true;
  }
  return P;
}

const s = {
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40, fontFamily: "Franklin", fontSize: 9, color: C.ink, lineHeight: 1.35 },
  // Line heights in points: react-pdf resolves the page's unitless one against the page font size.
  h1: { fontSize: 20, fontWeight: 600, lineHeight: "24pt" },
  h2: { fontSize: 11, fontWeight: 600, lineHeight: "15pt", marginTop: 14, marginBottom: 5, paddingBottom: 2, borderBottomWidth: 0.75, borderBottomColor: C.rule },
  lead: { fontSize: 10.5, lineHeight: "14pt" },
  dim: { color: C.ink2 },
  faint: { color: C.ink3, fontSize: 8 },
  paper: { fontFamily: "Literata", fontSize: 8.5, color: C.ink2 },
  mono: { fontFamily: "Mono", fontSize: 8 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.ink3 },
} as const;

function Footer({ left }: { left: string }) {
  return (
    <P.View style={s.footer} fixed>
      <P.Text>{left}</P.Text>
      <P.Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </P.View>
  );
}

/** A table: column widths as fractions, header row, body rows; rows never split across pages. */
function Table({ cols, head, rows, mono = [] }: { cols: number[]; head: string[]; rows: (string | null)[][]; mono?: number[] }) {
  const cell = (i: number) => ({ width: `${cols[i] * 100}%`, paddingRight: 6, paddingVertical: 2 });
  return (
    <P.View>
      <P.View style={{ flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: C.ink3 }}>
        {head.map((h, i) => <P.Text key={i} style={[cell(i), { fontWeight: 600, fontSize: 8, color: C.ink2 }]}>{h}</P.Text>)}
      </P.View>
      {rows.map((r, j) => (
        <P.View key={j} wrap={false} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.rule }}>
          {r.map((v, i) => <P.Text key={i} style={[cell(i), mono.includes(i) ? s.mono : {}]}>{v ?? "—"}</P.Text>)}
        </P.View>
      ))}
    </P.View>
  );
}

function Section({ title, children, empty }: { title: string; children?: ReactNode; empty?: string | false }) {
  return (
    <P.View>
      <P.Text style={s.h2} minPresenceAhead={40}>{title}</P.Text>
      {empty ? <P.Text style={s.dim}>{empty}</P.Text> : children}
    </P.View>
  );
}

// --- Summary -------------------------------------------------------------------------

function SummaryDoc({ m }: { m: SummaryModel }) {
  return (
    <P.Document title={m.title} author="MyTailLog" creator="MyTailLog" producer="MyTailLog">
      <P.Page size="LETTER" style={s.page}>
        <P.Text style={s.h1}>{m.title}</P.Text>
        <P.Text style={[s.faint, { marginTop: 2 }]}>Generated {m.generatedOn}</P.Text>
        <P.Text style={[s.dim, { marginTop: 6 }]}>{m.identity}</P.Text>
        <P.Text style={[s.lead, { marginTop: 6, fontWeight: 600 }]}>{m.verdict}</P.Text>
        <Section title={`Inspections, items and recurring ADs (${m.items.length})`} empty={!m.items.length && "Nothing is tracked yet."}>
          <Table cols={[0.3, 0.17, 0.2, 0.14, 0.1, 0.09]} head={["Item", "Last done", "Next due", "Left", "Status", "Page"]} mono={[5]}
            rows={m.items.map((i) => [i.label, i.lastDone, i.nextDue, i.left, i.status, i.page])} />
        </Section>
        {m.squawksShown && <Section title={`Open squawks (${m.squawks.length})`} empty={!m.squawks.length && "No open squawks."}>
          <Table cols={[0.16, 0.12, m.squawks.some((q) => q.reporter) ? 0.52 : 0.72, ...(m.squawks.some((q) => q.reporter) ? [0.2] : [])]}
            head={["Reported", "Severity", "Discrepancy", ...(m.squawks.some((q) => q.reporter) ? ["Reported by"] : [])]}
            rows={m.squawks.map((q) => [q.reported, q.severity, q.description, ...(m.squawks.some((x) => x.reporter) ? [q.reporter] : [])])} />
        </Section>}
        <Section title={`ADs (${m.ads.length})`} empty={!m.ads.length && "No ADs recorded."}>
          <Table cols={[0.2, 0.4, 0.2, 0.12, 0.08]} head={["AD", "Subject", "Status", "Complied", "Page"]} mono={[4]}
            rows={m.ads.map((a) => [a.reference, a.title, a.status, a.complied, a.page])} />
        </Section>
        <Section title="Installed equipment" empty={!m.equipment.length && "No equipment recorded."}>
          <Table cols={[0.4, 0.2, 0.2, 0.2]} head={["Item", "Make", "Part number", "Serial"]}
            rows={m.equipment.map((e) => [e.name, e.make, e.partNumber, e.serial])} />
        </Section>
        <Section title="Weight and balance" empty={!m.wb && "No weight and balance on file."}>
          {m.wb && (
            <P.Text>
              Revised {m.wb.revised}. Empty weight {m.wb.emptyWeight ?? "—"} lb, arm {m.wb.arm ?? "—"} in, maximum gross {m.wb.maxGross ?? "—"} lb, useful load {m.wb.usefulLoad ?? "—"} lb.
              {m.wb.mayBeStale ? " May be stale: equipment was installed after this revision." : ""}
            </P.Text>
          )}
        </Section>
        <P.Text style={[s.faint, { marginTop: 10 }]}>Page column: AF Airframe, EN Engine, PR Propeller, AV Avionics logbook page; Docs a document.</P.Text>
        <P.Text style={[s.faint, { marginTop: 4 }]}>{m.footer}</P.Text>
        <Footer left={`${m.title} · ${m.generatedOn}`} />
      </P.Page>
    </P.Document>
  );
}

// --- Dossier map (10 §13) ------------------------------------------------------------

function LifeMap({ m }: { m: DossierModel }) {
  // Lay out as if rendered 13/9 wider so labels come out at 9 pt when drawn at the page width.
  const L = layoutMap(m.map, { size: "routemap", renderedWidth: (W * 13) / 9 });
  const k = W / L.width;
  const u = (pt: number) => pt / k; // printed points → viewBox units
  const book = new Map(m.map.lines.map((l) => [l.lineId, l.logbook]));
  const color = (lineId: string) => C.line[book.get(lineId) ?? "other"] ?? C.ink;
  const gapMarks = [...new Set(L.segments.filter((g) => g.gapId).map((g) => g.gapId!))].map((id) => {
    const ps = L.segments.filter((g) => g.gapId === id);
    return { n: m.marks[`gap:${id}`], x: (ps[0].x1 + ps[ps.length - 1].x2) / 2, y: ps[0].y1 };
  });
  const stopMarks = L.stops.flatMap((st) => {
    const n = st.ids.map((id) => m.marks[`stop:${id}`]).filter(Boolean);
    return n.length ? [{ n: n.join(","), x: st.x, y: st.y, r: st.r }] : [];
  });
  return (
    <P.Svg width={W} height={L.height * k} viewBox={`0 0 ${L.width} ${L.height}`}>
      {L.lanes.map((l) => (
        <P.Text key={l.lineId} x={l.nameX} y={l.nameY} fill={color(l.lineId)} style={{ fontSize: L.fontSize, fontFamily: "Franklin", fontWeight: 600 }}>{l.name}</P.Text>
      ))}
      {L.segments.filter((g) => g.kind !== "future").map((g, i) => (
        <P.Line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={color(g.lineId)}
          strokeWidth={g.kind === "solid" ? u(4) : u(1.5)} strokeDasharray={g.kind === "solid" ? undefined : `${u(3)} ${u(3)}`}
          strokeLinecap={g.kind === "solid" ? "round" : "butt"} />
      ))}
      {L.scaleBreak && <P.Line x1={L.scaleBreak.x1} y1={L.scaleBreak.y1} x2={L.scaleBreak.x2} y2={L.scaleBreak.y2} stroke={C.rule} strokeWidth={u(0.75)} strokeDasharray={`${u(2)} ${u(3)}`} />}
      {L.interchanges.map((x) => (
        <P.G key={x.id}>
          <P.Rect x={x.x} y={x.y} width={x.w} height={x.h} rx={u(6)} fill="#ffffff" stroke={C.ink} strokeWidth={u(1.25)} />
          {x.dots.map((d, i) => <P.Circle key={i} cx={d.x} cy={d.y} r={u(1.8)} fill={C.ink} />)}
        </P.G>
      ))}
      {L.stops.map((st) => (
        <P.Circle key={st.id} cx={st.x} cy={st.y} r={st.r} fill="#ffffff" stroke={C.ink} strokeWidth={u(1.25)} />
      ))}
      {[...gapMarks, ...stopMarks].filter((x) => x.n).map((x, i) => (
        <P.Text key={`n${i}`} x={x.x} y={x.y - ("r" in x ? (x.r as number) : 0) - u(4)} textAnchor="middle" fill={C.ink}
          style={{ fontSize: L.fontSize, fontFamily: "Franklin", fontWeight: 600 }}>{String(x.n)}</P.Text>
      ))}
      {L.ticks.filter((t) => t.label !== "Today").map((t) => (
        <P.Text key={`${t.x}-${t.label}`} x={t.x} y={t.y} textAnchor={t.anchor} fill={C.ink3} style={{ fontSize: L.fontSize * 0.9, fontFamily: "Franklin" }}>{t.label}</P.Text>
      ))}
    </P.Svg>
  );
}

function DossierDoc({ m }: { m: DossierModel }) {
  const serials = [
    m.serials.airframe ? `Airframe S/N ${m.serials.airframe}` : null,
    ...m.serials.engines.map((x, i) => `Engine${m.serials.engines.length > 1 ? ` ${i + 1}` : ""} S/N ${x}`),
    ...m.serials.props.map((x, i) => `Propeller${m.serials.props.length > 1 ? ` ${i + 1}` : ""} S/N ${x}`),
  ].filter(Boolean).join(" · ");
  return (
    <P.Document title={`${m.tail} pre-buy dossier`} author="MyTailLog" creator="MyTailLog" producer="MyTailLog">
      <P.Page size="LETTER" style={s.page}>
        <P.Text style={s.h1}>{m.tail}</P.Text>
        <P.Text style={[s.dim, s.lead]}>{m.type || "Aircraft"}</P.Text>
        {serials ? <P.Text style={[s.dim, { marginTop: 2 }]}>{serials}</P.Text> : null}
        <P.Text style={[s.dim, { marginTop: 2 }]}>{m.prepared}. Meters: {m.meters}.</P.Text>
        {m.empty ? (
          <P.Text style={[s.lead, { marginTop: 24 }]}>The dossier needs confirmed entries. Review pages first.</P.Text>
        ) : (
          <>
            <P.Text style={s.h2}>The aircraft&apos;s life, from its logbooks</P.Text>
            <LifeMap m={m} />
            <P.Text style={[s.faint, { marginTop: 4 }]}>
              Solid line: pages in the index. Dashed: no pages. Circle: a date with confirmed entries; box: one visit signed in several books. Numbers refer to the notes below. As of {m.asOf}.
            </P.Text>
            <P.View style={{ marginTop: 8 }}>
              {m.footnotes.map((f) => (
                <P.View key={f.n} wrap={false} style={{ flexDirection: "row", marginBottom: 3 }}>
                  <P.Text style={{ width: 16, fontWeight: 600 }}>{f.n}</P.Text>
                  <P.View style={{ flex: 1 }}>
                    <P.Text>{f.text}</P.Text>
                    {f.quote ? <P.Text style={s.paper}>&ldquo;{f.quote}&rdquo;</P.Text> : null}
                  </P.View>
                </P.View>
              ))}
            </P.View>
          </>
        )}
        <Footer left={m.footer} />
      </P.Page>
      {!m.empty && (
        <P.Page size="LETTER" style={s.page}>
          <P.Text style={[s.dim, { fontSize: 9.5 }]}>
            The paper logbooks are the legal record (14 CFR 91.417). This dossier indexes them and lists what they show; it does not establish airworthiness or completeness.
          </P.Text>
          <Section title="Items to investigate" empty={!m.investigate.length && "No issue was flagged by the confirmed records. This does not establish completeness."}>
            {m.investigate.map((x, i) => (
              <P.View key={i} wrap={false} style={{ flexDirection: "row", marginBottom: 2 }}>
                <P.Text style={{ width: 16 }}>{i + 1}.</P.Text>
                <P.Text style={{ flex: 1 }}>{x.text}{x.notes.filter(Boolean).length ? ` See note ${x.notes.filter(Boolean).join(", ")}.` : ""}</P.Text>
              </P.View>
            ))}
          </Section>
          <Section title="What is due" empty={!m.due.length && "Nothing is tracked yet."}>
            <Table cols={[0.3, 0.17, 0.2, 0.14, 0.1, 0.09]} head={["Item", "Last done", "Next due", "Left", "Status", "Page"]} mono={[5]}
              rows={m.due.map((i) => [i.label, i.lastDone, i.nextDue, i.left, i.status, i.page])} />
          </Section>
          <Section title="Records coverage">
            <Table cols={[0.4, 0.15, 0.15, 0.3]} head={["Logbook", "Pages", "Entries", "Span"]}
              rows={m.coverage.map((c) => [c.logbook, String(c.pages), String(c.entries), c.span])} />
            {m.unconfirmedPages > 0 && <P.Text style={[s.faint, { marginTop: 3 }]}>{m.unconfirmedPages} pages scanned but not yet confirmed are not included.</P.Text>}
          </Section>
          <Section title="Engine">
            <P.Text>Last overhaul: {m.engine.lastOverhaul ?? "none in the confirmed entries"}.{m.engine.since ? ` ${m.engine.since}.` : ""}</P.Text>
            {m.engine.tbo ? <P.Text>Overhaul interval: {m.engine.tbo}.</P.Text> : null}
            {m.engine.oil ? <P.Text>Oil changes: {m.engine.oil}.</P.Text> : null}
          </Section>
          <Section title="Propeller">
            <P.Text>Last overhaul: {m.prop.lastOverhaul ?? "none in the confirmed entries"}.{m.prop.since ? ` ${m.prop.since}.` : ""}</P.Text>
            {m.prop.tbo ? <P.Text>Overhaul interval: {m.prop.tbo}.</P.Text> : null}
          </Section>
          <Section title="Airworthiness directives" empty={!m.ads.length && "No ADs recorded."}>
            <Table cols={[0.2, 0.4, 0.2, 0.12, 0.08]} head={["AD", "Subject", "Status", "Complied", "Page"]} mono={[4]}
              rows={m.ads.map((a) => [a.reference, a.title, a.status, a.complied, a.page])} />
          </Section>
          <Section title="Major alterations and equipment" empty={!m.alterations.length && !m.equipment.length && "None recorded."}>
            {m.alterations.length > 0 && (
              <Table cols={[0.16, 0.74, 0.1]} head={["Date", "Alteration", "Page"]} mono={[2]} rows={m.alterations.map((a) => [a.date, a.text, a.page])} />
            )}
            {m.equipment.length > 0 && (
              <P.View style={{ marginTop: 6 }}>
                <Table cols={[0.4, 0.2, 0.2, 0.2]} head={["Installed equipment", "Make", "Part number", "Serial"]} rows={m.equipment.map((e) => [e.name, e.make, e.partNumber, e.serial])} />
              </P.View>
            )}
          </Section>
          <Section title="What this does not cover">
            {m.notCovered.map((t, i) => <P.Text key={i}>• {t}</P.Text>)}
          </Section>
          <Footer left={m.footer} />
        </P.Page>
      )}
    </P.Document>
  );
}

export async function summaryPdf(m: SummaryModel): Promise<Buffer> {
  const rp = await lib();
  return rp.renderToBuffer(<SummaryDoc m={m} />);
}

export async function dossierPdf(m: DossierModel): Promise<Buffer> {
  const rp = await lib();
  return rp.renderToBuffer(<DossierDoc m={m} />);
}

/** A PDF response: inline, never cached (a revoked room's next request must fail). */
export function pdfResponse(buf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "cache-control": "private, no-store",
    },
  });
}
