import { color, text, radius, display } from "./tokens";
import { Documents } from "./documents-screen";
import { Entries, Pages } from "./screens";
import { CameraIcon } from "./icons";
import { accentGradient } from "./tokens";
import type { Segment } from "./App";
import type { Aircraft, LogEntry, Page } from "./types";

// Records — one tab, three segments.
//
// Documents, Scans and Maintenance history used to be three of five look-alike
// buttons on the aircraft home. They are all "the paperwork", reached for the
// same reason, so they collapse behind one tab with a segmented control instead
// of competing for space with Status and Log.

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "documents", label: "Documents" },
  { id: "scans", label: "Scans" },
  { id: "history", label: "History" },
];

export function Records({
  aircraft,
  segment,
  onSegment,
  onOpenEntry,
  onOpenPage,
  onOpenPdf,
  onCapture,
  onZoom,
}: {
  aircraft: Aircraft;
  segment: Segment;
  onSegment: (s: Segment) => void;
  onOpenEntry: (e: LogEntry) => void;
  onOpenPage: (pages: Page[], index: number) => void;
  onOpenPdf: (doc: { id: string; title: string }) => void;
  onCapture: () => void;
  onZoom: (src: string) => void;
}) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
        <h1 style={{ ...text.screenTitle, color: color.ink, margin: 0 }}>Records</h1>
        <span style={{ ...text.meta, color: color.faint, marginLeft: "auto" }}>{aircraft.tail_number}</span>
      </div>

      {/* Segmented control: track `surface`, selected segment lifts to `surfaceRaised`. */}
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 3,
          background: color.surface,
          border: `1px solid ${color.hairline}`,
          borderRadius: radius.control,
          padding: 3,
          marginBottom: 18,
        }}
      >
        {SEGMENTS.map((s) => {
          const on = s.id === segment;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={on}
              onClick={() => onSegment(s.id)}
              style={{
                flex: 1,
                minHeight: 36,
                background: on ? color.surfaceRaised : "transparent",
                border: "none",
                borderRadius: radius.chip,
                color: on ? color.ink : color.dim,
                fontFamily: text.rowTitle.fontFamily,
                fontSize: 13.5,
                fontWeight: on ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {segment === "documents" && (
        <Documents aircraft={aircraft} onZoom={onZoom} onOpenPdf={onOpenPdf} />
      )}

      {segment === "scans" && (
        <>
          <Pages aircraft={aircraft} onOpen={onOpenPage} />
          {/* Scanning belongs to the pages, so the FAB lives here rather than
              above the fleet where it used to sit. */}
          <button
            onClick={onCapture}
            style={{
              position: "fixed",
              right: 20,
              bottom: "calc(78px + env(safe-area-inset-bottom) + 20px)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 50,
              padding: "0 18px",
              borderRadius: 999,
              border: "none",
              background: accentGradient,
              color: color.onAccent,
              fontFamily: display,
              fontSize: 14.5,
              fontWeight: 600,
              boxShadow: `0 10px 26px ${color.accent}57`,
              cursor: "pointer",
              zIndex: 30,
            }}
          >
            <CameraIcon size={18} color={color.onAccent} />
            Scan
          </button>
        </>
      )}

      {segment === "history" && <Entries aircraft={aircraft} onOpen={onOpenEntry} />}
    </>
  );
}
