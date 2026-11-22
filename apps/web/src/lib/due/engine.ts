// ===========================================================================
// Due engine v2 (09 §3.1–3.4, 3.6; 12 §4). Pure: rows in, StatusSnapshot body
// out, no I/O and no clock (callers pass `today`). The Kotlin port in
// apps/core/domain (due/DueEngine.kt) runs the same fixtures
// (packages/shared/fixtures, built by packages/shared/scripts/build-due-fixtures.ts);
// change one, change both and regenerate.
//
// v1 (lib/status.ts) is untouched and still drives the v1 screens.
// Relative imports only: the fixture generator runs this file outside Next.
// ===========================================================================

/** Bump when any rule here changes (09 §2.15 `algo_version`). */
export const ALGO_VERSION = 2;

// --- Input: database row shapes (snake_case, as stored) ---------------------

export type MeterName = "tach" | "hobbs" | "airframe";
export type Trust = "ai_read" | "confirmed" | "signed";

export type AircraftRow = {
  id: string;
  tail_number: string;
  enrollment_date?: string | null;
  enrollment_tach?: number | null;
  enrollment_hobbs?: number | null;
  enrollment_airframe?: number | null;
  expected_hours_per_week?: number | null;
  situation_override?: "preparing_sale" | "in_shop" | null;
  home_base?: string | null;
};
export type MaintenanceItemRow = {
  updated_at?: string;
  id: string;
  kind: string;
  label: string;
  regulatory: boolean;
  interval_months: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  last_done_hours: number | null;
  next_due_date?: string | null;
  next_due_hours?: number | null;
  meter?: MeterName | null;
  line?: string | null;
  provider_id?: string | null;
  ifr_only?: boolean;
  expires_on?: string | null;
  shop_kind?: string | null;
  visit_window_days?: number | null;
  visit_window_hours?: number | null;
};
export type AdComplianceRow = {
  id: string;
  kind: string; // 'ad' | 'sb'
  reference: string;
  recurring: boolean;
  status: string;
  interval_months: number | null;
  interval_hours: number | null;
  complied_date: string | null;
  complied_hours: number | null;
  next_due_date?: string | null;
  next_due_hours?: number | null;
  reference_entry_id?: string | null;
  provider_id?: string | null;
};
export type DocumentRow = {
  id: string;
  type: string;
  title: string | null;
  expires_on: string | null;
  renews_every_months?: number | null;
  track_expiry: boolean;
  remind_lead_days?: number | null;
};
export type ItemCompletionRow = {
  id: string;
  maintenance_item_id: string | null;
  ad_compliance_id: string | null;
  log_entry_id: string | null;
  done_date: string;
  done_hours: number | null;
};
export type LogEntryRow = {
  id: string;
  logbook_id: string;
  page_id?: string | null;
  entry_date: string | null;
  tach?: number | null;
  hobbs?: number | null;
  airframe?: number | null;
  trust: Trust;
  replaced_by_entry_id?: string | null;
  signature_name?: string | null;
  entry_kind?: string | null;
  description?: string | null;
  work_performed?: string | null;
};
export type LogbookRow = { id: string; type: string };
export type PageRow = { id: string; logbook_id: string; page_sequence: number | null; extraction_status?: string };
export type HoursReadingRow = {
  updated_at?: string;
  id: string;
  reading_date: string | null;
  tach: number | null;
  hobbs: number | null;
  airframe?: number | null;
  source: string;
};
export type MeterResetRow = { meter: MeterName; reset_date: string; prior_value: number | null; new_value: number };
export type PlannedVisitRow = {
  updated_at?: string;
  id: string;
  status: string;
  week_of: string;
  visit_date: string | null;
  provider_id: string | null;
  airport?: string | null;
  from_suggestion_key?: string | null;
};
export type PlannedVisitItemRow = { visit_id: string; item_key: string; done_completion_id?: string | null };
export type ServiceProviderRow = { id: string; name: string; kind?: string | null; airport?: string | null; is_default?: boolean };
export type RecordRoomRow = { audience: string; expires_at: string; revoked_at: string | null };
export type SquawkRow = { id: string; description: string; severity: string | null; status: string };

export type DueInput = {
  aircraft: AircraftRow;
  maintenance_item?: MaintenanceItemRow[];
  ad_compliance?: AdComplianceRow[];
  document?: DocumentRow[];
  item_completion?: ItemCompletionRow[];
  log_entry?: LogEntryRow[];
  logbook?: LogbookRow[];
  page?: PageRow[];
  hours_reading?: HoursReadingRow[];
  meter_reset?: MeterResetRow[];
  planned_visit?: PlannedVisitRow[];
  planned_visit_item?: PlannedVisitItemRow[];
  service_provider?: ServiceProviderRow[];
  record_room?: RecordRoomRow[];
  squawk?: SquawkRow[];
  visit_suggestion_dismissal?: { suggestion_key: string }[];
};

// --- Output: API shapes (camelCase, 09 §4.3) --------------------------------

export type DueStatus = "overdue" | "due_soon" | "current" | "no_record";
export type Situation = "setup" | "in_shop" | "preparing_sale" | "annual_month" | "attention" | "all_clear";
export type Basis = "trailing_90" | "trailing_90_hobbs" | "trailing_365" | "owner_estimate" | "none";
export type Confidence = "high" | "medium" | "low" | "none";
export type MeterSource = "manual" | "tach_photo" | "myflightbook" | "entry" | "starting" | "adsb_estimate";

