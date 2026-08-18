import { useEffect, useState } from "react";
import { getByAircraft, listActions } from "./db";
import { queueAction, canEdit } from "./actions";
import { shortDate } from "./airworthiness";
import type { Aircraft } from "./types";
import { color, text, radius, hit, accentGradient, tint } from "./tokens";
import { ChevronRightIcon } from "./icons";

// Squawks — tab 4.
//
// The list leads and the composer is a sheet. It used to sit at the top of the
// screen, so opening the keyboard covered the squawks you were checking, and a
// half-typed one sat above the two you'd already filed.

type SquawkRow = {
  id: string;
  description: string;
  severity: "low" | "medium" | "high";
  status: "open" | "resolved";
  reporter_name: string | null;
  reported_at: string | null;
  resolution_notes: string | null;
};

/**
 * Severity is renamed at the presentation layer only — the stored enum stays
 * low|medium|high. "High" doesn't tell a pilot whether the aircraft is flyable;
 * "Ground" does.
 */
const SEVERITY: Record<SquawkRow["severity"], { label: string; color: string }> = {
  low: { label: "Low", color: color.accent },
  medium: { label: "Watch", color: color.warning },
  high: { label: "Ground", color: color.danger },
};
const ORDER: SquawkRow["severity"][] = ["low", "medium", "high"];

