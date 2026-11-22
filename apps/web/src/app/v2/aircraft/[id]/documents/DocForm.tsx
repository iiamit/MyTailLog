"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DocumentType } from "@/lib/database.types";
import { DOC_LABEL, DOCUMENT_TYPES, TRACKS_BY_DEFAULT } from "@/lib/v2/docs";
import { buttonClass } from "@/ui/Button";
import { Field, FormLeaf, Notice, fieldClass } from "@/ui/Form";
import { saveDocument, type DocFormState } from "./actions";

const MAX_BYTES = 25 * 1024 * 1024;

export type EntryOption = { id: string; label: string };
export type DocValues = {
  id: string;
  updated_at: string;
  type: DocumentType;
  title: string | null;
  reference: string | null;
  document_date: string | null;
  notes: string | null;
  log_entry_id: string | null;
  track_expiry: boolean;
  expires_on: string | null;
  renews_every_months: number | null;
  remind_lead_days: number | null;
};

/**
 * W-DOCS-01 right-leaf form: "Add a document" (multipart POST to the upload route, which caps at 25 MB) or
 * "Edit details" (server action). Same fields either way, plus the file on add.
 */
export function DocForm({
  aircraftId,
  doc,
  entries,
  closeHref,
}: {
  aircraftId: string;
  doc?: DocValues;
  entries: EntryOption[];
  closeHref: string;
}) {
  const [base] = useState(doc?.updated_at);
  const router = useRouter();
  const [type, setType] = useState<DocumentType>(doc?.type ?? "airworthiness_cert");
  const [track, setTrack] = useState(doc ? doc.track_expiry : TRACKS_BY_DEFAULT.includes(type));
  const [touchedTrack, setTouchedTrack] = useState(!!doc);
  const edit = doc ? saveDocument.bind(null, aircraftId, doc.id) : null;
  const [state, action, pending] = useActionState<DocFormState, FormData>(async (prev, form) => {
    if (edit) return edit(prev, form);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF or image to add." };
    if (file.size > MAX_BYTES) return { error: "That file is over 25 MB." };
    if (!String(form.get("title") ?? "").trim()) form.set("title", file.name.replace(/\.[^.]+$/, ""));
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/documents`, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string; document?: { id: string } };
      if (!res.ok || !body.document) return { error: body.error || "Upload failed. Try again." };
      router.replace(`/aircraft/${aircraftId}/documents?doc=${body.document.id}&done=added`, { scroll: false });
      router.refresh();
      return null;
    } catch {
      return { error: "Upload failed. Try again." };
    }
  }, null);

  const error = state?.error;
  return (
    <FormLeaf title={doc ? "Edit details" : "Add a document"} closeHref={closeHref}>
      <form action={action} className="flex flex-col gap-4">
        {doc && <input type="hidden" name="base" value={base} />}
        <Field label="Category">
          <select
            name="type"
            required
            value={type}
            onChange={(e) => {
              const t = e.target.value as DocumentType;
              setType(t);
              if (!touchedTrack) setTrack(TRACKS_BY_DEFAULT.includes(t));
            }}
            className={fieldClass}
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOC_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        {!doc && (
          <Field label="File" help="PDF or image, up to 25 MB.">
            <input type="file" name="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className={`${fieldClass} h-auto py-2`} />
          </Field>
        )}
        <Field label="Title" help={doc ? undefined : "Leave blank to use the file name."}>
          <input name="title" defaultValue={doc?.title ?? ""} className={fieldClass} />
        </Field>
        <Field label="Reference number">
          <input name="reference" defaultValue={doc?.reference ?? ""} placeholder="STC, form or tag number" className={fieldClass} />
        </Field>
        <Field label="Document date">
          <input type="date" name="document_date" defaultValue={doc?.document_date ?? ""} className={fieldClass} />
        </Field>
        <label className="flex items-center gap-2 text-label">
          <input
            type="checkbox"
            name="trackExpiry"
            checked={track}
            onChange={(e) => {
              setTrack(e.target.checked);
              setTouchedTrack(true);
            }}
            className="size-4 accent-[var(--color-ink)]"
          />
          Track its expiry
        </label>
        {track && (
          <div className="grid gap-4 border-l-2 border-rule pl-4">
            <Field label="Expires on" help="It goes on the due list on Status.">
              <input type="date" name="expiresOn" defaultValue={doc?.expires_on ?? ""} className={fieldClass} />
            </Field>
            <Field label="Renews every (months)">
              <input type="number" name="renewsEveryMonths" min={1} max={120} step={1} defaultValue={doc?.renews_every_months ?? ""} className={fieldClass} />
            </Field>
            <Field label="Remind me (days ahead)">
              <input type="number" name="remindLeadDays" min={0} max={365} step={1} defaultValue={doc?.remind_lead_days ?? 60} className={fieldClass} />
            </Field>
          </div>
        )}
        <Field label="Link to an entry">
          <select name="log_entry_id" defaultValue={doc?.log_entry_id ?? ""} className={fieldClass}>
            <option value="">Not linked</option>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <textarea name="notes" rows={3} defaultValue={doc?.notes ?? ""} className={`${fieldClass} h-auto py-2`} />
        </Field>
        {error && <Notice tone="alarm">{error}</Notice>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary", "m")}>
            {pending ? (doc ? "Saving…" : "Uploading…") : doc ? "Save details" : "Add document"}
          </button>
          <Link href={closeHref} replace scroll={false} className={buttonClass("quiet", "m")}>
            Cancel
          </Link>
        </div>
      </form>
    </FormLeaf>
  );
}
