import { useMemo, useState, type ReactNode } from "react";
import { enqueue, type MutationType } from "./mutations";
import { shortDate } from "./airworthiness";
import { firstSentence, titleCase } from "./history";
import type { LogEntry } from "./types";
import { color, text, radius, hit, tint, display, accentGradient, alpha } from "./tokens";

// One squawk, and everything that can happen to it: resolved (optionally naming
// the entry that cleared it), reopened, corrected, or deleted because it was
// never a defect.
//
// Every write goes through enqueue() with the row's `updated_at` as `base`, so a
// squawk somebody else already resolved on the web parks as a conflict instead
// of being quietly overwritten from a phone that has been in a hangar all week.

export type SquawkRow = {
  id: string;
  aircraft_id: string;
  description: string;
  severity: "low" | "medium" | "high";
  status: "open" | "resolved";
  reporter_name: string | null;
  reported_at: string | null;
  resolved_at: string | null;
  resolved_log_entry_id: string | null;
  resolution_notes: string | null;
  updated_at: string;
};

export const SEVERITY: Record<SquawkRow["severity"], { label: string; color: string }> = {
  low: { label: "Low", color: color.accent },
  medium: { label: "Watch", color: color.warning },
  high: { label: "Ground", color: color.danger },
};
export const SEVERITY_ORDER: SquawkRow["severity"][] = ["low", "medium", "high"];

const today = () => new Date().toISOString().slice(0, 10);