export type MeterView = {
  face: number | null;
  stitched: number | null;
  asOf: string | null;
  source: MeterSource | null;
  readingId: string | null;
};
export type Rate = {
  hoursPerDay: number;
  hoursPerWeek: number;
  basis: Basis;
  meter: "tach" | "hobbs";
  sampleCount: number;
  windowStart: string | null;
  windowEnd: string | null;
  confidence: Confidence;
};
export type DueItem = {
  key: string;
  source: "maintenance" | "ad" | "document";
  kind: string;
  label: string;
  rule: string;
  line: string | null;
  regulatory: boolean;
  advisory: boolean;
  ifrOnly: boolean;
  status: DueStatus;
  calendar: { dueDate: string; daysLeft: number; calendarMonthRule: boolean } | null;
  hours: {
    meter: MeterName;
    dueAt: number;
    remaining: number;
    projectedDate: string | null;
    projectionBasis: Basis;
    estimatedMeter: boolean;
  } | null;
  first: "calendar" | "hours" | null;
  firstDate: string | null;
  lastDone: {
    date: string | null;
    hours: number | null;
    entryId: string | null;
    pageId: string | null;
    pageLabel: string | null;
    trust: Trust | null;
    signer: string | null;
  } | null;
  /** A newer completion sits on an entry still waiting for review (02 §5.8 "Unconfirmed source"). */
  waitingEntryId: string | null;
  providerId: string | null;
  visitId: string | null;
  reminder: { nextAt: string | null; kind: string | null; snoozedUntil: string | null };
};
export type Ring = { itemKey: string; line: string; date: string; dateKind: "calendar" | "projected"; status: DueStatus };
export type VisitStatus = "suggested" | "planned" | "in_shop" | "awaiting_records" | "done" | "cancelled";
/** 09 §4.3 VisitView. Squawks riding along have status "open"; `done` marks an item with a completion at this visit. */
export type VisitView = {
  updatedAt?: string;
  id: string | null;
  suggestionKey: string | null;
  status: VisitStatus;
  weekOf: string;
  visitDate: string | null;
  place: string;
  providerIds: string[];
  items: { key: string; earlyBy: { days?: number; hours?: number } | null; status: DueStatus | "open"; done: boolean }[];
  clearsBeforeLapse: number;
  atRisk: { itemKey: string; firstDate: string }[];
};
/** Status shows 2 suggestions within 12 months; Plan ahead up to 6 within 24 (09 §3.5 step 10). */
export type VisitOptions = { horizonMonths?: number; limit?: number };
export type Verdict = {
  text: string;
  emphasis: [number, number][];
  /** Second lines (12 §4 items 5–7), never merged into the sentence. */
  lines: string[];
};
export type StatusBody = {
  aircraftId: string;
  algoVersion: number;
  today: string;
  situation: Situation;
  verdict: Verdict;
  meters: Record<MeterName, MeterView>;
  rate: Rate;
  items: DueItem[];
  visits: { suggested: VisitView[]; planned: VisitView[] };
  lineAhead: { from: string; to: string; rings: Ring[]; undated: string[] };
  counts: { overdue: number; dueSoon: number; noRecord: number; pagesToReview: number; pagesBeingRead: number; openSquawks: number };
};

// --- Dates (UTC calendar arithmetic on YYYY-MM-DD) --------------------------

const DAY_MS = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(ms(d) + n * DAY_MS);
export const daysBetween = (from: string, to: string) => Math.round((ms(to) - ms(from)) / DAY_MS);

/** Same day of month, `months` later, clamped to month end. */
export function addMonths(d: string, months: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return iso(first.getTime());
}

/** Last day of the month `months` after `d`'s month (14 CFR "calendar months"). */
export function endOfMonthAfter(d: string, months: number): string {
  const [y, m] = d.split("-").map(Number);
  return iso(Date.UTC(y, m - 1 + months + 1, 0));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (d: string) => d.split("-").map(Number);
/** "Dec 31, 2026" (12 §4). */
export const fmtDate = (d: string) => { const [y, m, day] = parts(d); return `${MONTHS[m - 1]} ${day}, ${y}`; };
/** "Sep 2", with the year when it is not `today`'s year. */
const fmtShort = (d: string, today: string) => {
  const [y, m, day] = parts(d);
  return y === parts(today)[0] ? `${MONTHS[m - 1]} ${day}` : `${MONTHS[m - 1]} ${day}, ${y}`;
};
/** 09 §3.3 display granularity: ≤120 days "Dec 12"; ≤540 "Apr 2027"; else "2030". */
export function fmtAbout(d: string, today: string): string {
  const [y, m, day] = parts(d);
  const n = daysBetween(today, d);
  return n <= 120 ? `${MONTHS[m - 1]} ${day}` : n <= 540 ? `${MONTHS[m - 1]} ${y}` : `${y}`;
}

/** Code-unit order (not localeCompare), so Kotlin's String.compareTo agrees. */
const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
const round1 = (x: number) => Math.floor(x * 10 + 0.5) / 10;
const fmt1 = (x: number) => round1(x).toFixed(1);

// --- Rules tables ------------------------------------------------------------

/** 09 §3.2: due at the end of the month (91.409, 91.413, 91.411, 91.207). */
export const CALENDAR_MONTH_KINDS = new Set(["annual", "transponder", "pitot_static", "elt"]);
const DUE_SOON_DAYS = 90;
const DUE_SOON_HOURS = 10;
const VOR_DUE_SOON_DAYS = 5;
const DOC_LEAD_DAYS = 60;
const STALE_METER_DAYS = 30;
const LANES = ["airframe", "engine", "prop", "avionics"];

const NAMES: Record<string, string> = {
  annual: "Annual",
  hundred_hour: "100-hour inspection",
  transponder: "Transponder check",
  pitot_static: "Pitot-static check",
  elt: "ELT inspection",
  elt_battery: "ELT battery",
  vor: "VOR check",
  oil_change: "Oil change",
  engine_tbo: "Engine overhaul",
  prop_overhaul: "Propeller overhaul",
};
const REGS: Record<string, string> = {
  annual: "91.409", hundred_hour: "91.409", transponder: "91.413", pitot_static: "91.411",
  elt: "91.207", elt_battery: "91.207", vor: "91.171",
};
/** 09 §2.3 back-fill defaults, used when `line` is null. */
const DEFAULT_LINE: Record<string, string> = {
  transponder: "avionics", pitot_static: "avionics", elt: "avionics", elt_battery: "avionics", vor: "avionics",
  oil_change: "engine", engine_tbo: "engine", prop_overhaul: "prop",
};
const DOC_NAMES: Record<string, string> = {
  registration: "Registration", airworthiness_cert: "Airworthiness certificate", radio_license: "Radio licence",
  insurance: "Insurance", weight_balance: "Weight and balance", other: "Document",
};
const REGULATORY_DOCS = new Set(["registration", "airworthiness_cert", "radio_license"]);
const BOOK_NAMES: Record<string, string> = { airframe: "Airframe", engine: "Engine", prop: "Propeller", avionics: "Avionics", other: "Other" };

const every = (months: number | null, hours: number | null) => {
  const p: string[] = [];
  if (hours != null) p.push(`${hours} h`);
  if (months != null) p.push(months === 1 ? "month" : `${months} months`);
  return p.length ? `every ${p.join(" or ")}` : null;
};

// --- Meters --------------------------------------------------------------------

type Reading = {
  id: string;
  readingId: string | null;
  date: string | null;
  source: MeterSource;
  raw: Record<MeterName, number | null>;
};
const METERS: MeterName[] = ["tach", "hobbs", "airframe"];
const sourceOf = (s: string): MeterSource =>
  s === "manual" ? "manual" : s === "tach_photo" ? "tach_photo" : "myflightbook";

type Reset = { meter: MeterName; date: string; prior: number; next: number };

/** Fill a missing `prior_value` from the highest reading of the era it ended (hobbsTach.resolvePriors). */
function resolveResets(readings: Reading[], rows: MeterResetRow[]): Reset[] {
  const out: Reset[] = [];
  for (const meter of METERS) {
    const list = rows.filter((r) => r.meter === meter).sort((a, b) => cmp(a.reset_date, b.reset_date));
    list.forEach((r, i) => {
      let prior = r.prior_value;
      if (prior == null) {
        const eraStart = i > 0 ? list[i - 1].reset_date : null;
        let max: number | null = null;
        for (const x of readings) {
          const v = x.raw[meter];
          const d = x.date ?? "";
          if (v == null || d >= r.reset_date || (eraStart != null && d < eraStart)) continue;
          if (max == null || v > max) max = v;
        }
        prior = max ?? 0;
      }
      out.push({ meter, date: r.reset_date, prior, next: r.new_value });
    });
  }
  return out;
}

const offset = (resets: Reset[], meter: MeterName, date: string | null) => {
  let sum = 0;
  for (const r of resets) if (r.meter === meter && (date ?? "") >= r.date) sum += r.prior - r.next;
  return sum;
};
/** A stored scalar (last done hours, a reading) on the continuous stitched scale (09 §3.1). */
const toTotal = (v: number, date: string | null, meter: MeterName, resets: Reset[]) =>
  resets.length ? round1(v + offset(resets, meter, date)) : v;

// --- Rate (09 §3.3) -------------------------------------------------------------

type Util = { hoursPerDay: number; sampleCount: number; spanDays: number; windowStart: string; windowEnd: string };

function ladder(samples: number, span: number): Confidence {
  if (samples >= 6 && span >= 180) return "high";
  if (samples >= 4 && span >= 90) return "medium";
  if (samples >= 2 && span >= 30) return "low";
  return "none";
}

/** utilization.ts utilizationFor with a window length: raw readings, intervals across a reset dropped. */
function utilization(readings: Reading[], resets: Reset[], meter: "tach" | "hobbs", today: string, windowDays: number): Util | null {
  const start = addDays(today, -windowDays);
  const dated = readings
    .filter((r) => r.date != null && r.raw[meter] != null && r.date >= start && r.date <= today)
    .map((r) => ({ date: r.date as string, value: r.raw[meter] as number }))
    .sort((a, b) => cmp(a.date, b.date) || a.value - b.value);
  const pts: { date: string; value: number }[] = [];
  for (const p of dated) {
    if (pts.length && pts[pts.length - 1].date === p.date) pts[pts.length - 1] = p;
    else pts.push(p);
  }
  let hours = 0;
  let days = 0;
  const used = new Set<string>();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (resets.some((r) => r.meter === meter && r.date > a.date && r.date <= b.date)) continue;
    const delta = b.value - a.value;
    if (delta < 0) continue;
    hours += delta;
    days += daysBetween(a.date, b.date);
    used.add(a.date);
    used.add(b.date);
  }
  if (days <= 0 || used.size < 2) return null;
  const sorted = [...used].sort();
  return { hoursPerDay: hours / days, sampleCount: used.size, spanDays: days, windowStart: sorted[0], windowEnd: sorted[sorted.length - 1] };
}

