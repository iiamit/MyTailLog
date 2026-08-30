import { documentTypeLabel } from "@/lib/documents";
import type { DocumentType } from "@/lib/database.types";

// Matching for the Documents search field, kept free of Capacitor imports so it
// can be unit-tested off-device (apps/mobile has no runner of its own — see
// apps/web/test/mobile-documents-search.test.ts).

export type SearchableDoc = {
  type: DocumentType;
  title: string | null;
  reference: string | null;
  file_name: string | null;
};

/**
 * Every string an owner might plausibly type to find a document.
 *
 * The type LABEL matters as much as the title: most vault documents have no
 * title at all, so the row shows "Registration" — searching for what you can
 * see has to work. `reference` and `file_name` are here because a document is
 * often known by its number or the file it arrived as.
 */
const haystack = (d: SearchableDoc): string =>
  [d.title, documentTypeLabel(d.type), d.reference, d.file_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

/** Every term must appear somewhere, so "reg 2024" finds a 2024 registration. */
export function matchDocument(doc: SearchableDoc, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = haystack(doc);
  return terms.every((t) => hay.includes(t));
}

export function searchDocuments<T extends SearchableDoc>(docs: T[], query: string): T[] {
  return query.trim() === "" ? docs : docs.filter((d) => matchDocument(d, query));
}
