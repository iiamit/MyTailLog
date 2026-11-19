"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowDownUp, FolderInput, GripVertical, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/ui/Button";
import { StatusMark, TrustMark } from "@/ui/Marks";
import { SORTS, pagesPhrase, plural, type PageSort, type PageStateKey } from "@/lib/v2/capture";
import { deletePagesNow, movePagesTo, readPagesAgain, savePageOrder } from "../actions";

export type GridPage = {
  id: string; seq: number | null; state: PageStateKey; entries: number; confirmed: number; spread: boolean; sideways: boolean; href: string;
};

// Quiet buttons on the ink selection bar (02 §6.4): leaf text in both themes.
const BAR = "!border-leaf/40 !text-leaf hover:!no-underline";

/** The state under a thumbnail: a mark and a word, never colour alone (W-BOOKS-05). */
export function PageStateMark({ state, word }: { state: PageStateKey; word: string }) {
  if (state === "confirmed") return <TrustMark level="confirmed" />;
  if (state === "ai_read") return <TrustMark level="ai_read" />;
  if (state === "needs_look") return <StatusMark kind="due_soon" label={word} compact />;
  if (state === "failed") return <StatusMark kind="overdue" label={word} compact />;
  if (state === "processing") return <StatusMark kind="neutral" label={word} compact />;
  return <StatusMark kind="no_record" label={word} compact />;
}

/** A native modal that names what an action affects before it runs (02 ConfirmDialog). */
function Confirm({ text, action, danger, onConfirm, onClose }: { text: string; action: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={action} className="m-auto max-w-[440px] rounded-leaf bg-leaf p-6 text-ink shadow-leaf backdrop:bg-cover/60">
      <p className="text-body">{text}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={() => ref.current?.close()}>Cancel</Button>
        <Button variant={danger ? "alarm" : "primary"} onClick={() => { onConfirm(); ref.current?.close(); }}>{action}</Button>
      </div>
    </dialog>
  );
}

