import { useEffect, useMemo, useState } from "react";
import { getByAircraft, enqueueCapture } from "./db";
import { localImageSrc } from "./blobs";
import { enqueue } from "./mutations";
import { canEdit } from "./actions";
import { scanPages } from "./capture";
import { sortPages, movedOrder, displayedOrder, type SortKey, type SortDir } from "@/lib/pageSort";
import { logbookLabel } from "@/lib/logbooks";
import { deleteWarning, entriesOnPages, toSortable, toggleSelection, type EntryLike } from "./page-select";
import { useSizeClass } from "./layout";
import type { Aircraft, Logbook, Page } from "./types";
import { color, text, radius, hit, display, alpha } from "./tokens";

// Putting a logbook back in order, and taking bad scans out of it — the two
// things the web app can do to a page stack and the phone could not.
//
// One logbook at a time on purpose. Page order only ever means anything WITHIN
// a book (@/lib/pageSort never sorts across them), and "reorder" over a mixed
// list of an airframe book and a prop book is a question with no answer.

const SORTS: { key: SortKey; label: string }[] = [
  { key: "upload", label: "Filed order" },
  { key: "date", label: "Date" },
  { key: "tach", label: "Tach" },
  { key: "airframe", label: "AFTT" },
];

export function PageManager({
  aircraft,
  onOpen,
  onChanged,
}: {
  aircraft: Aircraft;
  /** Tap a page when not selecting — opens the viewer. */
  onOpen?: (pages: Page[], index: number) => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [pages, setPages] = useState<Page[] | null>(null);
  const [books, setBooks] = useState<Logbook[]>([]);
  const [entries, setEntries] = useState<EntryLike[]>([]);
  const [bookId, setBookId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("upload");
  const [dir, setDir] = useState<SortDir>("asc");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const size = useSizeClass();
  const editable = canEdit(aircraft.id);

  useEffect(() => {
    let live = true;
    getByAircraft<Page>("page", aircraft.id).then((r) => live && setPages(r));
    getByAircraft<Logbook>("logbook", aircraft.id).then((r) => {
      if (!live) return;
      setBooks(r);
      setBookId((cur) => (r.some((b) => b.id === cur) ? cur : (r[0]?.id ?? null)));
    });
    getByAircraft<EntryLike>("log_entry", aircraft.id).then((r) => live && setEntries(r));
    return () => { live = false; };
  }, [aircraft.id]);

  const all = pages ?? [];
  const book = books.find((b) => b.id === bookId) ?? null;
  const mine = useMemo(() => all.filter((p) => p.logbook_id === bookId), [all, bookId]);

  // One sorted list, produced by the same functions the web app sorts with.
  const sortable = useMemo(() => toSortable(mine, entries), [mine, entries]);
  const ordered = useMemo(() => {
    const order = sortPages(sortable, sort, dir, new Map([[bookId ?? "", 0]]));
    const byId = new Map(mine.map((p) => [p.id, p]));
    return order.map((s) => byId.get(s.id)).filter((p): p is Page => !!p);
  }, [sortable, sort, dir, bookId, mine]);

  const selectedEntries = entriesOnPages(entries, selected);
  // Offered only when the arrangement on screen is a fact, not a guess (a page
  // with no date can't be placed by date) — displayedOrder says so.
  const persistable = sort === "upload" ? null : displayedOrder(sortable, bookId ?? "", sort, dir);

  async function reorder(orderedIds: string[], note: string) {
    if (!bookId) return;
    await enqueue("page.reorder", aircraft.id, { logbookId: bookId, orderedIds });
    // Optimistic: renumber locally so the grid moves under the finger rather
    // than after the next sync.
    setPages((cur) =>
      (cur ?? []).map((p) => {
        const i = orderedIds.indexOf(p.id);
        return i === -1 ? p : { ...p, page_sequence: i + 1 };
      }),
    );
    setSort("upload");
    setDir("asc");
    setMsg(note);
    await onChanged?.();
  }

  async function move(pageId: string, step: 1 | -1) {
    const next = movedOrder(sortable, pageId, step);
    if (!next) return;
    await reorder(next, "Moved.");
  }

  async function dropOn(targetId: string) {
    if (!drag || drag === targetId) return setDrag(null);
    const ids = ordered.map((p) => p.id);
    const from = ids.indexOf(drag);
    const to = ids.indexOf(targetId);
    setDrag(null);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    await reorder(ids, "Moved.");
  }

  async function remove() {
    const ids = [...selected];
    setConfirm(null);
    setBusy("Deleting…");
    await enqueue("page.delete", aircraft.id, { pageIds: ids });
    setPages((cur) => (cur ?? []).filter((p) => !ids.includes(p.id)));
    setSelected([]);
    setSelecting(false);
    setBusy(null);
    setMsg(`${ids.length} ${ids.length === 1 ? "scan" : "scans"} deleted.`);
    await onChanged?.();
  }

  /** Re-shoot a page: the new one is queued as a capture, the old one deleted. */
  async function retake() {
    const pageId = selected[0];
    if (!pageId || !bookId) return;
    setBusy("Opening scanner…");
    try {
      const shots = await scanPages();
      if (shots.length === 0) return;
      setBusy("Saving…");
      for (const shot of shots) {
        await enqueueCapture({
          id: crypto.randomUUID(),
          aircraft_id: aircraft.id,
          logbook_id: bookId,
          page_sequence: null,
          captured_at: new Date().toISOString(),
          is_handwritten: 1,
          image: shot.image,
          thumbnail: shot.thumbnail,
        });
      }
      await enqueue("page.delete", aircraft.id, { pageIds: [pageId] });
      setPages((cur) => (cur ?? []).filter((p) => p.id !== pageId));
      setSelected([]);
      setSelecting(false);
      setMsg("New scan saved. The old one is on its way out — read the new one when it arrives.");
      await onChanged?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!pages) return <p style={{ ...text.secondary, color: color.faint }}>Loading…</p>;
  if (all.length === 0) return <p style={{ ...text.secondary, color: color.faint }}>No scans yet.</p>;

  return (
    <>
      {books.length > 1 && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
          {books.map((b) => {
            const on = b.id === bookId;
            return (
              <button
                key={b.id}
                onClick={() => { setBookId(b.id); setSelected([]); }}
                style={{
                  minHeight: hit.min, padding: "8px 12px", borderRadius: radius.chip,
                  background: on ? color.accent : color.surfaceRaised,
                  border: `1px solid ${on ? color.accent : color.hairline}`,
                  color: on ? color.onAccent : color.dim,
                  fontFamily: text.rowTitle.fontFamily, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                }}
              >
                {logbookLabel(b.type, b.title)}
              </button>
            );
          })}
        </div>
      )}

      {/* Sort. Direction is a second tap on the sort you're already using. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {SORTS.map((s) => {
          const on = s.key === sort;
          return (
            <button
              key={s.key}
              onClick={() => {
                if (on) return setDir((d) => (d === "asc" ? "desc" : "asc"));
                setSort(s.key);
                setDir("asc");
              }}
              aria-pressed={on}
              style={{
                minHeight: hit.min, padding: "8px 11px", borderRadius: radius.chip,
                background: on ? color.surfaceRaised : "transparent",
                border: `1px solid ${on ? color.accent : color.hairline}`,
                color: on ? color.ink : color.dim,
                fontFamily: text.rowTitle.fontFamily, fontSize: 12.5, fontWeight: on ? 600 : 500, cursor: "pointer",
              }}
            >
              {s.label}
              {on ? (dir === "asc" ? " ↑" : " ↓") : ""}
            </button>
          );
        })}
        {editable && (
          <button
            onClick={() => { setSelecting((v) => !v); setSelected([]); }}
            style={{
              marginLeft: "auto", minHeight: hit.min, padding: "8px 12px", borderRadius: radius.chip,
              background: "transparent", border: `1px solid ${selecting ? color.accent : color.hairline}`,
              color: selecting ? color.accent : color.dim,
              fontFamily: text.rowTitle.fontFamily, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            }}
          >
            {selecting ? "Done" : "Select"}
          </button>
        )}
      </div>

      {editable && persistable && (
        <button
          onClick={() => reorder(persistable, "This is the filed order now.")}
          style={{
            width: "100%", minHeight: hit.stepper, marginBottom: 12, borderRadius: radius.control,
            background: color.surface, border: `1px solid ${color.hairline}`, color: color.accent,
            fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          Keep this as the filed order
        </button>
      )}

      <div style={{ ...text.meta, color: color.faint, marginBottom: 10 }}>
        {book ? logbookLabel(book.type, book.title) : "Logbook"} · {ordered.length} pages
        {selecting && selected.length > 0 ? ` · ${selected.length} selected` : ""}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${size === "regular" ? 5 : 3}, 1fr)`, gap: 9 }}>
        {ordered.map((p, i) => (
          <ManagedThumb
            key={p.id}
            page={p}
            index={i}
            count={ordered.length}
            selecting={selecting}
            selected={selected.includes(p.id)}
            editable={editable}
            reorderable={editable && sort === "upload"}
            draggable={size === "regular"}
            dragging={drag === p.id}
            onTap={() =>
              selecting ? setSelected((s) => toggleSelection(s, p.id)) : onOpen?.(ordered, i)
            }
            onMove={(step) => move(p.id, step)}
            onDragStart={() => setDrag(p.id)}
            onDropHere={() => dropOn(p.id)}
          />
        ))}
      </div>

      {selecting && selected.length > 0 && (
        <div
          style={{
            position: "sticky", bottom: 0, zIndex: 20, marginTop: 14,
            display: "flex", gap: 8,
            background: color.surface, border: `1px solid ${color.hairline}`,
            borderRadius: radius.card, padding: 10,
          }}
        >
          {selected.length === 1 && (
            <button
              onClick={retake}
              disabled={!!busy}
              style={{
                flex: 1, minHeight: hit.stepper, borderRadius: radius.control,
                background: color.surfaceRaised, border: `1px solid ${color.hairline}`, color: color.ink,
                fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Retake this page
            </button>
          )}
          <button
            onClick={() => setConfirm(deleteWarning(selected.length, selectedEntries))}
            disabled={!!busy}
            style={{
              flex: 1, minHeight: hit.stepper, borderRadius: radius.control,
              background: color.surfaceRaised, border: `1px solid ${alpha(color.danger, "66")}`, color: color.danger,
              fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            Delete {selected.length}
          </button>
        </div>
      )}

      {confirm && (
        <Confirm
          message={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={remove}
        />
      )}

      {busy && <p style={{ ...text.secondary, color: color.dim, marginTop: 12 }}>{busy}</p>}
      {msg && !busy && <p style={{ ...text.secondary, color: color.dim, marginTop: 12, lineHeight: 1.45 }}>{msg}</p>}
    </>
  );
}

function ManagedThumb({
  page, index, count, selecting, selected, editable, reorderable, draggable, dragging,
  onTap, onMove, onDragStart, onDropHere,
}: {
  page: Page;
  index: number;
  count: number;
  selecting: boolean;
  selected: boolean;
  editable: boolean;
  reorderable: boolean;
  draggable: boolean;
  dragging: boolean;
  onTap: () => void;
  onMove: (step: 1 | -1) => void;
  onDragStart: () => void;
  onDropHere: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    localImageSrc("page", page.id, { thumb: true }).then((s) => live && setSrc(s));
    return () => { live = false; };
  }, [page.id]);

  return (
    <div
      draggable={draggable && reorderable}
      onDragStart={onDragStart}
      onDragOver={(e) => { if (reorderable) e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); onDropHere(); }}
      style={{ opacity: dragging ? 0.4 : 1 }}
    >
      <div
        onClick={onTap}
        style={{
          position: "relative", aspectRatio: "3 / 4", cursor: "pointer",
          background: color.surface, borderRadius: radius.chip, overflow: "hidden",
          border: `${selected ? 2 : 1}px solid ${selected ? color.accent : color.hairline}`,
        }}
      >
        {src ? (
          <img src={src} alt={`Page ${page.page_sequence ?? index + 1}`} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: color.faint, fontSize: 10 }}>—</div>
        )}
        {selecting && (
          <span
            aria-hidden
            style={{
              position: "absolute", top: 5, left: 5, width: 20, height: 20, borderRadius: 10,
              background: selected ? color.accent : "rgba(0,0,0,.45)",
              border: `1.5px solid ${selected ? color.accent : "rgba(255,255,255,.7)"}`,
              color: color.onAccent, fontSize: 12, fontWeight: 700,
              display: "grid", placeItems: "center",
            }}
          >
            {selected ? "✓" : ""}
          </span>
        )}
        {page.page_sequence != null && (
          <span style={{ position: "absolute", right: 4, bottom: 4, background: "rgba(255,255,255,.75)", color: "#0B1017", fontSize: 9.5, fontWeight: 700, borderRadius: 3, padding: "1px 4px" }}>
            {page.page_sequence}
          </span>
        )}
      </div>

      {/* Up/down on every device: dragging a thumbnail with a thumb, on a phone,
          in a hangar, is not a thing anyone can do reliably. */}
      {editable && reorderable && (
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          <NudgeButton label="Move up" glyph="↑" disabled={index === 0} onClick={() => onMove(-1)} />
          <NudgeButton label="Move down" glyph="↓" disabled={index === count - 1} onClick={() => onMove(1)} />
        </div>
      )}
    </div>
  );
}

function NudgeButton({
  label, glyph, disabled, onClick,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        flex: 1, minHeight: hit.min, background: color.surfaceRaised,
        border: `1px solid ${color.hairline}`, borderRadius: radius.chip,
        color: disabled ? color.hairline : color.dim, fontSize: 13,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {glyph}
    </button>
  );
}

function Confirm({
  message, onCancel, onConfirm,
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 70, display: "grid", placeItems: "center", padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 340, background: color.surface, border: `1px solid ${color.hairline}`,
          borderRadius: radius.card, padding: 18,
        }}
      >
        <div style={{ fontFamily: display, fontSize: 16, fontWeight: 700, color: color.ink, marginBottom: 8 }}>
          Are you sure?
        </div>
        <p style={{ ...text.secondary, color: color.dim, lineHeight: 1.5, margin: "0 0 16px" }}>{message}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, minHeight: hit.stepper, borderRadius: radius.control,
              background: color.surfaceRaised, border: `1px solid ${color.hairline}`, color: color.ink,
              fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            Keep them
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, minHeight: hit.stepper, borderRadius: radius.control,
              background: color.danger, border: "none", color: color.onAccent,
              fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
