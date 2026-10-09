import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMeters } from "@/lib/aircraftHours";
import { auditADs, auditAnnuals, auditContinuity } from "@/lib/audit";
import { buildStatusItems, sortStatusItems } from "@/lib/status";
import { loadLogEntries, loadRecordPages } from "@/lib/loadLogEntries";
import { engineTrends } from "@/lib/engineTrends";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Pre-buy dossier — MyTailLog" };

const section = "mt-7 border-b border-line pb-1 text-base font-semibold text-ink";
const source = (id: string, pageId: string | null, entryId: string) => pageId
  ? `/aircraft/${id}/pages/${pageId}/review` : `/aircraft/${id}/timeline?entry=${entryId}`;

export default async function PrebuyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: aircraft } = await supabase.from("aircraft").select("*").eq("id", id).single();
  if (!aircraft) notFound();
  const [entries, pages, { data: logbooks }, { data: maintenance }, { data: ads }, { data: squawks }, { data: components }] = await Promise.all([
    loadLogEntries(supabase, id),
    loadRecordPages(supabase, id),
    supabase.from("logbook").select("id, type, title").eq("aircraft_id", id),
    supabase.from("maintenance_item").select("*").eq("aircraft_id", id),
    supabase.from("ad_compliance").select("*").eq("aircraft_id", id),
    supabase.from("squawk").select("id, description, severity, status, reported_at").eq("aircraft_id", id).eq("status", "open"),
    supabase.from("component").select("id, name, make, part_number, serial_number").eq("aircraft_id", id).eq("is_installed", true),
  ]);
  const meters = await getCurrentMeters(supabase, id, {
    hobbs: aircraft.enrollment_hobbs, tach: aircraft.enrollment_tach,
    airframe: aircraft.enrollment_airframe, date: aircraft.enrollment_date,
  });
  const current = { tach: meters.tach.tach, hobbs: meters.hobbs.hobbs, airframe: meters.airframe.airframe,
    tachEstimated: meters.tach.estimated, hobbsEstimated: meters.hobbs.estimated,
    airframeEstimated: meters.airframe.estimated, baselineFor: meters.baselineFor, toTotalHours: meters.toTotalHours };
  const status = sortStatusItems(buildStatusItems(maintenance ?? [], (ads ?? []).filter((ad) => ad.recurring && ad.status !== "not_applicable" && ad.status !== "superseded"), current));
  const urgent = status.filter((item) => item.urgency === "overdue" || item.urgency === "due_soon");
  const auditEntries = entries.filter((e) => !e.authored_superseded_by).map((e) => ({ date: e.entry_date,
    text: `${e.description ?? ""} ${e.work_performed ?? ""}`.toLowerCase() }));
  const findings = [
    ...auditAnnuals(auditEntries), ...auditContinuity(auditEntries),
    ...auditADs(ads ?? [], current.tach),
  ];
  const unreviewed = pages.filter((p) => p.review_status !== "confirmed" || p.extraction_status !== "extracted" || p.unread_rotated_content);
  const unconfirmedEntries = entries.filter((e) => !e.owner_confirmed && !e.authored_superseded_by);
  const trends = engineTrends(entries);
  const latestCompression = [...trends.compression].reverse().find((test) => test.confirmed && test.date);
  const logbookName = (id: string) => { const lb = logbooks?.find((l) => l.id === id); return lb?.title || lb?.type || "Logbook"; };
  const generated = new Date().toISOString().slice(0, 10);

  return <main className="mx-auto max-w-4xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 print:hidden"><div>
      <div className="eyebrow mb-2">Manage</div><h1 className="font-display text-[27px] font-semibold">Pre-buy dossier</h1>
      <p className="mt-2 max-w-2xl text-sm text-dim">A source-linked briefing for a prospective buyer or mechanic. Print or save as PDF, then inspect the linked records and physical logbooks before relying on any finding.</p>
    </div><PrintButton /></header>
    <article className="text-[12px] leading-relaxed text-dim">
      <div className="border-b-2 border-line2 pb-3"><h2 className="font-display text-xl font-bold text-ink">{aircraft.tail_number} · Pre-buy dossier</h2>
        <p>{[aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(" ")}{aircraft.serial_number && ` · Airframe S/N ${aircraft.serial_number}`}</p>
        <p>{aircraft.engine_serials?.length ? `Engine S/N ${aircraft.engine_serials.join(", ")} · ` : "Engine S/N not recorded · "}{aircraft.prop_serials?.length ? `Prop S/N ${aircraft.prop_serials.join(", ")}` : "Prop S/N not recorded"}</p>
        <p className="text-faint">Generated {generated} · Tach {current.tach ?? "unknown"} · Hobbs {current.hobbs ?? "unknown"} · Airframe {current.airframe ?? "unknown"}</p>
      </div>
      <h3 className={section}>Records coverage</h3>
      <p className="mt-2">{logbooks?.length ?? 0} logbooks · {pages.length} scanned pages · {entries.length} extracted or authored entries · {unconfirmedEntries.length} entries awaiting confirmation.</p>
      {(logbooks ?? []).map((lb) => { const p = pages.filter((page) => page.logbook_id === lb.id); const e = entries.filter((entry) => entry.logbook_id === lb.id && entry.entry_date); const dates = e.map((entry) => entry.entry_date!).sort(); return <p key={lb.id} className="mt-1"><strong className="text-ink">{lb.title || lb.type}</strong>: {p.length} pages, {p.filter((page) => page.review_status === "confirmed").length} reviewed; {dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : "no dated entries"}</p>; })}
      {unreviewed.length > 0 && <p className="mt-2 text-annun-amber">{unreviewed.length} page{unreviewed.length === 1 ? "" : "s"} need extraction or review: {unreviewed.slice(0, 20).map((page, i) => <span key={page.id}>{i > 0 && ", "}<Link className="underline" href={`/aircraft/${id}/pages/${page.id}/review`}>{logbookName(page.logbook_id)} {page.page_sequence ?? "page"}</Link></span>)}{unreviewed.length > 20 && `, and ${unreviewed.length - 20} more in Logbook pages`}. <Link className="underline" href={`/aircraft/${id}/pages`}>View all pages</Link>.</p>}
      {unconfirmedEntries.length > 0 && <p className="mt-1"><Link className="text-accent underline" href={`/aircraft/${id}/review`}>Review unconfirmed entries</Link> before using this report.</p>}
      <h3 className={section}>Items to investigate</h3>
      {findings.length === 0 && urgent.length === 0 && !squawks?.length && <p className="mt-2">No issue was flagged by the available records. This does not establish completeness or airworthiness.</p>}
      {findings.map((f, i) => <div key={i} className="mt-2 break-inside-avoid"><strong className="text-ink">{f.title}</strong> · {f.detail} <Link className="text-accent underline" href={`/aircraft/${id}/audit`}>Records gap audit</Link><span className="text-faint"> · Source: inferred from dated entries; a missing record has no linked scan.</span></div>)}
      {urgent.map((item) => { const ad = item.source === "ad" ? ads?.find((a) => a.id === item.id) : null; const pageId = ad?.verified_report_page_id ?? null; const entry = ad?.reference_entry_id ? entries.find((e) => e.id === ad.reference_entry_id) : null; const href = pageId ? `/aircraft/${id}/pages/${pageId}/review` : entry ? source(id, entry.page_id, entry.id) : item.source === "ad" ? `/aircraft/${id}/compliance` : `/aircraft/${id}/maintenance`; return <div key={`${item.source}-${item.id}`} className="mt-2 break-inside-avoid"><strong className="text-ink">{item.label}</strong> · {item.urgency === "overdue" ? "Overdue" : "Due soon"}{item.nextDueDate && ` · due ${item.nextDueDate}`}{item.nextDueForItem != null && ` / ${item.nextDueForItem} ${item.meter} hrs`}. <Link className="text-accent underline" href={href}>{pageId || entry ? "Source record" : "Tracker record"}</Link>{!pageId && !entry && <span className="text-faint"> · No scanned source linked.</span>}</div>; })}
      {(squawks ?? []).map((s) => <div key={s.id} className="mt-2"><strong className="text-ink">Open squawk ({s.severity})</strong> · {s.description} <Link className="text-accent underline" href={`/aircraft/${id}/squawks`}>Squawk record</Link></div>)}
      <h3 className={section}>AD status and equipment</h3>
      <p className="mt-2">{ads?.length ?? 0} AD/SB records tracked; {(ads ?? []).filter((a) => a.status === "open").length} open. <Link className="text-accent underline" href={`/aircraft/${id}/compliance`}>Inspect AD records and evidence</Link></p>
      <p className="mt-1">{components?.length ?? 0} installed components in inventory. <Link className="text-accent underline" href={`/aircraft/${id}/equipment`}>Inspect serial numbers and source records</Link></p>
      {(components ?? []).map((c) => <p key={c.id} className="ml-3">{c.name}{c.make && ` · ${c.make}`}{c.part_number && ` · P/N ${c.part_number}`}{c.serial_number && ` · S/N ${c.serial_number}`}</p>)}
      <h3 className={section}>Engine history</h3>
      {latestCompression ? <p className="mt-2">Latest confirmed compression, {latestCompression.date}: {latestCompression.readings.map((r) => `#${r.cylinder} ${r.psi}/${r.reference}`).join(" · ")}. <Link className="text-accent underline" href={source(id, latestCompression.pageId, latestCompression.entryId)}>Source entry</Link></p> : <p className="mt-2">No confirmed, dated compression readings recognized in the digitized entries.</p>}
      <p>{trends.oilChanges.length} oil-change entries recognized; {trends.oilIntervals.length} comparable intervals. <Link className="text-accent underline" href={`/aircraft/${id}/oil-analysis`}>Inspect engine trends and every source</Link></p>
      <h3 className={section}>Scope and next checks</h3>
      <p className="mt-2">This report summarizes MyTailLog records as of {generated}. Extraction and record-gap checks are imperfect. Unscanned pages, unreviewed text, unlinked AD evidence, and work after the last sync may be absent. Verify against physical logbooks, current AD research, and a qualified pre-buy inspection.</p>
    </article>
  </main>;
}
