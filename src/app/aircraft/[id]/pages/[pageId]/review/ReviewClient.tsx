"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ZoomableImage } from "@/components/ZoomableImage";
import { CONFIDENCE_THRESHOLD, type FieldBox } from "@/lib/extraction/schema";
import type { ExtractionStatus, ReviewStatus } from "@/lib/database.types";
import {
  saveEntry,
  addEntry,
  deleteEntry,
  setEntryConfirmed,
  setPageReview,
  mergeContinuation,
  type EntryFields,
} from "./actions";

export type ReviewEntry = {
  id: string;
  entry_date: string | null;
  hobbs: number | null;
  tach: number | null;
  description: string | null;
  work_performed: string | null;
  parts: string | null;
  signature_name: string | null;
  mechanic_cert_number: string | null;
  ad_refs: string[];
  sb_refs: string[];
  confidence: number | null;
  field_confidence: Record<string, number> | null;
  field_boxes: Record<string, FieldBox | null> | null;
  owner_confirmed: boolean;
  is_continuation: boolean;
};

const blankEntry = (): ReviewEntry => ({
  id: "",
  entry_date: null,
  hobbs: null,
  tach: null,
  description: null,
  work_performed: null,
  parts: null,
  signature_name: null,
  mechanic_cert_number: null,
  ad_refs: [],
  sb_refs: [],
  confidence: null,
  field_confidence: null,
  field_boxes: null,
  owner_confirmed: false,
  is_continuation: false,
});

// Local editable form state — everything as strings for controlled inputs.
type FormState = {
  entry_date: string;
  hobbs: string;
  tach: string;
  description: string;
  work_performed: string;
  parts: string;
  signature_name: string;
  mechanic_cert_number: string;
  ad_refs: string;
  sb_refs: string;
};

function toForm(e: ReviewEntry): FormState {
  return {
    entry_date: e.entry_date ?? "",
    hobbs: e.hobbs?.toString() ?? "",
    tach: e.tach?.toString() ?? "",
    description: e.description ?? "",
    work_performed: e.work_performed ?? "",
    parts: e.parts ?? "",
    signature_name: e.signature_name ?? "",
    mechanic_cert_number: e.mechanic_cert_number ?? "",
    ad_refs: e.ad_refs.join(", "),
    sb_refs: e.sb_refs.join(", "),
  };
}

function toFields(f: FormState): EntryFields {
  const num = (s: string) => {
    const n = Number(s.trim());
    return s.trim() !== "" && Number.isFinite(n) ? n : null;
  };
  const str = (s: string) => (s.trim() === "" ? null : s.trim());
  const csv = (s: string) =>
    s.split(",").map((x) => x.trim()).filter(Boolean);
  return {
    entry_date: str(f.entry_date),
    hobbs: num(f.hobbs),
    tach: num(f.tach),
    description: str(f.description),
    work_performed: str(f.work_performed),
    parts: str(f.parts),
    signature_name: str(f.signature_name),
    mechanic_cert_number: str(f.mechanic_cert_number),
    ad_refs: csv(f.ad_refs),
    sb_refs: csv(f.sb_refs),
  };
}

const inputClass =
  "w-full rounded-md border bg-panel2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent";
function fieldBorder(flagged: boolean) {
  return flagged ? "border-annun-amber/70" : "border-line";
}

// A small monospace % chip, colored by whether the model cleared the trust
// threshold. Null confidence (manual/new entries) shows nothing.
function ConfChip({ conf }: { conf: number | null | undefined }) {
  if (typeof conf !== "number") return null;
  const ok = conf >= CONFIDENCE_THRESHOLD;
  return (
    <span
      className={`readout rounded px-1 text-[10px] ${
        ok ? "text-annun-green" : "text-annun-amber"
      }`}
      style={{ background: ok ? "var(--grn-bg)" : "var(--amb-bg)" }}
      title={`${Math.round(conf * 100)}% model confidence in this field`}
    >
      {Math.round(conf * 100)}%
    </span>
  );
}

// Expand a box by a margin (fraction of its own size) so the crop shows a bit
// of surrounding context, then clamp back into the image. Handwriting is hard
// to read edge-to-edge; the padding is what makes the snippet legible.
function padBox(b: FieldBox, m = 0.6): FieldBox {
  const x = Math.max(0, b.x - b.w * m);
  const y = Math.max(0, b.y - b.h * m);
  const w = Math.min(1 - x, b.w * (1 + 2 * m));
  const h = Math.min(1 - y, b.h * (1 + 2 * m));
  return { x, y, w, h };
}

