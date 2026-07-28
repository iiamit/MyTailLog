import { useEffect, useState } from "react";
import { getRows, getByAircraft } from "./db";
import type { Aircraft, LogEntry } from "./types";
import { Card, Row, TopBar, dim, faint, ink, mono, panel2, line, accent } from "./ui";

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
export function Entries({ aircraft, onBack, onOpen }: { aircraft: Aircraft; onBack: () => void; onOpen: (e: LogEntry) => void }) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);

  useEffect(() => {
    getByAircraft<LogEntry>("log_entry", aircraft.id).then((rows) =>
      setEntries(rows.sort((a, b) => (b.entry_date || "").localeCompare(a.entry_date || ""))),
    );
  }, [aircraft.id]);

  return (
    <>
      <TopBar title={aircraft.tail_number} onBack={onBack} right={<span style={{ color: faint, fontSize: 12 }}>{entries?.length ?? ""} entries</span>} />
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
export function EntryDetail({ entry, tail, onBack }: { entry: LogEntry; tail: string; onBack: () => void }) {
  const ads = [...(entry.ad_refs ?? []), ...(entry.sb_refs ?? [])];
  return (
    <>
      <TopBar title={tail} onBack={onBack} />
      <div style={{ marginTop: 12 }}>
        <div style={{ ...mono, color: accent, fontSize: 13 }}>{entry.entry_date ?? "—"}</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{entry.description || "(no description)"}</div>
      </div>
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

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginTop: 14, background: panel2, border: `1px solid ${line}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ color: faint, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: ink, fontSize: 13.5, marginTop: 5, whiteSpace: "pre-wrap" }}>{text}</div>
    </div>
  );
}
