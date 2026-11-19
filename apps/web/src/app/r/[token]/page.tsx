import Link from "next/link";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import {
  logRoomView, openRoom, roomEntries, roomEntriesByIds, roomEntryCounts, roomRateLimited, visitorOf, ROOM_PAGE_SIZE, type Room,
} from "@/lib/recordRoom";
import { buildDossier, buildSummary, loadShareInput, roomMap, type ShareInput, type SummaryModel } from "@/lib/share/model";
import { BOOK_NAME } from "@/lib/mapModel";
import { fmtDate } from "@/lib/due/engine";
import { StaticMap } from "@/ui/map/StaticMap";
import { StatusMark } from "@/ui/Marks";
import { buttonClass } from "@/ui/Button";

export const metadata = { title: "Shared aircraft records — MyTailLog", robots: { index: false, follow: false } };

const LOGBOOK_LABEL: Record<string, string> = { airframe: "Airframe", engine: "Engine", prop: "Propeller", avionics: "Avionics", other: "Other" };
const BOUNDARY =
  "Only entries the owner has confirmed are shown. The paper logbooks are the legal record (14 CFR 91.417); check the originals before you rely on this index.";
type Tab = "map" | "summary" | "logbooks" | "documents";

/**
 * W-SHARE-02 Record room, recipient view: no account, read-only, only what the owner selected, light paper. Every read
 * goes through lib/recordRoom.ts (the service client bypasses RLS, so that module is the boundary). Unknown, revoked and
 * expired links get one identical answer. Never cached (next.config.mjs sends no-store and noindex for /r).
 */
