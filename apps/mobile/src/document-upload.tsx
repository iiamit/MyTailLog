import { useEffect, useRef, useState, type ReactNode } from "react";
import { DOCUMENT_TYPES, documentTypeLabel } from "@/lib/documents";
import type { DocumentType } from "@/lib/database.types";
import { scanPages } from "./capture";
import {
  queueDocumentUpload,
  drainDocumentUploads,
  downscaleImage,
  fileToBase64,
  type PendingUpload,
} from "./blob-upload";
import { ACCEPT_ATTR, fileSizeLabel, validateDocument } from "./document-validate";
import type { Aircraft } from "./types";
import { useDropFiles } from "./layout";
import { color, text, radius, hit, display, accentGradient, alpha } from "./tokens";
import { CameraIcon } from "./icons";

// Adding paperwork from the aircraft rather than from a desk: pick a file out of
// Files or iCloud, drag one in on an iPad, or photograph it with Apple's own
// document scanner. Everything is held on the device first (blob-upload.ts) and
// uploaded when there's signal — the same promise scanning already makes.

type Staged = {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  base64: string;
};

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

/** Photographs are re-encoded as JPEG, so the name has to follow. */
function jpegName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.jpg`;
}

export function DocumentUpload({
  aircraft,
  /** Set when the upload is being made from a log entry — attaches on arrival. */
  entryId = null,
  initialType = "other",
  /** Files already chosen elsewhere — dropped onto the list, typically. */
  initialFiles = null,
  onClose,
  onUploaded,
}: {
  aircraft: Aircraft;
  entryId?: string | null;
  initialType?: DocumentType;
  initialFiles?: File[] | null;
  onClose: () => void;
  onUploaded?: () => void | Promise<void>;
}) {
  const [staged, setStaged] = useState<Staged[]>([]);
  const [type, setType] = useState<DocumentType>(initialType);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const tookInitial = useRef(false);

  async function take(files: File[]) {
    setError(null);
    const next: Staged[] = [];
    const refused: string[] = [];
    for (const f of files) {
      const check = validateDocument(f);
      if (!check.ok) {
        refused.push(check.message);
        continue;
      }
      setBusy(`Reading ${f.name}…`);
      try {
        const raw = await fileToBase64(f);
        // A phone photo is 4–8 MB of pixels nobody needs; a PDF is left alone.
        const isImage = check.mime.startsWith("image/");
        const body = isImage ? await downscaleImage(raw, check.mime) : raw;
        next.push({
          id: uuid(),
          name: isImage ? jpegName(f.name) : f.name,
          mime: isImage ? "image/jpeg" : check.mime,
          // base64 is ~4/3 of the bytes it encodes.
          bytes: Math.round((body.length * 3) / 4),
          base64: body,
        });
      } catch (e) {
        refused.push(e instanceof Error ? e.message : `${f.name} couldn't be read.`);
      }
    }
    setBusy(null);
    if (next.length > 0) setStaged((s) => [...s, ...next]);
    if (refused.length > 0) setError(refused.join(" "));
  }

  // Files dropped on the list arrive with the sheet; staged once, not per render.
  useEffect(() => {
    if (tookInitial.current || !initialFiles?.length) return;
    tookInitial.current = true;
    take(initialFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);

  async function shoot() {
    setError(null);
    setBusy("Opening scanner…");
    try {
      const pages = await scanPages();
      if (pages.length > 0) {
        setStaged((s) => [
          ...s,
          ...pages.map((p, i) => ({
            id: uuid(),
            name: `${aircraft.tail_number}-${new Date().toISOString().slice(0, 10)}${
              pages.length > 1 ? `-${i + 1}` : ""
            }.jpg`,
            mime: "image/jpeg",
            bytes: Math.round((p.image.length * 3) / 4),
            base64: p.image,
          })),
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (staged.length === 0) return;
    setError(null);
    setBusy("Saving…");
    const queuedAt = new Date().toISOString();
    for (const s of staged) {
      const meta: PendingUpload = {
        id: s.id,
        aircraftId: aircraft.id,
        type,
        title: staged.length === 1 && title.trim() ? title.trim() : s.name,
        fileName: s.name,
        mimeType: s.mime,
        bytes: s.bytes,
        logEntryId: entryId,
        documentDate: null,
        queuedAt,
      };
      await queueDocumentUpload(meta, s.base64);
    }
    const count = staged.length;
    setStaged([]);
    setTitle("");

    if (!navigator.onLine) {
      setBusy(null);
      setMsg(
        `Saved on this device — ${count === 1 ? "it uploads" : "they upload"} when you're back in range.`,
      );
      return;
    }
    setBusy("Uploading…");
    const res = await drainDocumentUploads((d, t) => setBusy(`Uploading ${d} of ${t}`));
    setBusy(null);
    if (res.message) setError(res.message);
    setMsg(
      res.uploaded > 0
        ? `${res.uploaded} added to the vault. ${res.failed > 0 ? "The rest will retry." : "Sync to see them."}`
        : "Saved on this device — it uploads when you're back in range.",
    );
    if (res.uploaded > 0) await onUploaded?.();
  }

  return (
    <RecordsSheet onClose={onClose} title="Add a document">
      <DropZone onFiles={take} busy={!!busy}>
        <div style={{ display: "flex", gap: 8 }}>
          <SourceButton label="Choose a file" hint="Files, iCloud, Photos" onClick={() => fileInput.current?.click()} />
          <SourceButton label="Use the camera" hint="Finds the page edges" icon onClick={shoot} />
        </div>
      </DropZone>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) take(files);
        }}
        style={{ display: "none" }}
      />

      {staged.length > 0 && (
        <>
          <SheetLabel>Ready to add</SheetLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {staged.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, minHeight: hit.min,
                  background: color.surfaceRaised, border: `1px solid ${color.hairline}`,
                  borderRadius: radius.row, padding: "10px 12px",
                }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ ...text.rowTitle, fontWeight: 500, color: color.ink, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </span>
                  <span style={{ ...text.meta, color: color.faint }}>
                    {s.mime === "application/pdf" ? "PDF" : "Image"} · {fileSizeLabel(s.bytes)}
                  </span>
                </span>
                <button
                  onClick={() => setStaged((cur) => cur.filter((x) => x.id !== s.id))}
                  aria-label={`Remove ${s.name}`}
                  style={{
                    flex: "none", width: 44, minHeight: hit.min, background: "transparent",
                    border: "none", color: color.faint, fontSize: 18, cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <SheetLabel>What is it</SheetLabel>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DocumentType)}
            style={{
              width: "100%", boxSizing: "border-box", minHeight: hit.stepper,
              background: color.bg, border: `1px solid ${color.hairline}`, borderRadius: radius.control,
              padding: "0 12px", color: color.ink, fontFamily: text.rowTitle.fontFamily,
              // 16px minimum — WKWebView zooms a focused control below it (README).
              fontSize: 16,
            }}
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>{documentTypeLabel(t)}</option>
            ))}
          </select>

          {staged.length === 1 && (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name it (optional)"
              style={{
                width: "100%", boxSizing: "border-box", minHeight: hit.min, marginTop: 8,
                background: color.bg, border: `1px solid ${color.hairline}`, borderRadius: radius.control,
                padding: "0 12px", color: color.ink, fontFamily: text.rowTitle.fontFamily, fontSize: 16,
              }}
            />
          )}

          <button
            onClick={save}
            disabled={!!busy}
            style={{
              width: "100%", height: hit.primary, marginTop: 16, borderRadius: 15, border: "none",
              background: accentGradient, color: color.onAccent,
              fontFamily: text.button.fontFamily, fontSize: 16, fontWeight: 600,
              opacity: busy ? 0.5 : 1, cursor: busy ? "default" : "pointer",
            }}
          >
            {busy ?? `Add ${staged.length === 1 ? "this document" : `${staged.length} documents`}`}
          </button>
        </>
      )}

      {busy && staged.length === 0 && (
        <p style={{ ...text.secondary, color: color.dim, marginTop: 14 }}>{busy}</p>
      )}
      {error && <p style={{ ...text.secondary, color: color.danger, marginTop: 14, lineHeight: 1.45 }}>{error}</p>}
      {msg && <p style={{ ...text.secondary, color: color.dim, marginTop: 14, lineHeight: 1.45 }}>{msg}</p>}
      <p style={{ ...text.meta, color: color.faint, marginTop: 14, lineHeight: 1.45 }}>
        PDF or a photo, up to 25 MB each. Photos are shrunk before they go so they upload on one bar.
      </p>
    </RecordsSheet>
  );
}

