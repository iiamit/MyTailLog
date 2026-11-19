import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdCompliance, Database, WeightBalance } from "@/lib/database.types";
import { addDays, computeStatus, fmtDate, type DueItem } from "@/lib/due/engine";
import { loadDueInput } from "@/lib/due/load";
import { BOOK_NAME, buildMapModel, counts, isAnnual, majorLabel, type MapEntryRow, type MapInput, type MapLogbookType, type MapModel } from "@/lib/mapModel";

// ===========================================================================
// The maintenance summary (W-SHARE-04) and the pre-buy dossier (W-SHARE-03) as data: one view model each, built
// from the due engine and the confirmed map, that the screen, the record room and the PDF render all draw from.
// The unconfirmed gate (09 §3.1): only confirmed and signed entries reach either; ai_read entries change nothing
// (test/share-model.test.ts). The builders are pure; loadShareInput does the reads.
// ===========================================================================

export type ShareExtras = {
  aircraft: { tail_number: string; make: string | null; model: string | null; year: number | null; serial_number: string | null; engine_serials: string[]; prop_serials: string[] };
  ownerName: string | null;
  ads: Pick<AdCompliance, "id" | "kind" | "reference" | "title" | "status" | "recurring" | "complied_date" | "complied_hours" | "reference_entry_id">[];
  squawks: { description: string; severity: string | null; reported_at: string | null; reporter_name: string | null; status: string }[];
  components: { name: string; make: string | null; part_number: string | null; serial_number: string | null; install_date: string | null; is_installed: boolean }[];
  wb: Pick<WeightBalance, "revision_date" | "empty_weight" | "empty_weight_arm" | "max_gross_weight"> | null;
};
export type ShareInput = { input: MapInput; today: string; extras: ShareExtras };

const STATUS_WORD: Record<DueItem["status"], string> = { overdue: "Overdue", due_soon: "Due soon", current: "Current", no_record: "No record" };
const AD_WORD: Record<string, string> = {
  open: "Open", complied: "Complied", previously_complied: "Previously complied", not_applicable: "Does not apply", superseded: "Superseded",
};
const SEVERITY_WORD: Record<string, string> = { low: "Low", medium: "Watch", high: "Ground" };
const CODE: Record<string, string> = { Airframe: "AF", Engine: "EN", Propeller: "PR", Avionics: "AV", Other: "OT" };
const h1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "Airframe p. 61" → "AF 61" (W-SHARE-04 page column). */
export const pageCode = (label: string | null) => {
  const m = label?.match(/^(\w+) p\. (\d+)$/);
  return m ? `${CODE[m[1]] ?? m[1].slice(0, 2).toUpperCase()} ${m[2]}` : null;
};

export type SummaryRow = { key: string; label: string; lastDone: string; nextDue: string; left: string; status: string; statusKey: DueItem["status"]; page: string | null };
export type SummaryModel = {
  tail: string;
  title: string;
  generatedOn: string;
  identity: string;
  verdict: string;
  items: SummaryRow[];
  squawksShown: boolean;
  squawks: { reported: string; severity: string; description: string; reporter: string | null }[];
  ads: { reference: string; title: string | null; status: string; complied: string; page: string | null }[];
  equipment: { name: string; make: string | null; partNumber: string | null; serial: string | null }[];
  wb: { revised: string; emptyWeight: number | null; arm: number | null; maxGross: number | null; usefulLoad: number | null; mayBeStale: boolean } | null;
  footer: string;
};

function row(i: DueItem): SummaryRow {
  const last = i.lastDone;
  const lastDone = last?.date || last?.hours != null ? [last.date ? fmtDate(last.date) : null, last.hours != null ? `${h1(last.hours)} h` : null].filter(Boolean).join(" · ") : "No record";
  const nextDue = [i.calendar ? fmtDate(i.calendar.dueDate) : null, i.hours ? `${h1(i.hours.dueAt)} ${i.hours.meter}` : null].filter(Boolean).join(" or ") || "—";
  const left = [
    i.calendar ? (i.calendar.daysLeft < 0 ? `${-i.calendar.daysLeft} days ago` : `${i.calendar.daysLeft} days`) : null,
    i.hours ? (i.hours.remaining < 0 ? `${h1(-i.hours.remaining)} h over` : `${h1(i.hours.remaining)} h`) : null,
  ].filter(Boolean).join(" · ") || "—";
  return { key: i.key, label: i.label, lastDone, nextDue, left, status: STATUS_WORD[i.status], statusKey: i.status, page: pageCode(last?.pageLabel ?? null) ?? (i.source === "document" ? "Docs" : null) };
}

