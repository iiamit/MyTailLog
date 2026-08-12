import { useEffect, useState } from "react";
import { listActions, removeAction, type QueuedAction } from "./db";
import { faint, ink, dim, line, panel2, accent, amber, red, mono } from "./ui";

// What you've recorded that hasn't reached the server yet.
//
// This screen is not optional decoration. Once the app can write offline, an
// action that fails to upload and isn't shown anywhere is indistinguishable
// from one that succeeded — the owner believes the tach is recorded and it
// isn't. Anything refused keeps its error and stays here until it's dealt with.

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

export function Pending({ onBack, onChanged }: { onBack: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<QueuedAction[] | null>(null);

  async function reload() {
    setRows(await listActions());
  }
  useEffect(() => {
    reload();
  }, []);

  async function discard(id: string) {
    await removeAction(id);
    await reload();
    onChanged();
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 30 }}>
        <button
          onClick={onBack}
          style={{ background: "transparent", color: dim, border: `1px solid ${line}`, borderRadius: 8, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}
        >
          ‹ Back
        </button>
        <span style={{ fontWeight: 700, fontSize: 17 }}>Waiting to upload</span>
      </div>

      {rows?.length === 0 && (
        <p style={{ color: faint, fontSize: 13, marginTop: 16 }}>
          Everything you&apos;ve recorded has reached the server.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {rows?.map((a) => (
          <div
            key={a.id}
            style={{
              background: panel2,
              border: `1px solid ${a.error ? `${red}66` : line}`,
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div style={{ fontSize: 13.5, color: ink }}>{a.label}</div>
            <div style={{ ...mono, color: faint, fontSize: 10.5, marginTop: 3 }}>
              {a.type} · {a.created_at.slice(0, 16).replace("T", " ")}
              {a.attempts > 0 ? ` · ${a.attempts} attempt${a.attempts === 1 ? "" : "s"}` : ""}
            </div>
            {a.error ? (
              <div style={{ color: red, fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>{a.error}</div>
            ) : (
              <div style={{ color: accent, fontSize: 11, marginTop: 6 }}>queued — uploads on the next sync</div>
            )}
            {/* Only offer discard once something has actually failed: a merely
                queued action is waiting for signal, not stuck, and throwing it
                away is the one irreversible thing this screen can do. */}
            {a.error && (
              <button
                onClick={() => discard(a.id)}
                style={{ marginTop: 8, background: "transparent", color: amber, border: `1px solid ${line}`, borderRadius: 8, padding: "7px 11px", fontSize: 12, cursor: "pointer" }}
              >
                Discard this change
              </button>
            )}
          </div>
        ))}
      </div>

      {!rows && <p style={{ color: faint, fontSize: 13, marginTop: 14 }}>Loading…</p>}
    </>
  );
}
