import { useCallback, useEffect, useState } from "react";
import {
  computeAirworthiness, buildVerdict, shortDate, loadAirworthinessRows, runScan,
  type Airworthiness, type AirworthinessRows, type ScanKind, type StatusLine, type Verdict,
} from "./airworthiness";
import { canEdit, drainActions } from "./actions";
import { actionCount } from "./db";
import { enqueue } from "./mutations";
import { ItemEditor, type Queued } from "./item-editor";
import { AdList } from "./ad-compliance";
import { EquipmentList } from "./equipment-list";
import { CompleteItem } from "./complete-screen";
import { READING_SOURCE_LABEL } from "@/lib/hobbsTach";
import type { MaintenanceItem } from "@/lib/database.types";
import type { StatusItem } from "@/lib/status";
import type { Aircraft } from "./types";
import { color, text, radius, hit, tint, semantic, accentGradient, tabular, alpha } from "./tokens";
import { ChevronRightIcon } from "./icons";

// Status — the default screen after choosing an aircraft.
//
// "Am I legal to fly today, and if not, what do I do about it?" One verdict in
// words before any list; the single item needing attention; everything healthy
// collapsed into a row. Previously seven items rendered as near-identical cards,
// so an engine overhaul due in 2038 competed with a VOR check due in 26 days.

export function Status({
  aircraft,
  onComplete,
  onQueued,
  onShowAll,
}: {
  aircraft: Aircraft;
  onComplete: (item: StatusItem) => void;
  onQueued?: Queued;
  /** Regular width only: the shell already shows AllItems beside this, so the
   *  summary row asks it to come back rather than swapping the primary pane. */
  onShowAll?: () => void;
}) {
  const [data, setData] = useState<Airworthiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const editable = canEdit(aircraft.id);

  useEffect(() => {
    let live = true;
    setData(null);
    computeAirworthiness(aircraft.id)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [aircraft.id]);

  if (error) return <p style={{ ...text.secondary, color: color.danger }}>{error}</p>;
  if (!data) return <p style={{ ...text.secondary, color: color.faint }}>Working it out…</p>;

  const verdict = buildVerdict(data.lines);
  const attention = data.lines.filter((l) => l.urgency === "overdue" || l.urgency === "due_soon");
  const clear = data.lines.filter((l) => l.urgency !== "overdue" && l.urgency !== "due_soon");

  if (showAll) return <AllItems aircraft={aircraft} data={data} onBack={() => setShowAll(false)} onQueued={onQueued} />;

  return (
    <div style={{ position: "relative" }}>
      {/* Instrument backlighting, not a gradient background. */}
      <div aria-hidden style={{
        position: "absolute", top: -70, left: "50%", transform: "translateX(-50%)",
        width: 300, height: 220, pointerEvents: "none",
        background: `radial-gradient(closest-side, ${alpha(semantic[verdict.semantic].color, "2E")}, transparent)`,
      }} />

      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 11, marginBottom: 15 }}>
        <CountdownRing verdict={verdict} />
        <div style={{ ...text.verdict, color: semantic[verdict.semantic].color, textAlign: "center" }}>{verdict.headline}</div>
        <div style={{ ...text.secondary, color: color.dim, textAlign: "center", maxWidth: 250, textWrap: "pretty" }}>{verdict.detail}</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <MeterTile label="TACH" value={data.meters.tach.tach} from={data.meters.tach.from} asOf={data.meters.tach.asOf} estimated={data.meters.tach.estimated} />
        <MeterTile label="HOBBS" value={data.meters.hobbs.hobbs} from={data.meters.hobbs.from} asOf={data.meters.hobbs.asOf} estimated={data.meters.hobbs.estimated} />
      </div>

      {attention.length > 0 && (
        <>
          <div style={{ ...text.sectionLabel, color: color.faint, marginBottom: 8 }}>Needs attention</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            {attention.map((l) => (
              <AttentionCard key={`${l.item.source}:${l.item.id}`} line={l}
                editable={editable && l.item.source === "maintenance"} onComplete={() => onComplete(l.item)} />
            ))}
          </div>
        </>
      )}

      <button onClick={() => (onShowAll ? onShowAll() : setShowAll(true))} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
          background: color.surface, border: `1px solid ${color.hairline}`,
          borderRadius: radius.card, padding: "12px 15px", cursor: "pointer", minHeight: 44,
        }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ ...text.rowTitle, color: color.ink, display: "block" }}>
              {clear.length === 0 ? "Everything tracked" : attention.length > 0 ? "Clear for now" : "Everything is clear"}
            </span>
            {/* Plain English, not a count of opaque rows. */}
            <span style={{ ...text.meta, color: color.faint, display: "block", marginTop: 2 }}>
              {clear.length > 0
                ? clear.map((l) => l.item.label.replace(/\s*\(.*\)\s*/, "")).join(", ")
                : "Inspections, directives and equipment"}
            </span>
          </span>
          {clear.length > 0 && <span style={{ ...text.countdown, color: color.success, fontSize: 14 }}>{clear.length}</span>}
          <ChevronRightIcon size={14} color={color.faint} />
        </button>

      <p style={{ ...text.meta, color: color.faint, marginTop: 16, lineHeight: 1.5 }}>
        Worked out on this phone from your last sync. It mirrors your records — it isn&apos;t the
        logbook, and the PIC is still responsible for airworthiness under 91.7.
      </p>
    </div>
  );
}

