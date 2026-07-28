import { useEffect, useState } from "react";
import { getRows, getByAircraft } from "./db";
import { localImageSrc } from "./blobs";
import type { Aircraft, LogEntry, Page } from "./types";
import { Card, Row, TopBar, dim, faint, ink, mono, panel, panel2, line, accent } from "./ui";

// ---- Hangar: the aircraft you have on device ----------------------------------
export function Hangar({
  onOpen,
  sync,
  syncing,
  cursor,
  error,
}: {
  onOpen: (a: Aircraft) => void;
  sync: () => void;
  syncing: string | null;
  cursor: number;
  error: string | null;
}) {
  const [aircraft, setAircraft] = useState<Aircraft[] | null>(null);

  useEffect(() => {
    getRows<Aircraft>("aircraft").then((rows) =>
      setAircraft(rows.sort((a, b) => (a.tail_number || "").localeCompare(b.tail_number || ""))),
    );
  }, [cursor]); // reload after a sync advances the cursor

  return (
    <>
      <button
        onClick={sync}
        disabled={!!syncing}
        style={{ background: accent, color: "#071018", border: "none", borderRadius: 10, padding: "12px", fontSize: 15, fontWeight: 700, marginTop: 14 }}
      >
        {syncing ?? (cursor > 0 ? "Sync" : "Sync now")}
      </button>
      {error && <p style={{ color: "#ff6b6b", fontSize: 13, marginTop: 10 }}>{error}</p>}

      <div style={{ marginTop: 18, color: faint, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>Your aircraft</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {aircraft?.length === 0 && <p style={{ color: faint, fontSize: 13 }}>Nothing on device yet — tap Sync.</p>}
        {aircraft?.map((a) => (
          <Card key={a.id} onClick={() => onOpen(a)}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...mono, fontSize: 16, fontWeight: 700 }}>{a.tail_number}</span>
              <span style={{ color: dim, fontSize: 13 }}>{[a.make, a.model].filter(Boolean).join(" ")}</span>
              <span style={{ marginLeft: "auto", color: faint }}>›</span>
            </div>
          </Card>
        ))}
        {!aircraft && <p style={{ color: faint, fontSize: 13 }}>Loading…</p>}
      </div>
    </>
  );
}

// ---- Entries: one aircraft's log, newest first --------------------------------
export function Entries({
  aircraft,
  onBack,
  onOpen,
  onScans,
}: {
  aircraft: Aircraft;
  onBack: () => void;
  onOpen: (e: LogEntry) => void;
  onScans: () => void;
}) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);

  useEffect(() => {
    getByAircraft<LogEntry>("log_entry", aircraft.id).then((rows) =>
      setEntries(rows.sort((a, b) => (b.entry_date || "").localeCompare(a.entry_date || ""))),
    );
  }, [aircraft.id]);

  return (
    <>
      <TopBar title={aircraft.tail_number} onBack={onBack} right={<button onClick={onScans} style={{ background: "transparent", color: accent, border: `1px solid ${line}`, borderRadius: 8, padding: "6px 11px", fontSize: 12.5, cursor: "pointer" }}>Scans ›</button>} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {entries?.length === 0 && <p style={{ color: faint, fontSize: 13 }}>No entries.</p>}
        {entries?.map((e) => (
          <div key={e.id} onClick={() => onOpen(e)} style={{ display: "flex", gap: 10, padding: "10px 2px", borderBottom: `1px solid ${line}`, cursor: "pointer" }}>
            <span style={{ ...mono, color: accent, fontSize: 11, width: 62, flex: "0 0 auto", paddingTop: 2 }}>{e.entry_date ?? "—"}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: ink }}>{e.description || e.work_performed || "(no description)"}</div>
              <div style={{ ...mono, color: faint, fontSize: 10.5, marginTop: 3 }}>
                {e.tach != null ? `TACH ${e.tach}` : e.hobbs != null ? `HOBBS ${e.hobbs}` : ""}
                {e.signature_name ? `  ·  ${e.signature_name}` : ""}
              </div>
            </div>
            <span style={{ color: faint }}>›</span>
          </div>
        ))}
        {!entries && <p style={{ color: faint, fontSize: 13 }}>Loading…</p>}
      </div>
    </>
  );
}

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
export function Pages({ aircraft, onBack, onOpen }: { aircraft: Aircraft; onBack: () => void; onOpen: (pages: Page[], i: number) => void }) {
  const [pages, setPages] = useState<Page[] | null>(null);
  useEffect(() => {
    getByAircraft<Page>("page", aircraft.id).then((rows) => setPages(orderPages(rows)));
  }, [aircraft.id]);

  return (
    <>
      <TopBar title={`${aircraft.tail_number} · scans`} onBack={onBack} right={<span style={{ color: faint, fontSize: 12 }}>{pages?.length ?? ""} pages</span>} />
      {pages?.length === 0 && <p style={{ color: faint, fontSize: 13, marginTop: 14 }}>No scans.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 }}>
        {pages?.map((p, i) => <Thumb key={p.id} pageId={p.id} onClick={() => onOpen(pages, i)} />)}
      </div>
      {!pages && <p style={{ color: faint, fontSize: 13, marginTop: 14 }}>Loading…</p>}
    </>
  );
}

