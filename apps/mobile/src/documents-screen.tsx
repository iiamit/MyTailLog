import { useEffect, useState } from "react";
import { getByAircraft } from "./db";
import { localImageSrc } from "./blobs";
import { DOCUMENT_TYPES, documentTypeLabel } from "@/lib/documents";
import type { DocumentType } from "@/lib/database.types";
import type { Aircraft } from "./types";
import { TopBar, Card, dim, faint, ink, mono, panel, panel2, line, accent, amber } from "./ui";

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
  onBack,
  onZoom,
}: {
  aircraft: Aircraft;
  onBack: () => void;
  onZoom: (src: string) => void;
}) {
  const [docs, setDocs] = useState<Doc[] | null>(null);

  useEffect(() => {
    getByAircraft<Doc>("document", aircraft.id).then(setDocs);
  }, [aircraft.id]);

  const arow = (docs ?? []).filter((d) => AROW.includes(d.type));
  const rest = (docs ?? []).filter((d) => !AROW.includes(d.type));
  const order = (d: Doc) => DOCUMENT_TYPES.indexOf(d.type);

  return (
    <>
      <TopBar
        title={`${aircraft.tail_number} · documents`}
        onBack={onBack}
        right={<span style={{ color: faint, fontSize: 12 }}>{docs?.length ?? ""}</span>}
      />

      <Section label="AROW — carry-aboard">
        {AROW.map((t) => {
          const found = arow.filter((d) => d.type === t);
          return found.length > 0 ? (
            found.map((d) => <DocRow key={d.id} doc={d} onZoom={onZoom} />)
          ) : (
            <div
              key={t}
              style={{ background: panel2, border: `1px dashed ${line}`, borderRadius: 10, padding: "10px 12px" }}
            >
              <div style={{ fontSize: 13, color: dim }}>{documentTypeLabel(t)}</div>
              <div style={{ color: amber, fontSize: 11, marginTop: 3 }}>Not in the vault yet</div>
            </div>
          );
        })}
      </Section>

      {rest.length > 0 && (
        <Section label="Everything else">
          {[...rest].sort((a, b) => order(a) - order(b) || (b.document_date ?? "").localeCompare(a.document_date ?? "")).map((d) => (
            <DocRow key={d.id} doc={d} onZoom={onZoom} />
          ))}
        </Section>
      )}

      {docs?.length === 0 && (
        <p style={{ color: faint, fontSize: 13, marginTop: 14 }}>
          No documents in the vault. Upload them on the web app, then Sync.
        </p>
      )}
      {!docs && <p style={{ color: faint, fontSize: 13, marginTop: 14 }}>Loading…</p>}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div style={{ marginTop: 18, color: faint, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>{children}</div>
    </>
  );
}

function DocRow({ doc, onZoom }: { doc: Doc; onZoom: (src: string) => void }) {
  const [state, setState] = useState<"idle" | "opening" | "missing">("idle");
  // PDFs can't go in the lightbox — it renders an <img>. Say so rather than
  // opening a blank sheet on the ramp, which is the worst possible moment.
  const isPdf = (doc.mime_type ?? "").includes("pdf") || (doc.file_name ?? "").toLowerCase().endsWith(".pdf");

  async function open() {
    if (isPdf) return;
    setState("opening");
    const src = await localImageSrc("document", doc.id).catch(() => null);
    setState(src ? "idle" : "missing");
    if (src) onZoom(src);
  }

  return (
    <Card onClick={isPdf ? undefined : open}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: ink }}>
            {doc.title || documentTypeLabel(doc.type)}
          </div>
          <div style={{ ...mono, color: faint, fontSize: 10.5, marginTop: 3 }}>
            {documentTypeLabel(doc.type)}
            {doc.document_date ? ` · ${doc.document_date}` : ""}
            {doc.reference ? ` · ${doc.reference}` : ""}
          </div>
          {state === "missing" && (
            <div style={{ color: amber, fontSize: 11, marginTop: 4 }}>
              Not on device — connect once, or use “Download all”.
            </div>
          )}
          {isPdf && (
            <div style={{ color: faint, fontSize: 10.5, marginTop: 4 }}>PDF — open on the web app</div>
          )}
        </div>
        {!isPdf && <span style={{ color: state === "opening" ? faint : accent, fontSize: 12 }}>{state === "opening" ? "…" : "View"}</span>}
      </div>
    </Card>
  );
}
