import { useEffect, useState } from "react";
import { getRows, getByAircraft, enqueueCapture, captureCount } from "./db";
import { takePhoto, drainCaptures } from "./capture";
import type { Aircraft, Logbook } from "./types";
import { TopBar, dim, faint, ink, accent, line, panel, panel2, mono } from "./ui";

// Photograph a logbook page → queue locally → upload when online. The server
// stores the blob, inserts the page, and extracts; the new page flows back on
// the sync that runs after a successful upload.
export function CaptureScreen({ onBack, onSynced }: { onBack: () => void; onSynced: () => void }) {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [acId, setAcId] = useState<string | null>(null);
  const [logbooks, setLogbooks] = useState<Logbook[]>([]);
  const [lbId, setLbId] = useState<string | null>(null);
  const [handwritten, setHandwritten] = useState(true);
  const [pending, setPending] = useState(0);
  const [thumb, setThumb] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getRows<Aircraft>("aircraft").then((rows) => {
      const sorted = rows.sort((a, b) => (a.tail_number || "").localeCompare(b.tail_number || ""));
      setAircraft(sorted);
      if (sorted.length === 1) setAcId(sorted[0].id);
    });
    captureCount().then(setPending);
  }, []);

  useEffect(() => {
    if (!acId) {
      setLogbooks([]);
      setLbId(null);
      return;
    }
    getByAircraft<Logbook>("logbook", acId).then((lbs) => {
      setLogbooks(lbs);
      setLbId(lbs[0]?.id ?? null);
    });
  }, [acId]);

  async function shoot() {
    if (!acId || !lbId) return;
    setBusy("Opening camera…");
    setMsg(null);
    try {
      const photo = await takePhoto();
      if (!photo) return;
      await enqueueCapture({
        id: crypto.randomUUID(),
        aircraft_id: acId,
        logbook_id: lbId,
        page_sequence: null,
        captured_at: new Date().toISOString(),
        is_handwritten: handwritten ? 1 : 0,
        image: photo.image,
        thumbnail: photo.thumbnail,
      });
      setThumb(photo.thumbnail);
      setPending(await captureCount());
      setMsg("Queued — snap more, or upload.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function upload() {
    setBusy("Uploading…");
    setMsg(null);
    const { uploaded, failed } = await drainCaptures((d, t) => setBusy(`Uploading… ${d}/${t}`));
    setPending(await captureCount());
    setBusy(null);
    setMsg(`Uploaded ${uploaded}${failed ? `, ${failed} failed` : ""}.`);
    if (uploaded > 0) onSynced();
  }

  const canShoot = !!acId && !!lbId && !busy;

  return (
    <>
      <TopBar title="Capture page" onBack={onBack} />

      <Label>Aircraft</Label>
      <Pills options={aircraft.map((a) => ({ id: a.id, label: a.tail_number }))} value={acId} onPick={setAcId} />

      {acId && (
        <>
          <Label>Logbook</Label>
          {logbooks.length === 0 ? (
            <p style={{ color: faint, fontSize: 13 }}>No logbooks — create one on the web first.</p>
          ) : (
            <Pills options={logbooks.map((l) => ({ id: l.id, label: l.title || l.type }))} value={lbId} onPick={setLbId} />
          )}
        </>
      )}

      <button
        onClick={() => setHandwritten((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", color: dim, fontSize: 13, marginTop: 16, padding: 0 }}
      >
        <span style={{ width: 42, height: 26, borderRadius: 13, background: handwritten ? accent : line, position: "relative", transition: "background .15s" }}>
          <span style={{ position: "absolute", top: 3, left: handwritten ? 19 : 3, width: 20, height: 20, borderRadius: 10, background: "#fff", transition: "left .15s" }} />
        </span>
        Handwritten page (routes to vision extraction)
      </button>

      <button
        onClick={shoot}
        disabled={!canShoot}
        style={{ width: "100%", marginTop: 20, background: canShoot ? accent : panel, color: canShoot ? "#071018" : faint, border: `1px solid ${line}`, borderRadius: 12, padding: "15px", fontSize: 16, fontWeight: 700 }}
      >
        {busy && busy.startsWith("Opening") ? busy : "📷  Take photo"}
      </button>

      {thumb && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <img src={`data:image/jpeg;base64,${thumb}`} alt="last capture" style={{ width: 56, height: 74, objectFit: "cover", borderRadius: 8, border: `1px solid ${line}` }} />
          <span style={{ color: faint, fontSize: 12 }}>Last page queued</span>
        </div>
      )}

      {pending > 0 && (
        <div style={{ marginTop: 22, borderTop: `1px solid ${line}`, paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ ...mono, color: ink, fontSize: 14 }}>{pending} pending</span>
            <button
              onClick={upload}
              disabled={!!busy}
              style={{ marginLeft: "auto", background: panel2, color: accent, border: `1px solid ${line}`, borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 600 }}
            >
              {busy && busy.startsWith("Uploading") ? busy : `⤴ Upload ${pending}`}
            </button>
          </div>
          <p style={{ color: faint, fontSize: 11, marginTop: 8 }}>Queued pages upload when you have signal; the server extracts them and they sync back into your logbook.</p>
        </div>
      )}

      {msg && <p style={{ color: dim, fontSize: 13, marginTop: 14 }}>{msg}</p>}
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ color: faint, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginTop: 18, marginBottom: 8 }}>{children}</div>;
}

function Pills({ options, value, onPick }: { options: { id: string; label: string }[]; value: string | null; onPick: (id: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onPick(o.id)}
            style={{ background: on ? accent : panel, color: on ? "#071018" : ink, border: `1px solid ${on ? accent : line}`, borderRadius: 999, padding: "8px 14px", fontSize: 13.5, fontWeight: 600 }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
