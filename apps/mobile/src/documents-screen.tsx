import { useEffect, useRef, useState } from "react";
import { useShortcuts } from "./layout";
import { getByAircraft } from "./db";
import { localImageSrc } from "./blobs";
import { enqueue } from "./mutations";
import { canEdit } from "./actions";
import { DOCUMENT_TYPES, documentTypeLabel } from "@/lib/documents";
import type { DocumentType } from "@/lib/database.types";
import type { Aircraft, LogEntry } from "./types";
import { color, text, radius, tint, hit, accentGradient, alpha } from "./tokens";
import { ChevronRightIcon } from "./icons";
import { searchDocuments } from "./documents-search";
import { shortDate } from "./airworthiness";
import { firstSentence, titleCase } from "./history";
import { DocumentUpload, DropZone, RecordsSheet, SheetLabel } from "./document-upload";
import { listDocumentUploads, drainDocumentUploads, type PendingUpload } from "./blob-upload";

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
  log_entry_id: string | null;
  updated_at: string;
};

export function Documents({
  aircraft,
  onZoom,
  onOpenPdf,
  onChanged,
}: {
  aircraft: Aircraft;
  onZoom: (src: string) => void;
  onOpenPdf: (doc: { id: string; title: string }) => void;
  /** Sync + refresh the counters after a document is queued or uploaded. */
  onChanged?: () => void | Promise<void>;
}) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<File[] | null | undefined>(undefined);
  const [waiting, setWaiting] = useState<PendingUpload[]>([]);
  const [acting, setActing] = useState<Doc | null>(null);
  const editable = canEdit(aircraft.id);
  const searchRef = useRef<HTMLInputElement>(null);
  useShortcuts({ "cmd+f": () => searchRef.current?.focus() });

  async function reload() {
    setDocs(await getByAircraft<Doc>("document", aircraft.id));
    setWaiting(await listDocumentUploads(aircraft.id));
  }

  useEffect(() => {
    reload();
    getByAircraft<LogEntry>("log_entry", aircraft.id).then(setEntries);
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

  const rowProps = { onOpenPdf, onZoom, editable, onActions: setActing };

  return (
    <>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <input
          ref={searchRef}
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

      {/* Adding paperwork: a button on the phone, and the whole list is a drop
          target on an iPad so a PDF can come straight out of Files. */}
      {editable && !searching && (
        <DropZone onFiles={(files) => setAdding(files)}>
          <button
            onClick={() => setAdding(null)}
            style={{
              width: "100%", minHeight: hit.stepper, borderRadius: radius.control, border: "none",
              background: accentGradient, color: color.onAccent,
              fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600, cursor: "pointer",
            }}
          >
            Add a document
          </button>
        </DropZone>
      )}

      {waiting.length > 0 && (
        <WaitingToUpload
          items={waiting}
          onUploaded={async () => { await reload(); await onChanged?.(); }}
        />
      )}

      <div style={{ height: 16 }} />

      {searching ? (
        <SearchResults docs={results} {...rowProps} />
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
            border: `1px solid ${alpha((missing ? color.danger : color.success), "4D")}`,
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
              <DocRow key={d.id} doc={d} {...rowProps} />
            ))}
          </div>
        </>
      )}
      </>
      )}

      {docs?.length === 0 && !searching && waiting.length === 0 && (
        <p style={{ ...text.secondary, color: color.faint, marginTop: 14 }}>
          Nothing in the vault yet. Add the registration and airworthiness certificate and they travel with you.
        </p>
      )}
      {!docs && <p style={{ ...text.secondary, color: color.faint, marginTop: 14 }}>Loading…</p>}

      {adding !== undefined && (
        <DocumentUpload
          aircraft={aircraft}
          initialFiles={adding}
          onClose={() => setAdding(undefined)}
          onUploaded={async () => { await reload(); await onChanged?.(); }}
        />
      )}

      {acting && (
        <DocumentActions
          doc={acting}
          aircraft={aircraft}
          entries={entries}
          onClose={() => setActing(null)}
          onChanged={async (next) => {
            setDocs((cur) => (cur ?? []).map((d) => (d.id === acting.id ? { ...d, ...next } : d)));
            setActing(null);
            await onChanged?.();
          }}
          onDeleted={async () => {
            setDocs((cur) => (cur ?? []).filter((d) => d.id !== acting.id));
            setActing(null);
            await onChanged?.();
          }}
        />
      )}
    </>
  );
}

