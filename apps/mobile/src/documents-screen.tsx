import { useEffect, useState } from "react";
import { getByAircraft } from "./db";
import { localImageSrc } from "./blobs";
import { DOCUMENT_TYPES, documentTypeLabel } from "@/lib/documents";
import type { DocumentType } from "@/lib/database.types";
import type { Aircraft } from "./types";
import { color, text, radius, tint } from "./tokens";
import { ChevronRightIcon } from "./icons";

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
  const match = (d: Doc) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${d.title ?? ""} ${documentTypeLabel(d.type)}`.toLowerCase().includes(q);
  };

  const carry = AROW.map((t) => ({ type: t, doc: all.find((d) => d.type === t) ?? null }));
  const missing = carry.filter((c) => !c.doc).length;
  const rest = all.filter((d) => !AROW.includes(d.type)).filter(match);
  const order = (d: Doc) => DOCUMENT_TYPES.indexOf(d.type);

  return (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search documents"
        style={{
          width: "100%", boxSizing: "border-box", minHeight: 40, marginBottom: 20,
          background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.control,
          padding: "0 13px", color: color.ink, fontFamily: text.rowTitle.fontFamily, fontSize: 13.5,
        }}
      />

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
            {[...rest].sort((a, b) => order(a) - order(b)).map((d) => (
              <div
                key={d.id}
                onClick={() => openDoc(d, onOpenPdf, onZoom)}
                style={{ display: "flex", alignItems: "center", gap: 10, background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.row, padding: 14, cursor: "pointer", minHeight: 44 }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ ...text.rowTitle, fontWeight: 500, color: color.ink, display: "block" }}>
                    {d.title || documentTypeLabel(d.type)}
                  </span>
                  <span style={{ ...text.meta, color: color.faint, display: "block", marginTop: 3 }}>
                    {isPdf(d) ? "PDF" : "Image"}
                    {d.document_date ? ` · added ${addedLabel(d.document_date)}` : ""}
                  </span>
                </span>
                <ChevronRightIcon size={14} color={color.faint} />
              </div>
            ))}
          </div>
        </>
      )}

      {docs?.length === 0 && (
        <p style={{ ...text.secondary, color: color.faint, marginTop: 14 }}>
          No documents in the vault. Upload them on the web app, then sync.
        </p>
      )}
      {!docs && <p style={{ ...text.secondary, color: color.faint, marginTop: 14 }}>Loading…</p>}
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

