import { useEffect, useMemo, useState } from "react";
import { getRows, getByAircraft, enqueueCapture, listCaptures } from "./db";
import type { QueuedCapture } from "./db";
import { scanPages, drainCaptures } from "./capture";
import type { Aircraft, Logbook, Page } from "./types";
import { color, text, radius, display, accentGradient, hit } from "./tokens";
import { CameraIcon } from "./icons";

// Photograph a logbook page → hold it locally → upload when online. The server
// stores the blob, inserts the page, and extracts; the new page flows back on
// the sync that runs after a successful upload.
//
// Screen 11 in the redesign — a sheet over Records → Scans, not a Back-stack
// screen. It used to ASK WHICH AIRCRAFT from inside an aircraft context whose
// header already carried the tail number, so the answer was on screen while the
// question was being asked. The aircraft is inherited now; the only thing left
// to choose is the logbook. The offline queue is described, never named.

export function CaptureScreen({
  aircraft,
  onClose,
  onSynced,
}: {
  /** From the tab you opened this over. Null only on the fleet-level entry. */
  aircraft: Aircraft | null;
  onClose: () => void;
  onSynced: () => void;
}) {
  const [fleet, setFleet] = useState<Aircraft[]>([]);
  const [picked, setPicked] = useState<Aircraft | null>(aircraft);
  const [logbooks, setLogbooks] = useState<Logbook[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lbId, setLbId] = useState<string | null>(null);
  const [handwritten, setHandwritten] = useState(true);
  const [held, setHeld] = useState<QueuedCapture[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!picked) {
      getRows<Aircraft>("aircraft").then((rows) =>
        setFleet(rows.sort((a, b) => (a.tail_number || "").localeCompare(b.tail_number || ""))),
      );
    }
    listCaptures().then(setHeld);
  }, [picked]);

  useEffect(() => {
    if (!picked) return;
    const id = picked.id;
    getByAircraft<Logbook>("logbook", id).then((lbs) => {
      setLogbooks(lbs);
      setLbId((cur) => (lbs.some((l) => l.id === cur) ? cur : (lbs[0]?.id ?? null)));
    });
    // "Adds to the end — 24 pages so far" needs a per-logbook page count.
    getByAircraft<Page>("page", id).then((pages) => {
      const n: Record<string, number> = {};
      for (const p of pages) n[p.logbook_id] = (n[p.logbook_id] ?? 0) + 1;
      setCounts(n);
    });
  }, [picked]);

  async function shoot() {
    if (!picked || !lbId) return;
    setBusy("Opening scanner…");
    setMsg(null);
    try {
      // One session can return a whole stack of pages, so hold them in the
      // order VisionKit handed them back.
      const pages = await scanPages();
      if (pages.length === 0) return; // backed out of the scanner
      setBusy(`Saving ${pages.length} page${pages.length === 1 ? "" : "s"}…`);
      for (const page of pages) {
        await enqueueCapture({
          id: crypto.randomUUID(),
          aircraft_id: picked.id,
          logbook_id: lbId,
          page_sequence: null,
          captured_at: new Date().toISOString(),
          is_handwritten: handwritten ? 1 : 0,
          image: page.image,
          thumbnail: page.thumbnail,
        });
      }
      setHeld(await listCaptures());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function upload() {
    setBusy("Uploading…");
    setMsg(null);
    const { uploaded, failed } = await drainCaptures((d, t) => setBusy(`Uploading ${d} of ${t}`));
    setHeld(await listCaptures());
    setBusy(null);
    setMsg(
      failed
        ? `${uploaded} uploaded, ${failed} still waiting — they'll go on the next sync.`
        : `${uploaded} page${uploaded === 1 ? "" : "s"} uploaded — they'll appear once they're read.`,
    );
    if (uploaded > 0) onSynced();
  }

  const uploading = !!busy && busy.startsWith("Uploading");
  const canShoot = !!picked && !!lbId && !busy;
  // Most recent first — proof the photograph worked, at the page viewer's size.
  const strip = useMemo(() => [...held].reverse().slice(0, 12), [held]);

  return (
    <Sheet onClose={onClose}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
        <h2 style={{ ...text.screenTitle, fontSize: 19, color: color.ink, margin: 0 }}>Scan pages</h2>
        {picked && <span style={{ ...text.meta, color: color.faint, marginLeft: "auto" }}>{picked.tail_number}</span>}
      </div>

      {/* The fleet-level entry has no aircraft in context, so it asks — once, in
          the switcher's row idiom rather than the old pill row. */}
      {!picked ? (
        <>
          <Label>Which aircraft</Label>
          {fleet.length === 0 ? (
            <Panel title="No aircraft yet" detail="Add one in the web app and it will appear here." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {fleet.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setPicked(a)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                    background: color.surfaceRaised, border: `1px solid ${color.hairline}`,
                    borderRadius: radius.row, padding: "12px 13px", minHeight: hit.min, cursor: "pointer",
                  }}
                >
                  <span style={{ fontFamily: display, fontSize: 15, fontWeight: 700, color: color.ink }}>
                    {a.tail_number}
                  </span>
                  <span style={{ ...text.meta, color: color.dim, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[a.make, a.model].filter(Boolean).join(" ")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <Label>Which logbook</Label>
          {logbooks.length === 0 ? (
            <Panel title="No logbooks yet" detail="Create one in the web app and it will appear here." />
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {logbooks.map((l) => {
                  const on = l.id === lbId;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setLbId(l.id)}
                      style={{
                        borderRadius: radius.chip, padding: "7px 12px", minHeight: hit.min,
                        background: on ? color.accent : color.surfaceRaised,
                        border: `1px solid ${on ? color.accent : color.hairline}`,
                        color: on ? color.onAccent : color.dim,
                        fontFamily: text.rowTitle.fontFamily, fontSize: 12, fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {l.title || l.type}
                    </button>
                  );
                })}
              </div>
              {/* Scanning appends. Re-sequencing is a separate, deliberate act on
                  the web — saying where the pages land stops anyone believing
                  they have to shoot in order. */}
              <div style={{ ...text.meta, color: color.faint, marginTop: 9 }}>
                Adds to the end{lbId && counts[lbId] ? ` — ${counts[lbId]} pages so far` : ""}.
              </div>
            </>
          )}

          {/* The old label read "Handwritten page (routes to vision extraction)".
              The routing is ours; what the owner picks is whether the pages have
              handwriting on them, and what it costs them is time. */}
          <button
            onClick={() => setHandwritten((v) => !v)}
            aria-pressed={handwritten}
            style={{
              display: "flex", alignItems: "center", gap: 14, textAlign: "left", width: "100%",
              background: color.surfaceRaised, border: `1px solid ${color.hairline}`,
              borderRadius: radius.row, padding: "13px 15px", marginTop: 16, cursor: "pointer",
            }}
          >
            <span>
              <span style={{ ...text.rowTitle, color: color.ink, display: "block" }}>Handwritten entries</span>
              <span style={{ ...text.meta, color: color.faint, display: "block", marginTop: 3, lineHeight: 1.45 }}>
                Reads cursive as well as typed entries. Turn it off for printed pages and they come back faster.
              </span>
            </span>
            <span
              style={{
                flex: "none", width: 42, height: 26, borderRadius: 13,
                background: handwritten ? color.accent : color.surface,
                border: `1px solid ${handwritten ? color.accent : color.hairline}`,
                position: "relative", transition: "background .15s",
              }}
            >
              <span style={{ position: "absolute", top: 2, left: handwritten ? 18 : 2, width: 20, height: 20, borderRadius: 10, background: "#fff", transition: "left .15s" }} />
            </span>
          </button>

          <button
            onClick={shoot}
            disabled={!canShoot}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%",
              height: hit.primary, marginTop: 18, borderRadius: 15,
              background: canShoot ? accentGradient : color.surfaceRaised,
              border: canShoot ? "none" : `1px solid ${color.hairline}`,
              color: canShoot ? color.onAccent : color.faint,
              fontFamily: text.rowTitle.fontFamily, fontSize: 16, fontWeight: 600,
              cursor: canShoot ? "pointer" : "default",
            }}
          >
            {!busy && <CameraIcon size={18} color={canShoot ? color.onAccent : color.faint} />}
            {busy && !uploading ? busy : "Scan pages"}
          </button>
          <div style={{ ...text.meta, color: color.faint, textAlign: "center", lineHeight: 1.45, maxWidth: 250, margin: "10px auto 0" }}>
            Apple's scanner finds the page edges. Shoot the whole stack in one go — up to 24 pages.
          </div>
        </>
      )}

      {held.length > 0 && (
        <>
          <div style={{ marginTop: 22 }}><Label>On this phone</Label></div>
          <div
            style={{
              background: color.surfaceRaised, border: `1px solid ${color.hairline}`,
              borderRadius: radius.card, padding: 14, display: "flex", flexDirection: "column", gap: 12,
            }}
          >
            <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
              {strip.map((c) => (
                <img
                  key={c.id}
                  src={`data:image/jpeg;base64,${c.thumbnail}`}
                  alt=""
                  style={{ flex: "none", width: 38, height: 50, objectFit: "cover", borderRadius: 5, border: `1px solid ${color.hairline}` }}
                />
              ))}
            </div>
            <div>
              <div style={{ ...text.rowTitle, color: color.ink }}>
                {held.length} page{held.length === 1 ? "" : "s"} saved on your phone
              </div>
              <div style={{ ...text.meta, color: color.faint, marginTop: 3, lineHeight: 1.45 }}>
                They upload on the next sync. Send them now if you have signal.
              </div>
            </div>
            {/* Secondary on purpose: scanning more is the likelier next act, and
                the upload happens by itself anyway. */}
            <button
              onClick={upload}
              disabled={!!busy}
              style={{
                height: hit.stepper, borderRadius: radius.control,
                background: color.surface, border: `1px solid ${color.hairline}`,
                color: color.accent, fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: 600,
                cursor: busy ? "default" : "pointer", opacity: busy && !uploading ? 0.5 : 1,
              }}
            >
              {uploading ? busy : `Upload ${held.length} page${held.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}

      {msg && <div style={{ ...text.secondary, color: color.dim, marginTop: 14 }}>{msg}</div>}
    </Sheet>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 60, display: "flex", alignItems: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxHeight: "92vh", overflowY: "auto",
          background: color.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          border: `1px solid ${color.hairline}`, borderBottom: "none",
          padding: "10px 20px calc(22px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: color.hairline, margin: "0 auto 14px" }} />
        {children}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ ...text.sectionLabel, color: color.faint, marginBottom: 8 }}>{children}</div>;
}

function Panel({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{ background: color.surfaceRaised, border: `1px solid ${color.hairline}`, borderRadius: radius.row, padding: "13px 15px" }}>
      <div style={{ ...text.rowTitle, color: color.ink }}>{title}</div>
      <div style={{ ...text.meta, color: color.faint, marginTop: 3, lineHeight: 1.45 }}>{detail}</div>
    </div>
  );
}