/**
 * 120pt ring. The arc sweep is the proportion of the interval elapsed, so it
 * fills as the deadline approaches — readable before the number is.
 */
function CountdownRing({ verdict }: { verdict: Verdict }) {
  const c = semantic[verdict.semantic].color;
  const SIZE = 120, R = 46;
  const circumference = 2 * Math.PI * R;
  const [sweep, setSweep] = useState(0);

  // One movement on appear (~400ms), then still.
  useEffect(() => {
    const t = setTimeout(() => setSweep(verdict.progress), 40);
    return () => clearTimeout(t);
  }, [verdict.progress]);

  return (
    <div role="img"
      aria-label={`${verdict.value} ${verdict.unit}${verdict.item ? `, ${verdict.item.label}` : ""}. ${verdict.headline}.`}
      style={{
        width: SIZE, height: SIZE, position: "relative", borderRadius: "50%",
        border: `2px solid ${alpha(c, "47")}`, background: `radial-gradient(closest-side, ${alpha(c, "17")}, transparent)`,
        display: "grid", placeItems: "center",
      }}>
      <svg width={SIZE} height={SIZE} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }} aria-hidden>
        {/* stroke goes through style, not the presentation attribute: a var() is not substituted in an attribute. */}
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={5} style={{ stroke: color.surfaceRaised }} />
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={5} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - sweep)}
          style={{ stroke: c, transition: "stroke-dashoffset 400ms ease-out" }} />
      </svg>
      <div style={{ position: "relative", textAlign: "center" }}>
        <div style={{ ...text.hero, ...tabular, color: color.ink }}>{verdict.value}</div>
        <div style={{ fontFamily: text.meta.fontFamily, fontSize: 10.5, color: color.dim, marginTop: 2 }}>{verdict.unit}</div>
      </div>
    </div>
  );
}

