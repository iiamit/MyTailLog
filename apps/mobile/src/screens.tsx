import { useEffect, useRef, useState } from "react";
import { getByAircraft } from "./db";
import { logbookLabel } from "@/lib/logbooks";
import { buildHistory, byMonth } from "./history";
import { shortDate } from "./airworthiness";
import { localImageSrc } from "./blobs";
import type { Urgency } from "@/lib/compliance";
import type { Aircraft, LogEntry, Page } from "./types";
import { Card, Row, TopBar, Pill, URGENCY_COLOR, URGENCY_LABEL, text, dim, faint, ink, mono, panel, panel2, line, accent, green, red } from "./ui";

// ---- Fleet home ------------------------------------------------------------
// "Which of my aircraft needs me?" in one glance. The fleet IS the content:
// Sign out moved into the avatar menu, and scanning moved into the aircraft
// context where the pages belong, so nothing competes with the aircraft.

export function Hangar({
  fleet,
  summaries,
  onOpen,
  syncing,
  syncedLabel,
  error,
}: {
  fleet: Aircraft[];
  summaries: Record<string, { urgency: Urgency; line: string }>;
  onOpen: (a: Aircraft) => void;
  syncing: string | null;
  syncedLabel: string;
  error: string | null;
}) {
  // Worst first, then soonest — a problem should be impossible to miss.
  const RANK: Record<string, number> = { overdue: 0, due_soon: 1, upcoming: 2, none: 3 };
  const sorted = [...fleet].sort(
    (a, b) =>
      (RANK[summaries[a.id]?.urgency ?? "none"] ?? 9) - (RANK[summaries[b.id]?.urgency ?? "none"] ?? 9) ||
      (a.tail_number || "").localeCompare(b.tail_number || ""),
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <h1 style={{ ...text.screenTitle, color: ink, margin: 0 }}>Your fleet</h1>
        <span style={{ ...text.meta, color: syncing ? faint : green, marginLeft: "auto" }}>
          {syncing ?? syncedLabel}
        </span>
      </div>
      {error && <p style={{ ...text.secondary, color: red, marginBottom: 10 }}>{error}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.length === 0 && <p style={{ ...text.secondary, color: faint }}>Nothing on device yet — pull to sync.</p>}
        {sorted.map((a) => {
          const s = summaries[a.id];
          const u = s?.urgency ?? "none";
          const c = URGENCY_COLOR[u] ?? faint;
          return (
            <button
              key={a.id}
              onClick={() => onOpen(a)}
              style={{
                position: "relative", overflow: "hidden", textAlign: "left",
                background: panel, border: `1px solid ${line}`, borderRadius: 16,
                padding: "15px 16px 15px 19px", cursor: "pointer", minHeight: 44,
                display: "flex", flexDirection: "column", gap: 9,
              }}
            >
              {/* 3pt semantic bar on the leading edge, clipped by the radius. */}
              <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: c }} />
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ ...text.tailCard, color: ink }}>{a.tail_number}</span>
                <span style={{ marginLeft: "auto" }}>
                  <Pill tone={u}>{URGENCY_LABEL[u]}</Pill>
                </span>
              </span>
              <span style={{ ...text.secondary, color: dim }}>
                {[a.make, a.model].filter(Boolean).join(" ") || "Details not set"}
              </span>
              <span style={{ height: 1, background: line }} />
              {/* The one line that matters — the date that drives the status. */}
              <span style={{ ...text.secondary, fontWeight: 500, color: u === "overdue" || u === "due_soon" ? c : dim }}>
                {s?.line ?? "Nothing tracked yet"}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ---- Entries: one aircraft's log, newest first --------------------------------
export function Entries({ aircraft, onOpen }: { aircraft: Aircraft; onOpen: (e: LogEntry) => void }) {
  const [rows, setRows] = useState<LogEntry[] | null>(null);

  useEffect(() => {
    getByAircraft<LogEntry>("log_entry", aircraft.id).then(setRows);
  }, [aircraft.id]);

  if (!rows) return <p style={{ ...text.secondary, color: faint }}>Loading…</p>;
  if (rows.length === 0) return <p style={{ ...text.secondary, color: faint }}>No entries yet.</p>;

  const months = byMonth(buildHistory(rows));

  return (
    <>
      {months.map((m) => (
        <div key={m.label} style={{ marginBottom: 18 }}>
          <div style={{ ...text.meta, fontWeight: 600, letterSpacing: "0.07em", color: faint, marginBottom: 10 }}>
            {m.label}
          </div>
          {m.items.map((h, idx) => (
            <div key={h.id} onClick={() => onOpen(h.entry)} style={{ display: "flex", gap: 12, cursor: "pointer" }}>
              {/* Rail: category glyph, with a connector to the next entry. */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 auto", width: 34 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center",
                  background: `${CATEGORY[h.category].color}1F`, color: CATEGORY[h.category].color, fontSize: 14,
                }}>
                  {CATEGORY[h.category].glyph}
                </div>
                {idx < m.items.length - 1 && <div style={{ flex: 1, width: 1, background: line, marginTop: 4 }} />}
              </div>

              <div style={{ minWidth: 0, flex: 1, paddingBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                  <span style={{ ...text.rowTitle, color: ink }}>{h.title}</span>
                  {h.merged > 1 && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: dim, background: panel2, borderRadius: 5, padding: "1px 5px" }}>
                      {h.merged} merged
                    </span>
                  )}
                </div>
                {h.summary && h.summary !== h.title && (
                  <div style={{ ...text.secondary, color: dim, marginTop: 4 }}>{h.summary}</div>
                )}
                <div style={{ ...text.meta, color: faint, marginTop: 5 }}>
                  {h.entry.entry_date ? shortDate(h.entry.entry_date) : "undated"}
                  {h.entry.tach != null ? ` · tach ${h.entry.tach}` : h.entry.hobbs != null ? ` · hobbs ${h.entry.hobbs}` : ""}
                  {h.entry.signature_name ? ` · ${h.entry.signature_name}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

const CATEGORY: Record<string, { color: string; glyph: string }> = {
  oil: { color: "#F2B544", glyph: "◍" },
  avionics: { color: "#5AA9FF", glyph: "◎" },
  inspection: { color: "#4ED69A", glyph: "✓" },
  other: { color: "#6B7482", glyph: "▫" },
};

// ---- Entry detail -------------------------------------------------------------
export function EntryDetail({ entry, tail, onBack, onZoom }: { entry: LogEntry; tail: string; onBack: () => void; onZoom: (src: string) => void }) {
  const ads = [...(entry.ad_refs ?? []), ...(entry.sb_refs ?? [])];
  return (
    <>
      <TopBar title={tail} onBack={onBack} />
      <div style={{ marginTop: 12 }}>
        <div style={{ ...mono, color: accent, fontSize: 13 }}>{entry.entry_date ?? "—"}</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{entry.description || "(no description)"}</div>
      </div>
      {entry.page_id && <Scan pageId={entry.page_id} onZoom={onZoom} />}
      {entry.work_performed && <Block label="Work performed" text={entry.work_performed} />}
      {entry.parts && <Block label="Parts" text={entry.parts} />}
      <div style={{ marginTop: 14 }}>
        {(entry.tach != null || entry.hobbs != null) && (
          <Row label="Meters" value={[entry.tach != null ? `tach ${entry.tach}` : null, entry.hobbs != null ? `hobbs ${entry.hobbs}` : null].filter(Boolean).join("  ·  ")} />
        )}
        {entry.signature_name && <Row label="Signed" value={[entry.signature_name, entry.mechanic_cert_number].filter(Boolean).join(" · ")} />}
        {ads.length > 0 && <Row label="AD / SB" value={ads.join(", ")} />}
      </div>
    </>
  );
}

// The entry's original scanned page. Downloads once (Bearer route), then cached
// on device — views offline after the first load. Tap to open full-screen.
function Scan({ pageId, onZoom }: { pageId: string; onZoom: (src: string) => void }) {
  const [src, setSrc] = useState<string | null | "loading">("loading");
  useEffect(() => {
    let live = true;
    setSrc("loading");
    localImageSrc("page", pageId)
      .then((s) => live && setSrc(s))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [pageId]);

  const box: React.CSSProperties = { marginTop: 14, borderRadius: 10, border: `1px solid ${line}`, overflow: "hidden", background: panel };
  if (src === "loading") return <div style={{ ...box, padding: 20, textAlign: "center", color: faint, fontSize: 13 }}>Loading scan…</div>;
  if (!src) return <div style={{ ...box, padding: 20, textAlign: "center", color: faint, fontSize: 13 }}>Scan not on device — connect once to download it.</div>;
  return (
    <div style={{ ...box, position: "relative" }} onClick={() => onZoom(src)}>
      <img src={src} alt="Scanned logbook page" style={{ display: "block", width: "100%", height: "auto" }} />
      <span style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 11, padding: "3px 8px", borderRadius: 6 }}>⤢ Tap to zoom</span>
    </div>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginTop: 14, background: panel2, border: `1px solid ${line}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ color: faint, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: ink, fontSize: 13.5, marginTop: 5, whiteSpace: "pre-wrap" }}>{text}</div>
    </div>
  );
}

// Order pages by logbook then capture sequence — the reading order, so multi-page
// events sit next to each other.
function orderPages(pages: Page[]): Page[] {
  return [...pages].sort(
    (a, b) => (a.logbook_id || "").localeCompare(b.logbook_id || "") || (a.page_sequence ?? 1e9) - (b.page_sequence ?? 1e9),
  );
}

// ---- Scans browser: every page for an aircraft, tap to view full --------------
export function Pages({ aircraft, onOpen }: { aircraft: Aircraft; onOpen: (pages: Page[], i: number) => void }) {
  const [pages, setPages] = useState<Page[] | null>(null);
  const [book, setBook] = useState<string | null>(null);
  const [books, setBooks] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    getByAircraft<Page>("page", aircraft.id).then((rows) => setPages(orderPages(rows)));
    getByAircraft<{ id: string; type: string; title: string | null }>("logbook", aircraft.id).then((rows) =>
      setBooks(new Map(rows.map((r) => [r.id, r.title ?? logbookLabel(r.type as never, null)]))),
    );
  }, [aircraft.id]);

  const all = pages ?? [];
  const present = [...new Set(all.map((p) => p.logbook_id))];
  const shown = book ? all.filter((p) => p.logbook_id === book) : all;

  // Grouping IS the point: 111 undifferentiated thumbnails can't be searched by
  // eye, and "the prop logbook" is how an owner thinks about them.
  const runs: { id: string; label: string; pages: Page[] }[] = [];
  for (const p of shown) {
    const last = runs[runs.length - 1];
    if (last && last.id === p.logbook_id) last.pages.push(p);
    else runs.push({ id: p.logbook_id, label: books.get(p.logbook_id) ?? "Logbook", pages: [p] });
  }

  return (
    <>
      <div style={{ ...text.meta, color: faint, marginBottom: 12 }}>{all.length} pages</div>

      {present.length > 1 && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
          {[null, ...present].map((id) => {
            const on = book === id;
            return (
              <button
                key={id ?? "all"}
                onClick={() => setBook(id)}
                style={{
                  background: on ? accent : panel, color: on ? "#0B1017" : dim,
                  border: `1px solid ${on ? accent : line}`, borderRadius: 9,
                  padding: "7px 12px", minHeight: 36, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                {id === null ? "All" : books.get(id) ?? "Logbook"}
              </button>
            );
          })}
        </div>
      )}

      {runs.map((run, ri) => {
        const first = run.pages[0]?.page_sequence;
        const last = run.pages[run.pages.length - 1]?.page_sequence;
        return (
          <div key={`${run.id}-${ri}`} style={{ marginBottom: 18 }}>
            <div style={{ ...text.meta, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: faint, marginBottom: 9 }}>
              {run.label}
              {first != null && last != null ? ` · ${first}–${last}` : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 9 }}>
              {run.pages.map((p) => (
                <Thumb
                  key={p.id}
                  pageId={p.id}
                  seq={p.page_sequence}
                  onClick={() => onOpen(shown, shown.findIndex((x) => x.id === p.id))}
                />
              ))}
            </div>
          </div>
        );
      })}

      {pages?.length === 0 && <p style={{ ...text.secondary, color: faint }}>No scans yet.</p>}
      {!pages && <p style={{ ...text.secondary, color: faint }}>Loading…</p>}
    </>
  );
}

function Thumb({ pageId, seq, onClick }: { pageId: string; seq: number | null; onClick: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    localImageSrc("page", pageId, { thumb: true }).then((s) => live && setSrc(s));
    return () => { live = false; };
  }, [pageId]);
  return (
    <div onClick={onClick} style={{ position: "relative", aspectRatio: "3 / 4", background: panel, border: `1px solid ${line}`, borderRadius: 9, overflow: "hidden", cursor: "pointer" }}>
      {src ? (
        <img src={src} alt={`Page ${seq ?? ""}`} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: faint, fontSize: 10 }}>—</div>
      )}
      {seq != null && (
        <span style={{ position: "absolute", right: 4, bottom: 4, background: "rgba(255,255,255,.7)", color: "#0B1017", fontSize: 9.5, fontWeight: 600, borderRadius: 3, padding: "1px 4px" }}>
          {seq}
        </span>
      )}
    </div>
  );
}

