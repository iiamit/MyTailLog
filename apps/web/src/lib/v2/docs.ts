import type { DocumentType } from "@/lib/database.types";
import { DOCUMENT_TYPES } from "@/lib/documents";
import { fmtDate } from "@/lib/due/engine";

export { DOCUMENT_TYPES };

/** W-DOCS-01 category names (12 copy), in `document_type` order. */
export const DOC_LABEL: Record<DocumentType, string> = {
  airworthiness_cert: "Airworthiness certificate",
  registration: "Registration",
  radio_license: "Radio station licence",
  poh_afm: "POH or AFM",
  weight_balance: "Weight and balance",
  stc: "STCs",
  form_337: "Form 337",
  form_8130_3: "Form 8130-3",
  ica: "ICA",
  maintenance_manual: "Maintenance manuals",
  insurance: "Insurance",
  other: "Other",
};

/** Registration and insurance track their expiry by default (W-DOCS-01 Add a document). */
export const TRACKS_BY_DEFAULT: DocumentType[] = ["registration", "insurance"];

export type VaultDoc = {
  id: string;
  type: DocumentType;
  title: string | null;
  file_name: string | null;
  expires_on: string | null;
  track_expiry: boolean;
  document_date: string | null;
};

export const docTitle = (d: Pick<VaultDoc, "title" | "file_name" | "type">) => d.title || d.file_name || DOC_LABEL[d.type];

export type CarryRow = { key: string; label: string; state: string; kind: "current" | "overdue" | "no_record" | "neutral"; docId: string | null; href?: string };

/**
 * The four AROW papers (C-DOCS-02). A paper is on file when a document of its type exists; registration reads its
 * expiry; weight and balance also counts a recorded revision and says "May be stale" after later equipment changes.
 */
export function carryAboard(docs: VaultDoc[], today: string, wb: { hasRevision: boolean; stale: boolean }): CarryRow[] {
  const first = (t: DocumentType) => docs.find((d) => d.type === t) ?? null;
  const onFile = (key: string, label: string, t: DocumentType): CarryRow => {
    const d = first(t);
    return { key, label, state: d ? "On file" : "Not on file", kind: d ? "current" : "no_record", docId: d?.id ?? null };
  };
  const reg = docs.filter((d) => d.type === "registration").sort((a, b) => (b.expires_on ?? "").localeCompare(a.expires_on ?? ""))[0] ?? null;
  const registration: CarryRow = !reg
    ? { key: "registration", label: "Registration", state: "Not on file", kind: "no_record", docId: null }
    : reg.expires_on
      ? reg.expires_on < today
        ? { key: "registration", label: "Registration", state: `Expired ${fmtDate(reg.expires_on)}`, kind: "overdue", docId: reg.id }
        : { key: "registration", label: "Registration", state: `To ${fmtDate(reg.expires_on)}`, kind: "current", docId: reg.id }
      : { key: "registration", label: "Registration", state: "On file, no expiry date", kind: "current", docId: reg.id };
  const wbDoc = first("weight_balance");
  const weight: CarryRow =
    wb.stale && (wbDoc || wb.hasRevision)
      ? { key: "wb", label: "Weight and balance", state: "May be stale", kind: "neutral", docId: wbDoc?.id ?? null, href: "weight-balance" }
      : wbDoc || wb.hasRevision
        ? { key: "wb", label: "Weight and balance", state: "On file", kind: "current", docId: wbDoc?.id ?? null }
        : { key: "wb", label: "Weight and balance", state: "Not on file", kind: "no_record", docId: null };
  return [onFile("aw", "Airworthiness", "airworthiness_cert"), registration, onFile("poh", "Operating handbook", "poh_afm"), weight];
}

/** The verdict's "most useful gap" (W-DOCS-01): a missing carry-aboard paper, then a tracked paper with no date. */
export function docsGap(docs: VaultDoc[], carry: CarryRow[]): string | null {
  const missing = carry.find((r) => r.kind === "no_record");
  if (missing) return `The ${missing.label === "Airworthiness" ? "airworthiness certificate" : missing.label.toLowerCase()} isn't on file yet.`;
  const undated = docs.find((d) => d.track_expiry && !d.expires_on);
  if (undated) return `The ${d0(undated)} has no expiry date on file yet.`;
  const expired = carry.find((r) => r.kind === "overdue");
  if (expired) return `The registration has expired.`;
  return null;
}

const d0 = (d: VaultDoc) => (d.type === "insurance" && !d.title ? "insurance policy" : docTitle(d).toLowerCase() === DOC_LABEL[d.type].toLowerCase() ? DOC_LABEL[d.type].toLowerCase() : docTitle(d));

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Case-insensitive search across title, file name, reference, notes and category. */
export function matchesQuery(d: VaultDoc & { reference: string | null; notes: string | null }, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [d.title, d.file_name, d.reference, d.notes, DOC_LABEL[d.type]].some((v) => v?.toLowerCase().includes(needle));
}
