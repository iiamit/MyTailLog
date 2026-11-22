"use client";

import { useState, useTransition } from "react";
import { Button } from "@/ui/Button";
import { setGapStatus } from "../actions";

type Status = "open" | "no_pages_exist" | "asked_previous_owner" | "dismissed";
const WORD: Partial<Record<Status, string>> = {
  no_pages_exist: "You marked: no pages exist.",
  asked_previous_owner: "You noted: asked the previous owner.",
};

/** The gap's actions (W-BOOKS-04, F06): scan, mark "no pages exist", note "asked the previous owner", dismiss. */
export function GapActions({
  aircraftId,
  gapId,
  base,
  status,
  note,
  scanHref,
}: {
  aircraftId: string;
  gapId: string;
  base: string;
  status: string;
  note: string | null;
  scanHref: string;
}) {
  const [version, setVersion] = useState(base);
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<Status | null>(null);
  const [text, setText] = useState(note ?? "");
  const [msg, setMsg] = useState<{ text: string; undo?: Status } | null>(null);
  const set = WORD[status as Status];

  const save = (s: Status, n: string | null, undoTo?: Status) =>
    start(async () => {
      const r = await setGapStatus(aircraftId, gapId, s, n, version);
      if ("error" in r) return setMsg({ text: r.error });
      setVersion(r.updatedAt);
      setAsking(null);
      setMsg(
        s === "dismissed"
          ? { text: "Removed from the map.", undo: (undoTo ?? "open") as Status }
          : s === "open"
            ? { text: "The gap is open again." }
            : { text: "Noted. The gap stays on the map with your note." },
      );
    });

  return (
    <div className="space-y-3">
      {set && !asking && (
        <p className="text-body">
          {set} {note && <span className="font-paper text-ink-2">“{note}”</span>}{" "}
          <button type="button" className="font-semibold text-board-ink underline decoration-dotted" onClick={() => setAsking(status as Status)}>
            Change
          </button>
        </p>
      )}
      {!set && !asking && (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" href={scanHref}>
            Scan the missing pages
          </Button>
          <Button onClick={() => setAsking("no_pages_exist")}>Mark “no pages exist”</Button>
          <Button onClick={() => setAsking("asked_previous_owner")}>Note: asked the previous owner</Button>
          <Button variant="quiet" disabled={pending} onClick={() => save("dismissed", null, status as Status)}>
            It isn’t a real gap
          </Button>
        </div>
      )}
      {asking && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(asking, text.trim() || null);
          }}
        >
          <label className="block text-small font-semibold" htmlFor="gap-note">
            {asking === "no_pages_exist" ? "Why no pages exist (optional)" : asking === "asked_previous_owner" ? "What you asked, and when (optional)" : "Note (optional)"}
          </label>
          {asking !== "open" && asking !== status && (
            <textarea
              id="gap-note"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              rows={2}
              className="w-full rounded-control border border-control-border bg-leaf px-3 py-2 font-paper text-paper-small"
            />
          )}
          {asking === status && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setAsking("no_pages_exist")}>No pages exist</Button>
              <Button onClick={() => setAsking("asked_previous_owner")}>Asked the previous owner</Button>
              <Button variant="quiet" disabled={pending} onClick={() => save("open", null)}>
                Open it again
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            {asking !== status && (
              <Button type="submit" variant="primary" disabled={pending}>
                Save
              </Button>
            )}
            <Button variant="quiet" onClick={() => setAsking(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <p role="status" className="text-small text-ink-2">
        {msg?.text}{" "}
        {msg?.undo && (
          <button type="button" className="font-semibold text-board-ink underline decoration-dotted" onClick={() => save(msg.undo!, note)}>
            Undo
          </button>
        )}
      </p>
    </div>
  );
}
