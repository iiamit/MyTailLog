// ===========================================================================
// Completeness / gap audit.
//
// Compares what's present in the digitized records against expectations under
// 14 CFR 91.417(b) and flags SUSPECTED gaps — missing annual inspections, gaps
// in the record timeline, and AD-compliance gaps. Everything here is advisory:
// findings say "suspected", because the physical logbooks are the legal record
// and extraction is imperfect. Pure functions over already-loaded data.
// ===========================================================================

export type Severity = "warning" | "info";
export type Finding = {
  category: string;
  severity: Severity;
  title: string;
  detail: string;
};

export type AuditEntry = {
  date: string | null; // YYYY-MM-DD
  text: string; // description + work_performed, lowercased
};

const yearOf = (d: string) => d.slice(0, 4);
const monthsBetween = (a: string, b: string) => {
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  return (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth());
};

/** Entries whose text indicates an annual inspection was performed. */
function annualYears(entries: AuditEntry[]): number[] {
  const years = new Set<number>();
  for (const e of entries) {
    if (!e.date) continue;
    if (/\bannual\b/.test(e.text) && /inspect|complied|performed|due|signed/.test(e.text)) {
      years.add(Number(yearOf(e.date)));
    }
  }
  return [...years].sort((a, b) => a - b);
}

/** Gaps in the annual-inspection chain: consecutive annuals more than ~13
 *  months apart imply one or more missing annuals in between. */
export function auditAnnuals(entries: AuditEntry[]): Finding[] {
  const years = annualYears(entries);
  if (years.length < 2) {
    return years.length === 0
      ? [
          {
            category: "Annual inspections",
            severity: "info",
            title: "No annual inspections detected",
            detail:
              "No annual inspection was recognized in the extracted entries. Confirm annuals are captured, or that pages covering them are digitized.",
          },
        ]
      : [];
  }
  const findings: Finding[] = [];
  for (let i = 1; i < years.length; i++) {
    const gap = years[i] - years[i - 1];
    if (gap > 1) {
      const missing = [];
      for (let y = years[i - 1] + 1; y < years[i]; y++) missing.push(y);
      findings.push({
        category: "Annual inspections",
        severity: "warning",
        title: `Possible missing annual${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
        detail: `An annual was recognized in ${years[i - 1]} and again in ${years[i]}, but none in ${missing.join(", ")}. An annual is required every 12 calendar months (91.409) — the record for ${missing.length > 1 ? "these years" : "this year"} may be missing or not yet digitized.`,
      });
    }
  }
  return findings;
}

/** Gaps in the overall record timeline — long stretches with no entries. */
export function auditContinuity(entries: AuditEntry[]): Finding[] {
  const dated = entries
    .filter((e): e is AuditEntry & { date: string } => !!e.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (dated.length < 2) return [];
  const findings: Finding[] = [];
  const GAP_MONTHS = 24;
  for (let i = 1; i < dated.length; i++) {
    const months = monthsBetween(dated[i - 1].date, dated[i].date);
    if (months >= GAP_MONTHS) {
      const years = Math.round(months / 12);
      findings.push({
        category: "Record continuity",
        severity: "info",
        title: `~${years}-year gap in records (${dated[i - 1].date} → ${dated[i].date})`,
        detail:
          "No entries were recorded for an extended period. This may be normal (little activity) or indicate missing pages between these dates.",
      });
    }
  }
  return findings;
}

export type AdRow = {
  reference: string;
  kind: string;
  recurring: boolean;
  status: string;
  next_due_date: string | null;
  next_due_hours: number | null;
  complied_date: string | null;
};

/** AD-compliance gaps: recurring ADs never complied, or overdue with no newer
 *  compliance record. */
export function auditADs(
  ads: AdRow[],
  currentHours: number | null,
  today = new Date().toISOString().slice(0, 10),
): Finding[] {
  const findings: Finding[] = [];
  for (const ad of ads) {
    if (ad.status === "not_applicable" || ad.status === "superseded") continue;
    const ref = `${ad.kind.toUpperCase()} ${ad.reference}`;
    if (ad.recurring && ad.status === "open" && !ad.complied_date) {
      findings.push({
        category: "Airworthiness Directives",
        severity: "warning",
        title: `${ref}: recurring, no compliance recorded`,
        detail: "This recurring AD is being tracked but has no compliance record. Confirm and record the last compliance.",
      });
      continue;
    }
    const overdueDate = ad.next_due_date && ad.next_due_date < today;
    const overdueHours =
      ad.next_due_hours != null && currentHours != null && ad.next_due_hours <= currentHours;
    if (ad.recurring && (overdueDate || overdueHours)) {
      findings.push({
        category: "Airworthiness Directives",
        severity: "warning",
        title: `${ref}: past next-due with no newer compliance`,
        detail: `Next due ${[ad.next_due_date, ad.next_due_hours != null ? `${ad.next_due_hours} hrs` : null].filter(Boolean).join(" / ")} has passed. Either it's overdue, or a more recent compliance record is missing.`,
      });
    }
  }
  return findings;
}
