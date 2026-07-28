"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmButton } from "@/components/ConfirmButton";
import type { DocumentType } from "@/lib/database.types";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, documentTypeLabel } from "@/lib/documents";
import { deleteDocument } from "./actions";

type Doc = {
  id: string;
  type: DocumentType;
  title: string | null;
  reference: string | null;
  document_date: string | null;
  notes: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  log_entry_id: string | null;
  created_at: string;
};

const inputClass =
  "rounded-md border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-hidden focus:border-accent";

function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsClient({
  aircraftId,
  canEdit,
  docs,
}: {
  aircraftId: string;
  canEdit: boolean;
  docs: Doc[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function upload(formData: FormData) {
    setBusy(true);
    try {
      // POST to the upload route (server actions cap the body at ~1 MB).
      const res = await fetch(`/api/aircraft/${aircraftId}/documents`, { method: "POST", body: formData });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return toast.error(body.error || "Upload failed.");
      toast.success("Document added.");
      setOpen(false);
      (document.getElementById("upload-doc") as HTMLFormElement | null)?.reset();
      router.refresh();
    } catch {
      toast.error("Upload failed — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await deleteDocument(aircraftId, id);
    if (res.error) return toast.error(res.error);
    toast.success("Document removed.");
    router.refresh();
  }

  const byType = new Map<DocumentType, Doc[]>();
  for (const d of docs) (byType.get(d.type) ?? byType.set(d.type, []).get(d.type)!).push(d);

  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Add a document</h2>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-line2 hover:text-ink"
            >
              {open ? "Cancel" : "+ Upload"}
            </button>
          </div>
          {open && (
            <form id="upload-doc" action={upload} className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Category</span>
                  <select name="type" defaultValue="airworthiness_cert" className={inputClass}>
                    {DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {DOCUMENT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">File</span>
                  <input type="file" name="file" accept="application/pdf,image/*" className={inputClass} required />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Title</span>
                  <input name="title" className={inputClass} placeholder="e.g. Airworthiness certificate" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Reference #</span>
                  <input name="reference" className={inputClass} placeholder="STC / form / tag number" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Document date</span>
                  <input type="date" name="document_date" className={inputClass} />
                </label>
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span className="font-medium">Notes</span>
                  <input name="notes" className={inputClass} />
                </label>
              </div>
              <div>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? "Uploading…" : "Upload"}
                </button>
                <span className="ml-3 text-xs text-faint">PDF or image, up to 25 MB.</span>
              </div>
            </form>
          )}
        </div>
      )}

      {docs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-5 py-10 text-center text-sm text-dim">
          No documents yet.{canEdit ? " Upload the aircraft's certificates, STCs, and manuals to keep them here." : ""}
        </p>
      ) : (
        DOCUMENT_TYPES.filter((t) => byType.has(t)).map((t) => (
          <section key={t} className="flex flex-col gap-2">
            <div className="eyebrow">{documentTypeLabel(t)}</div>
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {byType.get(t)!.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0 text-sm">
                    <div className="flex items-center gap-2 font-medium text-ink">
                      <a href={`/api/document/${d.id}`} target="_blank" rel="noreferrer" className="truncate hover:underline">
                        {d.title || d.file_name || "Document"}
                      </a>
                      {d.log_entry_id && (
                        <span className="rounded-sm border border-line px-1.5 py-0.5 text-[10px] text-faint">
                          on an entry
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-faint">
                      {[d.reference, d.document_date, fmtSize(d.size_bytes)].filter(Boolean).join(" · ")}
                      {d.notes ? ` — ${d.notes}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <a
                      href={`/api/document/${d.id}?download`}
                      className="rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-line2 hover:text-ink"
                    >
                      Download
                    </a>
                    {canEdit && (
                      <ConfirmButton
                        onConfirm={() => remove(d.id)}
                        confirmLabel="Delete"
                        className="rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-annun-red hover:text-annun-red"
                      >
                        Delete
                      </ConfirmButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