function selectRate(readings: Reading[], resets: Reset[], today: string, perWeek: number | null | undefined): Rate {
  const rate = (u: Util, basis: Basis, meter: "tach" | "hobbs", confidence: Confidence): Rate => ({
    hoursPerDay: u.hoursPerDay,
    hoursPerWeek: round1(u.hoursPerDay * 7),
    basis,
    meter,
    sampleCount: u.sampleCount,
    windowStart: u.windowStart,
    windowEnd: u.windowEnd,
    confidence,
  });
  // Rules 1–2: ≥3 dates over ≥21 days; reported at most `medium`, at least `low` once it qualifies.
  for (const [meter, basis] of [["tach", "trailing_90"], ["hobbs", "trailing_90_hobbs"]] as const) {
    const u = utilization(readings, resets, meter, today, 90);
    if (u && u.sampleCount >= 3 && u.spanDays >= 21 && u.hoursPerDay > 0) {
      const c = ladder(u.sampleCount, u.spanDays);
      return rate(u, basis, meter, c === "high" ? "medium" : c === "none" ? "low" : c);
    }
  }
  // Rule 3: trailing year, tach then hobbs, at confidence ≥ low.
  for (const meter of ["tach", "hobbs"] as const) {
    const u = utilization(readings, resets, meter, today, 365);
    if (u && u.hoursPerDay > 0) {
      const c = ladder(u.sampleCount, u.spanDays);
      if (c !== "none") return rate(u, "trailing_365", meter, c);
    }
  }
  if (perWeek != null && perWeek > 0)
    return { hoursPerDay: perWeek / 7, hoursPerWeek: perWeek, basis: "owner_estimate", meter: "tach", sampleCount: 0, windowStart: null, windowEnd: null, confidence: "low" };
  return { hoursPerDay: 0, hoursPerWeek: 0, basis: "none", meter: "tach", sampleCount: 0, windowStart: null, windowEnd: null, confidence: "none" };
}

// --- Engine ---------------------------------------------------------------------

type LastDone = NonNullable<DueItem["lastDone"]>;