/** Thumbnails, selection, the selection bar and reorder (W-BOOKS-05; 02 §6.3, §6.4). */
export function PagesGrid({
  aircraftId,
  logbookId,
  pages,
  canEdit,
  canReorder,
  bookLabel,
  moveTargets,
  stateWords,
}: {
  aircraftId: string;
  logbookId: string;
  pages: GridPage[];
  canEdit: boolean;
  canReorder: boolean;
  bookLabel: string;
  moveTargets: { id: string; label: string }[];
  stateWords: Record<PageStateKey, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [order, setOrder] = useState<string[] | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState<null | "again" | "delete">(null);
  const [target, setTarget] = useState(moveTargets[0]?.id ?? "");
  const cells = useRef<(HTMLElement | null)[]>([]);

  const byId = new Map(pages.map((p) => [p.id, p]));
  const list = order ? order.map((id) => byId.get(id)!).filter(Boolean) : pages;
  const chosen = pages.filter((p) => selected.has(p.id));
  const chosenEntries = chosen.reduce((n, p) => n + p.entries, 0);
  const chosenConfirmed = chosen.reduce((n, p) => n + p.confirmed, 0);
  const label = (p: GridPage) => `Page ${p.seq ?? "unnumbered"}, ${stateWords[p.state].toLowerCase()}`;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const cols = () => {
    const els = cells.current.filter(Boolean) as HTMLElement[];
    const top = els[0]?.offsetTop;
    return Math.max(1, els.filter((e) => e.offsetTop === top).length);
  };
  const move = (i: number) => {
    const j = Math.max(0, Math.min(list.length - 1, i));
    setFocus(j);
    cells.current[j]?.focus();
    return j;
  };

  const run = (fn: () => Promise<{ ok: true; n: number } | { error: string }>, done: (n: number) => string) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if ("error" in r) return setErr(r.error);
      setSelected(new Set());
      setSaid(done(r.n));
      router.refresh();
    });

  const onKey = (e: React.KeyboardEvent, i: number, p: GridPage) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols(), ArrowUp: -cols() }[e.key];
    if (order) {
      // Reorder mode: Space lifts and drops, arrows carry the lifted page, Escape puts everything back.
      if (e.key === " ") {
        e.preventDefault();
        setLifted(lifted ? null : p.id);
        setSaid(lifted ? `Page ${p.seq ?? ""} dropped at position ${i + 1}.` : `Page ${p.seq ?? ""} lifted. Use the arrow keys, then Space to drop.`);
      } else if (e.key === "Escape") {
        setLifted(null);
        setOrder(null);
        setSaid("Reordering cancelled.");
      } else if (step && lifted === p.id) {
        e.preventDefault();
        const j = Math.max(0, Math.min(list.length - 1, i + step));
        const next = [...order];
        next.splice(i, 1);
        next.splice(j, 0, p.id);
        setOrder(next);
        setFocus(j);
        requestAnimationFrame(() => cells.current[j]?.focus());
        setSaid(`Page ${p.seq ?? ""}, moved to position ${j + 1}.`);
      } else if (step) {
        e.preventDefault();
        move(i + step);
      }
      return;
    }
    if (step) {
      e.preventDefault();
      const j = move(i + step);
      if (e.shiftKey && canEdit) setSelected((s) => new Set(s).add(p.id).add(list[j].id));
    } else if (e.key === " " && canEdit) {
      e.preventDefault();
      toggle(p.id);
    } else if (e.key === "Escape" && selected.size) {
      setSelected(new Set());
    }
  };

  const drop = (overId: string) => {
    if (!order || !dragging || dragging === overId) return;
    const next = order.filter((id) => id !== dragging);
    next.splice(next.indexOf(overId), 0, dragging);
    setOrder(next);
  };

  return (
    <div className="mt-4">
      {canEdit && selected.size > 0 && (
        <div role="toolbar" aria-label="Selected pages" className="sticky top-0 z-10 mb-[18px] flex flex-wrap items-center gap-3 rounded-[3px] bg-ink py-2 pr-2.5 pl-3.5 text-[15px] text-leaf">
          <strong>{plural(selected.size, "page")} selected</strong>
          <span className="opacity-80">{pagesPhrase(chosen.map((p) => p.seq))}, {plural(chosenEntries, "entry", "entries")}</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {moveTargets.length > 0 && (
              <>
                <label className="sr-only" htmlFor="move-target">Move to</label>
                <select id="move-target" value={target} onChange={(e) => setTarget(e.target.value)} className="h-[34px] rounded-control border border-on-cover-2 bg-ink px-2 text-small text-leaf">
                  {moveTargets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <Button size="s" variant="quiet" className={BAR} disabled={pending} onClick={() => run(() => movePagesTo(aircraftId, [...selected], target), (n) => `Moved ${plural(n, "page")} to ${moveTargets.find((t) => t.id === target)?.label}.`)}>
                  <FolderInput aria-hidden size={16} /> Move to another book
                </Button>
              </>
            )}
            <Button size="s" variant="quiet" className={BAR} disabled={pending} onClick={() => setAsk("again")}>
              <RefreshCw aria-hidden size={16} /> Read again
            </Button>
            <Button size="s" variant="quiet" className={BAR} disabled={pending} onClick={() => setAsk("delete")}>
              <Trash2 aria-hidden size={16} /> Delete
            </Button>
            <Button size="s" variant="quiet" className={BAR} onClick={() => setSelected(new Set())}>Clear</Button>
          </span>
        </div>
      )}
      {canReorder && (
        <div className="mb-3 flex items-center gap-2">
          {order ? (
            <>
              <Button size="s" variant="primary" disabled={pending} onClick={() => run(async () => {
                const r = await savePageOrder(aircraftId, logbookId, order);
                if (!("error" in r)) setOrder(null);
                return r;
              }, (n) => `Saved the order of ${plural(n, "page")}.`)}>
                Done reordering
              </Button>
              <Button size="s" variant="quiet" onClick={() => { setOrder(null); setLifted(null); }}>Cancel</Button>
              <span className="text-small text-ink-3">Drag a page, or focus it and press Space, the arrow keys, then Space.</span>
            </>
          ) : (
            <Button size="s" variant="quiet" onClick={() => { setSelected(new Set()); setOrder(pages.map((p) => p.id)); }}>
              <ArrowDownUp aria-hidden size={16} /> Reorder
            </Button>
          )}
        </div>
      )}
      <p aria-live="polite" className="mb-2 min-h-5 text-small">{said}</p>
      {err && <p role="alert" className="mb-2 text-small font-semibold text-alarm-text">{err}</p>}
      <div role="grid" aria-label={`${bookLabel} pages`} aria-multiselectable={canEdit || undefined}>
        <div role="row" className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-3.5 gap-y-[18px]">
          {list.map((p, i) => {
            const on = selected.has(p.id);
            return (
              <div
                key={p.id}
                role="gridcell"
                aria-selected={canEdit ? on : undefined}
                className={`group relative grid content-start gap-1.5 text-[13px] leading-[1.3] ${order ? "cursor-grab" : ""} ${dragging === p.id ? "opacity-50" : ""}`}
                draggable={!!order}
                onDragStart={() => setDragging(p.id)}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => { if (order) { e.preventDefault(); drop(p.id); } }}
              >
                <Link
                  ref={(el) => { cells.current[i] = el; }}
                  href={order ? "#" : p.href}
                  scroll={false}
                  tabIndex={i === focus ? 0 : -1}
                  aria-label={label(p)}
                  onClick={(e) => order && e.preventDefault()}
                  onKeyDown={(e) => onKey(e, i, p)}
                  onFocus={() => setFocus(i)}
                  className="block rounded-[2px]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated thumbnail route */}
                  <img
                    src={`/api/page/${p.id}/image?thumb=1`}
                    alt=""
                    loading="lazy"
                    className={`aspect-[0.72] w-full rounded-[2px] bg-leaf-2 object-cover ${on || lifted === p.id ? "outline-[3px] outline-offset-2 outline-ink outline-solid" : "group-hover:outline group-hover:outline-rule-2"}`}
                  />
                </Link>
                {order && <GripVertical aria-hidden size={16} className="absolute top-1.5 right-1.5 rounded-[2px] bg-leaf text-ink-2" />}
                {canEdit && !order && (
                  <input
                    type="checkbox"
                    tabIndex={-1}
                    aria-label={`Select page ${p.seq ?? ""}`}
                    checked={on}
                    onChange={() => toggle(p.id)}
                    className={`absolute top-1.5 left-1.5 size-[18px] ${on || selected.size ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}
                  />
                )}
                <span className="font-bold">p. {p.seq ?? "?"}</span>
                <PageStateMark state={p.state} word={stateWords[p.state]} />
                {(p.spread || p.sideways) && (
                  <span className="flex flex-wrap gap-1 text-label text-ink-2">
                    {p.spread && <span className="rounded-[var(--radius-s)] border border-rule-2 px-1">2 pages</span>}
                    {p.sideways && <span className="rounded-[var(--radius-s)] border border-rule-2 px-1">Sideways text</span>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {ask === "again" && (
        <Confirm
          text={`Read ${plural(selected.size, "page")} again? Their unconfirmed entries are replaced. Confirmed entries are kept.`}
          action="Read again"
          onClose={() => setAsk(null)}
          onConfirm={() => run(() => readPagesAgain(aircraftId, [...selected]), (n) => `${plural(n, "page")} wait${n === 1 ? "s" : ""} to be read again.`)}
        />
      )}
      {ask === "delete" && (
        <Confirm
          danger
          text={`Delete ${plural(selected.size, "page")} and their ${plural(chosenEntries, "entry", "entries")}? This can't be undone.${chosenConfirmed ? " Confirmed entries on them are deleted too." : ""}`}
          action="Delete"
          onClose={() => setAsk(null)}
          onConfirm={() => run(() => deletePagesNow(aircraftId, [...selected]), (n) => `Deleted ${plural(n, "page")}.`)}
        />
      )}
    </div>
  );
}

/** Sort Select and direction toggle; the choice is remembered per browser (W-BOOKS-05). */
export function SortControl({ sort, desc, base }: { sort: PageSort; desc: boolean; base: string }) {
  const router = useRouter();
  const go = (s: PageSort, d: boolean) => {
    try {
      localStorage.setItem("mtl.pages.sort", JSON.stringify({ s, d }));
    } catch { /* storage blocked: the default sort stands */ }
    const q = new URLSearchParams(base.split("?")[1] ?? "");
    if (s !== "paper") q.set("sort", s);
    if (d) q.set("dir", "desc");
    router.replace(`${base.split("?")[0]}${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  useEffect(() => {
    if (sort !== "paper" || desc) return;
    try {
      const saved = JSON.parse(localStorage.getItem("mtl.pages.sort") ?? "null") as { s: PageSort; d: boolean } | null;
      if (saved && (saved.s !== "paper" || saved.d)) go(saved.s, saved.d);
    } catch { /* storage blocked: the default sort stands */ }
    // Only on arrival: a saved sort replaces the default once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="ml-auto flex items-center gap-1.5 text-small">
      <label htmlFor="page-sort" className="text-ink-3">Sort</label>
      <select id="page-sort" value={sort} onChange={(e) => go(e.target.value as PageSort, desc)} className="h-[34px] rounded-control border border-control-border bg-leaf px-2 text-ink">
        {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <Button size="s" variant="quiet" aria-label={desc ? "Descending; switch to ascending" : "Ascending; switch to descending"} onClick={() => go(sort, !desc)}>
        <ArrowDownUp aria-hidden size={16} /> {desc ? "Newest first" : "Oldest first"}
      </Button>
    </div>
  );
}

/** The page drawer's actions (W-BOOKS-05 Page selected). */
export function PageDrawerActions({
  aircraftId, pageId, reviewHref, closeHref, entries, confirmed,
}: { aircraftId: string; pageId: string; reviewHref: string | null; closeHref: string; entries: number; confirmed: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState<null | "again" | "delete">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const go = (fn: () => Promise<{ ok: true; n: number } | { error: string }>, after: (n: number) => void) =>
    start(async () => {
      const r = await fn();
      if ("error" in r) return setMsg(r.error);
      after(r.n);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {reviewHref && <Button size="s" variant="on-mat" href={reviewHref}>Open in the review desk</Button>}
      <Button size="s" variant="on-mat" disabled={pending} onClick={() => setAsk("again")}>Read again</Button>
      <Button size="s" variant="on-mat" disabled={pending} onClick={() => setAsk("delete")}>Delete page</Button>
      {msg && <p role="status" className="w-full text-small text-on-cover">{msg}</p>}
      {ask === "again" && (
        <Confirm text="Read this page again? Its unconfirmed entries are replaced. Confirmed entries are kept." action="Read again" onClose={() => setAsk(null)}
          onConfirm={() => go(() => readPagesAgain(aircraftId, [pageId]), () => { setMsg("The page waits to be read again."); router.refresh(); })} />
      )}
      {ask === "delete" && (
        <Confirm danger action="Delete"
          text={`Delete this page and its ${plural(entries, "entry", "entries")}? This can't be undone.${confirmed ? " Confirmed entries on it are deleted too." : ""}`}
          onClose={() => setAsk(null)}
          onConfirm={() => go(() => deletePagesNow(aircraftId, [pageId]), () => router.replace(closeHref))} />
      )}
    </div>
  );
}
