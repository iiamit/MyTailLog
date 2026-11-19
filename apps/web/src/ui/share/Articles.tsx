import type { DossierModel, SummaryModel } from "@/lib/share/model";
import { buttonClass } from "@/ui/Button";
import { StatusMark } from "@/ui/Marks";
import { StaticMap } from "@/ui/map/StaticMap";

// The printed documents as HTML (W-SHARE-03, W-SHARE-04): the record room's Summary tab and the Share previews.
// Same view models as the PDFs (lib/share/model.ts), so the screen and the paper say the same thing.

const th = "pb-1 pr-3 text-left font-semibold";

function DueTable({ rows }: { rows: SummaryModel["items"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="mt-2 w-full min-w-[560px] text-small">
        <thead className="text-caption text-ink-3"><tr><th className={th}>Item</th><th className={th}>Last done</th><th className={th}>Next due</th><th className={th}>Left</th><th className={th}>Status</th><th className={th}>Page</th></tr></thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.key} className="border-t border-rule align-top">
              <td className="py-1.5 pr-3 font-semibold">{i.label}</td><td className="py-1.5 pr-3">{i.lastDone}</td><td className="py-1.5 pr-3">{i.nextDue}</td>
              <td className="py-1.5 pr-3">{i.left}</td><td className="py-1.5 pr-3"><StatusMark kind={i.statusKey} compact /></td><td className="py-1.5 whitespace-nowrap">{i.page ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdList({ ads }: { ads: SummaryModel["ads"] }) {
  return ads.length ? (
    <ul className="mt-1 text-body">{ads.map((a) => <li key={a.reference} className="border-t border-rule py-1.5">{a.reference}{a.title ? ` · ${a.title}` : ""} · {a.status}{a.complied ? ` · ${a.complied}` : ""}{a.page ? ` · ${a.page}` : ""}</li>)}</ul>
  ) : <p className="mt-1 text-body text-ink-2">No ADs recorded.</p>;
}

/** W-SHARE-04's article; the room's Summary tab and the Share › Maintenance summary preview. */
export function SummaryArticle({ m, pdf }: { m: SummaryModel; pdf?: string }) {
  return (
    <article className="max-w-[880px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-heading">{m.title}</h2>
        {pdf && <a className={buttonClass("secondary", "s")} href={pdf} target="_blank" rel="noopener noreferrer">Open as PDF</a>}
      </div>
      <p className="text-small text-ink-3">Generated {m.generatedOn}</p>
      <p className="mt-2 text-body text-ink-2">{m.identity}</p>
      <p className="mt-3 text-lede">{m.verdict}</p>
      <h3 className="mt-6 text-section">Inspections, items and recurring ADs ({m.items.length})</h3>
      <DueTable rows={m.items} />
      {m.squawksShown && (
        <>
          <h3 className="mt-6 text-section">Open squawks ({m.squawks.length})</h3>
          {m.squawks.length ? (
            <ul className="mt-1 text-body">{m.squawks.map((q, i) => <li key={i} className="border-t border-rule py-1.5">{q.reported} · {q.severity} · {q.description}{q.reporter ? ` · ${q.reporter}` : ""}</li>)}</ul>
          ) : <p className="mt-1 text-body text-ink-2">No open squawks.</p>}
        </>
      )}
      <h3 className="mt-6 text-section">ADs ({m.ads.length})</h3>
      <AdList ads={m.ads} />
      {m.equipment.length > 0 && (
        <>
          <h3 className="mt-6 text-section">Installed equipment</h3>
          <ul className="mt-1 text-body">{m.equipment.map((e, i) => <li key={i} className="border-t border-rule py-1.5">{[e.name, e.make, e.partNumber, e.serial && `S/N ${e.serial}`].filter(Boolean).join(" · ")}</li>)}</ul>
        </>
      )}
      {m.wb && (
        <>
          <h3 className="mt-6 text-section">Weight and balance</h3>
          <p className="mt-1 text-body">
            Revised {m.wb.revised}. Empty weight {m.wb.emptyWeight ?? "—"} lb, arm {m.wb.arm ?? "—"} in, useful load {m.wb.usefulLoad ?? "—"} lb.{m.wb.mayBeStale ? " May be stale." : ""}
          </p>
        </>
      )}
      <p className="mt-6 text-small text-ink-3">Page column: AF Airframe, EN Engine, PR Propeller, AV Avionics logbook page; Docs a document.</p>
      <p className="mt-1 text-small text-ink-3">{m.footer}</p>
    </article>
  );
}

/** W-SHARE-03's pages as one article: the life map and its notes first, then what to investigate and the tables. */
export function DossierArticle({ m }: { m: DossierModel }) {
  const serials = [
    m.serials.airframe ? `Airframe S/N ${m.serials.airframe}` : null,
    ...m.serials.engines.map((x) => `Engine S/N ${x}`),
    ...m.serials.props.map((x) => `Propeller S/N ${x}`),
  ].filter(Boolean).join(" · ");
  return (
    <article className="max-w-[880px]">
      <h2 className="text-board-title">{m.tail}</h2>
      <p className="text-lede text-ink-2">{m.type || "Aircraft"}</p>
      {serials && <p className="mt-1 text-small text-ink-2">{serials}</p>}
      <p className="text-small text-ink-2">{m.prepared}. Meters: {m.meters}.</p>
      {m.empty ? (
        <p className="mt-6 text-lede">The dossier needs confirmed entries. Review pages first.</p>
      ) : (
        <>
          <h3 className="mt-6 border-b border-rule pb-1 text-section">The aircraft&apos;s life, from its logbooks</h3>
          <div className="mt-3"><StaticMap model={m.map} label={`The life of ${m.tail} from its confirmed logbook entries`} /></div>
          <p className="mt-2 text-small text-ink-3">Solid line: pages in the index. Dashed: no pages. A box is one visit signed in several books. The printed copy numbers each gap and major stop. As of {m.asOf}.</p>
          <ol className="mt-3 space-y-2">
            {m.footnotes.map((f) => (
              <li key={f.n} className="grid grid-cols-[1.75rem_1fr] text-small">
                <span className="font-bold">{f.n}</span>
                <span>{f.text}{f.quote && <span className="mt-0.5 block text-paper-small text-ink-2">&ldquo;{f.quote}&rdquo;</span>}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-body text-ink-2">The paper logbooks are the legal record (14 CFR 91.417). This dossier indexes them and lists what they show; it does not establish airworthiness or completeness.</p>
          <h3 className="mt-6 text-section">Items to investigate</h3>
          {m.investigate.length ? (
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-body">
              {m.investigate.map((x, i) => <li key={i}>{x.text}{x.notes.filter(Boolean).length ? ` See note ${x.notes.filter(Boolean).join(", ")}.` : ""}</li>)}
            </ol>
          ) : <p className="mt-1 text-body text-ink-2">No issue was flagged by the confirmed records. This does not establish completeness.</p>}
          <h3 className="mt-6 text-section">What is due</h3>
          <DueTable rows={m.due} />
          <h3 className="mt-6 text-section">Records coverage</h3>
          <table className="mt-2 w-full text-small">
            <thead className="text-caption text-ink-3"><tr><th className={th}>Logbook</th><th className={th}>Pages</th><th className={th}>Entries</th><th className={th}>Span</th></tr></thead>
            <tbody>{m.coverage.map((c) => <tr key={c.logbook} className="border-t border-rule"><td className="py-1.5 pr-3 font-semibold">{c.logbook}</td><td className="pr-3">{c.pages}</td><td className="pr-3">{c.entries}</td><td>{c.span}</td></tr>)}</tbody>
          </table>
          {m.unconfirmedPages > 0 && <p className="mt-1 text-small text-ink-3">{m.unconfirmedPages} pages scanned but not yet confirmed are not included.</p>}
          <h3 className="mt-6 text-section">Engine</h3>
          <p className="mt-1 text-body">Last overhaul: {m.engine.lastOverhaul ?? "none in the confirmed entries"}.{m.engine.since ? ` ${m.engine.since}.` : ""}</p>
          {m.engine.tbo && <p className="text-body">Overhaul interval: {m.engine.tbo}.</p>}
          {m.engine.oil && <p className="text-body">Oil changes: {m.engine.oil}.</p>}
          <h3 className="mt-6 text-section">Propeller</h3>
          <p className="mt-1 text-body">Last overhaul: {m.prop.lastOverhaul ?? "none in the confirmed entries"}.{m.prop.since ? ` ${m.prop.since}.` : ""}</p>
          <h3 className="mt-6 text-section">Airworthiness directives</h3>
          <AdList ads={m.ads} />
          <h3 className="mt-6 text-section">Major alterations and equipment</h3>
          {!m.alterations.length && !m.equipment.length && <p className="mt-1 text-body text-ink-2">None recorded.</p>}
          {m.alterations.length > 0 && <ul className="mt-1 text-body">{m.alterations.map((a, i) => <li key={i} className="border-t border-rule py-1.5">{a.date} · {a.text}{a.page ? ` · ${a.page}` : ""}</li>)}</ul>}
          {m.equipment.length > 0 && <ul className="mt-1 text-body">{m.equipment.map((e, i) => <li key={i} className="border-t border-rule py-1.5">{[e.name, e.make, e.partNumber, e.serial && `S/N ${e.serial}`].filter(Boolean).join(" · ")}</li>)}</ul>}
          <h3 className="mt-6 text-section">What this does not cover</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-body">{m.notCovered.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </>
      )}
      <p className="mt-6 text-small text-ink-3">{m.footer}</p>
    </article>
  );
}