export function computeStatus(input: DueInput, today: string, visitOpts: VisitOptions = {}): StatusBody {
  const a = input.aircraft;
  const entries = input.log_entry ?? [];
  const books = new Map((input.logbook ?? []).map((b) => [b.id, b.type]));
  const pages = new Map((input.page ?? []).map((p) => [p.id, p]));
  const entryById = new Map(entries.map((e) => [e.id, e]));
  // 09 §3.1 the unconfirmed gate: only confirmed/signed, not replaced, entries count.
  const counts = (e: LogEntryRow | undefined) => !!e && e.trust !== "ai_read" && !e.replaced_by_entry_id;

  // Readings: starting values, counting entries, owner/synced readings (never ADS-B estimates).
  const readings: Reading[] = [];
  const pushReading = (r: Reading) => {
    if (r.raw.hobbs != null && r.raw.tach != null && r.raw.hobbs === r.raw.tach) r.raw.hobbs = null; // hobbsTach.normalizeReadings
    if (METERS.some((m) => r.raw[m] != null)) readings.push(r);
  };
  if (a.enrollment_tach != null || a.enrollment_hobbs != null || a.enrollment_airframe != null)
    pushReading({ id: "starting", readingId: null, date: a.enrollment_date ?? null, source: "starting",
      raw: { tach: a.enrollment_tach ?? null, hobbs: a.enrollment_hobbs ?? null, airframe: a.enrollment_airframe ?? null } });
  for (const e of entries)
    if (counts(e))
      pushReading({ id: e.id, readingId: null, date: e.entry_date, source: "entry",
        raw: { tach: e.tach ?? null, hobbs: e.hobbs ?? null, airframe: e.airframe ?? null } });
  for (const r of input.hours_reading ?? [])
    if (!r.source.endsWith("_estimate"))
      pushReading({ id: r.id, readingId: r.id, date: r.reading_date, source: sourceOf(r.source),
        raw: { tach: r.tach, hobbs: r.hobbs, airframe: r.airframe ?? null } });
  const resets = resolveResets(readings, input.meter_reset ?? []);

  const meters = {} as Record<MeterName, MeterView>;
  for (const m of METERS) {
    let best: { r: Reading; total: number } | null = null;
    for (const r of readings) {
      const v = r.raw[m];
      if (v == null) continue;
      const total = toTotal(v, r.date, m, resets);
      const d = r.date ?? "";
      const bd = best?.r.date ?? "";
      if (!best || d > bd || (d === bd && total > best.total)) best = { r, total };
    }
    meters[m] = best
      ? { face: best.r.raw[m], stitched: best.total, asOf: best.r.date, source: best.r.source, readingId: best.r.readingId }
      : { face: null, stitched: null, asOf: null, source: null, readingId: null };
  }
  const rate = selectRate(readings, resets, today, a.expected_hours_per_week);

  // Last done from completions that pass the gate (owner-entered rows with no entry count).
  const completions = input.item_completion ?? [];
  const pageLabel = (pageId: string | null | undefined) => {
    const p = pageId ? pages.get(pageId) : undefined;
    if (!p || p.page_sequence == null) return null;
    return `${BOOK_NAMES[books.get(p.logbook_id) ?? "other"] ?? "Other"} p. ${p.page_sequence}`;
  };
  const fromEntry = (date: string | null, hours: number | null, entryId: string | null): LastDone => {
    const e = entryId ? entryById.get(entryId) : undefined;
    return {
      date, hours,
      entryId: e ? e.id : null,
      pageId: e?.page_id ?? null,
      pageLabel: pageLabel(e?.page_id),
      trust: e ? e.trust : "confirmed",
      signer: e?.signature_name ?? null,
    };
  };
  const sourceFor = (kind: string, line: string, last: LastDone | null): LastDone | null => {
    if (!last?.date || last.entryId) return last;
    const phrases: Record<string, RegExp> = {
      annual: /\bannual(?:\s+(?:inspection|insp))?\b/i,
      hundred_hour: /\b(?:100|one hundred)[-\s]*(?:hour|hr)\b/i,
      oil_change: /\b(?:oil\s+(?:and\s+filter\s+)?(?:change|changed|service|replaced)|(?:changed|replaced)\s+(?:the\s+)?(?:engine\s+)?oil)\b/i,
    };
    const phrase = phrases[kind];
    if (!phrase) return last;
    const matches = entries.filter((e) => e.entry_date === last.date && e.page_id && pages.has(e.page_id) && counts(e) &&
      (e.entry_kind === kind || phrase.test(`${e.description ?? ""} ${e.work_performed ?? ""}`)));
    const onOnePage = (rows: typeof matches) => new Set(rows.map((e) => e.page_id)).size === 1 ? rows[0] : undefined;
    const match = onOnePage(matches) ?? onOnePage(matches.filter((e) => books.get(e.logbook_id) === line));
    return match ? fromEntry(last.date, last.hours, match.id) : last;
  };
  const byLatest = (x: ItemCompletionRow, y: ItemCompletionRow) =>
    cmp(y.done_date, x.done_date) || (y.done_hours ?? -1) - (x.done_hours ?? -1) || cmp(x.id, y.id);
  /** Returns the counted last done (or the parent's columns when the item has no completion rows) and a newer waiting entry. */
  const lastDoneOf = (rows: ItemCompletionRow[], parent: { date: string | null; hours: number | null; entryId: string | null }) => {
    const sorted = [...rows].sort(byLatest);
    const counted = sorted.find((c) => c.log_entry_id == null || counts(entryById.get(c.log_entry_id)));
    const waiting = sorted.find((c) => c.log_entry_id != null && entryById.get(c.log_entry_id)?.trust === "ai_read" &&
      !entryById.get(c.log_entry_id)?.replaced_by_entry_id && (!counted || c.done_date > counted.done_date));
    let last: LastDone | null = null;
    if (counted) last = fromEntry(counted.done_date, counted.done_hours, counted.log_entry_id);
    else if (!rows.length && (parent.date != null || parent.hours != null) &&
      !(parent.entryId && entryById.has(parent.entryId) && !counts(entryById.get(parent.entryId))))
      last = fromEntry(parent.date, parent.hours, parent.entryId && entryById.has(parent.entryId) ? parent.entryId : null);
    return { last, waiting: waiting?.log_entry_id ?? null, hadRows: rows.length > 0 };
  };

  const visitOf = new Map<string, string>();
  const liveVisits = new Map((input.planned_visit ?? []).filter((v) => v.status === "planned" || v.status === "in_shop").map((v) => [v.id, v]));
  for (const vi of input.planned_visit_item ?? []) if (liveVisits.has(vi.visit_id)) visitOf.set(vi.item_key, vi.visit_id);

  type Draft = {
    key: string; source: DueItem["source"]; kind: string; label: string; rule: string; line: string | null;
    regulatory: boolean; ifrOnly: boolean; dueDate: string | null; monthRule: boolean;
    hours: { meter: MeterName; dueAt: number; estimatedMeter: boolean } | null;
    hoursNoMeter: boolean; soonDays: number; lastDone: LastDone | null; waiting: string | null; providerId: string | null;
  };
  const drafts: Draft[] = [];
  const mxItems = input.maintenance_item ?? [];
  const mxLast = new Map(mxItems.map((m) => {
    const result = lastDoneOf(completions.filter((c) => c.maintenance_item_id === m.id),
      { date: m.last_done_date, hours: m.last_done_hours, entryId: null });
    return [m.id, { ...result, last: sourceFor(m.kind, m.line ?? DEFAULT_LINE[m.kind] ?? "airframe", result.last) }] as const;
  }));

  const hoursLimit = (meterChoice: MeterName | null | undefined, kind: string, base: { hours: number; date: string | null } | null, interval: number | null, stored: number | null | undefined) => {
    let meter: MeterName = meterChoice ?? (kind === "oil_change" ? "hobbs" : "tach");
    let estimatedMeter = false;
    // 09 §3.2: hobbs missing → tach (only for the default; an owner's choice stands).
    if (!meterChoice && meter === "hobbs" && meters.hobbs.stitched == null && meters.tach.stitched != null) { meter = "tach"; estimatedMeter = true; }
    let dueAt: number | null = null;
    if (base && interval != null) dueAt = round1(toTotal(base.hours, base.date, meter, resets) + interval);
    else if (!base && stored != null) dueAt = toTotal(stored, null, meter, resets);
    return dueAt == null ? null : { meter, dueAt, estimatedMeter };
  };

  const annual = mxItems.find((m) => m.kind === "annual");
  const annualLast = annual ? mxLast.get(annual.id)!.last : null;
  for (const m of mxItems) {
    const { last, waiting, hadRows } = mxLast.get(m.id)!;
    const useStored = !last && !hadRows; // nothing done on record: an owner-typed next due still counts
    let dueDate: string | null = null;
    let monthRule = false;
    if (m.expires_on) dueDate = m.expires_on;
    else if (last?.date && m.interval_months) {
      if (m.kind === "vor") dueDate = addDays(last.date, 30);
      else if (CALENDAR_MONTH_KINDS.has(m.kind)) { dueDate = endOfMonthAfter(last.date, m.interval_months); monthRule = true; }
      else dueDate = addMonths(last.date, m.interval_months);
    } else if (useStored && m.next_due_date) dueDate = m.next_due_date;
    // 100-hour resets off the later of its own last done and the last annual (maintenance.effectiveNextDue).
    let base = last?.hours != null ? { hours: last.hours, date: last.date } : null;
    if (m.kind === "hundred_hour" && annualLast?.hours != null) {
      const on = m.meter ?? "tach"; // compared on the stitched scale: a meter swap between them must not decide
      if (base == null || toTotal(annualLast.hours, annualLast.date, on, resets) > toTotal(base.hours, base.date, on, resets))
        base = { hours: annualLast.hours, date: annualLast.date };
    }
    const hours = hoursLimit(m.meter, m.kind, base, m.interval_hours, useStored ? m.next_due_hours : null);
    drafts.push({
      key: `mx:${m.id}`, source: "maintenance", kind: m.kind, label: NAMES[m.kind] ?? m.label,
      rule: [REGS[m.kind], m.kind === "vor" && m.interval_months ? "every 30 days" : every(m.interval_months, m.interval_hours),
        m.expires_on && !m.interval_months ? "by expiry date" : null].filter(Boolean).join(" · "),
      line: m.line ?? DEFAULT_LINE[m.kind] ?? "airframe",
      regulatory: m.regulatory, ifrOnly: !!m.ifr_only, dueDate, monthRule, hours,
      hoursNoMeter: !!hours && meters[hours.meter].stitched == null,
      soonDays: m.kind === "vor" ? VOR_DUE_SOON_DAYS : DUE_SOON_DAYS,
      lastDone: last, waiting, providerId: m.provider_id ?? null,
    });
  }

  for (const ad of input.ad_compliance ?? []) {
    if (!(ad.recurring || ad.status === "open")) continue;
    const { last, waiting, hadRows } = lastDoneOf(
      completions.filter((c) => c.ad_compliance_id === ad.id),
      { date: ad.complied_date, hours: ad.complied_hours, entryId: ad.reference_entry_id ?? null });
    const useStored = !last && !hadRows;
    const recurringDone = ad.recurring && last != null;
    const dueDate = recurringDone && last.date && ad.interval_months ? addMonths(last.date, ad.interval_months)
      : useStored || !ad.recurring ? ad.next_due_date ?? null : null;
    const hours = hoursLimit("tach", "ad", recurringDone && last.hours != null ? { hours: last.hours, date: last.date } : null,
      ad.interval_hours, useStored || !ad.recurring ? ad.next_due_hours : null);
    const refEntry = ad.reference_entry_id ? entryById.get(ad.reference_entry_id) : undefined;
    const refBook = refEntry ? books.get(refEntry.logbook_id) : undefined;
    drafts.push({
      key: `ad:${ad.id}`, source: "ad", kind: ad.kind, label: `${ad.kind.toUpperCase()} ${ad.reference}`,
      rule: ad.recurring ? every(ad.interval_months, ad.interval_hours) ?? "recurring" : "once",
      line: refBook && LANES.includes(refBook) ? refBook : "airframe",
      regulatory: ad.kind === "ad", ifrOnly: false, dueDate, monthRule: false, hours,
      hoursNoMeter: !!hours && meters[hours.meter].stitched == null,
      soonDays: DUE_SOON_DAYS, lastDone: last, waiting, providerId: ad.provider_id ?? null,
    });
  }

  for (const d of input.document ?? []) {
    if (!d.track_expiry) continue;
    drafts.push({
      key: `doc:${d.id}`, source: "document", kind: d.type, label: d.title ?? DOC_NAMES[d.type] ?? "Document",
      rule: d.renews_every_months ? `renews every ${d.renews_every_months} months` : "expiry date",
      line: null, regulatory: REGULATORY_DOCS.has(d.type), ifrOnly: false,
      dueDate: d.expires_on, monthRule: false, hours: null, hoursNoMeter: false,
      soonDays: d.remind_lead_days ?? DOC_LEAD_DAYS, lastDone: null, waiting: null, providerId: null,
    });
  }

  const items: DueItem[] = drafts.map((x) => {
    const daysLeft = x.dueDate ? daysBetween(today, x.dueDate) : null;
    const cur = x.hours ? meters[x.hours.meter].stitched : null;
    const remaining = x.hours && cur != null ? round1(x.hours.dueAt - cur) : null;
    let status: DueStatus;
    if ((daysLeft != null && daysLeft < 0) || (remaining != null && remaining <= 0)) status = "overdue";
    else if ((daysLeft != null && daysLeft <= x.soonDays) || (remaining != null && remaining <= DUE_SOON_HOURS)) status = "due_soon";
    else if ((daysLeft == null && remaining == null) || x.hoursNoMeter) status = "no_record";
    else status = "current";

    const projectedDate = remaining != null && remaining > 0 && rate.basis !== "none"
      ? addDays(today, Math.ceil(remaining / rate.hoursPerDay)) : null;
    const hoursDate = remaining == null ? null : remaining <= 0 ? today : projectedDate;
    let first: DueItem["first"] = null;
    let firstDate: string | null = null;
    if (x.dueDate && remaining != null) {
      first = hoursDate == null ? (remaining <= DUE_SOON_HOURS ? "hours" : "calendar") : x.dueDate <= hoursDate ? "calendar" : "hours";
      firstDate = first === "calendar" ? x.dueDate : hoursDate;
    } else if (x.dueDate) { first = "calendar"; firstDate = x.dueDate; }
    else if (remaining != null) { first = "hours"; firstDate = hoursDate; }
    if (status === "no_record") { first = x.dueDate ? "calendar" : null; firstDate = x.dueDate; }

    return {
      key: x.key, source: x.source, kind: x.kind, label: x.label, rule: x.rule, line: x.line,
      regulatory: x.regulatory, advisory: !x.regulatory, ifrOnly: x.ifrOnly, status,
      calendar: x.dueDate ? { dueDate: x.dueDate, daysLeft: daysLeft as number, calendarMonthRule: x.monthRule } : null,
      hours: x.hours && remaining != null ? {
        meter: x.hours.meter, dueAt: x.hours.dueAt, remaining, projectedDate,
        projectionBasis: rate.basis, estimatedMeter: x.hours.estimatedMeter,
      } : null,
      first, firstDate, lastDone: x.lastDone, waitingEntryId: x.waiting, providerId: x.providerId,
      visitId: visitOf.get(x.key) ?? null,
      reminder: { nextAt: null, kind: null, snoozedUntil: null },
    };
  });
  const RANK: Record<DueStatus, number> = { overdue: 0, due_soon: 1, current: 2, no_record: 3 };
  items.sort((p, q) => RANK[p.status] - RANK[q.status] ||
    cmp(p.firstDate ?? "9999", q.firstDate ?? "9999") || cmp(p.key, q.key));

  // --- Situation (09 §3.6) ---
  const annualItem = annual ? items.find((i) => i.key === `mx:${annual.id}`) : undefined;
  const ready = !!annualLast?.date && (meters.tach.stitched != null || meters.hobbs.stitched != null);
  const shopVisit = (input.planned_visit ?? []).find((v) => v.status === "in_shop");
  const buyerRoom = (input.record_room ?? [])
    .filter((r) => r.audience === "buyer" && !r.revoked_at && r.expires_at.slice(0, 10) >= today)
    .sort((p, q) => cmp(q.expires_at, p.expires_at))[0];
  const anyAlert = items.some((i) => i.status === "overdue" || i.status === "due_soon");
  const situation: Situation = !ready ? "setup"
    : a.situation_override === "in_shop" || shopVisit ? "in_shop"
    : a.situation_override === "preparing_sale" || buyerRoom ? "preparing_sale"
    : annualItem?.calendar && annualItem.status !== "overdue" && annualItem.calendar.daysLeft <= 60 ? "annual_month"
    : anyAlert ? "attention" : "all_clear";

  // --- Line ahead (09 §3.4) ---
  const to = situation === "setup" ? today : situation === "in_shop" || situation === "annual_month" ? addDays(today, 60) : addMonths(today, 12);
  const rings: Ring[] = [];
  const undated: string[] = [];
  if (situation !== "setup")
    for (const i of items) {
      if (i.source === "document" || !i.line) continue;
      if (!i.firstDate || i.status === "no_record") { undated.push(i.key); continue; }
      const date = i.status === "overdue" ? today : i.firstDate;
      if (date <= to) rings.push({ itemKey: i.key, line: i.line, date, dateKind: i.first === "hours" ? "projected" : "calendar", status: i.status });
    }

  const waitingEntries = entries.filter((e) => e.trust === "ai_read" && !e.replaced_by_entry_id);
  const openSquawks = (input.squawk ?? []).filter((s) => s.status !== "resolved");
  const verdict = composeVerdict({
    situation, items, today, tail: a.tail_number, meters, shopVisit,
    providers: input.service_provider ?? [], visitItems: input.planned_visit_item ?? [], buyerRoom,
    annualItem, waiting: waitingEntries.length, groundSquawks: openSquawks.filter((s) => s.severity === "high"),
  });

  return {
    aircraftId: a.id,
    algoVersion: ALGO_VERSION,
    today,
    situation,
    verdict,
    meters,
    rate,
    items,
    visits: computeVisits(input, items, rate, today, visitOpts),
    lineAhead: { from: today, to, rings, undated },
    counts: {
      overdue: items.filter((i) => i.status === "overdue").length,
      dueSoon: items.filter((i) => i.status === "due_soon").length,
      noRecord: items.filter((i) => i.status === "no_record").length,
      pagesToReview: new Set(waitingEntries.map((e) => e.page_id).filter(Boolean)).size,
      pagesBeingRead: (input.page ?? []).filter((p) => ["pending", "queued", "processing", "waiting_allowance"].includes(p.extraction_status ?? "")).length,
      openSquawks: openSquawks.length,
    },
  };
}