function Thumb({ pageId, onClick }: { pageId: string; onClick: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    localImageSrc("page", pageId, { thumb: true }).then((s) => live && setSrc(s));
    return () => {
      live = false;
    };
  }, [pageId]);
  return (
    <div onClick={onClick} style={{ aspectRatio: "3 / 4", background: panel, border: `1px solid ${line}`, borderRadius: 8, overflow: "hidden", cursor: "pointer" }}>
      {src ? (
        <img src={src} alt="page thumbnail" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: faint, fontSize: 10 }}>—</div>
      )}
    </div>
  );
}

// ---- Full page viewer with prev/next through the ordered scans ----------------
export function PageViewer({ pages, index, onBack, onZoom }: { pages: Page[]; index: number; onBack: () => void; onZoom: (src: string) => void }) {
  const [i, setI] = useState(index);
  const [src, setSrc] = useState<string | null | "loading">("loading");
  const page = pages[i];

  useEffect(() => {
    let live = true;
    setSrc("loading");
    localImageSrc("page", page.id).then((s) => live && setSrc(s)).catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [page.id]);

  return (
    <>
      <TopBar title={`Page ${i + 1} of ${pages.length}`} onBack={onBack} />
      <div
        style={{ marginTop: 12, borderRadius: 10, border: `1px solid ${line}`, overflow: "hidden", background: panel, minHeight: 200, position: "relative" }}
        onClick={() => typeof src === "string" && onZoom(src)}
      >
        {src === "loading" && <div style={{ padding: 30, textAlign: "center", color: faint, fontSize: 13 }}>Loading…</div>}
        {src === null && <div style={{ padding: 30, textAlign: "center", color: faint, fontSize: 13 }}>Not on device — connect once, or use “Download all”.</div>}
        {typeof src === "string" && (
          <>
            <img src={src} alt="Scanned page" style={{ display: "block", width: "100%", height: "auto" }} />
            <span style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 11, padding: "3px 8px", borderRadius: 6 }}>⤢ Tap to zoom</span>
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0} style={navBtn(i === 0)}>‹ Prev</button>
        <button onClick={() => setI((n) => Math.min(pages.length - 1, n + 1))} disabled={i >= pages.length - 1} style={navBtn(i >= pages.length - 1)}>Next ›</button>
      </div>
    </>
  );
}

function navBtn(disabled: boolean): React.CSSProperties {
  return { flex: 1, background: disabled ? "transparent" : panel, color: disabled ? faint : ink, border: `1px solid ${line}`, borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, cursor: disabled ? "default" : "pointer" };
}
