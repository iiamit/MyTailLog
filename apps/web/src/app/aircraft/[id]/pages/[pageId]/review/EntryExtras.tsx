"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ReferenceLink } from "@/lib/database.types";
import { setEntryLinks } from "./actions";
import { setDocumentEntry } from "../../../documents/actions";

export type EntryAttachment = { id: string; title: string | null; file_name: string | null };

const inputClass =
  "rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-sm text-ink outline-hidden focus:border-accent";

// Attachments & external references for a single maintenance entry. Self-
// contained: uploads go to the documents route (with this entry's id), links are
// saved via setEntryLinks. Rendered at the bottom of an entry's review card.
export function EntryExtras({
  entryId,
  aircraftId,
  pageId,
  canEdit,
  attachments,
  links,
}: {
  entryId: string;
  aircraftId: string;
  pageId: string;
  canEdit: boolean;
  attachments: EntryAttachment[];
  links: ReferenceLink[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  // Vault documents not yet attached to any entry — loaded on demand (opening
  // the picker) rather than prop-drilled through both review pages. RLS scopes
  // the read to this aircraft.
  const [picker, setPicker] = useState<EntryAttachment[] | null>(null);

  async function openPicker() {
    setError(null);
    setBusy(true);
    const { data, error: e } = await createClient()
      .from("document")
      .select("id, title, file_name")
      .eq("aircraft_id", aircraftId)
      .is("log_entry_id", null)
      .order("created_at", { ascending: false })
      .limit(100);
    setBusy(false);
    if (e) return setError(e.message);
    setPicker(data ?? []);
  }

  async function setAttachment(documentId: string, entry: string | null) {
    setError(null);
    const res = await setDocumentEntry(aircraftId, documentId, entry);
    if (res.error) return setError(res.error);
    setPicker(null);
    router.refresh();
  }

  async function saveLinks(next: ReferenceLink[]) {
    setError(null);
    const res = await setEntryLinks(aircraftId, pageId, entryId, next);
    if ("error" in res) return setError(res.error);
    router.refresh();
  }

  async function addLink() {
    let u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    await saveLinks([...links, { label: label.trim() || u, url: u }]);
    setLabel("");
    setUrl("");
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("log_entry_id", entryId);
    fd.set("type", "other");
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/documents`, { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setError(body.error || "Upload failed.");
      router.refresh();
    } catch {
      setError("Upload failed — check your connection and try again.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-line bg-panel/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Attachments */}
        <div>
          <div className="eyebrow mb-1.5">Attachments</div>
          {attachments.length === 0 && <p className="text-xs text-faint">None.</p>}
          <ul className="flex flex-col gap-1">
            {attachments.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                <a href={`/api/document/${d.id}`} target="_blank" rel="noreferrer" className="truncate text-ink hover:underline">
                  {d.title || d.file_name || "Document"}
                </a>
                {canEdit && (
                  <button
                    onClick={() => setAttachment(d.id, null)}
                    title="Detach from this entry — the document stays in the Records Vault."
                    className="ml-auto shrink-0 text-xs text-faint hover:text-annun-red"
                  >
                    unlink
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <label className="cursor-pointer text-xs text-accent hover:underline">
                {busy ? "Working…" : "+ Add file"}
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={uploadFile} disabled={busy} />
              </label>
              {picker === null ? (
                <button onClick={openPicker} disabled={busy} className="text-xs text-accent hover:underline">
                  + Link from Vault
                </button>
              ) : (
                <select
                  aria-label="Link a Vault document"
                  defaultValue=""
                  onChange={(e) => e.target.value && setAttachment(e.target.value, entryId)}
                  className={`${inputClass} max-w-full text-xs`}
                >
                  <option value="">
                    {picker.length ? "Choose a document…" : "No unattached documents in the Vault"}
                  </option>
                  {picker.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title || d.file_name || "Document"}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Links */}
        <div>
          <div className="eyebrow mb-1.5">Reference links</div>
          {links.length === 0 && <p className="text-xs text-faint">None.</p>}
          <ul className="flex flex-col gap-1">
            {links.map((l, i) => (
              <li key={`${l.url}-${i}`} className="flex items-center gap-2 text-sm">
                <a href={l.url} target="_blank" rel="noreferrer" className="truncate text-ink hover:underline">
                  {l.label || l.url}
                </a>
                {canEdit && (
                  <button
                    onClick={() => saveLinks(links.filter((_, j) => j !== i))}
                    className="ml-auto shrink-0 text-xs text-faint hover:text-annun-red"
                  >
                    remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className={`${inputClass} w-24`} />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={`${inputClass} flex-1`} />
              <button onClick={addLink} className="rounded-md border border-line px-2.5 py-1 text-xs text-dim hover:border-line2 hover:text-ink">
                Add
              </button>
            </div>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-annun-red">{error}</p>}
    </div>
  );
}
