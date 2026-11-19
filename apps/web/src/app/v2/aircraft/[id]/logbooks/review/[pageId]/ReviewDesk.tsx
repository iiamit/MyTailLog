"use client";

import { useEffect, useReducer, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus } from "lucide-react";
import { Leaf, Leaves, SourceMat } from "@/ui/Board";
import { Button } from "@/ui/Button";
import { StatusMark, TrustMark } from "@/ui/Marks";
import { ScanViewer } from "@/ui/ScanViewer";
import {
  FIELD_LABEL, NUMERIC, PAPER, acceptedLine, confirmPlan, deskEntry, deskReducer, entryBox, entryTitle, fieldState, fmtDay, fmtMonDay,
  isUnsure, type Box, type DeskEntryInput, type DeskField, type DeskState, type FieldInfo,
} from "@/lib/v2/books";
import { confirmEntries, deleteEntry, flagPage, joinContinuation, undoConfirm } from "../../actions";

type EntryIn = { input: DeskEntryInput; fields: FieldInfo[]; boxes: Record<string, Box | null>; continuation: boolean };

const CORE: DeskField[] = ["entry_date", "description", "logbook_id"];
const NEW_FIELDS: DeskField[] = ["entry_date", "tach", "hobbs", "description", "work_performed", "signature_name", "mechanic_cert_number", "logbook_id"];
/** Fields worth a row: anything read, anything doubted, plus date, text and book. */
const visible = (e: DeskEntryInput, fs: FieldInfo[]) =>
  fs.filter((f) => f.doubt || CORE.includes(f.field) || (e[f.field as keyof DeskEntryInput] != null && String(e[f.field as keyof DeskEntryInput]) !== "" && !(Array.isArray(e[f.field as keyof DeskEntryInput]) && (e[f.field as keyof DeskEntryInput] as string[]).length === 0)));

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * The review desk's client half (W-BOOKS-07, 02 §6.7, 11 §4). Field outcomes stay on this page until an entry or
 * the page is confirmed, so nothing counts toward what is due before "Confirm" completes. Keys: J/K field, A accept,
 * E edit, X not on this page, Enter accept (or save the edit), Ctrl/Cmd+Enter confirm the entry, Shift+Enter
 * confirm the page and open the next (also inside inputs), [ ] page, + − 0 zoom, Esc leave an edit.
 */