/** A compliance row's proving entry counts only when confirmed or signed; otherwise the AD shows as not yet confirmed. */
function adRows(ads: ShareExtras["ads"], entries: Map<string, MapEntryRow>, cite: (e: MapEntryRow) => string | null) {
  return [...ads].sort((a, b) => (a.reference < b.reference ? -1 : 1)).map((a) => {
    const e = a.reference_entry_id ? entries.get(a.reference_entry_id) : undefined;
    const unconfirmed = a.reference_entry_id && (!e || !counts(e));
    return {
      reference: `${a.kind === "sb" ? "SB" : "AD"} ${a.reference}`, title: a.title,
      status: unconfirmed ? "Proof not yet confirmed" : AD_WORD[a.status] ?? a.status,
      complied: unconfirmed ? "—" : [a.complied_date ? fmtDate(a.complied_date) : null, a.complied_hours != null ? `${h1(a.complied_hours)} h` : null].filter(Boolean).join(" · ") || "—",
      page: e && !unconfirmed ? pageCode(cite(e)) : null,
    };
  });
}

function common(s: ShareInput) {
  const { input, today, extras } = s;
  const status = computeStatus(input, today);
  const pages = new Map((input.page ?? []).map((p) => [p.id, p]));
  const bookType = new Map((input.logbook ?? []).map((b) => [b.id, b.type]));
  const entries = new Map((input.log_entry ?? []).map((e) => [e.id, e]));
  const bookName = (logbookId: string) => BOOK_NAME[bookType.get(logbookId) as MapLogbookType] ?? "Other";
  const cite = (e: MapEntryRow): string | null => {
    const p = e.page_id ? pages.get(e.page_id) : undefined;
    return p?.page_sequence != null ? `${bookName(e.logbook_id)} p. ${p.page_sequence}` : null;
  };
  const a = extras.aircraft;
  const type = [a.year, a.make, a.model].filter(Boolean).join(" ");
  const m = status.meters;
  const meters = [m.tach.face != null ? `tach ${h1(m.tach.face)}` : null, m.hobbs.face != null ? `hobbs ${h1(m.hobbs.face)}` : null, m.airframe.face != null ? `airframe ${h1(m.airframe.face)}` : null].filter(Boolean).join(", ");
  const asOf = [m.tach.asOf, m.hobbs.asOf].filter(Boolean).sort().at(-1) ?? null;
  return { status, entries, cite, bookName, type, meters, asOf };
}

const FOOTER = (tail: string) =>
  `Generated by MyTailLog from an index of ${tail}'s paper logbooks, which remain the legal record under 14 CFR 91.417. This is not an airworthiness determination; check the originals before relying on any value.`;