// ---- Page viewer -----------------------------------------------------------
// Background darkens so the paper is the brightest thing on screen. The
// full-width Prev/Next buttons are gone: they took roughly a third of the
// screen to do what a swipe does, and neither could jump ten pages.

export function PageViewer({ pages, index, onBack, onZoom }: { pages: Page[]; index: number; onBack: () => void; onZoom: (src: string) => void }) {
  const [i, setI] = useState(index);
  const [src, setSrc] = useState<string | null | "loading">("loading");
  const page = pages[i];
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let live = true;
    setSrc("loading");
    localImageSrc("page", page.id).then((s) => live && setSrc(s)).catch(() => live && setSrc(null));
    return () => { live = false; };
  }, [page.id]);

  return (
    <div style={{ background: "#08090C", margin: -20, padding: "20px 0 0", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px" }}>
        <button onClick={onBack} aria-label="Back" style={{ background: "none", border: "none", color: accent, fontSize: 19, cursor: "pointer", minHeight: 44, padding: "0 8px 0 0" }}>‹</button>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontFamily: text.rowTitle.fontFamily, fontSize: 14.5, fontWeight: 600, color: ink }}>
            Page {i + 1} of {pages.length}
          </div>
        </div>
        <span style={{ width: 28 }} />
      </div>

      <div
        style={{ padding: "14px 14px 0" }}
        onTouchStart={(e) => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; }}
        onTouchEnd={(e) => {
          const t = e.changedTouches[0];
          if (!touch.current || !t) return;
          const dx = t.clientX - touch.current.x;
          // Horizontal swipe turns the page; vertical is a scroll, not a turn.
          if (Math.abs(dx) > 56 && Math.abs(t.clientY - touch.current.y) < 60) {
            setI((n) => Math.min(pages.length - 1, Math.max(0, n + (dx < 0 ? 1 : -1))));
          }
          touch.current = null;
        }}
        onClick={() => typeof src === "string" && onZoom(src)}
      >
        {src === "loading" && <div style={{ padding: 40, textAlign: "center", color: faint, fontSize: 13 }}>Loading…</div>}
        {src === null && <div style={{ padding: 40, textAlign: "center", color: faint, fontSize: 13 }}>Not on device — connect once, or use “Download all”.</div>}
        {typeof src === "string" && (
          <img src={src} alt={`Page ${i + 1}`} style={{ display: "block", width: "100%", height: "auto", borderRadius: 6, boxShadow: "0 14px 40px rgba(0,0,0,.5)" }} />
        )}
      </div>

      <div style={{ ...text.meta, color: faint, textAlign: "center", padding: "12px 0 8px" }}>
        Swipe to turn · tap to zoom
      </div>

      {/* The strip is for jumping ten pages at once, which a swipe can't do. */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 14px calc(20px + env(safe-area-inset-bottom))" }}>
        {pages.map((p, n) => (
          <StripThumb key={p.id} pageId={p.id} current={n === i} onClick={() => setI(n)} />
        ))}
      </div>
    </div>
  );
}

function StripThumb({ pageId, current, onClick }: { pageId: string; current: boolean; onClick: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    localImageSrc("page", pageId, { thumb: true }).then((s) => live && setSrc(s));
    return () => { live = false; };
  }, [pageId]);
  return (
    <button
      onClick={onClick}
      style={{
        flex: "0 0 auto", width: 38, height: 50, borderRadius: 5, overflow: "hidden", padding: 0,
        border: current ? `2px solid ${accent}` : `1px solid ${line}`,
        background: panel, opacity: current ? 1 : 0.6, cursor: "pointer",
      }}
    >
      {src && <img src={src} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />}
    </button>
  );
}
