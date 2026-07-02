"use client";

import { useState } from "react";
import Link from "next/link";
import { CONFIDENCE_THRESHOLD } from "@/lib/extraction/schema";
import type { ExtractionStatus, ReviewStatus } from "@/lib/database.types";
import {
  saveEntry,
  addEntry,
  deleteEntry,
  setEntryConfirmed,
  setPageReview,
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
  owner_confirmed: boolean;
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
  owner_confirmed: false,
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
  "w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus:border-slate-500 dark:bg-slate-900 dark:text-slate-100";
function fieldBorder(flagged: boolean) {
  return flagged
    ? "border-amber-400 dark:border-amber-500/70"
    : "border-slate-300 dark:border-slate-700";
}

function EntryCard({
  entry,
  isNew,
  logbookId,
  aircraftId,
  pageId,
  onSaved,
  onCreated,
  onDeleted,
  onCancelNew,
}: {
  entry: ReviewEntry;
  isNew: boolean;
  logbookId: string;
  aircraftId: string;
  pageId: string;
  onSaved: (id: string, fields: EntryFields) => void;
  onCreated: (draftId: string, newId: string, fields: EntryFields) => void;
  onDeleted: (id: string) => void;
  onCancelNew: (draftId: string) => void;
}) {
  const [form, setForm] = useState<FormState>(toForm(entry));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fc = entry.field_confidence;
  const flagged = (field: string) =>
    !isNew && typeof fc?.[field] === "number" && fc[field] < CONFIDENCE_THRESHOLD;

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

  const Label = ({ name, text }: { name: string; text: string }) => (
    <span className="mb-0.5 flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
      {text}
      {flagged(name) && (
        <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          check
        </span>
      )}
    </span>
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">
          {isNew ? "New entry" : entry.owner_confirmed ? "Confirmed" : "Extracted"}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {!isNew && entry.confidence != null
            ? `${Math.round(entry.confidence * 100)}% confidence`
            : isNew
              ? "manual"
              : "reviewed"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2">
          <Label name="entry_date" text="Date" />
          <input
            type="date"
            value={form.entry_date}
            onChange={(e) => set("entry_date", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("entry_date"))}`}
          />
        </label>
        <label>
          <Label name="hobbs" text="Hobbs" />
          <input
            type="number"
            step="0.1"
            value={form.hobbs}
            placeholder={flagged("hobbs") ? "needs your input" : ""}
            onChange={(e) => set("hobbs", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("hobbs"))}`}
          />
        </label>
        <label>
          <Label name="tach" text="Tach" />
          <input
            type="number"
            step="0.1"
            value={form.tach}
            placeholder={flagged("tach") ? "needs your input" : ""}
            onChange={(e) => set("tach", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("tach"))}`}
          />
        </label>
        <label className="col-span-2">
          <Label name="description" text="Description" />
          <textarea
            rows={2}
            value={form.description}
            placeholder={flagged("description") ? "needs your input" : ""}
            onChange={(e) => set("description", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("description"))}`}
          />
        </label>
        <label className="col-span-2">
          <Label name="work_performed" text="Work performed" />
          <textarea
            rows={2}
            value={form.work_performed}
            onChange={(e) => set("work_performed", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("work_performed"))}`}
          />
        </label>
        <label className="col-span-2">
          <Label name="parts" text="Parts" />
          <textarea
            rows={2}
            value={form.parts}
            onChange={(e) => set("parts", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("parts"))}`}
          />
        </label>
        <label>
          <Label name="signature_name" text="Signature" />
          <input
            value={form.signature_name}
            onChange={(e) => set("signature_name", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("signature_name"))}`}
          />
        </label>
        <label>
          <Label name="mechanic_cert_number" text="Cert #" />
          <input
            value={form.mechanic_cert_number}
            onChange={(e) => set("mechanic_cert_number", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("mechanic_cert_number"))}`}
          />
        </label>
        <label>
          <Label name="ad_refs" text="AD refs (comma-sep)" />
          <input
            value={form.ad_refs}
            onChange={(e) => set("ad_refs", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("ad_refs"))}`}
          />
        </label>
        <label>
          <Label name="sb_refs" text="SB refs (comma-sep)" />
          <input
            value={form.sb_refs}
            onChange={(e) => set("sb_refs", e.target.value)}
            className={`${inputClass} ${fieldBorder(flagged("sb_refs"))}`}
          />
        </label>
      </div>

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={handleSave}
          disabled={busy}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {busy ? "Saving…" : isNew ? "Add entry" : "Save & confirm"}
        </button>
        {!isNew && (
          <button
            onClick={toggleConfirm}
            disabled={busy}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:border-slate-500 disabled:opacity-50 dark:border-slate-700"
          >
            {entry.owner_confirmed ? "Unconfirm" : "Confirm as-is"}
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={busy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-red-600 hover:border-red-400 disabled:opacity-50 dark:border-slate-700 dark:text-red-400"
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
}) {
  const [entries, setEntries] = useState<ReviewEntry[]>(initialEntries);
  const [drafts, setDrafts] = useState<ReviewEntry[]>([]);
  const [review, setReview] = useState<ReviewStatus>(reviewStatus);
  const [pageBusy, setPageBusy] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

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
    setPageBusy(false);
    if (!("error" in res)) setReview(status);
  }

  const confirmedCount = entries.filter((e) => e.owner_confirmed).length;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Source: image + raw transcription, so the owner can verify against the
          original (entries mix printed and handwritten content). */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Logbook page"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800"
          />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
            Image unavailable.
          </div>
        )}

        {detectedPageCount === 2 && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            Detected as a two-page spread — entries from both pages are listed;
            check that none were missed.
          </p>
        )}

        <button
          onClick={() => setShowRaw((s) => !s)}
          className="mt-3 text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400"
        >
          {showRaw ? "Hide" : "Show"} extracted text
        </button>
        {showRaw && (
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            {rawText?.trim() || "No text transcribed."}
          </pre>
        )}
      </div>

      {/* Entries */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {entries.length} {entries.length === 1 ? "entry" : "entries"} ·{" "}
            {confirmedCount} confirmed
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs ${
              review === "confirmed"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : review === "disputed"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {review}
          </span>
        </div>

        {extractionStatus !== "extracted" && entries.length === 0 && (
          <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
            This page hasn&apos;t been extracted yet. Extract it from the aircraft
            page, or add entries manually below.
          </p>
        )}

        {entries.map((e) => (
          <EntryCard
            key={e.id}
            entry={e}
            isNew={false}
            aircraftId={aircraftId}
            pageId={pageId}
            logbookId={logbookId}
            onSaved={patchEntry}
            onCreated={onCreated}
            onDeleted={(id) => setEntries((es) => es.filter((x) => x.id !== id))}
            onCancelNew={() => {}}
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
            onSaved={patchEntry}
            onCreated={onCreated}
            onDeleted={() => {}}
            onCancelNew={(draftId) =>
              setDrafts((ds) => ds.filter((x) => x.id !== draftId))
            }
          />
        ))}

        <button
          onClick={addDraft}
          className="rounded-md border border-dashed border-slate-300 px-4 py-2.5 text-sm hover:border-slate-500 dark:border-slate-700"
        >
          + Add an entry the extractor missed
        </button>

        <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <button
            onClick={() => markReviewed("confirmed")}
            disabled={pageBusy}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Mark page reviewed
          </button>
          <button
            onClick={() => markReviewed("disputed")}
            disabled={pageBusy}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:border-slate-500 disabled:opacity-50 dark:border-slate-700"
          >
            Flag as disputed
          </button>
          <Link
            href={`/aircraft/${aircraftId}`}
            className="rounded-md px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400"
          >
            Done
          </Link>
        </div>
      </div>
    </div>
  );
}
