import { useEffect, useState } from "react";
import { getByAircraft } from "./db";
import { localImageSrc } from "./blobs";
import { DOCUMENT_TYPES, documentTypeLabel } from "@/lib/documents";
import type { DocumentType } from "@/lib/database.types";
import type { Aircraft } from "./types";
import { color, text, radius, tint } from "./tokens";
import { ChevronRightIcon } from "./icons";
import { searchDocuments } from "./documents-search";

// The paperwork, offline. The reason this screen exists is the ramp check: an
// inspector asks for AROW and you are standing on a taxiway with no signal.
//
// AROW = Airworthiness certificate, Registration, Operating limitations
// (POH/AFM), Weight & balance. Those four are pinned to the top; everything else
// in the vault follows in the web app's own display order.
const AROW: DocumentType[] = ["airworthiness_cert", "registration", "poh_afm", "weight_balance"];

type Doc = {
  id: string;
  type: DocumentType;
  title: string | null;
  document_date: string | null;
  reference: string | null;
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
};

export function Documents({
  aircraft,
  onZoom,
  onOpenPdf,
}: {
  aircraft: Aircraft;
  onZoom: (src: string) => void;
  onOpenPdf: (doc: { id: string; title: string }) => void;
}) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getByAircraft<Doc>("document", aircraft.id).then(setDocs);
  }, [aircraft.id]);

  const all = docs ?? [];
  const searching = query.trim() !== "";
  const order = (d: Doc) => DOCUMENT_TYPES.indexOf(d.type);
  const byType = (a: Doc, b: Doc) => order(a) - order(b);

  // Searching used to filter ONLY the "Everything else" list, leaving the AROW
  // card untouched — so looking for a registration or an airworthiness
  // certificate, the four documents people reach for most, changed nothing on
  // screen and read as a dead search box. A query now searches the whole vault
  // and returns one flat list; the AROW card is a completeness verdict, not a
  // search result, so it steps aside while you search.
  const results = [...searchDocuments(all, query)].sort(byType);

  const carry = AROW.map((t) => ({ type: t, doc: all.find((d) => d.type === t) ?? null }));
  const missing = carry.filter((c) => !c.doc).length;
  const rest = [...all.filter((d) => !AROW.includes(d.type))].sort(byType);

  return (
    <>
      <div style={{ position: "relative", marginBottom: 20 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Results are live, so there is nothing to submit — but people do
          // press Enter, and it did nothing at all. Dismiss the keyboard so the
          // results it was covering are visible.
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          enterKeyHint="search"
          type="search"
          placeholder="Search documents"
          style={{
            width: "100%", boxSizing: "border-box", minHeight: 44,
            background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.control,
            padding: query ? "0 40px 0 13px" : "0 13px",
            color: color.ink, fontFamily: text.rowTitle.fontFamily,
            // 16px minimum: WKWebView zooms a focused control below it and leaves
            // the app horizontally pannable (see README, and PR #179).
            fontSize: 16,
          }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            style={{
              position: "absolute", right: 0, top: 0, bottom: 0, width: 40,
              background: "transparent", border: "none", color: color.faint,
              fontSize: 18, lineHeight: 1, cursor: "pointer",
            }}
          >
            ×
          </button>
        )}
      </div>

      {searching ? (
        <SearchResults docs={results} onOpenPdf={onOpenPdf} onZoom={onZoom} />
      ) : (
      <>
      {/* Carry aboard — a card with a verdict, not a heading over four rows. */}
      <div style={{ background: color.surface, border: `1px solid ${missing ? color.danger + "3D" : color.success + "3D"}`, borderRadius: radius.card, padding: "15px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...text.cardTitle, color: color.ink }}>Carry aboard</div>
            <div style={{ ...text.meta, color: color.faint, marginTop: 2 }}>AROW — required on every flight</div>
          </div>
          <span style={{
            ...text.chip,
            color: missing ? color.danger : color.success,
            background: missing ? tint.danger : tint.success,
            border: `1px solid ${(missing ? color.danger : color.success)}4D`,
            borderRadius: 6, padding: "4px 8px", whiteSpace: "nowrap",
          }}>
            {missing ? `${missing} MISSING` : "ALL PRESENT"}
          </span>
        </div>

        {carry.map(({ type, doc }) => (
          <div
            key={type}
            onClick={doc ? () => openDoc(doc, onOpenPdf, onZoom) : undefined}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              borderTop: `1px solid ${color.hairline}`, padding: "9px 0", marginTop: 9,
              cursor: doc ? "pointer" : "default", minHeight: 44,
            }}
          >
            <span style={{ ...text.secondary, fontSize: 13.5, color: doc ? color.ink : color.dim, minWidth: 0, flex: 1 }}>
              {documentTypeLabel(type)}
              {!doc && <span style={{ ...text.meta, color: color.warning, display: "block", marginTop: 2 }}>Not in the vault yet</span>}
            </span>
            {doc && <ChevronRightIcon size={14} color={color.faint} />}
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <div style={{ ...text.sectionLabel, color: color.faint, margin: "20px 0 10px" }}>Everything else</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rest.map((d) => (
              <DocRow key={d.id} doc={d} onOpenPdf={onOpenPdf} onZoom={onZoom} />
            ))}
          </div>
        </>
      )}
      </>
      )}

      {docs?.length === 0 && !searching && (
        <p style={{ ...text.secondary, color: color.faint, marginTop: 14 }}>
          No documents in the vault. Upload them on the web app, then sync.
        </p>
      )}
      {!docs && <p style={{ ...text.secondary, color: color.faint, marginTop: 14 }}>Loading…</p>}
    </>
  );
}