/** A record room shows squawks only when the owner included them, and who reported them only when asked (0080). */
export function buildSummary(s: ShareInput, opts: { includeSquawks?: boolean; includeReporters?: boolean } = {}): SummaryModel {
  const { extras, today } = s;
  const { status, entries, cite, type, meters, asOf } = common(s);
  const a = extras.aircraft;
  const installed = extras.components.filter((c) => c.is_installed);
  const wb = extras.wb;
  return {
    tail: a.tail_number,
    squawksShown: opts.includeSquawks !== false,
    title: `${a.tail_number} maintenance summary`,
    generatedOn: fmtDate(today),
    identity: [type, a.serial_number ? `S/N ${a.serial_number}` : null, meters ? `${meters}${asOf ? ` (read ${fmtDate(asOf)})` : ""}` : null].filter(Boolean).join(" · "),
    verdict: status.verdict.text,
    items: status.items.map(row),
    squawks: extras.squawks.filter((q) => q.status === "open" && opts.includeSquawks !== false).map((q) => ({
      reported: q.reported_at ? fmtDate(q.reported_at.slice(0, 10)) : "—", severity: SEVERITY_WORD[q.severity ?? ""] ?? "—",
      description: q.description, reporter: opts.includeReporters ? q.reporter_name : null,
    })),
    ads: adRows(extras.ads, entries, cite),
    equipment: installed.map((c) => ({ name: c.name, make: c.make, partNumber: c.part_number, serial: c.serial_number })),
    wb: wb && {
      revised: fmtDate(wb.revision_date), emptyWeight: wb.empty_weight, arm: wb.empty_weight_arm, maxGross: wb.max_gross_weight,
      usefulLoad: wb.empty_weight != null && wb.max_gross_weight != null ? Math.round((wb.max_gross_weight - wb.empty_weight) * 100) / 100 : null,
      // Equipment installed after the last weighing may have changed it.
      mayBeStale: installed.some((c) => c.install_date != null && c.install_date > wb.revision_date),
    },
    footer: FOOTER(a.tail_number),
  };
}

/** The summary as plain text, for "Copy as text" (W-SHARE-04): the same article, one line per row, pages kept. */
export function summaryText(m: SummaryModel): string {
  const out = [m.title, `Generated ${m.generatedOn}`, m.identity, "", m.verdict, "", `Inspections, items and recurring ADs (${m.items.length})`];
  for (const i of m.items) out.push(`- ${i.label}: ${i.status}. Last done ${i.lastDone}; next due ${i.nextDue}${i.left ? ` (${i.left})` : ""}${i.page ? ` [${i.page}]` : ""}`);
  if (m.squawksShown) {
    out.push("", `Open squawks (${m.squawks.length})`);
    for (const q of m.squawks) out.push(`- ${q.reported} · ${q.severity} · ${q.description}${q.reporter ? ` (${q.reporter})` : ""}`);
  }
  out.push("", `ADs (${m.ads.length})`);
  for (const a of m.ads) out.push(`- ${a.reference}${a.title ? ` ${a.title}` : ""}: ${a.status}${a.complied ? `, ${a.complied}` : ""}${a.page ? ` [${a.page}]` : ""}`);
  if (m.wb) out.push("", `Weight and balance: revised ${m.wb.revised}, empty ${m.wb.emptyWeight ?? "—"} lb, useful load ${m.wb.usefulLoad ?? "—"} lb${m.wb.mayBeStale ? " (may be stale)" : ""}`);
  out.push("", "Page column: AF Airframe, EN Engine, PR Propeller, AV Avionics logbook page; Docs a document.", m.footer);
  return out.join("\n");
}

// --- Dossier ------------------------------------------------------------------------

export type Footnote = { n: number; kind: "gap" | "overhaul" | "annual" | "major"; text: string; quote: string | null };
export type DossierModel = {
  tail: string;
  type: string;
  serials: { airframe: string | null; engines: string[]; props: string[] };
  prepared: string;
  asOf: string;
  meters: string;
  map: MapModel;
  /** Footnote numbers drawn on the map: `gap:<id>` or `stop:<id>` → n. */
  marks: Record<string, number>;
  footnotes: Footnote[];
  investigate: { text: string; notes: number[] }[];
  due: SummaryRow[];
  coverage: { logbook: string; pages: number; entries: number; span: string }[];
  unconfirmedPages: number;
  engine: { lastOverhaul: string | null; since: string | null; tbo: string | null; oil: string | null };
  prop: { lastOverhaul: string | null; since: string | null; tbo: string | null };
  ads: SummaryModel["ads"];
  alterations: { date: string; text: string; page: string | null }[];
  equipment: SummaryModel["equipment"];
  notCovered: string[];
  footer: string;
  empty: boolean;
};