export function SquawkDetail({
  squawk,
  entries,
  editable,
  variant,
  onClose,
  onChanged,
}: {
  squawk: SquawkRow;
  /** Candidates for "which entry cleared it" — the aircraft's log entries. */
  entries: LogEntry[];
  editable: boolean;
  /** "sheet" on a phone, "pane" beside the list on an iPad. */
  variant: "sheet" | "pane";
  onClose: () => void;
  /** Called with the optimistic row after a write is queued; null = deleted. */
  onChanged: (next: SquawkRow | null) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(squawk.description);
  const [severity, setSeverity] = useState(squawk.severity);
  const [resolving, setResolving] = useState(false);
  const [resolvedOn, setResolvedOn] = useState(today());
  const [entryId, setEntryId] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Recent first — the entry that cleared a squawk is nearly always a new one.
  const candidates = useMemo(
    () =>
      [...entries]
        .sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? ""))
        .slice(0, 60),
    [entries],
  );

  const base = squawk.updated_at;
  const sev = SEVERITY[squawk.severity] ?? SEVERITY.low;

  async function write(type: MutationType, payload: Record<string, unknown>, optimistic: SquawkRow | null) {
    if (busy) return;
    setBusy(true);
    try {
      await enqueue(type, squawk.aircraft_id, payload, { base });
      await onChanged(optimistic);
    } finally {
      setBusy(false);
    }
  }

  const resolve = () =>
    write(
      "squawk.resolve",
      { squawkId: squawk.id, resolvedAt: resolvedOn, resolvedEntryId: entryId || null },
      { ...squawk, status: "resolved", resolved_at: resolvedOn, resolved_log_entry_id: entryId || null },
    );

  const reopen = () =>
    write("squawk.reopen", { squawkId: squawk.id }, { ...squawk, status: "open", resolved_at: null });

  const save = () =>
    write(
      "squawk.update",
      { squawkId: squawk.id, description: description.trim(), severity },
      { ...squawk, description: description.trim(), severity },
    ).then(() => setEditing(false));

  const remove = () => write("squawk.delete", { squawkId: squawk.id }, null);

  const body = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: sev.color }} />
        <span style={{ ...text.chip, color: sev.color }}>{sev.label}</span>
        <span style={{ ...text.meta, color: color.faint, marginLeft: "auto" }}>
          {squawk.status === "open"
            ? `Reported ${squawk.reported_at ? shortDate(squawk.reported_at.slice(0, 10)) : "—"}`
            : `Resolved ${squawk.resolved_at ? shortDate(squawk.resolved_at.slice(0, 10)) : "—"}`}
        </span>
      </div>

      {editing ? (
        <>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box", minHeight: 76,
              background: color.bg, border: `1px solid ${color.hairline}`, borderRadius: 13,
              padding: "12px 13px", color: color.ink, resize: "vertical",
              fontFamily: text.rowTitle.fontFamily, fontSize: 16,
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {SEVERITY_ORDER.map((k) => {
              const on = severity === k;
              return (
                <button
                  key={k}
                  onClick={() => setSeverity(k)}
                  style={{
                    flex: 1, minHeight: hit.min, display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 7,
                    background: on ? tint.accent : color.surfaceRaised,
                    border: `1px solid ${on ? color.accent : color.hairline}`,
                    borderRadius: radius.control, color: on ? color.ink : color.dim,
                    fontFamily: text.rowTitle.fontFamily, fontSize: 13.5, fontWeight: on ? 600 : 500,
                    cursor: "pointer",
                  }}
                >
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: SEVERITY[k].color }} />
                  {SEVERITY[k].label}
                </button>
              );
            })}
          </div>
          <Row>
            <Secondary onClick={() => { setEditing(false); setDescription(squawk.description); setSeverity(squawk.severity); }}>
              Cancel
            </Secondary>
            <Primary onClick={save} disabled={busy || !description.trim()}>Save</Primary>
          </Row>
        </>
      ) : (
        <p style={{ ...text.bodyText, color: color.ink, margin: 0, textWrap: "pretty" }}>{squawk.description}</p>
      )}

      {squawk.reporter_name && !editing && (
        <div style={{ ...text.meta, color: color.faint, marginTop: 8 }}>Reported by {squawk.reporter_name}</div>
      )}
      {squawk.resolution_notes && !editing && (
        <div style={{ ...text.secondary, color: color.dim, marginTop: 10, lineHeight: 1.45 }}>
          {squawk.resolution_notes}
        </div>
      )}

      {!editable && (
        <div style={{ ...text.meta, color: color.faint, marginTop: 14 }}>
          You have read-only access to this aircraft.
        </div>
      )}

      {editable && !editing && squawk.status === "open" && !resolving && (
        <Row>
          <Secondary onClick={() => setEditing(true)}>Edit</Secondary>
          <Primary onClick={() => setResolving(true)} disabled={busy}>Mark resolved</Primary>
        </Row>
      )}

      {editable && !editing && squawk.status === "open" && resolving && (
        <>
          <div style={{ ...text.sectionLabel, color: color.faint, margin: "18px 0 8px" }}>When was it fixed</div>
          <input
            type="date"
            value={resolvedOn}
            onChange={(e) => setResolvedOn(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box", minHeight: hit.min,
              background: color.bg, border: `1px solid ${color.hairline}`, borderRadius: radius.control,
              padding: "0 12px", color: color.ink,
              fontFamily: text.rowTitle.fontFamily, fontSize: 16,
            }}
          />

          <div style={{ ...text.sectionLabel, color: color.faint, margin: "18px 0 8px" }}>
            Which entry cleared it
          </div>
          <select
            value={entryId}
            onChange={(e) => setEntryId(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box", minHeight: hit.stepper,
              background: color.bg, border: `1px solid ${color.hairline}`, borderRadius: radius.control,
              padding: "0 12px", color: color.ink,
              fontFamily: text.rowTitle.fontFamily, fontSize: 16,
            }}
          >
            <option value="">Not recorded in the books yet</option>
            {candidates.map((e) => (
              <option key={e.id} value={e.id}>
                {e.entry_date ? shortDate(e.entry_date) : "undated"} — {entryLabel(e)}
              </option>
            ))}
          </select>

          <Row>
            <Secondary onClick={() => setResolving(false)}>Not yet</Secondary>
            <Primary onClick={resolve} disabled={busy}>Resolve</Primary>
          </Row>
        </>
      )}

      {editable && !editing && squawk.status === "resolved" && (
        <Row>
          <Secondary onClick={reopen}>Reopen</Secondary>
          <Secondary onClick={() => setEditing(true)}>Edit</Secondary>
        </Row>
      )}

      {editable && !editing && (
        <>
          {confirmDelete ? (
            <div
              style={{
                marginTop: 14, background: tint.danger, border: `1px solid ${alpha(color.danger, "4D")}`,
                borderRadius: radius.card, padding: "12px 14px",
              }}
            >
              <div style={{ ...text.secondary, color: color.ink, lineHeight: 1.45 }}>
                Delete this squawk for good? Resolving it keeps the history; deleting removes it.
              </div>
              <Row>
                <Secondary onClick={() => setConfirmDelete(false)}>Keep it</Secondary>
                <Danger onClick={remove} disabled={busy}>Delete</Danger>
              </Row>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                width: "100%", minHeight: hit.min, marginTop: 10, background: "transparent",
                border: "none", color: color.faint,
                fontFamily: text.rowTitle.fontFamily, fontSize: 13.5, cursor: "pointer",
              }}
            >
              Delete this squawk
            </button>
          )}
        </>
      )}
    </>
  );

  if (variant === "pane") {
    return (
      <div style={{ background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.card, padding: 16 }}>
        {body}
      </div>
    );
  }

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "flex-end" }}
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
        <h2 style={{ fontFamily: display, fontSize: 19, fontWeight: 700, color: color.ink, margin: "0 0 14px" }}>
          Squawk
        </h2>
        {body}
      </div>
    </div>
  );
}

/** "Replaced vacuum pump" — the same wording the history list uses. */
function entryLabel(e: LogEntry): string {
  const source = e.description || e.work_performed || "(no description)";
  return titleCase(firstSentence(source, 52).replace(/[.]$/, ""));
}

function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 8, marginTop: 16 }}>{children}</div>;
}

function Secondary({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, minHeight: hit.stepper, borderRadius: radius.control,
        background: color.surfaceRaised, border: `1px solid ${color.hairline}`, color: color.ink,
        fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: 600,
        opacity: disabled ? 0.5 : 1, cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Primary({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, minHeight: hit.stepper, borderRadius: radius.control, border: "none",
        background: accentGradient, color: color.onAccent,
        fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600,
        opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Danger({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, minHeight: hit.stepper, borderRadius: radius.control, border: "none",
        background: color.danger, color: color.onAccent,
        fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: 600,
        opacity: disabled ? 0.5 : 1, cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
