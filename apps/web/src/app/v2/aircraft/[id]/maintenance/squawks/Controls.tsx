"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/ui/Button";
import { ConfirmSubmit, Notice, fieldClass } from "@/ui/Form";
import { ScanViewer } from "@/ui/ScanViewer";
import type { SquawkSeverity } from "@/lib/database.types";
import { addSquawksToVisit, deleteSquawk, deleteSquawkPhoto, reopenSquawk, revokeMechanicLink, updateSquawk, type Result } from "./actions";
import { SeverityPicker, uploadPhoto } from "./Panels";

/** Runs one action, refreshes the board, and shows the action's error in place. */
function useAct() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<Result>, then?: () => void) =>
    start(async () => {
      const r = await fn();
      if ("error" in r) return setError(r.error);
      setError(null);
      then?.();
      router.refresh();
    });
  return { act, error, pending, router };
}

export function SeverityControl({ aircraftId, squawkId, base, value }: { aircraftId: string; squawkId: string; base: string; value: SquawkSeverity }) {
  const { act, error, pending } = useAct();
  const [v, setV] = useState(value);
  return (
    <div>
      <SeverityPicker
        name={`sev-${squawkId}`}
        value={v}
        disabled={pending}
        onChange={(s) => {
          setV(s);
          act(() => updateSquawk(aircraftId, squawkId, { severity: s }, base));
        }}
      />
      {error && <Notice tone="alarm">{error}</Notice>}
    </div>
  );
}

/** The title, editable inline by editors ("Edit"). */
export function EditableTitle({ aircraftId, squawkId, base, text, canEdit }: { aircraftId: string; squawkId: string; base: string; text: string; canEdit: boolean }) {
  const { act, error, pending } = useAct();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  if (!editing)
    return (
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-heading">{text}</h2>
        {canEdit && (
          <button type="button" className={buttonClass("quiet", "s")} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        act(() => updateSquawk(aircraftId, squawkId, { description: draft }, base), () => setEditing(false));
      }}
    >
      <label className="text-label">
        What&apos;s wrong?
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className={`${fieldClass} h-auto py-2`} autoFocus />
      </label>
      {error && <Notice tone="alarm">{error}</Notice>}
      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass("primary", "s")}>
          Save
        </button>
        <button type="button" className={buttonClass("quiet", "s")} onClick={() => (setEditing(false), setDraft(text))}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export type PhotoView = { id: string; src: string; thumb: string; caption: string; canDelete: boolean; base: string };

/** Thumbnails 120 × 90; click opens the ScanViewer in a lightbox; "Add a photo" for the reporter and editors. */
export function Photos({
  aircraftId,
  squawkId,
  description,
  photos,
  canAdd,
}: {
  aircraftId: string;
  squawkId: string;
  description: string;
  photos: PhotoView[];
  canAdd: boolean;
}) {
  const { act, error, pending } = useAct();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<PhotoView | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let err: string | null = null;
    for (const f of files) err = (await uploadPhoto(aircraftId, squawkId, f)) ?? err;
    setBusy(false);
    setUploadError(err);
    router.refresh();
  }

  return (
    <div>
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2.5">
          {photos.map((p) => (
            <li key={p.id} className="w-[120px]">
              <button
                type="button"
                onClick={() => {
                  setOpen(p);
                  dialog.current?.showModal();
                }}
                aria-label={`Enlarge photo: ${p.caption}`}
                className="block overflow-hidden rounded-[var(--radius-s)] focus-visible:outline-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- private image behind RLS */}
                <img src={p.thumb} alt="" width={120} height={90} className="h-[90px] w-[120px] bg-leaf-2 object-cover" />
              </button>
              {p.canDelete && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(() => deleteSquawkPhoto(aircraftId, p.id, p.base));
                  }}
                >
                  <ConfirmSubmit label="Remove" question="Remove this photo? It can't be undone." confirmLabel="Remove photo" />
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {photos.length > 0 && <p className="mt-1 text-small text-ink-3">{photos[0].caption}. Click to enlarge.</p>}
      {canAdd && (
        <label className={`${buttonClass("secondary", "s")} mt-2 cursor-pointer has-[:focus-visible]:outline-2`}>
          {busy ? "Adding…" : "Add a photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/heic,image/webp"
            multiple
            className="sr-only"
            disabled={busy || pending}
            onChange={(e) => add(e.target.files)}
          />
        </label>
      )}
      {(error || uploadError) && <Notice tone="alarm">{error ?? uploadError}</Notice>}
      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        aria-label={`Photo of: ${description}`}
        className="m-auto h-[86vh] w-[min(1000px,92vw)] rounded-leaf bg-mat p-3 text-on-cover backdrop:bg-mat/70"
      >
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-small text-on-cover-2">{open?.caption}</p>
            <button type="button" className={buttonClass("on-mat", "s")} onClick={() => dialog.current?.close()} autoFocus>
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1">{open && <ScanViewer src={open.src} alt={`Photo of: ${description}`} />}</div>
        </div>
      </dialog>
    </div>
  );
}

/** Reopen (resolved) and Delete, editors only. */
export function SquawkActions({ aircraftId, squawkId, base, resolved, listHref }: { aircraftId: string; squawkId: string; base: string; resolved: boolean; listHref: string }) {
  const { act, error, pending, router } = useAct();
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {resolved && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass("secondary", "m")}
            onClick={() => act(() => reopenSquawk(aircraftId, squawkId, base), () => router.replace(`${listHref}?squawk=${squawkId}&done=reopened`, { scroll: false }))}
          >
            Reopen
          </button>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(() => deleteSquawk(aircraftId, squawkId, base), () => router.replace(`${listHref}?done=deleted`, { scroll: false }));
          }}
        >
          <ConfirmSubmit label="Delete" size="m" question="Delete this squawk and its photos? This can't be undone." confirmLabel="Delete squawk" />
        </form>
      </div>
      {error && <Notice tone="alarm">{error}</Notice>}
    </div>
  );
}

/** Revoke a mechanic link (ConfirmDialog); it stops working on the next request. */
export function RevokeLink({ aircraftId, linkId, label }: { aircraftId: string; linkId: string; label: string }) {
  const { act, error } = useAct();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        act(() => revokeMechanicLink(aircraftId, linkId));
      }}
    >
      <ConfirmSubmit label="Revoke" question={`Revoke the link for ${label}? It stops working at once.`} confirmLabel="Revoke link" />
      {error && <Notice tone="alarm">{error}</Notice>}
    </form>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className={buttonClass("quiet", "s")} onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}>
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

/** "Add to the visit": puts the open squawks on a planned visit's list. */
export function AddToVisit({ aircraftId, visitId, base, squawkIds }: { aircraftId: string; visitId: string; base: string; squawkIds: string[] }) {
  const { act, error, pending } = useAct();
  const [done, setDone] = useState(false);
  return (
    <span>
      <button
        type="button"
        disabled={pending || done}
        className={buttonClass("secondary", "s")}
        onClick={() => act(() => addSquawksToVisit(aircraftId, visitId, squawkIds, base), () => setDone(true))}
      >
        {done ? "Added to the visit" : "Add to the visit"}
      </button>
      {error && <Notice tone="alarm">{error}</Notice>}
    </span>
  );
}
