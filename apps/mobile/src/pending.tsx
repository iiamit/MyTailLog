import { useEffect, useState } from "react";
import { captureCount, listActions, removeAction, type QueuedAction } from "./db";
import { drainActions, keepMine } from "./actions";
import { changedFields, mineFields } from "@/lib/sync/mutations";
import { faint, ink, dim, line, panel2, accent, amber, red, mono, radius } from "./ui";
import { hit } from "./tokens";

// What you've recorded that hasn't reached the server yet.
//
// This screen is not optional decoration. Once the app can write offline, an
// action that fails to upload and isn't shown anywhere is indistinguishable
// from one that succeeded — the owner believes the tach is recorded and it
// isn't. Anything refused keeps its error and stays here until it's dealt with.
// A change the server couldn't apply because someone else edited the same row
// first is settled here too: yours next to theirs, nothing overwritten quietly.

export function PendingBanner({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count === 0) return null;
  return (
    <div
      onClick={onOpen}
      style={{
        marginTop: 14,
        background: `${accent}14`,
        border: `1px solid ${accent}55`,
        borderRadius: 10,
        padding: "10px 12px",
        minHeight: hit.min,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span style={{ color: ink, fontSize: 13 }}>
        {count} change{count === 1 ? "" : "s"} waiting to upload
      </span>
      <span style={{ marginLeft: "auto", color: accent, fontSize: 12 }}>View ›</span>
    </div>
  );
}

const btn = (color: string): React.CSSProperties => ({
  background: "transparent",
  color,
  border: `1px solid ${line}`,
  borderRadius: radius.control,
  padding: "0 14px",
  minHeight: hit.min,
  fontSize: 15,
  cursor: "pointer",
});

export function Pending({ onBack, onChanged }: { onBack: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<QueuedAction[] | null>(null);
  const [captures, setCaptures] = useState(0);
  const [open, setOpen] = useState<QueuedAction | null>(null);

  async function reload() {
    const [actions, pages] = await Promise.all([listActions(), captureCount()]);
    setRows(actions);
    setCaptures(pages);
  }
  useEffect(() => {
    reload();
  }, []);

  async function discard(id: string) {
    await removeAction(id);
    setOpen(null);
    await reload();
    onChanged();
  }

  async function resend(a: QueuedAction) {
    await keepMine(a);
    setOpen(null);
    await drainActions().catch(() => {});
    await reload();
    onChanged();
  }

  if (open) return <Conflict action={open} onBack={() => setOpen(null)} onKeepMine={() => resend(open)} onTakeTheirs={() => discard(open.id)} />;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: hit.min }}>
        <button onClick={onBack} style={btn(dim)}>
          ‹ Back
        </button>
        <span style={{ fontWeight: 700, fontSize: 17 }}>Waiting to upload</span>
      </div>

      {rows?.length === 0 && captures === 0 && (
        <p style={{ color: faint, fontSize: 13, marginTop: 16 }}>
          Everything you&apos;ve recorded has reached the server.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {captures > 0 && (
          <div style={{ background: panel2, border: `1px solid ${line}`, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 13.5, color: ink }}>{captures} scanned page{captures === 1 ? "" : "s"}</div>
            <div style={{ color: accent, fontSize: 11, marginTop: 6 }}>saved on this phone — uploads when connected</div>
          </div>
        )}
        {rows?.map((a) => (
          <div
            key={a.id}
            style={{
              background: panel2,
              border: `1px solid ${a.status === "failed" ? `${red}66` : a.status === "conflict" ? `${amber}88` : line}`,
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div style={{ fontSize: 13.5, color: ink }}>{a.label}</div>
            <div style={{ ...mono, color: faint, fontSize: 10.5, marginTop: 3 }}>
              {when(a.created_at)}
              {a.attempts > 0 ? ` · ${a.attempts} attempt${a.attempts === 1 ? "" : "s"}` : ""}
            </div>
            {a.status === "conflict" ? (
              <>
                <div style={{ color: amber, fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>
                  Someone else changed this while you were offline. Compare the two before it uploads.
                </div>
                <button onClick={() => setOpen(a)} style={{ ...btn(amber), marginTop: 8 }}>
                  Compare
                </button>
              </>
            ) : a.status === "failed" ? (
              <>
                <div style={{ color: red, fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>{a.error}</div>
                {/* Discard is the one irreversible thing this screen can do, so
                    it is only offered once the server has actually refused. */}
                <button onClick={() => discard(a.id)} style={{ ...btn(amber), marginTop: 8 }}>
                  Discard this change
                </button>
              </>
            ) : a.error ? (
              <div style={{ color: dim, fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>{a.error}</div>
            ) : (
              <div style={{ color: accent, fontSize: 11, marginTop: 6 }}>saved on this phone — uploads when connected</div>
            )}
          </div>
        ))}
      </div>

      {!rows && <p style={{ color: faint, fontSize: 13, marginTop: 14 }}>Loading…</p>}
    </>
  );
}

// --- Yours / theirs ---------------------------------------------------------

function Conflict({
  action,
  onBack,
  onKeepMine,
  onTakeTheirs,
}: {
  action: QueuedAction;
  onBack: () => void;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
}) {
  const payload = JSON.parse(action.payload) as Record<string, unknown>;
  const theirs = action.server_row ? (JSON.parse(action.server_row) as Record<string, unknown>) : {};
  const mine = mineFields(payload);
  const changed = new Set(changedFields(payload, theirs));
  const keys = Object.keys(mine).filter((k) => k in theirs);
  const isDelete = keys.length === 0 && /\.delete$/.test(action.type);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: hit.min }}>
        <button onClick={onBack} style={btn(dim)}>
          ‹ Back
        </button>
        <span style={{ fontWeight: 700, fontSize: 17 }}>Which version?</span>
      </div>
      <p style={{ color: dim, fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
        {action.label}. Someone else saved this
        {typeof theirs.updated_at === "string" ? ` on ${when(theirs.updated_at)}` : ""}, after you last synced.
        {isDelete ? " You were deleting it." : " Highlighted lines differ."}
      </p>

      {keys.length > 0 && (
        <div style={{ marginTop: 14, border: `1px solid ${line}`, borderRadius: radius.row, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", background: panel2, padding: "8px 12px", fontSize: 11, color: faint }}>
            <span>Field</span>
            <span>Yours</span>
            <span>Theirs</span>
          </div>
          {keys.map((k) => {
            const diff = changed.has(k);
            return (
              <div
                key={k}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 8,
                  padding: "10px 12px",
                  borderTop: `1px solid ${line}`,
                  background: diff ? `${amber}1a` : "transparent",
                  fontSize: 13,
                }}
              >
                <span style={{ color: dim }}>{fieldName(k)}</span>
                <span style={{ color: diff ? amber : ink, fontWeight: diff ? 600 : 400, wordBreak: "break-word" }}>{show(k, mine[k])}</span>
                <span style={{ color: ink, wordBreak: "break-word" }}>{show(k, theirs[k])}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
        <button onClick={onKeepMine} style={{ ...btn(ink), background: `${accent}22`, borderColor: accent }}>
          Keep mine — upload over theirs
        </button>
        <button onClick={onTakeTheirs} style={btn(amber)}>
          Take theirs — drop my change
        </button>
      </div>
    </>
  );
}

function fieldName(k: string): string {
  const s = k.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Owner-readable value: dates as dates, never ISO; blanks as a dash. */
function show(key: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.map(String).join(", ") : "—";
  if (typeof v === "string" && /(_date|_at)$/.test(key)) return when(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? d.toLocaleDateString(undefined, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" })
    : d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