export function ReviewDesk(p: {
  aircraftId: string;
  pageId: string;
  logbookId: string;
  canEdit: boolean;
  ownerName: string | null;
  title: string;
  bookName: string;
  position: string;
  meta: string;
  entries: EntryIn[];
  books: { id: string; label: string }[];
  prevHref: string | null;
  nextHref: string | null;
  backHref: string;
  waiting: number;
  notices: string[];
  landing: string | null;
  readState: "read" | "reading" | "failed";
  readError: string | null;
  ocrText: string | null;
  initial: { entry: string | null; field: string | null };
  undo: { ids: string[]; pageId: string; n: number } | null;
}) {
  const router = useRouter();
  const boxes = new Map(p.entries.map((e) => [e.input.id, e.boxes]));
  const [s, dispatch] = useReducer(deskReducer, undefined, (): DeskState => {
    const entries = p.entries.map((e) => deskEntry(e.input, visible(e.input, e.fields)));
    let entry = Math.max(0, entries.findIndex((e) => e.id === p.initial.entry));
    // Open on the least certain field: the first entry with an unsure field, its first field (fields are doubt-ordered).
    if (!p.initial.entry) entry = Math.max(0, entries.findIndex((e) => e.fields.some((f) => isUnsure(e, f))));
    const field = Math.max(0, entries[entry]?.fields.findIndex((f) => f.field === p.initial.field) ?? 0);
    return { entries, entry, field, editing: false, notice: null };
  });
  const [pending, start] = useTransition();
  const [undo, setUndo] = useState(p.undo);
  const zoomRef = useRef<((k: "+" | "-" | "0") => void) | null>(null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const cur = s.entries[s.entry];
  const field = cur?.fields[s.field];

  // Focus follows the selected field (its first control), and the edit input while editing.
  useEffect(() => {
    if (s.editing) {
      inputRef.current?.focus();
      const el = inputRef.current as HTMLInputElement | null;
      if (el && el.tagName !== "SELECT") {
        try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* date inputs have no caret */ }
      }
      return;
    }
    const row = deskRef.current?.querySelector<HTMLElement>(`[data-field="${s.entry}:${s.field}"]`);
    (row?.querySelector<HTMLElement>("button") ?? row)?.focus({ preventScroll: false });
  }, [s.entry, s.field, s.editing]);


  function confirm(only?: number) {
    if (!p.canEdit || pending) return;
    const plan = confirmPlan(s, only);
    if ("blocked" in plan) {
      dispatch({ type: "select", entry: plan.blocked.entry, field: plan.blocked.field });
      dispatch({ type: "notice", text: plan.blocked.message });
      return;
    }
    if ("error" in plan) return dispatch({ type: "notice", text: plan.error });
    start(async () => {
      const whole = only == null;
      const r = await confirmEntries(p.aircraftId, p.pageId, p.logbookId, plan.writes, whole);
      if ("error" in r) return dispatch({ type: "notice", text: r.error });
      if (!whole) {
        dispatch({ type: "entryConfirmed", entry: only! });
        dispatch({ type: "notice", text: `Entry ${only! + 1} confirmed.` });
        return;
      }
      const n = s.entries.length;
      if (r.next) router.push(`${p.backHref}/${r.next}?undo=${r.confirmed.join(",")}&from=${p.pageId}&n=${n}`);
      else router.push(`${p.backHref}?done=${encodeURIComponent(`That was the last page waiting. ${n} ${n === 1 ? "entry" : "entries"} confirmed on it.`)}`);
    });
  }

  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      if (s.editing && inputRef.current) dispatch({ type: "commit", value: inputRef.current.value });
      return confirm();
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (s.editing && inputRef.current) dispatch({ type: "commit", value: inputRef.current.value });
      return confirm(s.entry);
    }
    if (s.editing) {
      if (e.key === "Escape") {
        e.preventDefault();
        dispatch({ type: "cancel" });
      } else if (e.key === "Enter" && inputRef.current) {
        e.preventDefault();
        dispatch({ type: "commit", value: inputRef.current.value });
      }
      return;
    }
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === "j") dispatch({ type: "next" });
    else if (k === "k") dispatch({ type: "prev" });
    else if (k === "[" && p.prevHref) router.push(p.prevHref);
    else if (k === "]" && p.nextHref) router.push(p.nextHref);
    else if (k === "+" || k === "=" || k === "-" || k === "−" || k === "0") zoomRef.current?.(k === "0" ? "0" : k === "+" || k === "=" ? "+" : "-");
    else if (!p.canEdit) return;
    else if (k === "a" || k === "A" || (k === "Enter" && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement))) dispatch({ type: "accept" });
    else if (k === "e" || k === "E") dispatch({ type: "edit" });
    else if (k === "x" || k === "X") dispatch({ type: "absent" });
    else return;
    e.preventDefault();
  }
  const keyRef = useRef(onKey);
  useEffect(() => {
    keyRef.current = onKey;
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  function pick(j: number, type: "accept" | "edit" | "absent") {
    dispatch({ type: "select", entry: s.entry, field: j });
    dispatch({ type });
  }
  // What the live region says: a notice, else the field now in focus.
  const said = s.notice ?? (cur && field ? `${FIELD_LABEL[field.field]}, ${display(cur.values[field.field], field.field, p.books) || "empty"}, ${fieldState(cur, field).toLowerCase()}.${field.doubt && isUnsure(cur, field) ? ` ${field.doubt}` : ""}` : "");

  const unsure = cur ? cur.fields.filter((f) => isUnsure(cur, f)).length : 0;
  const lit = cur && field ? boxes.get(cur.id)?.[field.field] ?? null : null;
  const quiet = cur ? entryBox({ field_boxes: boxes.get(cur.id) ?? null }) : null;

  const pageActions = (
    <details className="relative">
      <summary className="cursor-pointer text-small font-semibold text-ink-2">More</summary>
      <div className="mt-2 space-y-2 rounded-control border border-rule bg-leaf p-3 text-small">
        {p.ocrText && (
          <details>
            <summary className="cursor-pointer font-semibold">Show the text as read</summary>
            <pre className="mt-2 max-h-60 overflow-auto font-app text-small whitespace-pre-wrap">{p.ocrText}</pre>
          </details>
        )}
        {p.canEdit && (
          <>
            <button
              type="button"
              className="block font-semibold text-board-ink underline decoration-dotted"
              onClick={() => start(async () => { const r = await flagPage(p.aircraftId, p.pageId); dispatch({ type: "notice", text: "error" in r ? r.error : "Page flagged. It stays out of the waiting list until you change it." }); })}
            >
              Flag this page
            </button>
            {/* shortcut: read again, crop, attachments and page delete stay on today's desk until their v2 tools land. */}
            <Link className="block font-semibold text-board-ink underline decoration-dotted" href={`/aircraft/${p.aircraftId}/pages/${p.pageId}/review?ui=v1`}>
              Read again, crop or attach files (today’s desk)
            </Link>
          </>
        )}
      </div>
    </details>
  );

  const left = (
    <Leaf label="Review desk" className="flex flex-col !pb-0">
      <div ref={deskRef} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 text-small text-ink-2">
          <Link href={p.backHref} className="font-semibold text-board-ink underline decoration-dotted">
            All {p.waiting} waiting
          </Link>
          <span>{p.position}</span>
          <span className="flex gap-2">
            {p.prevHref && <Link href={p.prevHref} className="font-semibold" aria-keyshortcuts="[">Previous page</Link>}
            {p.nextHref && <Link href={p.nextHref} className="font-semibold" aria-keyshortcuts="]">Next page</Link>}
          </span>
        </div>
        {undo && (
          <p role="status" className="mt-2 rounded-control bg-leaf-2 px-3 py-2 text-small">
            Previous page confirmed, {undo.n} {undo.n === 1 ? "entry" : "entries"}.{" "}
            <button
              type="button"
              className="font-semibold text-board-ink underline decoration-dotted"
              onClick={() => start(async () => {
                const r = await undoConfirm(p.aircraftId, undo.ids, [undo.pageId]);
                if ("error" in r) return dispatch({ type: "notice", text: r.error });
                setUndo(null);
                router.push(`${p.backHref}/${undo.pageId}`);
              })}
            >
              Undo
            </button>
          </p>
        )}
        {!p.canEdit && (
          <p className="mt-2 rounded-control bg-leaf-2 px-3 py-2 text-small">You can view this page. Ask {p.ownerName ?? "the owner"} for edit access to confirm it.</p>
        )}
        {p.notices.map((n) => (
          <p key={n} className="mt-2 rounded-control border border-rule px-3 py-2 text-small">{n}</p>
        ))}
        {p.landing && <p className="mt-2 text-small font-semibold">{p.landing}</p>}

        {p.readState !== "read" ? (
          <div className="mt-4 text-body">
            {p.readState === "reading" ? "Being read. This usually takes under a minute." : `The reader stopped: ${p.readError ?? "unknown reason"}.`}
          </div>
        ) : s.entries.length === 0 ? (
          <div className="mt-4 space-y-3">
            <p className="text-body">The reader found no entries on this page.</p>
            {p.canEdit && <Button onClick={() => dispatch({ type: "add", entry: blank(p.logbookId) })}><Plus aria-hidden size={16} /> Add an entry the AI missed</Button>}
          </div>
        ) : (
          <>
            {/* Entry strip: the page's entries as stops with their dates. */}
            <div role="group" aria-label="Entries on this page" className="mt-3 flex flex-wrap items-center gap-1 border-b border-rule pb-2">
              {s.entries.map((e, i) => (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={i === s.entry}
                  onClick={() => dispatch({ type: "select", entry: i })}
                  className={`state-layer inline-flex h-8 items-center gap-1.5 rounded-pill border px-3 text-small font-semibold ${i === s.entry ? "border-ink bg-ink text-leaf" : "border-control-border"}`}
                >
                  <span aria-hidden className={`inline-block size-2.5 rounded-full border-2 ${e.confirmed ? "border-current bg-current" : "border-dotted border-current"}`} />
                  {e.values.entry_date ? fmtMonDay(e.values.entry_date) : `Entry ${i + 1}`}
                  <span className="sr-only">{e.confirmed ? ", confirmed" : e.fields.some((f) => isUnsure(e, f)) ? ", has fields to check" : ", ready"}</span>
                </button>
              ))}
            </div>
            {cur && (
              <div className="min-h-0 flex-1 overflow-auto pt-3">
                <p className="text-small text-ink-3">Entry {s.entry + 1} of {s.entries.length} on this page</p>
                <h2 className="text-heading">
                  {cur.values.description || cur.values.work_performed ? entryTitle(cur.values) : "New entry"}
                  {/^\d{4}-\d{2}-\d{2}$/.test(cur.values.entry_date) ? `, ${fmtDay(cur.values.entry_date)}` : ""}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 text-small">
                  <TrustMark level={cur.confirmed ? "confirmed" : "ai_read"} label={cur.isNew ? "Added by you, not yet saved" : undefined} />
                  <span className="text-ink-2">
                    Least certain first. {unsure === 0 ? "Nothing" : unsure === 1 ? "1 field" : `${unsure} fields`} to check, {cur.fields.length - unsure} read clearly.
                  </span>
                </div>
                {p.entries.find((x) => x.input.id === cur.id)?.continuation && (
                  <p className="mt-2 rounded-control bg-leaf-2 px-3 py-2 text-small">
                    This looks like the rest of an entry from the page before.{" "}
                    {p.canEdit && (
                      <button type="button" className="font-semibold text-board-ink underline decoration-dotted" onClick={() => start(async () => { const r = await joinContinuation(p.aircraftId, cur.id); if ("error" in r) dispatch({ type: "notice", text: r.error }); else router.refresh(); })}>
                        Join them
                      </button>
                    )}
                  </p>
                )}
                <div className="mt-2">
                  {cur.fields.map((f, j) => (
                    <FieldRow
                      key={f.field}
                      id={`${s.entry}:${j}`}
                      entry={cur}
                      info={f}
                      selected={j === s.field}
                      editing={j === s.field && s.editing}
                      canEdit={p.canEdit}
                      books={p.books}
                      inputRef={j === s.field ? inputRef : undefined}
                      onSelect={() => dispatch({ type: "select", entry: s.entry, field: j })}
                      onAccept={() => pick(j, "accept")}
                      onEdit={() => pick(j, "edit")}
                      onAbsent={() => pick(j, "absent")}
                      onCommit={(v) => dispatch({ type: "commit", value: v })}
                      onUndo={() => dispatch({ type: "undo", entry: s.entry, field: f.field })}
                    />
                  ))}
                </div>
                {p.canEdit && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 pb-4 text-small">
                    <button type="button" className="inline-flex items-center gap-1 font-semibold text-board-ink underline decoration-dotted" onClick={() => dispatch({ type: "add", entry: blank(p.logbookId) })}>
                      <Plus aria-hidden size={14} /> Add an entry the AI missed
                    </button>
                    {!cur.confirmed && (
                      <Button size="s" disabled={pending} onClick={() => confirm(s.entry)} aria-keyshortcuts="Control+Enter Meta+Enter">
                        Confirm this entry <Kbd>Ctrl Enter</Kbd>
                      </Button>
                    )}
                    <button
                      type="button"
                      className="font-semibold text-alarm-text underline decoration-dotted"
                      onClick={() => {
                        if (cur.isNew) return dispatch({ type: "remove", entry: s.entry });
                        if (!window.confirm("Delete this entry? It is removed from the index. The page stays.")) return;
                        start(async () => {
                          const r = await deleteEntry(p.aircraftId, cur.id);
                          if ("error" in r) dispatch({ type: "notice", text: r.error });
                          else dispatch({ type: "remove", entry: s.entry });
                        });
                      }}
                    >
                      Delete this entry
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Page actions, pinned to the leaf bottom. */}
        <div className="sticky bottom-0 -mx-7 mt-auto border-t-2 border-ink bg-leaf px-7 pt-3 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            {p.canEdit && (
              <Button variant="primary" disabled={pending} onClick={() => confirm()} aria-keyshortcuts="Shift+Enter">
                {pending ? "Saving…" : "Confirm page and next"} <Kbd>Shift Enter</Kbd>
              </Button>
            )}
            <span className="text-small text-ink-2">{acceptedLine(s)}</span>
            <span className="ml-auto">{pageActions}</span>
          </div>
          <p aria-hidden className="mt-1 min-h-5 text-small font-semibold text-alarm-text">{s.notice}</p>
          <p className="key-hint mt-1 flex flex-wrap gap-x-3.5 text-[13px] text-ink-3" aria-hidden>
            <span><Kbd>J</Kbd> <Kbd>K</Kbd> next or previous field</span>
            {p.canEdit && <span><Kbd>A</Kbd> accept</span>}
            {p.canEdit && <span><Kbd>E</Kbd> edit</span>}
            {p.canEdit && <span><Kbd>X</Kbd> not on this page</span>}
            <span><Kbd>[</Kbd> <Kbd>]</Kbd> page</span>
          </p>
          <p aria-live="polite" className="sr-only">{said}</p>
        </div>
      </div>
    </Leaf>
  );

  const closeUp = lit && field ? lit : null;
  return (
    <Leaves split="1fr 1.08fr">
      {left}
      <SourceMat title={p.title} meta={`${p.meta} · ${cur?.confirmed ? "confirmed by you" : "read by AI"}`}>
        <ScanViewer src={`/api/page/${p.pageId}/image`} alt={`${p.title}, scanned page`} lit={lit ?? quiet} quiet={lit ? quiet : null} zoomRef={zoomRef} />
        {closeUp && (
          <div className="grid grid-cols-[230px_1fr] items-center gap-4">
            <div
              aria-hidden
              className="h-[76px] rounded-[2px] bg-no-repeat"
              style={{
                backgroundImage: `url(/api/page/${p.pageId}/image)`,
                backgroundSize: `${100 / Math.max(closeUp.w, 0.01)}% auto`,
                backgroundPosition: `${closeUp.w >= 1 ? 0 : (closeUp.x / (1 - closeUp.w)) * 100}% ${closeUp.h >= 1 ? 0 : (closeUp.y / (1 - closeUp.h)) * 100}%`,
              }}
            />
            <p className="text-[13px] leading-[1.45] text-on-cover-2">
              <span className="block text-[15px] text-on-cover">Close-up of the {FIELD_LABEL[field!.field].toLowerCase()}</span>
              Enlarged from the scan. If the paper is clearer, check it there.
            </p>
          </div>
        )}
        {!lit && cur && <p className="text-[13px] text-on-cover-2">Position on the page not known for this field.</p>}
      </SourceMat>
    </Leaves>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span aria-hidden className="key-hint rounded-[3px] border border-b-2 border-current px-1.5 py-[3px] text-[12px] leading-none font-semibold opacity-70">{children}</span>;
}

function display(v: string, f: DeskField, books: { id: string; label: string }[]) {
  return f === "logbook_id" ? books.find((b) => b.id === v)?.label ?? "" : v;
}

let seq = 0;
function blank(logbookId: string) {
  const id = `new-${Date.now()}-${seq++}`;
  const e = deskEntry(
    { id, logbook_id: logbookId, entry_date: null, tach: null, hobbs: null, airframe: null, description: null, work_performed: null, parts: null, signature_name: null, mechanic_cert_number: null, ad_refs: [], sb_refs: [], confidence: null, field_confidence: null, owner_confirmed: false },
    NEW_FIELDS.map((field) => ({ field, doubt: null, confidence: null, plausibility: false })),
  );
  return { ...e, isNew: true, outcome: { ...e.outcome } };
}

function FieldRow({ inputRef, ...p }: {
  id: string;
  entry: ReturnType<typeof deskEntry>;
  info: FieldInfo;
  selected: boolean;
  editing: boolean;
  canEdit: boolean;
  books: { id: string; label: string }[];
  inputRef?: React.RefObject<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement | null>;
  onSelect: () => void;
  onAccept: () => void;
  onEdit: () => void;
  onAbsent: () => void;
  onCommit: (v: string) => void;
  onUndo: () => void;
}) {
  const f = p.info.field;
  const value = p.entry.values[f];
  const state = fieldState(p.entry, p.info);
  const shown = display(value, f, p.books);
  const paper = PAPER.includes(f);
  const right =
    state === "Unsure" ? <StatusMark kind="due_soon" label="Unsure" compact />
    : state === "Not on this page" ? <span className="text-small text-ink-3">Not on this page</span>
    : <span className="inline-flex items-center gap-1 text-small font-semibold text-ink-2"><Check aria-hidden size={14} />{state}</span>;

  const input = p.editing && (
    f === "logbook_id" ? (
      <select ref={inputRef} defaultValue={value} aria-label={FIELD_LABEL[f]} className="h-[42px] rounded-control border-2 border-ink bg-leaf px-2 text-body">
        {p.books.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
      </select>
    ) : paper ? (
      <textarea ref={inputRef} defaultValue={value} aria-label={FIELD_LABEL[f]} rows={3} className="w-full rounded-control border-2 border-ink bg-leaf px-3 py-2 font-paper text-paper" />
    ) : (
      <input
        ref={inputRef}
        defaultValue={value}
        aria-label={FIELD_LABEL[f]}
        type={f === "entry_date" ? "date" : "text"}
        inputMode={NUMERIC.includes(f) ? "decimal" : undefined}
        className="h-[42px] w-full max-w-[260px] rounded-control border-2 border-ink bg-leaf px-3 text-body font-bold"
      />
    )
  );

  return (
    <div
      data-field={p.id}
      role="group"
      aria-label={`${FIELD_LABEL[f]}, ${state}`}
      tabIndex={-1}
      onClick={p.selected ? undefined : p.onSelect}
      className={`grid grid-cols-[112px_1fr_auto] gap-x-4 gap-y-2 border-b border-rule outline-none ${p.selected ? "-mx-4 items-start bg-leaf-2 px-4 py-4 shadow-[inset_4px_0_0_var(--color-ink)]" : "cursor-pointer items-center py-3"}`}
    >
      <span className={`text-[14px] font-bold text-ink-2 ${p.selected ? "pt-1" : ""}`}>{FIELD_LABEL[f]}</span>
      <div className="min-w-0">
        {p.editing ? (
          <div className="space-y-2">
            {input}
            <p className="text-small text-ink-3">Enter saves and moves on. Esc leaves without saving.</p>
            <div className="flex gap-2">
              <Button size="s" variant="primary" onClick={() => inputRef?.current && p.onCommit(inputRef.current.value)}>Save</Button>
            </div>
          </div>
        ) : (
          <span className={`${paper ? "font-paper text-paper" : "text-body"} ${state === "Not on this page" ? "text-ink-3 line-through" : ""} ${p.selected ? "" : "line-clamp-2"}`}>
            {(state === "Not on this page" ? display(p.entry.original[f], f, p.books) : shown) || <span className="text-ink-3">Empty</span>}
          </span>
        )}
        {p.selected && !p.editing && p.info.doubt && state === "Unsure" && <p className="mt-2 text-[15px] leading-[1.45]">{p.info.doubt}</p>}
        {p.selected && !p.editing && p.canEdit && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="s" variant="primary" onClick={p.onAccept} aria-keyshortcuts="a">
              <Check aria-hidden size={16} /> Confirm {shown ? (shown.length > 24 ? "as read" : shown) : "empty"} <Kbd>A</Kbd>
            </Button>
            <Button size="s" onClick={p.onEdit} aria-keyshortcuts="e">
              <Pencil aria-hidden size={16} /> Edit <Kbd>E</Kbd>
            </Button>
            <Button size="s" onClick={p.onAbsent} aria-keyshortcuts="x">
              Not on this page <Kbd>X</Kbd>
            </Button>
          </div>
        )}
      </div>
      <div className="text-right">
        {right}
        {state === "Not on this page" && p.canEdit && (
          <button type="button" className="ml-2 text-small font-semibold text-board-ink underline decoration-dotted" onClick={(e) => (e.stopPropagation(), p.onUndo())}>
            Undo
          </button>
        )}
      </div>
    </div>
  );
}

