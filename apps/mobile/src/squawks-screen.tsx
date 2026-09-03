import { useEffect, useRef, useState } from "react";
import { getByAircraft, listActions } from "./db";
import { enqueue } from "./mutations";
import { canEdit } from "./actions";
import { shortDate } from "./airworthiness";
import { TwoPane, useSizeClass, useShortcuts, fabBottom } from "./layout";
import { SquawkDetail, SEVERITY, SEVERITY_ORDER, type SquawkRow } from "./squawk-detail";
import type { Aircraft, LogEntry } from "./types";
import { color, text, radius, hit, accentGradient, tint, alpha } from "./tokens";
import { ChevronRightIcon } from "./icons";

// Squawks — tab 4.
//
// The list leads and the composer is a sheet. It used to sit at the top of the
// screen, so opening the keyboard covered the squawks you were checking, and a
// half-typed one sat above the two you'd already filed.
//
// Resolving used to be "do it on the web app". It is the other half of the
// feature and it happens in the hangar, next to the aircraft, with the mechanic
// standing there — so it happens here, offline, like everything else.

/** How far a card has to travel before the swipe counts as "resolve it". */
const SWIPE_TO_RESOLVE = 96;

export function Squawks({ aircraft, onQueued }: { aircraft: Aircraft; onQueued: () => Promise<"synced" | "pending"> }) {
  const [rows, setRows] = useState<SquawkRow[] | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [pending, setPending] = useState<{ id: string; label: string }[]>([]);
  const [composing, setComposing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const editable = canEdit(aircraft.id);
  const size = useSizeClass();
  useShortcuts({ "cmd+n": () => editable && setComposing(true) });

  async function reload() {
    setRows(await getByAircraft<SquawkRow>("squawk", aircraft.id));
    const queued = await listActions(aircraft.id);
    setPending(
      queued
        .filter((a) => a.type === "squawk.create" || a.type === "squawk")
        .map((a) => ({ id: a.id, label: a.label })),
    );
  }
  useEffect(() => {
    reload();
    getByAircraft<LogEntry>("log_entry", aircraft.id).then(setEntries);
  }, [aircraft.id]);

  const all = rows ?? [];
  const open = all.filter((s) => s.status === "open");
  const resolved = all.filter((s) => s.status !== "open");
  const newest = (a: SquawkRow, b: SquawkRow) => (b.reported_at ?? "").localeCompare(a.reported_at ?? "");
  const selected = all.find((s) => s.id === openId) ?? null;

  /** Patch the row in place after a write is queued — nothing waits for a sync. */
  async function applyLocal(next: SquawkRow | null, id: string) {
    setRows((cur) => {
      const list = cur ?? [];
      return next === null ? list.filter((s) => s.id !== id) : list.map((s) => (s.id === id ? next : s));
    });
    if (next === null) setOpenId(null);
    await onQueued();
  }

  /** The swipe shortcut: resolved today, no entry named. The sheet is where the
   *  entry that cleared it gets recorded, when there is one. */
  async function quickResolve(s: SquawkRow) {
    await enqueue(
      "squawk.resolve",
      aircraft.id,
      { squawkId: s.id, resolvedAt: new Date().toISOString().slice(0, 10), resolvedEntryId: null },
      { base: s.updated_at },
    );
    await applyLocal({ ...s, status: "resolved", resolved_at: new Date().toISOString() }, s.id);
  }

  const list = (
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
              <div key={p.id} style={{ background: color.surface, border: `1px dashed ${alpha(color.accent, "66")}`, borderRadius: radius.row, padding: 12 }}>
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
        {[...open].sort(newest).map((s) => (
          <SquawkCard
            key={s.id}
            squawk={s}
            active={s.id === openId}
            swipeable={editable}
            onOpen={() => setOpenId(s.id)}
            onSwipeResolve={() => quickResolve(s)}
          />
        ))}
      </div>

      {resolved.length > 0 && (
        <>
          <button
            onClick={() => setShowResolved((v) => !v)}
            aria-expanded={showResolved}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, minHeight: hit.min,
              background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.row,
              padding: "12px 14px", marginTop: 12, cursor: "pointer", textAlign: "left",
            }}
          >
            <span style={{ ...text.rowTitle, fontWeight: 500, color: color.dim }}>Resolved</span>
            <span style={{ ...text.countdown, color: color.faint, marginLeft: "auto" }}>{resolved.length}</span>
            <span style={{ transform: showResolved ? "rotate(90deg)" : "none", display: "inline-flex" }}>
              <ChevronRightIcon size={14} color={color.faint} />
            </span>
          </button>

          {showResolved && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {[...resolved].sort(newest).map((s) => (
                <SquawkCard
                  key={s.id}
                  squawk={s}
                  active={s.id === openId}
                  swipeable={false}
                  onOpen={() => setOpenId(s.id)}
                  onSwipeResolve={() => {}}
                />
              ))}
            </div>
          )}
        </>
      )}

      {editable && (
        <button
          onClick={() => setComposing(true)}
          style={{
            position: "fixed", right: 20, bottom: fabBottom(size),
            height: 50, padding: "0 20px", borderRadius: 999, border: "none",
            background: accentGradient, color: color.onAccent,
            fontFamily: text.button.fontFamily, fontSize: 14.5, fontWeight: 600,
            boxShadow: `0 10px 26px ${alpha(color.accent, "57")}`, cursor: "pointer", zIndex: 30,
          }}
        >
          + New squawk
        </button>
      )}
    </>
  );

  return (
    <>
      <TwoPane
        primary={list}
        ratio="55/45"
        secondary={
          selected ? (
            <SquawkDetail
              squawk={selected}
              entries={entries}
              editable={editable}
              variant="pane"
              onClose={() => setOpenId(null)}
              onChanged={(next) => applyLocal(next, selected.id)}
            />
          ) : null
        }
      />

      {/* Compact: the same detail as a sheet, because TwoPane shows only the list. */}
      {size === "compact" && selected && (
        <SquawkDetail
          squawk={selected}
          entries={entries}
          editable={editable}
          variant="sheet"
          onClose={() => setOpenId(null)}
          onChanged={(next) => applyLocal(next, selected.id)}
        />
      )}

      {composing && (
        <Composer
          onClose={() => setComposing(false)}
          onSave={async (description, severity) => {
            // The id is generated here and used twice: as the queue's
            // idempotency key AND as the row's own id, so a drain that lands but
            // loses its response can't file the squawk a second time.
            const id = crypto.randomUUID();
            await enqueue(
              "squawk.create",
              aircraft.id,
              { id, description, severity, reportedAt: new Date().toISOString() },
              { id, label: description.length > 48 ? `${description.slice(0, 48)}…` : description },
            );
            setComposing(false);
            await onQueued();
            await reload();
          }}
        />
      )}
    </>
  );
}