/** One tappable document row — shared by the search results and "Everything else". */
function DocRow({
  doc,
  onOpenPdf,
  onZoom,
}: {
  doc: Doc;
  onOpenPdf: (d: { id: string; title: string }) => void;
  onZoom: (src: string) => void;
}) {
  return (
    <div
      onClick={() => openDoc(doc, onOpenPdf, onZoom)}
      style={{ display: "flex", alignItems: "center", gap: 10, background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.row, padding: 14, cursor: "pointer", minHeight: 44 }}
    >
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ ...text.rowTitle, fontWeight: 500, color: color.ink, display: "block" }}>
          {doc.title || documentTypeLabel(doc.type)}
        </span>
        <span style={{ ...text.meta, color: color.faint, display: "block", marginTop: 3 }}>
          {isPdf(doc) ? "PDF" : "Image"}
          {doc.document_date ? ` \u00b7 added ${addedLabel(doc.document_date)}` : ""}
        </span>
      </span>
      <ChevronRightIcon size={14} color={color.faint} />
    </div>
  );
}

/**
 * What a query shows: every matching document in the vault, AROW included.
 *
 * An empty result has to SAY so. Previously a query that matched nothing just
 * removed a section heading, which is indistinguishable from a search that
 * never ran.
 */
function SearchResults({
  docs,
  onOpenPdf,
  onZoom,
}: {
  docs: Doc[];
  onOpenPdf: (d: { id: string; title: string }) => void;
  onZoom: (src: string) => void;
}) {
  if (docs.length === 0) {
    return (
      <p style={{ ...text.secondary, color: color.faint, textAlign: "center", padding: "28px 12px", lineHeight: 1.5 }}>
        Nothing matches that. Try part of a document&apos;s name, its type, or a reference number.
      </p>
    );
  }
  return (
    <>
      <div style={{ ...text.sectionLabel, color: color.faint, marginBottom: 10 }}>
        {docs.length} {docs.length === 1 ? "match" : "matches"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {docs.map((d) => (
          <DocRow key={d.id} doc={d} onOpenPdf={onOpenPdf} onZoom={onZoom} />
        ))}
      </div>
    </>
  );
}

const isPdf = (d: Doc) =>
  (d.mime_type ?? "").includes("pdf") || (d.file_name ?? "").toLowerCase().endsWith(".pdf");

/** "added Mar 2023" — an ISO date is not what an owner reads. */
function addedLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

async function openDoc(
  doc: Doc,
  onOpenPdf: (d: { id: string; title: string }) => void,
  onZoom: (src: string) => void,
) {
  const title = doc.title || documentTypeLabel(doc.type);
  if (isPdf(doc)) {
    onOpenPdf({ id: doc.id, title });
    return;
  }
  const src = await localImageSrc("document", doc.id).catch(() => null);
  if (src) onZoom(src);
}