// The source-image snippet for one field: a CSS background-crop of the page
// image to the field's (padded) box. No canvas — background-size/position scale
// the full image so just the region shows. Boxes are approximate, so this is a
// "look here" reference to confirm against, not a precise cut.
function CropStrip({ imageUrl, box }: { imageUrl: string; box: FieldBox }) {
  const b = padBox(box);
  // Guard against degenerate boxes (w or h ≈ full image) that would divide by ~0.
  if (b.w < 0.01 || b.h < 0.01 || b.w > 0.999 || b.h > 0.999) return null;
  return (
    <div
      aria-hidden
      className="mb-1 h-9 w-full overflow-hidden rounded border border-line bg-bg"
      style={{
        backgroundImage: `url(${imageUrl})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${100 / b.w}% ${100 / b.h}%`,
        backgroundPosition: `${(b.x / (1 - b.w)) * 100}% ${(b.y / (1 - b.h)) * 100}%`,
      }}
      title="Where this value appears on the scan (approximate)"
    />
  );
}

// One labelled field: label + a ◎ locate button (spotlight mode) or an inline
// crop (fallback) + confidence chip + the input. Spotlight mode wins when an
// onLocate handler is supplied (single-page reviewer, which has a sticky scan);
// the flat "Review all" view has no persistent image, so it gets the crop.
function Field({
  label,
  conf,
  box,
  imageUrl,
  onLocate,
  active,
  className,
  children,
}: {
  label: string;
  conf: number | null | undefined;
  box: FieldBox | null | undefined;
  imageUrl: string | null;
  onLocate?: (box: FieldBox | null) => void;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const canLocate = Boolean(box && onLocate);
  return (
    <label className={className}>
      <span className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-dim">
        {label}
        {canLocate && (
          <button
            type="button"
            onClick={() => onLocate!(active ? null : box!)}
            aria-pressed={active}
            title="Show where this was read on the scan"
            className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[10px] leading-none ${
              active ? "border-accent bg-accent-soft text-accent" : "border-line2 text-accent hover:border-accent"
            }`}
          >
            ◎
          </button>
        )}
        <ConfChip conf={conf} />
      </span>
      {box && imageUrl && !onLocate && <CropStrip imageUrl={imageUrl} box={box} />}
      {children}
    </label>
  );
}

export function EntryCard({
  entry,
  isNew,
  logbookId,
  aircraftId,
  pageId,
  imageUrl,
  onLocate,
  activeKey,
  onSaved,
  onCreated,
  onDeleted,
  onCancelNew,
  onMerge,
  merging,
}: {
  entry: ReviewEntry;
  isNew: boolean;
  logbookId: string;
  aircraftId: string;
  pageId: string;
  imageUrl: string | null;
  // Spotlight mode (single-page reviewer): highlight a field's box on the
  // shared sticky scan. Absent in the flat view, which falls back to crops.
  onLocate?: (box: FieldBox | null, key: string) => void;
  activeKey?: string | null;
  onSaved: (id: string, fields: EntryFields) => void;
  onCreated: (draftId: string, newId: string, fields: EntryFields) => void;
  onDeleted: (id: string) => void;
  onCancelNew: (draftId: string) => void;
  onMerge: (tailId: string) => void;
  merging: boolean;
}) {
  const [form, setForm] = useState<FormState>(toForm(entry));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fc = entry.field_confidence;
  const conf = (field: string): number | null =>
    !isNew && typeof fc?.[field] === "number" ? fc[field] : null;
  const flagged = (field: string) => {
    const c = conf(field);
    return c != null && c < CONFIDENCE_THRESHOLD;
  };
  const box = (field: string): FieldBox | null =>
    (!isNew && entry.field_boxes?.[field]) || null;
  // Per-field spotlight wiring (single-page reviewer only). Returns the props
  // Field needs to drive/toggle the highlight on the shared sticky scan.
  const locate = (field: string) => {
    const b = box(field);
    if (!onLocate || !b) return {};
    const key = `${entry.id}:${field}`;
    return { onLocate: (bx: FieldBox | null) => onLocate(bx, key), active: activeKey === key };
  };

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    const fields = toFields(form);
    if (isNew) {
      const res = await addEntry(aircraftId, pageId, logbookId, fields);
      setBusy(false);
      if ("error" in res) setError(res.error);
      else onCreated(entry.id, res.id, fields);
    } else {
      const res = await saveEntry(aircraftId, pageId, entry.id, fields);
      setBusy(false);
      if ("error" in res) setError(res.error);
      else onSaved(entry.id, fields);
    }
  }

  async function handleDelete() {
    if (isNew) {
      onCancelNew(entry.id);
      return;
    }
    setBusy(true);
    const res = await deleteEntry(aircraftId, pageId, entry.id);
    setBusy(false);
    if ("error" in res) setError(res.error);
    else onDeleted(entry.id);
  }

  async function toggleConfirm() {
    setBusy(true);
    const res = await setEntryConfirmed(aircraftId, pageId, entry.id, !entry.owner_confirmed);
    setBusy(false);
    if ("error" in res) setError(res.error);
    else onSaved(entry.id, toFields(form)); // reuse to bump confirmed via parent
  }

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">
          {isNew ? "New entry" : entry.owner_confirmed ? "Confirmed" : "Extracted"}
        </span>
        <span className="readout text-xs text-dim">
          {!isNew && entry.confidence != null
            ? `${Math.round(entry.confidence * 100)}% overall`
            : isNew
              ? "manual"
              : "reviewed"}
        </span>
      </div>

      {!isNew && entry.is_continuation && (
        <div
          className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-annun-amber/40 px-3 py-2 text-xs text-annun-amber"
          style={{ background: "var(--amb-bg)" }}
        >
          <span>
            This looks like the continuation of an entry that started on the
            previous page.
          </span>
          <button
            onClick={() => onMerge(entry.id)}
            disabled={merging}
            className="rounded-md border border-annun-amber/60 px-2.5 py-1 font-medium text-annun-amber hover:bg-panel2 disabled:opacity-50"
          >
            {merging ? "Merging…" : "Merge into that entry"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" conf={conf("entry_date")} box={box("entry_date")} imageUrl={imageUrl} {...locate("entry_date")} className="col-span-2">
          <input
            type="date"
            value={form.entry_date}
            onChange={(e) => set("entry_date", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("entry_date"))}`}
          />
        </Field>
        <Field label="Hobbs" conf={conf("hobbs")} box={box("hobbs")} imageUrl={imageUrl} {...locate("hobbs")}>
          <input
            type="number"
            step="0.1"
            value={form.hobbs}
            placeholder={flagged("hobbs") ? "needs your input" : ""}
            onChange={(e) => set("hobbs", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("hobbs"))}`}
          />
        </Field>
        <Field label="Tach" conf={conf("tach")} box={box("tach")} imageUrl={imageUrl} {...locate("tach")}>
          <input
            type="number"
            step="0.1"
            value={form.tach}
            placeholder={flagged("tach") ? "needs your input" : ""}
            onChange={(e) => set("tach", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("tach"))}`}
          />
        </Field>
        <Field label="Description" conf={conf("description")} box={box("description")} imageUrl={imageUrl} {...locate("description")} className="col-span-2">
          <textarea
            rows={2}
            value={form.description}
            placeholder={flagged("description") ? "needs your input" : ""}
            onChange={(e) => set("description", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("description"))}`}
          />
        </Field>
        <Field label="Work performed" conf={conf("work_performed")} box={box("work_performed")} imageUrl={imageUrl} {...locate("work_performed")} className="col-span-2">
          <textarea
            rows={2}
            value={form.work_performed}
            onChange={(e) => set("work_performed", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("work_performed"))}`}
          />
        </Field>
        <Field label="Parts" conf={conf("parts")} box={box("parts")} imageUrl={imageUrl} {...locate("parts")} className="col-span-2">
          <textarea
            rows={2}
            value={form.parts}
            onChange={(e) => set("parts", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("parts"))}`}
          />
        </Field>
        <Field label="Signature" conf={conf("signature_name")} box={box("signature_name")} imageUrl={imageUrl} {...locate("signature_name")}>
          <input
            value={form.signature_name}
            onChange={(e) => set("signature_name", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("signature_name"))}`}
          />
        </Field>
        <Field label="Cert #" conf={conf("mechanic_cert_number")} box={box("mechanic_cert_number")} imageUrl={imageUrl} {...locate("mechanic_cert_number")}>
          <input
            value={form.mechanic_cert_number}
            onChange={(e) => set("mechanic_cert_number", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("mechanic_cert_number"))}`}
          />
        </Field>
        <Field label="AD refs (comma-sep)" conf={conf("ad_refs")} box={box("ad_refs")} imageUrl={imageUrl} {...locate("ad_refs")}>
          <input
            value={form.ad_refs}
            onChange={(e) => set("ad_refs", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("ad_refs"))}`}
          />
        </Field>
        <Field label="SB refs (comma-sep)" conf={conf("sb_refs")} box={box("sb_refs")} imageUrl={imageUrl} {...locate("sb_refs")}>
          <input
            value={form.sb_refs}
            onChange={(e) => set("sb_refs", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("sb_refs"))}`}
          />
        </Field>
      </div>

      {error && <p className="mt-2 text-xs text-annun-red">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={handleSave}
          disabled={busy}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : isNew ? "Add entry" : "Save & confirm"}
        </button>
        {!isNew && (
          <button
            onClick={toggleConfirm}
            disabled={busy}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-line2 hover:text-ink disabled:opacity-50"
          >
            {entry.owner_confirmed ? "Unconfirm" : "Confirm as-is"}
          </button>
        )}
        {!isNew && !entry.is_continuation && (
          <button
            onClick={() => onMerge(entry.id)}
            disabled={busy || merging}
            title="Merge this into the entry that ends on the previous page (for entries that span a page break)"
            className="rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-line2 hover:text-ink disabled:opacity-50"
          >
            Merge ↑ prev page
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={busy}
          className="rounded-md border border-line px-3 py-1.5 text-sm text-annun-red hover:border-annun-red/60 disabled:opacity-50"
        >
          {isNew ? "Cancel" : "Delete"}
        </button>
      </div>
    </div>
  );
}

export function ReviewClient({
  aircraftId,
  pageId,
  logbookId,
  imageUrl,
  rawText,
  reviewStatus,
  extractionStatus,
  detectedPageCount,
  entries: initialEntries,
  returnLogbookId,
}: {
  aircraftId: string;
  pageId: string;
  logbookId: string;
  imageUrl: string | null;
  rawText: string | null;
  reviewStatus: ReviewStatus;
  extractionStatus: ExtractionStatus;
  detectedPageCount: number | null;
  entries: ReviewEntry[];
  returnLogbookId: string | null;
}) {
  const router = useRouter();
  // Reviewing exits back to the Logbooks & pages list (not the overview) so you
  // can move straight to the next page; retain the logbook filter if one was set.
  const backToPages = `/aircraft/${aircraftId}/pages${
    returnLogbookId ? `?logbook=${encodeURIComponent(returnLogbookId)}` : ""
  }`;
  const [entries, setEntries] = useState<ReviewEntry[]>(initialEntries);
  const [drafts, setDrafts] = useState<ReviewEntry[]>([]);
  const [review, setReview] = useState<ReviewStatus>(reviewStatus);
  const [pageBusy, setPageBusy] = useState(false);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  // Which field's box is spotlighted on the sticky scan (null = none).
  const [spot, setSpot] = useState<{ box: FieldBox; key: string } | null>(null);
  const locateField = (box: FieldBox | null, key: string) =>
    setSpot(box ? { box, key } : null);

  // Merge a page-spanning continuation into its head on the previous page. The
  // tail disappears from this page; the head (on the previous page) absorbs it.
  async function mergeTail(tailId: string) {
    setMergingId(tailId);
    setMergeError(null);
    const res = await mergeContinuation(aircraftId, pageId, tailId);
    setMergingId(null);
    if ("error" in res) {
      setMergeError(res.error);
      return;
    }
    setEntries((es) => es.filter((e) => e.id !== tailId));
    router.refresh();
  }

  function patchEntry(id: string, fields: EntryFields) {
    setEntries((es) =>
      es.map((e) =>
        e.id === id ? { ...e, ...fields, owner_confirmed: true } : e,
      ),
    );
  }

  function addDraft() {
    setDrafts((d) => [...d, { ...blankEntry(), id: `draft-${Date.now()}` }]);
  }

  function onCreated(draftId: string, newId: string, fields: EntryFields) {
    setDrafts((d) => d.filter((x) => x.id !== draftId));
    setEntries((es) => [
      ...es,
      { ...blankEntry(), ...fields, id: newId, owner_confirmed: true },
    ]);
  }

  async function markReviewed(status: ReviewStatus) {
    setPageBusy(true);
    const res = await setPageReview(aircraftId, pageId, status);
    if ("error" in res) {
      setPageBusy(false);
      return;
    }
    setReview(status);
    // Marking a page reviewed returns you to the pages list (same as Done), so
    // you can move straight to the next page that needs review. Flagging a
    // dispute stays put. Leave pageBusy set — the component unmounts on nav.
    if (status === "confirmed") {
      router.push(backToPages);
    } else {
      setPageBusy(false);
    }
  }

  const confirmedCount = entries.filter((e) => e.owner_confirmed).length;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Source: image + raw transcription, so the owner can verify against the
          original (entries mix printed and handwritten content). */}
      <div className="lg:sticky lg:top-[72px] lg:self-start">
        {imageUrl ? (
          <div>
            <div className="relative overflow-hidden rounded-lg border border-line">
              <ZoomableImage
                src={imageUrl}
                alt="Logbook page"
                className="w-full"
              />
              {/* Spotlight: dim the page and ring the located field's box. */}
              {spot && (
                <div
                  className="pointer-events-none absolute rounded-[3px] transition-all duration-200"
                  style={{
                    left: `${spot.box.x * 100}%`,
                    top: `${spot.box.y * 100}%`,
                    width: `${spot.box.w * 100}%`,
                    height: `${spot.box.h * 100}%`,
                    border: "2px solid var(--accent)",
                    boxShadow: "0 0 0 9999px rgba(4,10,20,0.55)",
                  }}
                />
              )}
            </div>
            <p className="mt-1 text-center text-xs text-faint">
              Tap a field&apos;s ◎ to spotlight where it was read. Click the image to magnify.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-dim">
            Image unavailable.
          </div>
        )}

        {detectedPageCount === 2 && (
          <p
            className="mt-2 rounded-md border border-annun-amber/40 px-3 py-2 text-xs text-annun-amber"
            style={{ background: "var(--amb-bg)" }}
          >
            Detected as a two-page spread — entries from both pages are listed;
            check that none were missed.
          </p>
        )}

        <button
          onClick={() => setShowRaw((s) => !s)}
          className="mt-3 text-xs text-dim underline hover:text-ink"
        >
          {showRaw ? "Hide" : "Show"} extracted text
        </button>
        {showRaw && (
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-bg p-3 text-xs text-dim">
            {rawText?.trim() || "No text transcribed."}
          </pre>
        )}
      </div>

      {/* Entries */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-dim">
            {entries.length} {entries.length === 1 ? "entry" : "entries"} ·{" "}
            {confirmedCount} confirmed
          </span>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              review === "confirmed"
                ? "border-annun-green/40 text-annun-green"
                : review === "disputed"
                  ? "border-annun-red/40 text-annun-red"
                  : "border-line text-dim"
            }`}
            style={
              review === "confirmed"
                ? { background: "var(--grn-bg)" }
                : review === "disputed"
                  ? { background: "var(--red-bg)" }
                  : undefined
            }
          >
            {review}
          </span>
        </div>

        {extractionStatus !== "extracted" && entries.length === 0 && (
          <p className="rounded-md border border-dashed border-line p-4 text-sm text-dim">
            This page hasn&apos;t been extracted yet. Extract it from the aircraft
            page, or add entries manually below.
          </p>
        )}

        {mergeError && <p className="text-sm text-annun-red">{mergeError}</p>}

        {entries.map((e) => (
          <EntryCard
            key={e.id}
            entry={e}
            isNew={false}
            aircraftId={aircraftId}
            pageId={pageId}
            logbookId={logbookId}
            imageUrl={imageUrl}
            onLocate={locateField}
            activeKey={spot?.key ?? null}
            onSaved={patchEntry}
            onCreated={onCreated}
            onDeleted={(id) => setEntries((es) => es.filter((x) => x.id !== id))}
            onCancelNew={() => {}}
            onMerge={mergeTail}
            merging={mergingId === e.id}
          />
        ))}

        {drafts.map((d) => (
          <EntryCard
            key={d.id}
            entry={d}
            isNew
            aircraftId={aircraftId}
            pageId={pageId}
            logbookId={logbookId}
            imageUrl={imageUrl}
            onSaved={patchEntry}
            onCreated={onCreated}
            onDeleted={() => {}}
            onCancelNew={(draftId) =>
              setDrafts((ds) => ds.filter((x) => x.id !== draftId))
            }
            onMerge={() => {}}
            merging={false}
          />
        ))}

        <button
          onClick={addDraft}
          className="rounded-md border border-dashed border-line px-4 py-2.5 text-sm text-dim hover:border-line2 hover:text-ink"
        >
          + Add an entry the extractor missed
        </button>

        <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-4">
          <button
            onClick={() => markReviewed("confirmed")}
            disabled={pageBusy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
          >
            Mark page reviewed
          </button>
          <button
            onClick={() => markReviewed("disputed")}
            disabled={pageBusy}
            className="rounded-md border border-line px-4 py-2 text-sm text-dim hover:border-line2 hover:text-ink disabled:opacity-50"
          >
            Flag as disputed
          </button>
          <Link
            href={backToPages}
            className="rounded-md px-4 py-2 text-sm text-dim hover:text-ink"
          >
            Done
          </Link>
        </div>
      </div>
    </div>
  );
}