function SquawkCard({
  squawk: s,
  active,
  swipeable,
  onOpen,
  onSwipeResolve,
}: {
  squawk: SquawkRow;
  active: boolean;
  swipeable: boolean;
  onOpen: () => void;
  onSwipeResolve: () => void;
}) {
  const sev = SEVERITY[s.severity] ?? SEVERITY.low;
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const horizontal = useRef(false);

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: radius.row }}>
      {/* What the swipe is going to do, revealed underneath the card. */}
      {dx > 0 && (
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", paddingLeft: 16,
            background: tint.success, ...text.chip, color: color.success,
          }}
        >
          {dx >= SWIPE_TO_RESOLVE ? "RELEASE TO RESOLVE" : "SLIDE TO RESOLVE"}
        </div>
      )}

      <div
        onClick={() => { if (Math.abs(dx) < 6) onOpen(); }}
        onTouchStart={(e) => {
          if (!swipeable) return;
          const t = e.touches[0];
          start.current = { x: t.clientX, y: t.clientY };
          horizontal.current = false;
        }}
        onTouchMove={(e) => {
          if (!swipeable || !start.current) return;
          const t = e.touches[0];
          const mx = t.clientX - start.current.x;
          const my = t.clientY - start.current.y;
          // Decide once: a vertical drag is the page scrolling, not a swipe.
          if (!horizontal.current && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) horizontal.current = true;
          if (horizontal.current) setDx(Math.max(0, Math.min(mx, 140)));
        }}
        onTouchEnd={() => {
          if (dx >= SWIPE_TO_RESOLVE) onSwipeResolve();
          setDx(0);
          start.current = null;
        }}
        style={{
          position: "relative",
          transform: `translateX(${dx}px)`,
          transition: dx === 0 ? "transform .16s" : "none",
          background: color.surface,
          border: `1px solid ${active ? color.accent : color.hairline}`,
          borderRadius: radius.row,
          padding: 12,
          minHeight: hit.min,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: sev.color, flex: "0 0 auto", marginTop: 6 }} />
          {/* Never truncated — this is the only place the defect is written down. */}
          <span style={{ ...text.rowTitle, fontWeight: 500, color: color.ink, textWrap: "pretty" }}>{s.description}</span>
        </div>
        <div style={{ ...text.meta, color: color.faint, paddingLeft: 18 }}>
          {sev.label} · {relative(s.status === "open" ? s.reported_at : s.resolved_at)}
          {s.status !== "open" ? " · resolved" : ""}
          {s.reporter_name ? ` · ${s.reporter_name}` : ""}
        </div>
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
  onSave: (description: string, severity: SquawkRow["severity"]) => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<SquawkRow["severity"]>("low");
  const [saving, setSaving] = useState(false);

  return (
    <div onClick={saving ? undefined : onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
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
            // iOS zooms focused controls below 16px and leaves the whole webview panned afterward.
            fontFamily: text.rowTitle.fontFamily, fontSize: 16, resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          {SEVERITY_ORDER.map((k) => {
            const on = severity === k;
            const sev = SEVERITY[k];
            return (
              <button
                key={k}
                onClick={() => setSeverity(k)}
                style={{
                  flex: 1, minHeight: hit.min, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
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
          onClick={async () => {
            if (saving) return;
            setSaving(true);
            try { await onSave(description.trim(), severity); } finally { setSaving(false); }
          }}
          disabled={saving || !description.trim()}
          style={{
            minHeight: hit.stepper, borderRadius: 14, border: "none", background: accentGradient,
            color: color.onAccent, fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600,
            opacity: !saving && description.trim() ? 1 : 0.4, cursor: "pointer",
          }}
        >
          {saving ? "Saving…" : "Add squawk"}
        </button>
        <button onClick={onClose} style={{ minHeight: hit.min, background: "transparent", border: "none", color: color.faint, fontFamily: text.rowTitle.fontFamily, fontSize: 13.5, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