function MeterTile({ label, value, from, asOf, estimated }: {
  label: string; value: number | null; from: string | null; asOf: string | null; estimated: boolean;
}) {
  return (
    <div style={{ flex: 1, background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.row, padding: "11px 13px" }}>
      <div style={{ fontFamily: text.meta.fontFamily, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.09em", color: color.faint }}>{label}</div>
      <div style={{ ...text.meterValue, ...tabular, color: value == null ? color.faint : color.ink, marginTop: 3 }}>
        {value == null ? "—" : value.toFixed(1)}
      </div>
      <div style={{ ...text.meta, color: color.faint, marginTop: 3 }}>
        {estimated ? "estimated · " : ""}{freshness(asOf)}
        {from ? ` · ${READING_SOURCE_LABEL[from as keyof typeof READING_SOURCE_LABEL] ?? from}` : ""}
      </div>
    </div>
  );
}

/** "5 days ago" beats a date here — the question is whether it's stale. */
function freshness(iso: string | null): string {
  if (!iso) return "no reading";
  const days = Math.round((Date.now() - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 45) return `${days} days ago`;
  return shortDate(iso);
}

function AttentionCard({ line, editable, onComplete }: {
  line: Airworthiness["lines"][number]; editable: boolean; onComplete: () => void;
}) {
  const i = line.item;
  const sem = line.urgency === "overdue" ? semantic.grounded : semantic.due;
  // The FAR number is a chip, never the title.
  const ref = /\(([^)]+)\)/.exec(i.label)?.[1] ?? null;
  const title = i.label.replace(/\s*\(.*\)\s*/, "").trim();

  return (
    <div style={{ background: color.surface, border: `1px solid ${sem.border}`, borderRadius: radius.card, padding: "13px 15px", display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...text.cardTitle, fontSize: 15.5, color: color.ink }}>{title}</span>
        {ref && (
          <span style={{ fontFamily: text.meta.fontFamily, fontSize: 10, fontWeight: 600, color: color.dim, background: color.surfaceRaised, borderRadius: 5, padding: "2px 6px" }}>{ref}</span>
        )}
      </div>
      <div style={{ ...text.secondary, fontWeight: 500, color: sem.color }}>
        {line.due}{i.nextDueDate ? ` — ${shortDate(i.nextDueDate)}` : ""}
      </div>
      <div style={{ ...text.meta, color: color.faint }}>
        {i.intervalMonths ? `Every ${i.intervalMonths} month${i.intervalMonths === 1 ? "" : "s"}` : ""}
        {i.intervalHours ? `Every ${i.intervalHours} h on ${i.meter}` : ""}
        {i.lastDoneDate ? ` · last done ${shortDate(i.lastDoneDate)}` : ""}
      </div>
      {i.hoursUnreliable && (
        <div style={{ ...text.meta, color: color.warning }}>
          The hours countdown can&apos;t be trusted — last-done is above the current reading.
        </div>
      )}
      {editable && (
        <button onClick={onComplete} style={{ minHeight: 44, borderRadius: radius.control, border: "none", background: accentGradient, color: color.onAccent, fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          Mark done
        </button>
      )}
    </div>
  );
}

// --- All items (pushed from "Clear for now") -------------------------------

// --- All items -------------------------------------------------------------
//
// Everything the aircraft is judged on, and the only place to change it:
// inspections, directives and installed equipment. On the phone it is pushed
// from "Everything else"; on iPad the shell renders it as the Status right
// pane, so it takes its own props, loads its own rows and needs no back button.

type Filter = "all" | "required" | "advisory";
type Segment = "inspections" | "ads" | "equipment";

const SEGMENTS: [Segment, string][] = [
  ["inspections", "Inspections"],
  ["ads", "Directives"],
  ["equipment", "Equipment"],
];

export function AllItems({ aircraft, data: seed, onBack, onQueued }: {
  aircraft: Aircraft;
  /** Already computed by Status — avoids a blank frame on the push. */
  data?: Airworthiness;
  /** Compact only; the iPad pane has nothing to go back to. */
  onBack?: () => void;
  onQueued?: Queued;
}) {
  const [data, setData] = useState<Airworthiness | null>(seed ?? null);
  const [rows, setRows] = useState<AirworthinessRows | null>(null);
  const [segment, setSegment] = useState<Segment>("inspections");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<MaintenanceItem | "new" | null>(null);
  const [completing, setCompleting] = useState<StatusItem | null>(null);
  const [scan, setScan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = canEdit(aircraft.id);
  const queued = onQueued ?? whenQueued;

  const reload = useCallback(async () => {
    const [d, r] = await Promise.all([
      computeAirworthiness(aircraft.id),
      loadAirworthinessRows(aircraft.id),
    ]);
    setData(d);
    setRows(r);
  }, [aircraft.id]);

  useEffect(() => { void reload(); }, [reload]);

  if (completing) {
    return (
      <CompleteItem
        aircraft={aircraft}
        item={completing}
        onBack={() => { setCompleting(null); void reload(); }}
        onQueued={queued}
      />
    );
  }

  const lines = data?.lines ?? [];
  const inspections = lines.filter((l) => l.item.source === "maintenance");
  const shown = inspections.filter((l) =>
    filter === "all" ? true : filter === "required" ? l.item.regulatory : !l.item.regulatory);
  const counts = {
    all: inspections.length,
    required: inspections.filter((l) => l.item.regulatory).length,
    advisory: inspections.filter((l) => !l.item.regulatory).length,
  };
  const itemById = new Map((rows?.items ?? []).map((i) => [i.id, i]));

  async function runScanFor(kind: ScanKind) {
    setBusy(true);
    setScan(null);
    try {
      const r = await runScan(aircraft.id, kind);
      // The rows land on the server; they reach the phone on the next sync.
      setScan("ok" in r ? `${r.summary}. They'll show here after the next sync.` : r.error);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function seedStandard() {
    setBusy(true);
    try {
      await enqueue("mx.seedStandard", aircraft.id, {}, { label: "Standard inspections set up" });
      await queued();
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        {onBack && (
          <button onClick={onBack} aria-label="Back" style={{ background: "none", border: "none", color: color.accent, fontSize: 18, cursor: "pointer", padding: "4px 8px 4px 0", minHeight: 44 }}>‹</button>
        )}
        <span style={{ ...text.verdict, color: color.ink }}>All items</span>
        <span style={{ ...text.meta, color: color.faint, marginLeft: "auto" }}>{aircraft.tail_number}</span>
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
        {SEGMENTS.map(([id, label]) => (
          <SegButton key={id} on={segment === id} onClick={() => setSegment(id)}>{label}</SegButton>
        ))}
      </div>

      {scan && <p style={{ ...text.secondary, color: color.dim, lineHeight: 1.45, marginTop: 0 }}>{scan}</p>}

      {segment === "inspections" && (
        <>
          {editable && (
            <button onClick={() => setEditing("new")} style={addButton}>+ Add an inspection or overhaul</button>
          )}

          {/* Required vs advisory is a filter, not grey metadata. */}
          {inspections.length > 0 && (
            <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
              {([["all", "All"], ["required", "Required"], ["advisory", "Advisory"]] as const).map(([id, label]) => (
                <SegButton key={id} small on={filter === id} onClick={() => setFilter(id)}>{`${label} ${counts[id]}`}</SegButton>
              ))}
            </div>
          )}

          {inspections.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ ...text.secondary, color: color.faint, lineHeight: 1.5, margin: 0 }}>
                Nothing is being tracked yet. Start with the inspections every aircraft needs — the annual,
                transponder, pitot-static and ELT — then add your own.
              </p>
              {editable && (
                <button onClick={seedStandard} disabled={busy} style={{ ...addButton, marginBottom: 0, opacity: busy ? 0.5 : 1 }}>
                  Set up the standard inspections
                </button>
              )}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shown.map((l) => (
              <ItemRow
                key={l.item.id}
                line={l}
                editable={editable}
                onEdit={() => { const row = itemById.get(l.item.id); if (row) setEditing(row); }}
                onComplete={() => setCompleting(l.item)}
              />
            ))}
          </div>

          {editable && inspections.length > 0 && (
            <ScanButton busy={busy} onClick={() => runScanFor("maintenance")}>
              Scan the logs for completions
            </ScanButton>
          )}
        </>
      )}

      {segment === "ads" && rows && (
        <AdList
          aircraft={aircraft}
          ads={rows.ads}
          refs={rows.refs}
          components={rows.components}
          currentTach={data?.meters.tach.tach ?? null}
          editable={editable}
          onQueued={queued}
          onChanged={reload}
        />
      )}

      {segment === "equipment" && rows && (
        <>
          <EquipmentList
            aircraft={aircraft}
            components={rows.components}
            proposals={rows.proposals}
            editable={editable}
            onQueued={queued}
            onChanged={reload}
          />
          {editable && (
            <ScanButton busy={busy} onClick={() => runScanFor("equipment")}>
              Find equipment in the logs
            </ScanButton>
          )}
        </>
      )}

      {editing && (
        <ItemEditor
          aircraft={aircraft}
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onQueued={queued}
          onChanged={reload}
        />
      )}
    </>
  );
}

/** After a write, when the shell hasn't handed us its own sync step. */
async function whenQueued(): Promise<"synced" | "pending"> {
  if (!navigator.onLine) return "pending";
  await drainActions();
  return (await actionCount()) === 0 ? "synced" : "pending";
}

function SegButton({ on, small, onClick, children }: {
  on: boolean; small?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} style={{
      flex: small ? "none" : 1, background: on ? color.accent : color.surface,
      color: on ? color.onAccent : color.dim,
      border: `1px solid ${on ? color.accent : color.hairline}`, borderRadius: radius.chip,
      padding: "7px 12px", minHeight: small ? 36 : 40, fontFamily: text.rowTitle.fontFamily,
      fontSize: small ? 12 : 13.5, fontWeight: 600, cursor: "pointer",
    }}>{children}</button>
  );
}

/** Costs an AI call and needs a live connection — say so instead of failing. */
function ScanButton({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: React.ReactNode }) {
  const online = navigator.onLine;
  return (
    <button onClick={onClick} disabled={busy || !online} style={{
      width: "100%", minHeight: hit.min, marginTop: 14, borderRadius: radius.control,
      background: "transparent", border: `1px solid ${color.hairline}`,
      color: online ? color.dim : color.faint,
      fontFamily: text.button.fontFamily, fontSize: 14, fontWeight: 600,
      cursor: online ? "pointer" : "default", opacity: busy ? 0.5 : 1,
    }}>{busy ? "Reading your logs…" : online ? children : "Reading your logs needs a connection"}</button>
  );
}

function ItemRow({ line: l, editable, onEdit, onComplete }: {
  line: StatusLine; editable: boolean; onEdit: () => void; onComplete: () => void;
}) {
  const i = l.item;
  const sem = l.urgency === "overdue" ? semantic.grounded : l.urgency === "due_soon" ? semantic.due : null;
  return (
    <div style={{ background: color.surface, border: `1px solid ${sem ? sem.border : color.hairline}`, borderRadius: radius.row, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <button onClick={onEdit} disabled={!editable} style={{ all: "unset", cursor: editable ? "pointer" : "default", display: "flex", flexDirection: "column", gap: 8, minHeight: editable ? 44 : undefined, justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ ...text.rowTitle, color: color.ink, minWidth: 0, flex: 1 }}>{i.label.replace(/\s*\(.*\)\s*/, "")}</span>
          <span style={{ ...text.countdown, ...tabular, color: sem ? sem.color : color.dim, whiteSpace: "nowrap" }}>{shortRemaining(l)}</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: color.surfaceRaised, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round(fraction(i) * 100)}%`, background: sem ? sem.color : i.regulatory ? color.accent : color.faint }} />
        </div>
        <div style={{ ...text.meta, color: color.faint }}>
          {i.regulatory ? "Required" : "Advisory"}
          {i.intervalMonths ? ` · every ${i.intervalMonths} mo` : ""}
          {i.intervalHours ? ` · every ${i.intervalHours} h ${i.meter}` : ""}
          {i.nextDueDate ? ` · ${shortDate(i.nextDueDate)}` : l.projection ? ` · around ${l.projection.replace(/^≈\s*/, "").replace(/\s*\(.*\)$/, "")}` : ""}
        </div>
      </button>
      {editable && (
        <button onClick={onComplete} style={{
          minHeight: hit.min, borderRadius: radius.control, background: tint.accent,
          border: `1px solid ${tint.accentBorder}`, color: color.accent,
          fontFamily: text.button.fontFamily, fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}>Mark done</button>
      )}
    </div>
  );
}

const addButton: React.CSSProperties = {
  width: "100%", minHeight: hit.min, marginBottom: 12, borderRadius: radius.control,
  background: tint.accent, border: `1px solid ${tint.accentBorder}`, color: color.accent,
  fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600, cursor: "pointer",
};

function fraction(i: StatusItem): number {
  if (i.nextDueForItem != null && i.currentForItem != null && i.intervalHours) {
    const remaining = i.nextDueForItem - i.currentForItem;
    return Math.max(0, Math.min(1, (i.intervalHours - remaining) / i.intervalHours));
  }
  if (i.nextDueDate && i.intervalMonths) {
    const days = Math.round((Date.parse(`${i.nextDueDate}T00:00:00Z`) - Date.now()) / 86_400_000);
    const total = i.intervalMonths * 30.44;
    return Math.max(0, Math.min(1, (total - days) / total));
  }
  return 0;
}

/** "26 days" / "30 hrs" / "7 months" — short enough not to wrap. */
function shortRemaining(l: Airworthiness["lines"][number]): string {
  const i = l.item;
  if (i.nextDueDate) {
    const days = Math.round((Date.parse(`${i.nextDueDate}T00:00:00Z`) - Date.now()) / 86_400_000);
    if (days < 0) return `${Math.abs(days)} d over`;
    if (days < 90) return `${days} days`;
    return `${Math.round(days / 30.44)} months`;
  }
  if (i.nextDueForItem != null && i.currentForItem != null) {
    const h = Math.round(i.nextDueForItem - i.currentForItem);
    return h < 0 ? `${Math.abs(h)} h over` : `${h} hrs`;
  }
  return "—";
}