const clip = (s: string, n = 180) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(" ", n - 1) > 0 ? s.lastIndexOf(" ", n - 1) : n - 1)} …`);
const year = (d: string) => d.slice(0, 4);

export function buildDossier(s: ShareInput, opts: { preparedFor?: string | null } = {}): DossierModel {
  const { input, today, extras } = s;
  const { status, cite, bookName, type, meters, asOf } = common(s);
  const a = extras.aircraft;
  // The dossier's map is confirmed entries only (W-SHARE-03); unconfirmed stops are not drawn at all.
  const confirmed = (input.log_entry ?? []).filter(counts);
  const map = buildMapModel({ ...input, log_entry: confirmed }, today);
  const byId = new Map(confirmed.map((e) => [e.id, e]));
  const lineName = new Map(map.lines.map((l) => [l.lineId, l.name]));

  const marks: Record<string, number> = {};
  const footnotes: Footnote[] = [];
  // Older rows have no entry_kind: "Major work" whose text says overhaul is the book's overhaul.
  const majorName = (e: MapEntryRow): string | null => {
    const l = majorLabel(e);
    if (l !== "Major work" || !/overhaul/i.test(e.description ?? "")) return l;
    const t = bookType(input, e.logbook_id);
    return t === "engine" ? "Engine overhaul" : t === "prop" ? "Propeller overhaul" : "Overhaul";
  };
  const signer = (e: MapEntryRow) => [e.signature_name, e.mechanic_cert_number].filter(Boolean).join(", ");
  const entryNote = (e: MapEntryRow) => [cite(e) ?? `${bookName(e.logbook_id)} logbook`, e.entry_date ? fmtDate(e.entry_date) : null, signer(e) || null].filter(Boolean).join(", ");

  // Every gap, every major stop and every signed annual gets a number, in date order (10 §13).
  type Mark = { key: string; date: string; kind: Footnote["kind"]; text: string; quote: string | null };
  const pending: Mark[] = [];
  for (const g of map.gaps) {
    const line = map.lines.find((l) => l.lineId === g.lineId);
    const books = new Set(line?.volumes.map((v) => v.id) ?? []);
    const inLine = confirmed.filter((e) => books.has(e.logbook_id) && e.entry_date).sort((x, y) => (x.entry_date! < y.entry_date! ? -1 : 1));
    const before = inLine.filter((e) => e.entry_date! <= g.from).at(-1);
    const after = inLine.find((e) => e.entry_date! >= g.to);
    const why = g.status === "no_pages_exist" ? " The owner says no pages exist for this period." : g.status === "asked_previous_owner" ? " The owner has asked the previous owner." : "";
    pending.push({
      key: `gap:${g.id}`, date: g.from, kind: "gap", quote: null,
      text: `No ${lineName.get(g.lineId) ?? "logbook"} pages from ${fmtDate(g.from)} to ${fmtDate(g.to)}.${why}${before ? ` Last before: ${entryNote(before)}.` : ""}${after ? ` Next after: ${entryNote(after)}.` : ""}`,
    });
  }
  for (const st of map.stops) {
    const es = st.entryIds.map((id) => byId.get(id)).filter((e): e is MapEntryRow => !!e);
    const major = es.find((e) => majorName(e));
    const annual = es.find((e) => e.trust === "signed" && isAnnual(e));
    // Other major stops (a book's first entry, 10 §2) are labelled too (10 §13).
    const e = major ?? annual ?? (st.major ? es[0] : undefined);
    if (!e) continue;
    const label = major ? majorName(major)! : annual ? "Annual inspection" : st.label ?? "First entry";
    pending.push({
      key: `stop:${st.id}`, date: st.date, kind: major ? (/overhaul/i.test(label) ? "overhaul" : "major") : annual ? "annual" : "major",
      text: `${label}: ${entryNote(e)}`, quote: e.description ? clip(e.description) : null,
    });
  }
  pending.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.key < y.key ? -1 : 1)).forEach((m, i) => {
    marks[m.key] = i + 1;
    footnotes.push({ n: i + 1, kind: m.kind, text: m.text, quote: m.quote });
  });

  const investigate: DossierModel["investigate"] = [
    ...map.gaps.filter((g) => g.status !== "no_pages_exist").map((g) => ({
      text: `${lineName.get(g.lineId) ?? "Logbook"} pages are missing from ${year(g.from)} to ${year(g.to)}. Ask where they are.`, notes: [marks[`gap:${g.id}`]],
    })),
    ...status.items.filter((i) => i.status === "overdue").map((i) => ({
      text: i.kind === "engine_tbo" || i.kind === "prop_overhaul" ? `${i.label} is past its advisory interval.` : `${i.label} is overdue${i.firstDate ? ` since ${fmtDate(i.firstDate)}` : ""}.`, notes: [],
    })),
    ...status.items.filter((i) => i.status === "no_record" && i.regulatory).map((i) => ({ text: `No record of the ${i.label.replace(/ \(.*\)$/, "").toLowerCase()} in the confirmed entries.`, notes: [] })),
  ];

  // Records coverage: every book, confirmed entries only; pages whose entries are all unconfirmed are counted apart.
  const countedPages = new Set(confirmed.map((e) => e.page_id).filter(Boolean));
  const unconfirmedPages = new Set((input.log_entry ?? []).filter((e) => !counts(e) && e.page_id && !countedPages.has(e.page_id)).map((e) => e.page_id)).size;
  const order = ["airframe", "engine", "prop", "avionics", "other"];
  const coverage = [...(input.logbook ?? [])].sort((x, y) => order.indexOf(x.type) - order.indexOf(y.type)).map((b) => {
    const es = confirmed.filter((e) => e.logbook_id === b.id);
    const ds = es.map((e) => e.entry_date).filter((d): d is string => !!d).sort();
    return {
      logbook: b.title || bookName(b.id), pages: (input.page ?? []).filter((p) => p.logbook_id === b.id).length, entries: es.length,
      span: ds.length ? `${year(ds[0])} to ${year(ds.at(-1)!)}` : "—",
    };
  });

  const overhaul = (kind: "engine" | "prop") => {
    const re = kind === "engine" ? /engine/i : /prop/i;
    const e = confirmed.filter((x) => { const l = majorName(x); return !!l && /overhaul/i.test(l) && (re.test(l) || bookType(input, x.logbook_id) === kind); })
      .sort((x, y) => ((x.entry_date ?? "") < (y.entry_date ?? "") ? -1 : 1)).at(-1);
    const item = (input.maintenance_item ?? []).find((m) => m.kind === (kind === "engine" ? "engine_tbo" : "prop_overhaul"));
    const now = status.meters.tach.stitched;
    return {
      lastOverhaul: e ? `${e.entry_date ? fmtDate(e.entry_date) : "undated"}${e.tach != null ? ` at tach ${h1(e.tach)}` : ""} (${cite(e) ?? "no page"})` : null,
      since: e?.tach != null && now != null ? `${h1(now - e.tach)} h since overhaul` : null,
      tbo: item ? [item.interval_hours ? `${item.interval_hours.toLocaleString("en-US")} h` : null, item.interval_months ? `${item.interval_months / 12} years` : null].filter(Boolean).join(" or ") + " (advisory)" : null,
    };
  };
  const oil = (input.maintenance_item ?? []).find((m) => m.kind === "oil_change");
  const alterations = confirmed.filter((e) => { const l = majorName(e); return !!l && !/overhaul/i.test(l); })
    .sort((x, y) => ((x.entry_date ?? "") < (y.entry_date ?? "") ? -1 : 1))
    .map((e) => ({ date: e.entry_date ? fmtDate(e.entry_date) : "undated", text: clip(`${majorName(e)}: ${e.description ?? ""}`, 140), page: pageCode(cite(e)) }));
  const summary = buildSummary(s);

  return {
    tail: a.tail_number, type,
    serials: { airframe: a.serial_number, engines: a.engine_serials ?? [], props: a.prop_serials ?? [] },
    prepared: `Prepared ${fmtDate(today)}${extras.ownerName ? ` by ${extras.ownerName}` : ""}${opts.preparedFor ? ` for ${opts.preparedFor}` : ""}`,
    asOf: fmtDate(today),
    meters: meters ? `${meters}${asOf ? `, read ${fmtDate(asOf)}` : ""}` : "No meter reading on file",
    map, marks, footnotes, investigate,
    due: summary.items, coverage, unconfirmedPages,
    engine: { ...overhaul("engine"), oil: oil ? `every ${[oil.interval_hours ? `${oil.interval_hours} h` : null, oil.interval_months ? `${oil.interval_months} months` : null].filter(Boolean).join(" or ")}` : null },
    prop: overhaul("prop"),
    ads: summary.ads, alterations, equipment: summary.equipment,
    notCovered: [
      "The paper logbooks are the legal record (14 CFR 91.417). This dossier indexes them; it does not establish airworthiness or completeness.",
      unconfirmedPages ? `${unconfirmedPages} scanned pages are not yet confirmed by the owner and are not included.` : "Pages not yet scanned or confirmed are not included.",
      "Work that was never written in the logbooks, and the condition of the aircraft today.",
      "Compression readings and oil analysis results, unless they appear in a confirmed entry.",
    ],
    footer: `${a.tail_number} pre-buy dossier · ${fmtDate(today)}`,
    empty: confirmed.length === 0,
  };
}

/**
 * A record room's map tab (W-SHARE-02, 0080 map_window): confirmed entries of the room's logbooks only. The line
 * ahead runs to the annual's due date + 14 days (12 months when unknown); the last five years start 5 years back.
 */
export function roomMap(s: ShareInput, room: { logbook_ids: string[]; map_window: "whole_life" | "line_ahead" | "last_5_years" }): MapModel {
  const { input, today } = s;
  const books = new Set(room.logbook_ids);
  const scoped: MapInput = {
    ...input,
    logbook: (input.logbook ?? []).filter((b) => books.has(b.id)),
    log_entry: (input.log_entry ?? []).filter((e) => books.has(e.logbook_id) && counts(e)),
    page: (input.page ?? []).filter((p) => books.has(p.logbook_id)),
    logbook_gap: (input.logbook_gap ?? []).filter((g) => books.has(g.logbook_id)),
  };
  if (room.map_window === "whole_life") return buildMapModel(scoped, today);
  if (room.map_window === "last_5_years") return buildMapModel(scoped, today, { from: `${Number(today.slice(0, 4)) - 5}${today.slice(4)}` });
  const annual = computeStatus(input, today).items.find((i) => i.kind === "annual")?.calendar?.dueDate;
  const to = annual && annual > today ? addDays(annual, 14) : `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  return buildMapModel(scoped, today, { from: today, to });
}