function WaitingToUpload({
  items, onUploaded,
}: {
  items: PendingUpload[];
  onUploaded: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div
      style={{
        marginTop: 12, background: color.surface, border: `1px dashed ${alpha(color.accent, "66")}`,
        borderRadius: radius.card, padding: "13px 15px",
      }}
    >
      <div style={{ ...text.rowTitle, color: color.ink }}>
        {items.length} document{items.length === 1 ? "" : "s"} saved on this device
      </div>
      <div style={{ ...text.meta, color: color.faint, marginTop: 3, lineHeight: 1.45 }}>
        {items.map((i) => i.fileName).join(", ")} — {items.length === 1 ? "it uploads" : "they upload"} when connected.
      </div>
      <button
        onClick={async () => {
          setBusy("Uploading…");
          await drainDocumentUploads((d, t) => setBusy(`Uploading ${d} of ${t}`));
          setBusy(null);
          await onUploaded();
        }}
        disabled={!!busy}
        style={{
          width: "100%", minHeight: hit.stepper, marginTop: 10, borderRadius: radius.control,
          background: color.surfaceRaised, border: `1px solid ${color.hairline}`, color: color.accent,
          fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: 600,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ?? "Upload now"}
      </button>
    </div>
  );
}

type RowProps = {
  onOpenPdf: (d: { id: string; title: string }) => void;
  onZoom: (src: string) => void;
  editable: boolean;
  onActions: (d: Doc) => void;
};

/** One tappable document row — shared by the search results and "Everything else". */
function DocRow({ doc, onOpenPdf, onZoom, editable, onActions }: { doc: Doc } & RowProps) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.row, minHeight: 44 }}
    >
      <div
        onClick={() => openDoc(doc, onOpenPdf, onZoom)}
        style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1, padding: 14, cursor: "pointer" }}
      >
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ ...text.rowTitle, fontWeight: 500, color: color.ink, display: "block" }}>
            {doc.title || documentTypeLabel(doc.type)}
          </span>
          <span style={{ ...text.meta, color: color.faint, display: "block", marginTop: 3 }}>
            {isPdf(doc) ? "PDF" : "Image"}
            {doc.document_date ? ` · added ${addedLabel(doc.document_date)}` : ""}
            {doc.log_entry_id ? " · attached to an entry" : ""}
          </span>
        </span>
        {!editable && <ChevronRightIcon size={14} color={color.faint} />}
      </div>
      {editable && (
        <button
          onClick={() => onActions(doc)}
          aria-label={`Options for ${doc.title || documentTypeLabel(doc.type)}`}
          style={{
            flex: "none", width: 44, minHeight: 44, background: "transparent", border: "none",
            color: color.faint, fontSize: 17, cursor: "pointer",
          }}
        >
          ⋯
        </button>
      )}
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
function SearchResults({ docs, ...rowProps }: { docs: Doc[] } & RowProps) {
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
          <DocRow key={d.id} doc={d} {...rowProps} />
        ))}
      </div>
    </>
  );
}

/**
 * Attach the document to the maintenance entry it belongs to, detach it, or
 * remove it from the vault.
 *
 * Attaching is what turns a loose 8130-3 into evidence for a particular repair:
 * the entry then carries its paperwork, and the paperwork knows which job it
 * came from.
 */
function DocumentActions({
  doc, aircraft, entries, onClose, onChanged, onDeleted,
}: {
  doc: Doc;
  aircraft: Aircraft;
  entries: LogEntry[];
  onClose: () => void;
  onChanged: (next: Partial<Doc>) => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}) {
  const [entryId, setEntryId] = useState(doc.log_entry_id ?? "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const candidates = [...entries]
    .sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? ""))
    .slice(0, 60);

  async function setEntry() {
    setBusy(true);
    try {
      await enqueue(
        "document.setEntry",
        aircraft.id,
        { documentId: doc.id, entryId: entryId || null },
        { base: doc.updated_at },
      );
      await onChanged({ log_entry_id: entryId || null });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await enqueue("document.delete", aircraft.id, { documentId: doc.id }, { base: doc.updated_at });
      await onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <RecordsSheet title={doc.title || documentTypeLabel(doc.type)} onClose={onClose}>
      <SheetLabel>Which entry does it belong to</SheetLabel>
      <select
        value={entryId}
        onChange={(e) => setEntryId(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box", minHeight: hit.stepper,
          background: color.bg, border: `1px solid ${color.hairline}`, borderRadius: radius.control,
          padding: "0 12px", color: color.ink, fontFamily: text.rowTitle.fontFamily, fontSize: 16,
        }}
      >
        <option value="">Not attached to an entry</option>
        {candidates.map((e) => (
          <option key={e.id} value={e.id}>
            {e.entry_date ? shortDate(e.entry_date) : "undated"} — {entryLabel(e)}
          </option>
        ))}
      </select>

      <button
        onClick={setEntry}
        disabled={busy || entryId === (doc.log_entry_id ?? "")}
        style={{
          width: "100%", minHeight: hit.stepper, marginTop: 12, borderRadius: radius.control, border: "none",
          background: accentGradient, color: color.onAccent,
          fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600,
          opacity: busy || entryId === (doc.log_entry_id ?? "") ? 0.4 : 1,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {entryId ? "Attach to this entry" : "Detach from the entry"}
      </button>

      {confirming ? (
        <div
          style={{
            marginTop: 16, background: tint.danger, border: `1px solid ${alpha(color.danger, "4D")}`,
            borderRadius: radius.card, padding: "12px 14px",
          }}
        >
          <div style={{ ...text.secondary, color: color.ink, lineHeight: 1.45 }}>
            Remove this from the vault for good? The file goes with it.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => setConfirming(false)}
              style={{
                flex: 1, minHeight: hit.stepper, borderRadius: radius.control,
                background: color.surfaceRaised, border: `1px solid ${color.hairline}`, color: color.ink,
                fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Keep it
            </button>
            <button
              onClick={remove}
              disabled={busy}
              style={{
                flex: 1, minHeight: hit.stepper, borderRadius: radius.control, border: "none",
                background: color.danger, color: color.onAccent,
                fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          style={{
            width: "100%", minHeight: hit.min, marginTop: 12, background: "transparent", border: "none",
            color: color.faint, fontFamily: text.rowTitle.fontFamily, fontSize: 13.5, cursor: "pointer",
          }}
        >
          Remove from the vault
        </button>
      )}
    </RecordsSheet>
  );
}

/** "Replaced vacuum pump" — the same wording the history list uses. */
function entryLabel(e: LogEntry): string {
  const source = e.description || e.work_performed || "(no description)";
  return titleCase(firstSentence(source, 52).replace(/[.]$/, ""));
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