function SourceButton({
  label, hint, icon, onClick,
}: {
  label: string;
  hint: string;
  icon?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, minHeight: 64, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 3,
        background: color.surfaceRaised, border: `1px solid ${color.hairline}`,
        borderRadius: radius.row, padding: "10px 8px", cursor: "pointer",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6, ...text.rowTitle, color: color.ink }}>
        {icon && <CameraIcon size={16} color={color.accent} />}
        {label}
      </span>
      <span style={{ ...text.meta, color: color.faint }}>{hint}</span>
    </button>
  );
}

/**
 * Drop target for the iPad: drag a PDF straight out of Files onto the sheet.
 *
 * ponytail: a local copy of the enter/leave depth counter, because the shell's
 * `useDropFiles` (CONTRACT §5) is on the iPad-shell branch and not in this one's
 * base. Swap the two at integration — the signature is already the same.
 */
export function DropZone({
  onFiles, busy, children,
}: {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const { dragging, props } = useDropFiles<HTMLDivElement>((files) => {
    if (!busy) onFiles(files);
  });
  return (
    <div
      {...props}
      style={{
        border: `1px ${dragging ? "solid" : "dashed"} ${dragging ? color.accent : color.hairline}`,
        borderRadius: radius.card,
        background: dragging ? `${alpha(color.accent, "14")}` : "transparent",
        padding: 12,
        transition: "background .12s",
      }}
    >
      {children}
      <div style={{ ...text.meta, color: color.faint, textAlign: "center", marginTop: 10 }}>
        {dragging ? "Drop it here" : "Or drag a file in from Files"}
      </div>
    </div>
  );
}

/**
 * The bottom sheet every records surface uses. It lives in this file rather than
 * its own because CONTRACT §8 names the records-UI filenames exactly; move it to
 * a shared module when the ownership table gains one.
 */
export function RecordsSheet({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 60, display: "flex", alignItems: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxHeight: "92vh", overflowY: "auto",
          background: color.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          border: `1px solid ${color.hairline}`, borderBottom: "none",
          padding: "10px 20px calc(22px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: color.hairline, margin: "0 auto 14px" }} />
        <h2 style={{ fontFamily: display, fontSize: 19, fontWeight: 700, color: color.ink, margin: "0 0 16px" }}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function SheetLabel({ children }: { children: ReactNode }) {
  return <div style={{ ...text.sectionLabel, color: color.faint, margin: "18px 0 8px" }}>{children}</div>;
}