export function Squawks({ aircraft, onQueued }: { aircraft: Aircraft; onQueued: () => void }) {
  const [rows, setRows] = useState<SquawkRow[] | null>(null);
  const [pending, setPending] = useState<{ id: string; label: string }[]>([]);
  const [composing, setComposing] = useState(false);
  const editable = canEdit(aircraft.id);

  async function reload() {
    setRows(await getByAircraft<SquawkRow>("squawk", aircraft.id));
    const queued = await listActions(aircraft.id);
    setPending(queued.filter((a) => a.type === "squawk").map((a) => ({ id: a.id, label: a.label })));
  }
  useEffect(() => { reload(); }, [aircraft.id]);

  const open = (rows ?? []).filter((s) => s.status === "open");
  const resolved = (rows ?? []).filter((s) => s.status !== "open");
  const newest = (a: SquawkRow, b: SquawkRow) => (b.reported_at ?? "").localeCompare(a.reported_at ?? "");

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 20 }}>
        <h1 style={{ ...text.screenTitle, color: color.ink, margin: 0 }}>Squawks</h1>
        <span style={{ ...text.meta, color: color.faint, marginLeft: "auto" }}>{aircraft.tail_number}</span>
      </div>

      {pending.length > 0 && (
        <>
          <div style={{ ...text.sectionLabel, color: color.faint, marginBottom: 8 }}>Waiting to upload</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            {pending.map((p) => (
              <div key={p.id} style={{ background: color.surface, border: `1px dashed ${color.accent}66`, borderRadius: radius.row, padding: 12 }}>
                <div style={{ ...text.rowTitle, fontWeight: 500, color: color.ink }}>{p.label}</div>
                <div style={{ ...text.meta, color: color.accent, marginTop: 3 }}>Not on the server yet</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ ...text.sectionLabel, color: color.faint, marginBottom: 8 }}>
        Open{open.length ? ` · ${open.length}` : ""}
      </div>
      {open.length === 0 && <p style={{ ...text.secondary, color: color.faint }}>Nothing open.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[...open].sort(newest).map((s) => <SquawkCard key={s.id} squawk={s} />)}
      </div>

      {resolved.length > 0 && (
        <div style={{ background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.row, padding: "12px 14px", marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ ...text.rowTitle, fontWeight: 500, color: color.dim }}>Resolved</span>
          <span style={{ ...text.countdown, color: color.faint, marginLeft: "auto" }}>{resolved.length}</span>
          <ChevronRightIcon size={14} color={color.faint} />
        </div>
      )}

      {/* Resolution stays on the web, matching the current build. */}
      {resolved.length > 0 && (
        <p style={{ ...text.meta, color: color.faint, marginTop: 8 }}>Resolve a squawk on the web app.</p>
      )}

      {editable && (
        <button
          onClick={() => setComposing(true)}
          style={{
            position: "fixed", right: 20, bottom: "calc(78px + env(safe-area-inset-bottom) + 20px)",
            height: 50, padding: "0 20px", borderRadius: 999, border: "none",
            background: accentGradient, color: color.onAccent,
            fontFamily: text.button.fontFamily, fontSize: 14.5, fontWeight: 600,
            boxShadow: `0 10px 26px ${color.accent}57`, cursor: "pointer", zIndex: 30,
          }}
        >
          + New squawk
        </button>
      )}

      {composing && (
        <Composer
          onClose={() => setComposing(false)}
          onSave={async (description, severity) => {
            await queueAction({
              aircraftId: aircraft.id,
              type: "squawk",
              label: description.length > 48 ? `${description.slice(0, 48)}…` : description,
              payload: { description, severity, reported_at: new Date().toISOString() },
            });
            setComposing(false);
            await reload();
            onQueued();
          }}
        />
      )}
    </>
  );
}

function SquawkCard({ squawk: s }: { squawk: SquawkRow }) {
  const sev = SEVERITY[s.severity] ?? SEVERITY.low;
  return (
    <div style={{ background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.row, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: sev.color, flex: "0 0 auto", marginTop: 6 }} />
        {/* Never truncated — this is the only place the defect is written down. */}
        <span style={{ ...text.rowTitle, fontWeight: 500, color: color.ink, textWrap: "pretty" }}>{s.description}</span>
      </div>
      <div style={{ ...text.meta, color: color.faint, paddingLeft: 18 }}>
        {sev.label} · {relative(s.reported_at)}
        {s.reporter_name ? ` · ${s.reporter_name}` : ""}
      </div>
    </div>
  );
}

/** Relative under ~6 weeks, absolute beyond — "3 weeks ago" beats a date here. */
function relative(iso: string | null): string {
  if (!iso) return "";
  const days = Math.round((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 42) return `${Math.round(days / 7)} weeks ago`;
  return shortDate(iso.slice(0, 10));
}

function Composer({
  onClose, onSave,
}: {
  onClose: () => void;
  onSave: (description: string, severity: SquawkRow["severity"]) => void;
}) {
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<SquawkRow["severity"]>("low");

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", background: color.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          border: `1px solid ${color.hairline}`, padding: "14px 16px calc(16px + env(safe-area-inset-bottom))",
          display: "flex", flexDirection: "column", gap: 10,
        }}
      >
        <div style={{ ...text.rowTitle, color: color.ink }}>New squawk</div>
        <textarea
          autoFocus
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What did you notice? e.g. #3 CHT reads intermittently"
          style={{
            minHeight: 48, background: color.bg, border: `1px solid ${color.hairline}`,
            borderRadius: 13, padding: "12px 13px", color: color.ink,
            fontFamily: text.rowTitle.fontFamily, fontSize: 14, resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          {ORDER.map((k) => {
            const on = severity === k;
            const sev = SEVERITY[k];
            return (
              <button
                key={k}
                onClick={() => setSeverity(k)}
                style={{
                  flex: 1, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  background: on ? tint.accent : color.surfaceRaised,
                  border: `1px solid ${on ? color.accent : color.hairline}`,
                  borderRadius: radius.control, color: on ? color.ink : color.dim,
                  fontFamily: text.rowTitle.fontFamily, fontSize: 13.5, fontWeight: on ? 600 : 500, cursor: "pointer",
                }}
              >
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: sev.color }} />
                {sev.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => onSave(description.trim(), severity)}
          disabled={!description.trim()}
          style={{
            minHeight: hit.stepper, borderRadius: 14, border: "none", background: accentGradient,
            color: color.onAccent, fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600,
            opacity: description.trim() ? 1 : 0.4, cursor: "pointer",
          }}
        >
          Add squawk
        </button>
        <button onClick={onClose} style={{ minHeight: 40, background: "transparent", border: "none", color: color.faint, fontFamily: text.rowTitle.fontFamily, fontSize: 13.5, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