export default async function RecordRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ tab?: string; q?: string; book?: string; stop?: string; p?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const visitor = visitorOf(await headers());
  if (roomRateLimited(visitor)) return <Inactive title="Too many requests" line="Wait a minute, then reload the page." />;
  const room = await openRoom(token);
  if (!room) return <Inactive />;

  const svc = createServiceClient();
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [{ data: aircraft }, { data: books }, { data: docs }] = await Promise.all([
    svc.from("aircraft").select("tail_number, year, make, model, serial_number, owner_id").eq("id", room.aircraft_id).single(),
    svc.from("logbook").select("id, type, title").eq("aircraft_id", room.aircraft_id).in("id", room.logbook_ids.length ? room.logbook_ids : none).order("created_at"),
    room.document_ids.length
      ? svc.from("document").select("id, type, title, file_name, document_date").eq("aircraft_id", room.aircraft_id).in("id", room.document_ids).order("document_date", { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] as { id: string; type: string; title: string | null; file_name: string | null; document_date: string | null }[] }),
  ]);
  if (!aircraft) return <Inactive />;
  const [{ data: owner }, counts] = await Promise.all([
    svc.from("profile").select("full_name").eq("id", aircraft.owner_id).maybeSingle(),
    roomEntryCounts(room),
  ]);

  const hasBooks = (books ?? []).length > 0;
  const tabs = [
    ...(hasBooks ? (["map"] as const) : []),
    ...(room.include_summary ? (["summary"] as const) : []),
    ...(hasBooks ? (["logbooks"] as const) : []),
    ...(docs?.length ? (["documents"] as const) : []),
  ] as Tab[];
  const tab: Tab | undefined = tabs.find((t) => t === sp.tab) ?? tabs[0];
  const base = `/r/${token}`;
  const bookName = (b: { type: string; title: string | null }) => b.title || LOGBOOK_LABEL[b.type] || b.type;
  const book = tab === "logbooks" ? ((books ?? []).find((b) => b.id === sp.book) ?? books?.[0]) : undefined;
  const totalEntries = Object.values(counts).reduce((n, c) => n + c, 0);

  const section = !tab ? null : tab === "logbooks" ? `logbook:${book?.id}` : tab;
  await logRoomView(room, `/${sp.tab ?? ""}`, visitor, section);

  // Map, summary and the dossier's overhauls all read the share input; load it once when any is shown.
  const share = tab === "map" || tab === "summary" ? await loadShareInput(svc, room.aircraft_id, aircraft.owner_id) : null;
  const summary = share && room.include_summary ? buildSummary(share, { includeSquawks: room.include_squawks, includeReporters: room.include_reporters }) : null;
  const years = share && hasBooks ? roomMap(share, { ...room, map_window: "whole_life" }).range : null;
  const desc = [aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(" ");
  const tabLabel: Record<Tab, string> = {
    map: `Map${years ? ` ${years.from.slice(0, 4)}–${years.to.slice(0, 4)}` : ""}`,
    summary: `Summary${summary ? ` as of ${summary.generatedOn}` : ""}`,
    logbooks: `Logbooks ${totalEntries} ${totalEntries === 1 ? "entry" : "entries"}`,
    documents: `Documents ${docs?.length ?? 0}`,
  };

  return (
    <div className="min-h-full bg-cover-2 px-4 py-6 max-sm:px-0 max-sm:py-0">
      <main className="mx-auto max-w-[1280px] overflow-hidden rounded-leaf bg-leaf text-ink shadow-leaf max-sm:rounded-none">
        <header className="border-b border-rule px-7 pt-6 max-sm:px-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-board-title">{aircraft.tail_number}</h1>
            <p className="text-body text-ink-2">
              {desc}
              {aircraft.serial_number ? ` · S/N ${aircraft.serial_number}` : ""}
            </p>
          </div>
          <p className="mt-2 text-small text-ink-2">
            Shared by {owner?.full_name || "the owner"} for {room.label} · <span className="text-ink-3">Read-only · open until {fmtDate(room.expires_at.slice(0, 10))}</span>
          </p>
          <nav aria-label="Sections" className="-mb-px mt-4 flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <Link
                key={t}
                href={`${base}?tab=${t}`}
                aria-current={t === tab ? "page" : undefined}
                className={`shrink-0 rounded-t-tab border border-b-0 px-3.5 pt-2 pb-2.5 text-[15px] font-semibold whitespace-nowrap ${
                  t === tab ? "border-rule bg-leaf text-ink" : "border-transparent text-ink-3 hover:text-ink"
                }`}
              >
                {tabLabel[t]}
              </Link>
            ))}
          </nav>
        </header>

        <div className="px-7 py-6 max-sm:px-4">
          {tab === "map" && share && <MapTab room={room} share={share} summary={summary} base={base} stop={sp.stop} totalEntries={totalEntries} hasDocs={!!docs?.length} />}
          {tab === "map" && !share && <p className="text-body text-ink-2">The map could not be loaded. Reload the page to try again.</p>}
          {tab === "summary" && (summary ? <SummaryArticle m={summary} pdf={`${base}/summary`} /> : <p className="text-body text-ink-2">The summary could not be loaded.</p>)}
          {tab === "logbooks" && book && (
            <Entries room={room} books={(books ?? []).map((b) => ({ id: b.id, name: bookName(b), count: counts[b.id] ?? 0 }))} book={book.id} q={sp.q ?? ""} page={Math.max(0, Number(sp.p) || 0)} base={base} />
          )}
          {tab === "documents" && (
            <ul>
              {(docs ?? []).map((d) => (
                <li key={d.id} className="flex items-center gap-3 border-t border-rule py-3 first:border-t-0">
                  <span className="min-w-0 flex-1 text-body">{d.title || d.file_name || d.type}</span>
                  <span className="text-small text-ink-3">{d.document_date ? fmtDate(d.document_date) : ""}</span>
                  <a href={`${base}/doc/${d.id}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "s")}>Open</a>
                </li>
              ))}
            </ul>
          )}
          {!tab && <p className="text-body text-ink-2">The owner hasn&apos;t included any records in this link.</p>}
          {!tab && room.include_dossier && (
            <a href={`${base}/dossier`} target="_blank" rel="noopener noreferrer" className={`${buttonClass("primary")} mt-4`}>Open the pre-buy dossier</a>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

/** Map tab: the whole life from confirmed entries, what is due, what is missing, and what else is in the room. */
async function MapTab({ room, share, summary, base, stop, totalEntries, hasDocs }: {
  room: Room; share: ShareInput; summary: SummaryModel | null; base: string; stop?: string; totalEntries: number; hasDocs: boolean;
}) {
  const full = roomMap(share, room);
  // Rings are what is due; the room shows them only with the summary. Planned visits are the owner's own.
  const model = { ...full, rings: room.include_summary ? full.rings : [], visits: [] };
  const sel = stop ? model.stops.find((s) => s.id === stop) ?? null : null;
  const entries = sel ? await roomEntriesByIds(room, sel.entryIds) : [];
  const due = summary?.items.filter((i) => i.statusKey === "overdue" || i.statusKey === "due_soon") ?? [];
  const dossier = room.include_dossier ? buildDossier(share, { preparedFor: room.label }) : null;
  const gaps = model.gaps.map((g) => {
    const why = g.status === "asked_previous_owner" ? " The owner has asked the previous owner for them." : g.status === "no_pages_exist" ? " The owner says no pages exist for this time." : "";
    return `${BOOK_NAME[g.logbook]} logbook: no pages from ${fmtDate(g.from)} to ${fmtDate(g.to)}.${why}`;
  });
  return (
    <div className="grid gap-8 lg:grid-cols-[1.75fr_1fr]">
      <section aria-labelledby="map-title" className="min-w-0">
        <h2 id="map-title" className="text-heading">The aircraft&apos;s life, from its logbooks</h2>
        <p className="mb-3 text-small text-ink-3">Solid line: pages in the index. Dashed: no pages. A box is one visit signed in several books.</p>
        <StaticMap model={model} selected={sel?.entryIds[0] ? sel.id : null} stopHref={(id) => `${base}?tab=map&stop=${id}#stop`} label={`The life of the aircraft from its logbooks, ${model.range.from.slice(0, 4)} to ${model.range.to.slice(0, 4)}. Each stop is a link to its entries.`} />
        {due.length > 0 && summary && (
          <section className="mt-6">
            <h3 className="text-section">Due as of {summary.generatedOn}</h3>
            <table className="mt-2 w-full text-left text-small">
              <thead className="text-caption text-ink-3"><tr><th className="pb-1 font-semibold">Item</th><th className="pb-1 font-semibold">Next due</th><th className="pb-1 font-semibold">Status</th><th className="pb-1 font-semibold">Page</th></tr></thead>
              <tbody>
                {due.map((i) => (
                  <tr key={i.key} className="border-t border-rule align-top">
                    <td className="py-1.5 pr-3 text-body-strong">{i.label}</td>
                    <td className="py-1.5 pr-3">{i.nextDue}<span className="block text-ink-3">{i.left}</span></td>
                    <td className="py-1.5 pr-3"><StatusMark kind={i.statusKey} compact /></td>
                    <td className="py-1.5 whitespace-nowrap">{i.page ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <p className="mt-5 text-small text-ink-3">Click any stop to open its entries. {BOUNDARY}</p>
      </section>

      <aside className="min-w-0 space-y-6">
        {sel && (
          <section id="stop" aria-labelledby="stop-title" className="scroll-mt-4 rounded-[var(--radius-s)] bg-leaf-2 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="stop-title" className="text-section">{BOOK_NAME[sel.logbook]}, {fmtDate(sel.date)}</h3>
              <Link href={`${base}?tab=map`} className="text-small font-semibold underline decoration-dotted">Close</Link>
            </div>
            {entries.length ? entries.map((e) => (
              <div key={e.id} className="mt-2 border-t border-rule pt-2">
                <p className="text-paper">{[e.description, e.work_performed].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 text-small text-ink-3">
                  {e.tach != null ? `Tach ${e.tach}` : ""}
                  {room.include_scans && e.page_id && (
                    <> {e.tach != null ? "· " : ""}<a href={`${base}/page/${e.page_id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline decoration-dotted">Open the page</a></>
                  )}
                </p>
              </div>
            )) : <p className="mt-2 text-small text-ink-3">This stop has no confirmed entry to show.</p>}
          </section>
        )}
        {summary && <p className="text-lede">{summary.verdict}</p>}
        <section>
          <h3 className="text-section">Missing</h3>
          {gaps.length ? <ul className="mt-1 space-y-1 text-body">{gaps.map((g) => <li key={g}>{g}</li>)}</ul> : <p className="mt-1 text-body text-ink-2">No gaps in the shared logbooks.</p>}
        </section>
        {dossier && (
          <section>
            <h3 className="text-section">Overhauls</h3>
            <p className="mt-1 text-body">Engine: {dossier.engine.lastOverhaul ?? "none in the confirmed entries"}{dossier.engine.since ? `. ${dossier.engine.since}` : ""}.</p>
            <p className="text-body">Propeller: {dossier.prop.lastOverhaul ?? "none in the confirmed entries"}{dossier.prop.since ? `. ${dossier.prop.since}` : ""}.</p>
          </section>
        )}
        <section>
          <h3 className="text-section">In this room</h3>
          <ul className="mt-1 space-y-1.5 text-body">
            {room.include_dossier && <li className="flex items-center justify-between gap-3">Pre-buy dossier <a href={`${base}/dossier`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "s")}>Open</a></li>}
            {room.include_summary && <li><Link href={`${base}?tab=summary`} className="underline decoration-dotted">Maintenance summary</Link></li>}
            <li><Link href={`${base}?tab=logbooks`} className="underline decoration-dotted">{room.logbook_ids.length} {room.logbook_ids.length === 1 ? "logbook" : "logbooks"}</Link>{room.include_scans ? ", with page scans" : ""}</li>
            {hasDocs && <li><Link href={`${base}?tab=documents`} className="underline decoration-dotted">Documents</Link></li>}
          </ul>
          <Link href={`${base}?tab=logbooks`} className={`${buttonClass("primary")} mt-4`}>Search all {totalEntries} entries</Link>
        </section>
      </aside>
    </div>
  );
}

/** Logbooks tab: book chips, search, confirmed entries 100 at a time (no cap). */
async function Entries({ room, books, book, q, page, base }: { room: Room; books: { id: string; name: string; count: number }[]; book: string; q: string; page: number; base: string }) {
  const rows = await roomEntries(room, book, q, page, ROOM_PAGE_SIZE + 1);
  const more = rows.length > ROOM_PAGE_SIZE;
  const entries = rows.slice(0, ROOM_PAGE_SIZE);
  const href = (o: { book?: string; p?: number }) => {
    const s = new URLSearchParams({ tab: "logbooks", book: o.book ?? book });
    if (q && !o.book) s.set("q", q);
    if (o.p) s.set("p", String(o.p));
    return `${base}?${s}`;
  };
  return (
    <>
      <nav aria-label="Logbooks" className="mb-4 flex flex-wrap gap-2">
        {books.map((b) => (
          <Link
            key={b.id}
            href={href({ book: b.id })}
            aria-current={b.id === book ? "page" : undefined}
            className={`rounded-pill border px-3 py-1.5 text-small font-semibold ${b.id === book ? "border-ink bg-ink text-leaf" : "border-control-border text-ink-2"}`}
          >
            {b.name} <span className={b.id === book ? "" : "text-ink-3"}>{b.count}</span>
          </Link>
        ))}
      </nav>
      <form className="mb-4 flex gap-2" action={base}>
        <input type="hidden" name="tab" value="logbooks" />
        <input type="hidden" name="book" value={book} />
        <input name="q" defaultValue={q} placeholder="Search entries" aria-label="Search entries" className="h-[42px] min-w-0 flex-1 rounded-control border border-control-border bg-leaf px-3 text-body" />
        <button className={buttonClass("secondary")}>Search</button>
      </form>
      {entries.length ? (
        <ul>
          {entries.map((e) => (
            <li key={e.id} className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-1 border-t border-rule py-3 max-sm:grid-cols-1">
              <span className="text-small font-semibold text-ink-2">{e.entry_date ? fmtDate(e.entry_date) : "Undated"}</span>
              <div className="min-w-0">
                <p className="text-paper">{[e.description, e.work_performed].filter(Boolean).join(" · ")}</p>
                <p className="mt-0.5 text-small text-ink-3">
                  {e.tach != null ? `Tach ${e.tach}` : ""}
                  {room.include_scans && e.page_id && (
                    <> {e.tach != null ? "· " : ""}<a href={`${base}/page/${e.page_id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline decoration-dotted">Open the page</a></>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-ink-2">{q ? "No entries match that search." : "No confirmed entries in this logbook yet."}</p>
      )}
      {(page > 0 || more) && (
        <nav aria-label="More entries" className="mt-4 flex gap-2">
          {page > 0 && <Link href={href({ p: page - 1 })} className={buttonClass("secondary", "s")}>Newer</Link>}
          {more && <Link href={href({ p: page + 1 })} className={buttonClass("secondary", "s")}>Older</Link>}
        </nav>
      )}
      <p className="mt-5 text-small text-ink-3">{BOUNDARY}</p>
    </>
  );
}

/** W-SHARE-04's article, as the room's Summary tab. */
function SummaryArticle({ m, pdf }: { m: SummaryModel; pdf: string }) {
  const th = "pb-1 pr-3 text-left font-semibold";
  return (
    <article className="max-w-[880px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-heading">{m.title}</h2>
        <a className={buttonClass("secondary", "s")} href={pdf} target="_blank" rel="noopener noreferrer">Open as PDF</a>
      </div>
      <p className="text-small text-ink-3">Generated {m.generatedOn}</p>
      <p className="mt-2 text-body text-ink-2">{m.identity}</p>
      <p className="mt-3 text-lede">{m.verdict}</p>
      <h3 className="mt-6 text-section">Inspections, items and recurring ADs ({m.items.length})</h3>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[560px] text-small">
          <thead className="text-caption text-ink-3"><tr><th className={th}>Item</th><th className={th}>Last done</th><th className={th}>Next due</th><th className={th}>Left</th><th className={th}>Status</th><th className={th}>Page</th></tr></thead>
          <tbody>
            {m.items.map((i) => (
              <tr key={i.key} className="border-t border-rule align-top">
                <td className="py-1.5 pr-3 font-semibold">{i.label}</td><td className="py-1.5 pr-3">{i.lastDone}</td><td className="py-1.5 pr-3">{i.nextDue}</td>
                <td className="py-1.5 pr-3">{i.left}</td><td className="py-1.5 pr-3"><StatusMark kind={i.statusKey} compact /></td><td className="py-1.5 whitespace-nowrap">{i.page ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {m.squawksShown && (
        <>
          <h3 className="mt-6 text-section">Open squawks ({m.squawks.length})</h3>
          {m.squawks.length ? (
            <ul className="mt-1 text-body">{m.squawks.map((q, i) => <li key={i} className="border-t border-rule py-1.5">{q.reported} · {q.severity} · {q.description}{q.reporter ? ` · ${q.reporter}` : ""}</li>)}</ul>
          ) : <p className="mt-1 text-body text-ink-2">No open squawks.</p>}
        </>
      )}
      <h3 className="mt-6 text-section">ADs ({m.ads.length})</h3>
      {m.ads.length ? (
        <ul className="mt-1 text-body">{m.ads.map((a) => <li key={a.reference} className="border-t border-rule py-1.5">{a.reference}{a.title ? ` · ${a.title}` : ""} · {a.status}{a.complied ? ` · ${a.complied}` : ""}{a.page ? ` · ${a.page}` : ""}</li>)}</ul>
      ) : <p className="mt-1 text-body text-ink-2">No ADs recorded.</p>}
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

function Inactive({ title = "This link is no longer active.", line = "Ask the owner for a new one." }: { title?: string; line?: string }) {
  return (
    <div className="min-h-full bg-cover-2 px-4 py-16">
      <main className="mx-auto max-w-xl rounded-leaf bg-leaf px-7 py-10 text-center text-ink shadow-leaf">
        <h1 className="text-heading">{title}</h1>
        <p className="mt-2 text-body text-ink-2">{line}</p>
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="mx-auto mt-6 flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-1 text-small text-on-cover-2 max-sm:px-4 max-sm:pb-6">
      <span>Kept with MyTailLog, a free and open-source logbook index for aircraft owners.</span>
      <a href="https://mytaillog.com/?ref=record-room" className="font-semibold text-on-cover underline decoration-dotted">Track your own aircraft</a>
    </footer>
  );
}
