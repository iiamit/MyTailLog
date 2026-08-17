import { useEffect, useState } from "react";
import { getByAircraft, listActions } from "./db";
import { queueAction, canEdit } from "./actions";
import type { Aircraft } from "./types";
import { TopBar, Pill, dim, faint, ink, mono, panel, panel2, line, accent, amber, red, input, primary } from "./ui";

// Open defects, and logging a new one the moment you notice it — which is
// usually on the ramp with a cowling open and no signal.

type SquawkRow = {
  id: string;
  description: string;
  severity: "low" | "medium" | "high";
  status: "open" | "resolved";
  reporter_name: string | null;
  reported_at: string | null;
  resolution_notes: string | null;
};

const SEVERITY_TONE: Record<string, string> = { high: "overdue", medium: "due_soon", low: "upcoming" };
const SEVERITIES: SquawkRow["severity"][] = ["low", "medium", "high"];

export function Squawks({
  aircraft,
  onBack,
  onQueued,
}: {
  aircraft: Aircraft;
  /** Absent when this is a tab root — the tab bar is the navigation. */
  onBack?: () => void;
  onQueued: () => void;
}) {
  const [rows, setRows] = useState<SquawkRow[] | null>(null);
  const [pending, setPending] = useState<{ id: string; label: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<SquawkRow["severity"]>("low");
  const editable = canEdit(aircraft.id);

  async function reload() {
    setRows(await getByAircraft<SquawkRow>("squawk", aircraft.id));
    const queued = await listActions(aircraft.id);
    setPending(queued.filter((a) => a.type === "squawk").map((a) => ({ id: a.id, label: a.label })));
  }

  useEffect(() => {
    reload();
  }, [aircraft.id]);

  async function save() {
    const text = description.trim();
    if (!text) return;
    await queueAction({
      aircraftId: aircraft.id,
      type: "squawk",
      label: text.length > 48 ? `${text.slice(0, 48)}…` : text,
      payload: { description: text, severity, reported_at: new Date().toISOString() },
    });
    setDescription("");
    setSeverity("low");
    setAdding(false);
    await reload();
    onQueued();
  }

  const open = (rows ?? []).filter((s) => s.status === "open");
  const resolved = (rows ?? []).filter((s) => s.status !== "open");
  const byNewest = (a: SquawkRow, b: SquawkRow) => (b.reported_at ?? "").localeCompare(a.reported_at ?? "");

  return (
    <>
      <TopBar
        title={`${aircraft.tail_number} · squawks`}
        onBack={onBack}
        right={
          editable ? (
            <button
              onClick={() => setAdding((v) => !v)}
              style={{ background: "transparent", color: accent, border: `1px solid ${line}`, borderRadius: 8, padding: "6px 11px", fontSize: 12.5, cursor: "pointer" }}
            >
              {adding ? "Cancel" : "+ New"}
            </button>
          ) : undefined
        }
      />

      {adding && (
        <div style={{ marginTop: 14, background: panel, border: `1px solid ${line}`, borderRadius: 12, padding: "13px 14px" }}>
          <textarea
            style={{ ...input, width: "100%", minHeight: 76, resize: "vertical" }}
            placeholder="What's wrong? e.g. #3 CHT reads intermittently"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {SEVERITIES.map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                style={{
                  flex: 1,
                  background: severity === s ? panel2 : "transparent",
                  color: severity === s ? ink : faint,
                  border: `1px solid ${severity === s ? accent : line}`,
                  borderRadius: 8,
                  padding: "9px 6px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  textTransform: "capitalize",
                  cursor: "pointer",
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={save}
            disabled={!description.trim()}
            style={{ ...primary, width: "100%", marginTop: 10, opacity: description.trim() ? 1 : 0.4 }}
          >
            Queue squawk
          </button>
          <p style={{ color: faint, fontSize: 11, marginTop: 8 }}>
            Saved on device now; uploads on the next sync. Resolving a squawk is done on the web app.
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <>
          <Heading>Waiting to upload</Heading>
          {pending.map((p) => (
            <div key={p.id} style={{ background: panel2, border: `1px dashed ${accent}66`, borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
              <div style={{ fontSize: 13, color: ink }}>{p.label}</div>
              <div style={{ color: accent, fontSize: 10.5, marginTop: 3 }}>queued — not on the server yet</div>
            </div>
          ))}
        </>
      )}

      <Heading>Open{open.length ? ` (${open.length})` : ""}</Heading>
      {open.length === 0 && <p style={{ color: faint, fontSize: 13, marginTop: 8 }}>Nothing open.</p>}
      {[...open].sort(byNewest).map((s) => <SquawkCard key={s.id} squawk={s} />)}

      {resolved.length > 0 && (
        <>
          <Heading>Resolved</Heading>
          {[...resolved].sort(byNewest).map((s) => <SquawkCard key={s.id} squawk={s} resolved />)}
        </>
      )}

      {!rows && <p style={{ color: faint, fontSize: 13, marginTop: 14 }}>Loading…</p>}
    </>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18, color: faint, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

function SquawkCard({ squawk: s, resolved }: { squawk: SquawkRow; resolved?: boolean }) {
  return (
    <div
      style={{
        background: panel2,
        border: `1px solid ${line}`,
        borderLeft: `3px solid ${resolved ? line : s.severity === "high" ? red : s.severity === "medium" ? amber : line}`,
        borderRadius: 10,
        padding: "10px 12px",
        marginTop: 8,
        opacity: resolved ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1, fontSize: 13.5, color: ink }}>{s.description}</div>
        {!resolved && <Pill tone={SEVERITY_TONE[s.severity] ?? "upcoming"}>{s.severity.toUpperCase()}</Pill>}
      </div>
      <div style={{ ...mono, color: faint, fontSize: 10.5, marginTop: 5 }}>
        {(s.reported_at ?? "").slice(0, 10)}
        {s.reporter_name ? ` · ${s.reporter_name}` : ""}
        {resolved ? " · resolved" : ""}
      </div>
      {resolved && s.resolution_notes && (
        <div style={{ color: dim, fontSize: 12, marginTop: 5 }}>{s.resolution_notes}</div>
      )}
    </div>
  );
}