// --- Visits (09 §3.5 suggested, §4.3 VisitView) ------------------------------------

/** 09 §2.3 back-fill defaults for `shop_kind`, used when it is null. */
const DEFAULT_SHOP: Record<string, string> = {
  transponder: "avionics_shop", pitot_static: "avionics_shop", vor: "self", engine_tbo: "engine_shop", prop_overhaul: "prop_shop",
};
const NEVER_BUNDLED = new Set(["engine_tbo", "prop_overhaul"]);
const VISIT_WINDOW_DAYS = 60;
const VISIT_WINDOW_HOURS = 25;
const LIVE_VISIT = new Set(["planned", "in_shop", "awaiting_records"]);

/** ISO weekday, Monday 1 … Sunday 7. */
const isoDow = (d: string) => ((new Date(ms(d)).getUTCDay() + 6) % 7) + 1;
const mondayOnOrBefore = (d: string) => addDays(d, 1 - isoDow(d));
const mondayOnOrAfter = (d: string) => addDays(d, (8 - isoDow(d)) % 7);

/** SHA-1 of a UTF-8 string, lowercase hex. Pure (the engine also runs in the browser, so no node:crypto). */
export function sha1Hex(text: string): string {
  const msg = new TextEncoder().encode(text);
  const len = Math.ceil((msg.length + 9) / 64) * 64;
  const buf = new Uint8Array(len);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(len - 4, (msg.length * 8) >>> 0);
  view.setUint32(len - 8, Math.floor((msg.length * 8) / 2 ** 32));
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  const rol = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  for (let o = 0; o < len; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(o + 4 * i);
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1]
        : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
      const t = (rol(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rol(b, 30) >>> 0; b = a; a = t;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0; h[4] = (h[4] + e) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

/** `sha1(place + '|' + sorted(item_keys).join(',') + '|' + M)`, first 16 hex (09 §3.5). */
export const suggestionKey = (place: string, itemKeys: string[], weekOf: string) =>
  sha1Hex(`${place}|${[...itemKeys].sort(cmp).join(",")}|${weekOf}`).slice(0, 16);

type VisitItem = VisitView["items"][number];

function computeVisits(input: DueInput, items: DueItem[], rate: Rate, today: string, opts: VisitOptions): StatusBody["visits"] {
  const providers = input.service_provider ?? [];
  const providerById = new Map(providers.map((p) => [p.id, p]));
  const mxById = new Map((input.maintenance_item ?? []).map((m) => [m.id, m]));
  const byKey = new Map(items.map((i) => [i.key, i]));
  const home = input.aircraft.home_base?.trim().toUpperCase() || "home";
  const mxOf = (i: DueItem) => (i.source === "maintenance" ? mxById.get(i.key.slice(3)) : undefined);
  const shopKind = (i: DueItem) => mxOf(i)?.shop_kind ?? DEFAULT_SHOP[i.kind] ?? "mechanic";
  /** item provider → the default provider for its kind → none (09 §3.5 "Groups by place"). */
  const providerOf = (i: DueItem) => (i.providerId ? providerById.get(i.providerId) : undefined)
    ?? providers.find((p) => p.is_default && p.kind === shopKind(i));
  const placeOf = (p: ServiceProviderRow | undefined) => p?.airport?.trim().toUpperCase() || home;
  const flown = (to: string) => rate.hoursPerDay * Math.max(0, daysBetween(today, to));
  const early = (i: DueItem, weekOf: string): VisitItem["earlyBy"] => {
    if (i.status === "overdue" || !i.firstDate) return null;
    const at = addDays(weekOf, 2);
    if (i.first === "hours" && i.hours) {
      const h = Math.floor(i.hours.remaining - flown(at) + 0.5);
      return h > 0 ? { hours: h } : null;
    }
    const d = daysBetween(at, i.firstDate);
    return d > 0 ? { days: d } : null;
  };
  const view = (v: { updatedAt?: string; id: string | null; key: string | null; status: VisitStatus; weekOf: string; visitDate: string | null; place: string;
    providerIds: (string | null | undefined)[]; members: { key: string; item?: DueItem; done: boolean }[] }): VisitView => {
    const due = v.members.filter((m) => m.item && !m.done && m.item.status !== "overdue");
    return {
      ...(v.updatedAt ? { updatedAt: v.updatedAt } : {}),
      id: v.id, suggestionKey: v.key, status: v.status, weekOf: v.weekOf, visitDate: v.visitDate, place: v.place,
      providerIds: [...new Set(v.providerIds.filter((p): p is string => !!p))],
      items: v.members.map((m) => ({
        key: m.key, earlyBy: m.item && !m.done ? early(m.item, v.weekOf) : null,
        status: m.item ? m.item.status : m.key.startsWith("squawk:") ? "open" : "no_record", done: m.done,
      })),
      clearsBeforeLapse: due.length,
      atRisk: due.filter((m) => m.item!.firstDate! < v.weekOf).map((m) => ({ itemKey: m.key, firstDate: m.item!.firstDate! })),
    };
  };

  // Planned: every visit not yet done or cancelled, earliest week first.
  const planned = (input.planned_visit ?? []).filter((v) => LIVE_VISIT.has(v.status))
    .sort((p, q) => cmp(p.week_of, q.week_of) || cmp(p.id, q.id))
    .map((v) => {
      const rows = (input.planned_visit_item ?? []).filter((x) => x.visit_id === v.id).sort((p, q) => cmp(p.item_key, q.item_key));
      const members = rows.map((x) => ({ key: x.item_key, item: byKey.get(x.item_key), done: !!x.done_completion_id }));
      const own = v.provider_id ? providerById.get(v.provider_id) : undefined;
      return view({
        updatedAt: v.updated_at, id: v.id, key: v.from_suggestion_key ?? null, status: v.status as VisitStatus, weekOf: v.week_of, visitDate: v.visit_date,
        place: own?.airport?.trim().toUpperCase() || v.airport?.trim().toUpperCase() || home,
        providerIds: [v.provider_id, ...members.map((m) => (m.item ? providerOf(m.item)?.id : null))], members,
      });
    });

  // Suggested (09 §3.5): computed, never stored.
  const horizon = addMonths(today, opts.horizonMonths ?? 12);
  const limit = opts.limit ?? 2;
  const cands = items.filter((i) => i.source !== "document" && i.status !== "no_record" && i.firstDate != null &&
    i.firstDate <= horizon && !NEVER_BUNDLED.has(i.kind) && !i.visitId);
  const shops = cands.filter((i) => shopKind(i) !== "self").sort((p, q) => cmp(p.firstDate!, q.firstDate!) || cmp(p.key, q.key));
  const selfs = cands.filter((i) => shopKind(i) === "self").sort((p, q) => cmp(p.firstDate!, q.firstDate!) || cmp(p.key, q.key));
  const inLiveVisit = new Set((input.planned_visit_item ?? [])
    .filter((x) => (input.planned_visit ?? []).some((v) => v.id === x.visit_id && (v.status === "planned" || v.status === "in_shop")))
    .map((x) => x.item_key));
  const squawks = (input.squawk ?? []).filter((s) => s.status !== "resolved" && (s.severity === "medium" || s.severity === "high") &&
    !inLiveVisit.has(`squawk:${s.id}`)).map((s) => `squawk:${s.id}`).sort(cmp);
  const nextMonday = mondayOnOrAfter(addDays(today, 1));
  const used = new Set<string>();
  const groups: { place: string; weekOf: string; members: DueItem[]; squawks: string[] }[] = [];
  for (const a of shops) {
    if (used.has(a.key)) continue;
    const place = placeOf(providerOf(a));
    const anchor = a.status === "overdue" ? today : a.firstDate!;
    const members: DueItem[] = [];
    for (const b of shops) {
      if (used.has(b.key) || placeOf(providerOf(b)) !== place) continue;
      const mx = mxOf(b);
      const inDays = b.firstDate! <= addDays(anchor, mx?.visit_window_days ?? VISIT_WINDOW_DAYS);
      // shortcut: hours flown are counted to the anchor date (the visit week is not known until the group is), 09 §3.5 step 3.
      // Count them to the visit week if an owner flying heavily sees an hours item left out of a visit it fits.
      const inHours = !!b.hours && b.hours.remaining - flown(anchor) <= (mx?.visit_window_hours ?? VISIT_WINDOW_HOURS);
      if (b === a || inDays || inHours) { members.push(b); used.add(b.key); }
    }
    const soonest = members.filter((m) => m.status !== "overdue").map((m) => m.firstDate!).sort(cmp)[0];
    let weekOf: string;
    if (members.some((m) => m.status === "overdue")) weekOf = mondayOnOrAfter(addDays(today, 2));
    else {
      weekOf = mondayOnOrBefore(addDays(soonest, -5));
      if (weekOf < nextMonday) weekOf = nextMonday;
    }
    for (const s of selfs)
      if (!used.has(s.key) && (s.status === "overdue" || s.firstDate! <= addDays(weekOf, 34))) { members.push(s); used.add(s.key); }
    groups.push({ place, weekOf, members, squawks: groups.length ? [] : squawks });
  }
  const dismissed = new Set((input.visit_suggestion_dismissal ?? []).map((d) => d.suggestion_key));
  const suggested = groups
    .filter((g) => g.members.length + g.squawks.length >= 2)
    .map((g) => ({ g, key: suggestionKey(g.place, [...g.members.map((m) => m.key), ...g.squawks], g.weekOf) }))
    .filter(({ key }) => !dismissed.has(key))
    .slice(0, limit)
    .map(({ g, key }) => view({
      id: null, key, status: "suggested", weekOf: g.weekOf, visitDate: null, place: g.place,
      providerIds: g.members.map((m) => providerOf(m)?.id),
      members: [...g.members.map((m) => ({ key: m.key, item: m, done: false })), ...g.squawks.map((k) => ({ key: k, done: false }))],
    }));
  return { suggested, planned };
}

// --- Verdict (12 §4) -----------------------------------------------------------

/** "annual", "oil change" in mid-sentence; acronyms ("ELT", "VOR", "AD") keep their case. */
const mid = (label: string) => (label.length > 1 && label[1] === label[1].toLowerCase() && label[1] !== label[1].toUpperCase()
  ? label[0].toLowerCase() + label.slice(1) : label);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (xs: string[]) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

function composeVerdict(c: {
  situation: Situation; items: DueItem[]; today: string; tail: string; meters: Record<MeterName, MeterView>;
  shopVisit: PlannedVisitRow | undefined; providers: ServiceProviderRow[]; visitItems: PlannedVisitItemRow[];
  buyerRoom: RecordRoomRow | undefined; annualItem: DueItem | undefined; waiting: number; groundSquawks: SquawkRow[];
}): Verdict {
  const { items, today } = c;
  let text = "";
  let bold = "";
  const dated = items.filter((i) => i.status !== "no_record" && i.firstDate);
  // The verdict never leads with an advisory item unless it is overdue (09 §3.2).
  const next = (pool: DueItem[]) => pool.find((i) => i.regulatory) ?? pool[0];
  const when = (i: DueItem) => i.first === "hours"
    ? (i.hours!.projectedDate ? `about ${fmtAbout(i.hours!.projectedDate, today)}` : `in about ${fmt1(i.hours!.remaining)} hours`)
    : fmtDate(i.calendar!.dueDate);
  const soonWhen = (i: DueItem) => i.first === "hours" ? `in about ${fmt1(i.hours!.remaining)} hours`
    : i.calendar!.daysLeft === 0 ? "today" : `in ${plural(i.calendar!.daysLeft, "day", "days")}`;
  const nextSentence = (i: DueItem, soon: boolean) =>
    soon ? `Next: ${mid(i.label)} ${soonWhen(i)}.` : `Next: ${mid(i.label)}, ${when(i)}.`;

  const fallback = () => {
    const overdue = items.filter((i) => i.status === "overdue");
    const soon = items.filter((i) => i.status === "due_soon");
    if (overdue.length === 1) {
      const i = overdue[0];
      const ago = i.calendar && i.calendar.daysLeft < 0
        ? `${plural(-i.calendar.daysLeft, "day", "days")} ago`
        : `${fmt1(-i.hours!.remaining)} hours ago`;
      if (i.ifrOnly) { bold = "1 item has lapsed"; text = `${bold}: ${i.label}, ${ago} (IFR only).`; }
      else { bold = "1 item is overdue"; text = `${bold}: ${i.label} lapsed ${ago}.`; }
    } else if (overdue.length > 1) {
      bold = `${overdue.length} items are overdue`; text = `${bold}.`;
    } else if (soon.length) {
      bold = "Nothing tracked is overdue"; text = `${bold}. ${nextSentence(next(soon), true)}`;
    } else {
      const i = next(dated);
      if (i && i.firstDate! <= addDays(today, DUE_SOON_DAYS)) { bold = "Nothing tracked is overdue"; text = `${bold}. ${nextSentence(i, false)}`; }
      else { bold = "Nothing tracked is due in the next 90 days"; text = i ? `${bold}. ${nextSentence(i, false)}` : `${bold}.`; }
    }
  };

  if (c.situation === "setup") {
    text = "Nothing to show yet. Scan or add your logbooks to see what's due.";
  } else if (c.situation === "in_shop" && c.shopVisit) {
    const v = c.shopVisit;
    const where = c.providers.find((p) => p.id === v.provider_id)?.name ?? v.airport ?? null;
    const labels = c.visitItems.filter((x) => x.visit_id === v.id)
      .map((x) => items.find((i) => i.key === x.item_key)).filter((i): i is DueItem => !!i).map((i) => mid(i.label));
    if (where && labels.length) {
      bold = `${c.tail} is at ${where}`;
      text = `${bold} for ${list(labels)}, since ${fmtDate(v.visit_date ?? v.week_of)}.`;
    } else fallback();
  } else if (c.situation === "preparing_sale" && c.buyerRoom) {
    const until = c.buyerRoom.expires_at.slice(0, 10);
    const n = dated.filter((i) => i.firstDate! <= until).length;
    bold = `A buyer's record room is open until ${fmtDate(until)}`;
    text = `${bold}. ${n === 1 ? "1 item is" : `${n} items are`} due before then.`;
  } else if (c.situation === "annual_month" && c.annualItem?.calendar) {
    const due = c.annualItem.calendar.dueDate;
    const n = dated.filter((i) => i.key !== c.annualItem!.key && i.source !== "document" && i.firstDate! <= due).length;
    bold = `The annual is due by ${fmtDate(due)}`;
    text = n ? `${bold}. ${n === 1 ? "1 item can" : `${n} items can`} ride along.` : `${bold}.`;
  } else fallback();

  const lines: string[] = [];
  if (c.waiting === 1) lines.push("1 entry read by AI is waiting for you. It doesn't count until you confirm it.");
  else if (c.waiting > 1) lines.push(`${c.waiting} entries read by AI are waiting for you. They don't count until you confirm them.`);
  if (c.situation !== "setup") {
    const used = new Set(items.map((i) => i.hours?.meter).filter(Boolean));
    const stale = (["tach", "hobbs", "airframe"] as MeterName[])
      .find((m) => used.has(m) && c.meters[m].asOf && daysBetween(c.meters[m].asOf!, today) > STALE_METER_DAYS);
    if (stale) lines.push(`Hours are from your last ${stale} reading on ${fmtShort(c.meters[stale].asOf!, today)}. Log a flight to update.`);
  }
  for (const s of c.groundSquawks) lines.push(`A squawk is marked Ground: ${s.description.replace(/\.+$/, "")}.`);

  const at = bold ? text.indexOf(bold) : -1;
  return { text, emphasis: at >= 0 ? [[at, at + bold.length]] : [], lines };
}
