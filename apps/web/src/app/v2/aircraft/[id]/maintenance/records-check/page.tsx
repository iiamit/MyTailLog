import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { dueSnapshot } from "@/lib/due/load";
import { fmtDate } from "@/lib/due/engine";
import { BOOK_NAME, type MapLogbookType } from "@/lib/mapModel";
import { gapEvidence, type StoredGap } from "@/lib/gaps";
import { LOGBOOK_LABEL } from "@/lib/logbooks";
import type { LogbookType } from "@/lib/database.types";
import { auditADs, auditAnnuals, auditContinuity, type AdRow, type AuditEntry } from "@/lib/audit";
import { filterEntryClusters, findEntryDuplicates, findPageDuplicates, type DupEntry, type DupPage } from "@/lib/duplicates";
import { getHoursAnomalies } from "@/lib/aircraftHours";
import { aircraftTail } from "@/lib/v2/landing";
import { maintTabs } from "@/lib/v2/tabs";
import { fmtMeter } from "@/lib/v2/status";
import { deletePageQuestion, gapTitle, readingReason, settledWord, splitGaps } from "@/lib/v2/records";
import { Board, BoardHead, HungSection, Leaf, Leaves, SourceMat, Spine } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { ConfirmSubmit, Notice, fieldClass } from "@/ui/Form";
import { deleteDuplicateEntry, deleteDuplicatePage, fixReading, reopenGap } from "./actions";
import { ExplainForm } from "./ExplainForm";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Records check · ${await aircraftTail(id)}` };
}

type Search = { finding?: string; panel?: string; done?: string; error?: string };

const link = "font-semibold text-board-ink underline decoration-dotted";
const row = "flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3";

/** A page image on the mat. Signed per user, so never next/image (it would cache across users). */
function PageImg({ pageId, alt }: { pageId: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- per-user page image
  return <img src={`/api/page/${pageId}/image`} alt={alt} className="h-auto w-full rounded-[var(--radius-s)]" />;
}

/**
 * W-MAINT-05 Records check: every place the records look missing or mistyped (gaps, AD compliance, duplicate scans
 * and entries, mis-keyed readings), each with its fix. Replaces /audit and /duplicates. Nothing here moves a due
 * date until the owner acts.
 */
export default async function RecordsCheckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  const self = `${a}/maintenance/records-check`;
  const edit = context.canEdit;

  const [due, entryRes, pageRes, squawks, aircraftRes] = await Promise.all([
    dueSnapshot(id, auth.user.id).catch(() => null),
    supabase.from("log_entry").select("id, page_id, logbook_id, entry_date, tach, hobbs, description, work_performed, owner_confirmed, created_at").eq("aircraft_id", id).limit(20000),
    supabase.from("page").select("id, logbook_id, page_sequence, ocr_text, created_at").eq("aircraft_id", id).limit(20000),
    supabase.from("squawk").select("id", { count: "exact", head: true }).eq("aircraft_id", id).eq("status", "open"),
    supabase.from("aircraft").select("enrollment_hobbs, enrollment_tach, enrollment_airframe, enrollment_date").eq("id", id).maybeSingle(),
  ]);
  const failed = !due || entryRes.error || pageRes.error || !aircraftRes.data;
  const head = (findings?: number) => (
    <>
      <BoardHead
        title="Maintenance"
        subTabs={maintTabs(id, "records-check", { squawks: squawks.count, findings })}
        actions={<span>Checked after every review</span>}
      />
      <Spine tail={context.reg} context="The whole life" href={`${a}/logbooks/map`} />
    </>
  );
  if (failed) {
    return (
      <Board section="maint">
        {head()}
        <Leaves split="1.9fr 1fr">
          <Leaf label="Records check">
            <p className="mb-3 text-lede text-ink-2">The records check could not be loaded.</p>
            <Button variant="quiet" href={self}>Try again</Button>
          </Leaf>
          <SourceMat />
        </Leaves>
      </Board>
    );
  }

  const input = due.loaded.input;
  const books = input.logbook ?? [];
  const bookOf = new Map(books.map((b) => [b.id, b]));
  const pageRows = pageRes.data ?? [];
  const pageById = new Map(pageRows.map((p) => [p.id, p]));
  const pageLabel = (pageId: string | null | undefined) => {
    const p = pageId ? pageById.get(pageId) : undefined;
    if (!p) return null;
    const b = bookOf.get(p.logbook_id);
    const name = b?.title ?? LOGBOOK_LABEL[b?.type as LogbookType] ?? "Logbook";
    return p.page_sequence != null ? `${name} p. ${p.page_sequence}` : name;
  };

  // Gaps (logbook_gap, 09 §2.6): open ones are findings, explained ones are settled.
  const { open: openGaps, settled } = splitGaps(input.logbook_gap ?? []);
  const gapName = (g: { logbook_id: string; from_date: string; to_date: string }) =>
    gapTitle(BOOK_NAME[(bookOf.get(g.logbook_id)?.type ?? "airframe") as MapLogbookType] ?? "Logbook", g.from_date, g.to_date);
  const evidence = (g: (typeof openGaps)[number]) =>
    gapEvidence({ gap: g as StoredGap & { note: string | null }, logbook: books, log_entry: input.log_entry ?? [], page: input.page ?? [] });

  // Confirmed entries only (S-UNCONF): pages waiting for review are not checked.
  const entryRows = entryRes.data ?? [];
  const confirmed: AuditEntry[] = entryRows.filter((e) => e.owner_confirmed).map((e) => ({
    date: e.entry_date, text: `${e.description ?? ""} ${e.work_performed ?? ""}`.toLowerCase(),
  }));
  const recordFindings = confirmed.length ? [...auditAnnuals(confirmed), ...auditContinuity(confirmed)] : [];
  const tach = due.snap.meters.tach.face;
  const adFindings = (input.ad_compliance ?? []).flatMap((ad) =>
    auditADs([ad as unknown as AdRow], tach, due.snap.today).map((f) => ({ ...f, adId: ad.id })));

  // Duplicates (same detection as today's /duplicates).
  const entries: DupEntry[] = entryRows.map((e) => ({
    id: e.id, page_id: e.page_id, logbook_id: e.logbook_id, entry_date: e.entry_date, tach: e.tach, hobbs: e.hobbs,
    text: `${e.description ?? ""} ${e.work_performed ?? ""}`.trim(), owner_confirmed: e.owner_confirmed, created_at: e.created_at,
  }));
  const entryIdsByPage = new Map<string, string[]>();
  for (const e of entries) if (e.page_id) entryIdsByPage.set(e.page_id, [...(entryIdsByPage.get(e.page_id) ?? []), e.id]);
  const dupPages: DupPage[] = pageRows.map((p) => ({ id: p.id, logbook_id: p.logbook_id, ocr_text: p.ocr_text, created_at: p.created_at, entryIds: entryIdsByPage.get(p.id) ?? [] }));
  const rawEntryClusters = findEntryDuplicates(entries);
  const pageClusters = findPageDuplicates(dupPages, rawEntryClusters);
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const entryClusters = filterEntryClusters(rawEntryClusters, pageClusters, new Map(entries.map((e) => [e.id, e.page_id])));
  const confirmedOn = (pageId: string) => (entryIdsByPage.get(pageId) ?? []).filter((eid) => entryById.get(eid)?.owner_confirmed).length;

  // Mis-keyed readings.
  const enr = aircraftRes.data!;
  const anomalies = (await getHoursAnomalies(supabase, id, {
    hobbs: enr.enrollment_hobbs, tach: enr.enrollment_tach, airframe: enr.enrollment_airframe, date: enr.enrollment_date,
  }).catch(() => [])).flatMap((x) => (x.source === "entry" || x.source === "mfb" ? [{ ...x, source: x.source }] : []));

  const total = openGaps.length + recordFindings.length + adFindings.length + pageClusters.length + entryClusters.length + anomalies.length;
  const waiting = context.badges.review;

  // Selection → right leaf.
  const [selKind, selId] = (sp.finding ?? "").split(":");
  const selGap = selKind === "gap" ? [...openGaps, ...settled].find((g) => g.id === selId) : undefined;
  const selPages = selKind === "pages" ? pageClusters.find((c) => c.ids.includes(selId)) : undefined;
  const selEntries = selKind === "entries" ? entryClusters.find((c) => c.ids.includes(selId)) : undefined;
  const selReading = selKind === "reading" ? anomalies.find((x) => x.readingId === selId) : undefined;
  const sel = (key: string) => `${self}?finding=${key}`;

  let right: React.ReactNode = <SourceMat />;
  if (selGap && sp.panel === "explain" && edit) {
    right = <ExplainForm aircraftId={id} gapId={selGap.id} title={gapName(selGap)} status={selGap.status} note={selGap.note ?? null} closeHref={sel(`gap:${selGap.id}`)} />;
  } else if (selGap) {
    const ev = evidence(selGap);
    const sides = [ev?.neighbourPages.before ?? null, ev?.neighbourPages.after ?? null];
    right = (
      <SourceMat title="Either side of the gap" meta={gapName(selGap)}>
        {sides.map((p, i) => p ? (
          <figure key={p.pageId} className="m-0 space-y-1">
            <figcaption className="text-caption text-on-cover-2">{p.label}</figcaption>
            <PageImg pageId={p.pageId} alt={p.label} />
          </figure>
        ) : (
          <p key={i} className="text-small text-on-cover-2">{i === 0 ? "No page before the gap." : "No page after the gap yet."}</p>
        ))}
      </SourceMat>
    );
  } else if (selPages) {
    const keep = selPages.keepId, drop = selPages.ids.filter((x) => x !== keep);
    right = (
      <SourceMat title={`${selPages.ids.map(pageLabel).join(" and ")}, side by side`} meta="Same entries, photographed twice">
        <div className="grid grid-cols-2 gap-2">
          {selPages.ids.map((pid) => (
            <figure key={pid} className="m-0 space-y-1">
              <figcaption className="text-caption text-on-cover-2">{pageLabel(pid)}{pid === keep ? " · suggested to keep" : ""}</figcaption>
              <PageImg pageId={pid} alt={pageLabel(pid) ?? "Logbook page"} />
            </figure>
          ))}
        </div>
        <p className="text-small text-on-cover-2">
          {drop.map((pid) => {
            const c = confirmedOn(pid);
            return `${pageLabel(pid)} has ${c ? `${c} confirmed ${c === 1 ? "entry" : "entries"}` : "nothing confirmed, so deleting it loses nothing confirmed"}.`;
          }).join(" ")}
        </p>
      </SourceMat>
    );
  } else if (selEntries || selReading) {
    const pids = selEntries
      ? [...new Set(selEntries.ids.map((e) => entryById.get(e)?.page_id).filter((p): p is string => !!p))]
      : selReading?.source === "entry" && entryById.get(selReading.readingId)?.page_id ? [entryById.get(selReading.readingId)!.page_id!] : [];
    right = pids.length ? (
      <SourceMat title={pids.map(pageLabel).join(" and ")}>
        {pids.map((pid) => <PageImg key={pid} pageId={pid} alt={pageLabel(pid) ?? "Logbook page"} />)}
      </SourceMat>
    ) : (
      <SourceMat title="No page">
        <p className="text-body text-on-cover-2">{selReading?.source === "mfb" ? "This reading came from MyFlightBook, so there is no logbook page behind it." : "No scanned page behind this yet."}</p>
      </SourceMat>
    );
  }

  const pick = (key: string, label: string) => (
    <Link href={sel(key)} replace scroll={false} aria-current={sp.finding === key ? "true" : undefined} className="text-body-strong hover:underline aria-[current]:underline">
      {label}
    </Link>
  );

  return (
    <Board section="maint">
      {head(total)}
      <Leaves split="1.9fr 1fr">
        <Leaf label="Records check">
          {sp.error && <div className="mb-4"><Notice tone="alarm">{sp.error}</Notice></div>}
          {sp.done && <div className="mb-4"><Notice>{sp.done}</Notice></div>}
          <p className="mb-2 max-w-[60ch] text-lede">
            {total === 0
              ? "Nothing looks missing or mistyped. The checks are rules of thumb; give the pages a look too."
              : `${total} ${total === 1 ? "thing" : "things"} in the records ${total === 1 ? "looks" : "look"} missing or mistyped. Nothing here changes what is due until you decide.`}
          </p>
          {waiting > 0 && (
            <p className="mb-4 text-small text-ink-3">
              {waiting} {waiting === 1 ? "page" : "pages"} waiting for review {waiting === 1 ? "was" : "were"} not checked.{" "}
              {edit && <Link href={`${a}/logbooks/review`} className={link}>Review {waiting === 1 ? "it" : "them"}</Link>}
            </p>
          )}

          {(openGaps.length > 0 || recordFindings.length > 0) && (
            <HungSection title="Gaps" count={`${openGaps.length + recordFindings.length}`} first>
              <ul className="divide-y divide-rule">
                {openGaps.map((g) => (
                  <li key={g.id} className={row}>
                    <span className="min-w-0 flex-1">
                      {pick(`gap:${g.id}`, gapName(g))}
                      <span className="block text-small text-ink-2">{evidence(g)?.verdict}</span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {edit && <Link href={`${a}/capture`} className={buttonClass("secondary", "s")}>Scan these pages</Link>}
                      <Link href={`${a}/logbooks/map?gap=${g.id}`} className={buttonClass("quiet", "s")}>Show on the map</Link>
                      {edit && <Link href={`${self}?finding=gap:${g.id}&panel=explain`} replace scroll={false} className={buttonClass("quiet", "s")}>Explain the gap</Link>}
                    </span>
                  </li>
                ))}
                {recordFindings.map((f, i) => (
                  <li key={`${i}-${f.title}`} className={row}>
                    <span className="min-w-0 flex-1">
                      <span className="text-body-strong">{f.title}</span>
                      <span className="block text-small text-ink-2">{f.detail}</span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <Link href={`${a}/logbooks/map`} className={buttonClass("quiet", "s")}>Show on the map</Link>
                      <Link href={`${a}/ask?q=${encodeURIComponent(f.title)}`} className={buttonClass("quiet", "s")}>Search</Link>
                    </span>
                  </li>
                ))}
              </ul>
            </HungSection>
          )}

          {adFindings.length > 0 && (
            <HungSection title="AD compliance" count={`${adFindings.length}`} first={openGaps.length + recordFindings.length === 0}>
              <ul className="divide-y divide-rule">
                {adFindings.map((f) => (
                  <li key={f.adId} className={row}>
                    <span className="min-w-0 flex-1">
                      <span className="text-body-strong">{f.title}</span>
                      <span className="block text-small text-ink-2">{f.detail}</span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <Link href={`${a}/maintenance/ads?ad=${f.adId}`} className={buttonClass("secondary", "s")}>Open the AD</Link>
                      <Link href={`${a}/ask?q=${encodeURIComponent(f.title.split(":")[0])}`} className={buttonClass("quiet", "s")}>Search the entries</Link>
                    </span>
                  </li>
                ))}
              </ul>
            </HungSection>
          )}

          {pageClusters.length > 0 && (
            <HungSection title="Duplicate scans" count={`${pageClusters.length}`}>
              <ul className="divide-y divide-rule">
                {pageClusters.map((c) => {
                  const drop = c.ids.filter((x) => x !== c.keepId);
                  const shared = Math.min(...c.ids.map((pid) => entryIdsByPage.get(pid)?.length ?? 0));
                  return (
                    <li key={c.keepId} className={row}>
                      <span className="min-w-0 flex-1">
                        {pick(`pages:${c.keepId}`, `${c.ids.map(pageLabel).join(" and ")} look like the same page`)}
                        <span className="block text-small text-ink-2">
                          {pageLabel(drop[0])} has {shared} {shared === 1 ? "entry" : "entries"} that repeat {pageLabel(c.keepId)}
                          {pageById.get(drop[0])?.created_at ? ` · added ${fmtDate(pageById.get(drop[0])!.created_at.slice(0, 10))}` : ""}
                        </span>
                      </span>
                      {edit && drop.map((pid) => {
                        const n = entryIdsByPage.get(pid)?.length ?? 0;
                        return (
                          <form key={pid} action={deleteDuplicatePage.bind(null, id, pid)}>
                            <ConfirmSubmit
                              variant="secondary"
                              label={`Delete ${pageLabel(pid)} and its ${n} ${n === 1 ? "entry" : "entries"}`}
                              confirmLabel="Delete"
                              question={deletePageQuestion(pageLabel(pid) ?? "this page", n, confirmedOn(pid))}
                            />
                          </form>
                        );
                      })}
                    </li>
                  );
                })}
              </ul>
            </HungSection>
          )}

          {entryClusters.length > 0 && (
            <HungSection title="Duplicate entries" count={`${entryClusters.length}`}>
              <ul className="divide-y divide-rule">
                {entryClusters.map((c) => (
                  <li key={c.keepId} className={row}>
                    <span className="min-w-0 flex-1">
                      {pick(`entries:${c.keepId}`, `${c.ids.length} entries look like the same logged event`)}
                      <span className="block text-small text-ink-2">
                        {c.ids.map((eid) => {
                          const e = entryById.get(eid);
                          return [e?.entry_date ? fmtDate(e.entry_date) : "no date", pageLabel(e?.page_id) ?? "no page", e?.owner_confirmed ? "confirmed" : "not confirmed"].join(", ");
                        }).join(" · ")}
                      </span>
                    </span>
                    {edit && c.ids.filter((x) => x !== c.keepId).map((eid) => (
                      <form key={eid} action={deleteDuplicateEntry.bind(null, id, eid)}>
                        <ConfirmSubmit
                          variant="secondary"
                          label="Delete the copy"
                          confirmLabel="Delete"
                          question={`Delete the copy on ${pageLabel(entryById.get(eid)?.page_id) ?? "no page"}? The entry on ${pageLabel(entryById.get(c.keepId)?.page_id) ?? "the other page"} stays. The page itself is kept.`}
                        />
                      </form>
                    ))}
                  </li>
                ))}
              </ul>
            </HungSection>
          )}

          {anomalies.length > 0 && (
            <HungSection title="Mis-keyed readings" count={`${anomalies.length}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-body">
                  <thead>
                    <tr className="text-left text-label text-ink-3">
                      <th scope="col" className="border-b border-rule-2 pr-3 pb-2 font-bold">Entry</th>
                      <th scope="col" className="border-b border-rule-2 pr-3 pb-2 font-bold">Reads</th>
                      <th scope="col" className="border-b border-rule-2 pr-3 pb-2 font-bold">Suggested</th>
                      <th scope="col" className="border-b border-rule-2 pb-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((x) => (
                      <tr key={`${x.readingId}-${x.field}`}>
                        <td className="border-b border-rule py-2.5 pr-3 align-top">
                          {pick(`reading:${x.readingId}`, `${x.date ? fmtDate(x.date) : "no date"} ${x.field}`)}
                          <span className="block text-small text-ink-3">{readingReason(x.reason, x.field, x.source)}</span>
                        </td>
                        <td className="border-b border-rule py-2.5 pr-3 align-top tabular-nums">{x.field} {fmtMeter(x.value)}</td>
                        <td className="border-b border-rule py-2.5 pr-3 align-top tabular-nums">{x.reason === "duplicate" ? "clear it" : x.suggested != null ? fmtMeter(x.suggested) : "none"}</td>
                        <td className="border-b border-rule py-2.5 align-top">
                          {edit && (
                            <form action={fixReading.bind(null, id, x.source, x.readingId, x.field)} className="flex flex-wrap items-center justify-end gap-1">
                              {x.reason === "duplicate" ? (
                                <button type="submit" name="how" value="clear" className={buttonClass("secondary", "s")}>Clear {x.field}</button>
                              ) : (
                                <>
                                  <label className="sr-only" htmlFor={`v-${x.readingId}`}>Corrected {x.field}</label>
                                  <input id={`v-${x.readingId}`} name="value" type="number" step="0.1" min="0" defaultValue={x.suggested ?? ""} className={`${fieldClass} mt-0 h-[34px] w-24`} />
                                  <button type="submit" name="how" value="use" className={buttonClass("secondary", "s")}>Use it</button>
                                </>
                              )}
                              <button type="submit" name="how" value="keep" className={buttonClass("quiet", "s")}>Keep</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </HungSection>
          )}

          {settled.length > 0 && (
            <details className="mt-2 border-t border-rule py-3">
              <summary className="cursor-pointer text-section">Settled · {settled.length}</summary>
              <ul className="mt-2 divide-y divide-rule">
                {settled.map((g) => (
                  <li key={g.id} className={`${row} text-ink-2`}>
                    <span className="min-w-0 flex-1">
                      {pick(`gap:${g.id}`, gapName(g))}
                      <span className="block text-small">
                        {settledWord(g.status)} {g.note && <span className="font-paper">“{g.note}”</span>}
                      </span>
                    </span>
                    {edit && (
                      <form action={reopenGap.bind(null, id, g.id)}>
                        <button type="submit" className={buttonClass("quiet", "s")}>Undo</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="mt-5 text-small text-ink-3">
            These checks are rules of thumb over the confirmed entries. They catch a lot, not everything; the paper books stay the record.
          </p>
        </Leaf>
        {right}
      </Leaves>
    </Board>
  );
}
