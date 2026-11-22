"use client";

import { useState, useTransition } from "react";
import { Button } from "@/ui/Button";
import { confirmClean, confirmEntries, undoConfirm } from "../actions";

/** "Confirm {c} clean pages" with its toast and Undo (W-BOOKS-08). No dialog: Undo is the safety. */
export function ConfirmClean({ aircraftId, pages, entries, eyes, versions }: { aircraftId: string; pages: number; entries: number; eyes: number; versions: Record<string, string> }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ text: string; entryVersions: Record<string, string>; pageVersions: Record<string, string> } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-3 space-y-2">
      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await confirmClean(aircraftId, versions);
            if ("error" in r) return setErr(r.error);
            setDone({ text: `Confirmed ${r.pages.length || pages} ${pages === 1 ? "page" : "pages"}, ${r.entries} ${r.entries === 1 ? "entry" : "entries"}. ${eyes} still ${eyes === 1 ? "needs" : "need"} your eyes.`, entryVersions: r.entryVersions, pageVersions: r.pageVersions });
          })
        }
      >
        Confirm {pages} clean {pages === 1 ? "page" : "pages"}
      </Button>
      <span className="ml-3 text-small text-ink-3">{entries} {entries === 1 ? "entry" : "entries"}</span>
      <p role="status" className="text-small">
        {done?.text}{" "}
        {done && (
          <button
            type="button"
            className="font-semibold text-board-ink underline decoration-dotted"
            onClick={() =>
              start(async () => {
                const r = await undoConfirm(aircraftId, done.entryVersions, done.pageVersions);
                setDone(null);
                if ("error" in r) setErr(r.error);
              })
            }
          >
            Undo
          </button>
        )}
      </p>
      {err && <p role="alert" className="text-small text-alarm-text">{err}</p>}
    </div>
  );
}

/** CSV-imported entries without a page: confirm per row or all at once. */
export function ConfirmImported({ aircraftId, rows }: { aircraftId: string; rows: { id: string; date: string; text: string; base: string }[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (ids: string[]) =>
    start(async () => {
      const r = await confirmEntries(aircraftId, null, "", ids.map((id) => ({ id, isNew: false, fields: null, base: rows.find((r) => r.id === id)!.base })), false);
      setErr("error" in r ? r.error : null);
    });
  return (
    <>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[112px_1fr_auto] items-baseline gap-3 border-b border-rule py-2.5">
            <span className="text-body-strong">{r.date}</span>
            <span className="line-clamp-2 font-paper text-paper-small">{r.text}</span>
            <Button size="s" disabled={pending} onClick={() => run([r.id])}>
              Confirm
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <Button disabled={pending} onClick={() => run(rows.map((r) => r.id))}>
          Confirm all {rows.length}
        </Button>
      </div>
      {err && <p role="alert" className="mt-2 text-small text-alarm-text">{err}</p>}
    </>
  );
}