function bookType(input: MapInput, logbookId: string) {
  return (input.logbook ?? []).find((b) => b.id === logbookId)?.type;
}

/** Everything the builders read, for one aircraft, through whichever client the caller holds (RLS or a room's service client). */
export async function loadShareInput(supabase: SupabaseClient<Database>, aircraftId: string, userId: string): Promise<ShareInput | null> {
  const loaded = await loadDueInput(supabase, aircraftId, userId);
  if (!loaded) return null;
  const [ac, ads, squawks, components, wb] = await Promise.all([
    supabase.from("aircraft").select("tail_number, make, model, year, serial_number, engine_serials, prop_serials, owner_id").eq("id", aircraftId).single(),
    supabase.from("ad_compliance").select("id, kind, reference, title, status, recurring, complied_date, complied_hours, reference_entry_id").eq("aircraft_id", aircraftId),
    supabase.from("squawk").select("description, severity, reported_at, reporter_name, status").eq("aircraft_id", aircraftId).eq("status", "open").order("reported_at", { ascending: false }),
    supabase.from("component").select("name, make, part_number, serial_number, install_date, is_installed").eq("aircraft_id", aircraftId).order("name"),
    supabase.from("weight_balance").select("revision_date, empty_weight, empty_weight_arm, max_gross_weight").eq("aircraft_id", aircraftId).order("revision_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [ac, ads, squawks, components, wb]) if (r.error) throw new Error(r.error.message);
  const { data: owner } = await supabase.from("profile").select("full_name").eq("id", ac.data!.owner_id).maybeSingle();
  return {
    input: loaded.input, today: loaded.today,
    extras: { aircraft: ac.data!, ownerName: owner?.full_name ?? null, ads: ads.data ?? [], squawks: squawks.data ?? [], components: components.data ?? [], wb: wb.data ?? null },
  };
}

