import { useState } from "react";
import { color, text, radius, display } from "./tokens";
import { ChevronDownIcon } from "./icons";
import { Pill, URGENCY_LABEL } from "./ui";
import type { Aircraft } from "./types";
import type { Urgency } from "@/lib/compliance";

// The tail number in the header IS the aircraft switcher.
//
// This is what lets the tab bar work: you change aircraft in place rather than
// backing out to a list, so the fleet stops being a place you have to return
// through. Switching keeps whichever tab you were on — if you were in Records
// you land on the new aircraft's Records.

export function AircraftSwitcher({
  aircraft,
  fleet,
  worst,
  onSwitch,
  onSeeAll,
  variant = "header",
}: {
  aircraft: Aircraft;
  fleet: Aircraft[];
  worst: Record<string, Urgency>;
  onSwitch: (a: Aircraft) => void;
  onSeeAll: () => void;
  /** `header`: the phone's inline tail button. `sidebar`: stacked, with the status pill, for the iPad sidebar. */
  variant?: "header" | "sidebar";
}) {
  const [open, setOpen] = useState(false);
  const type = [aircraft.make, aircraft.model].filter(Boolean).join(" ");
  // From the sidebar (regular width only) the list is a centred dialog: a
  // full-width bottom sheet on a 1024pt screen is a long reach for three tails.
  const dialog = variant === "sidebar";
  const current = worst[aircraft.id];

  return (
    <>
      {variant === "sidebar" ? (
        <button
          onClick={() => setOpen(true)}
          aria-label={`Switch aircraft, currently ${aircraft.tail_number}`}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 6,
            width: "100%",
            background: color.surfaceRaised,
            border: `1px solid ${color.hairline}`,
            borderRadius: radius.row,
            padding: "10px 12px",
            color: color.ink,
            cursor: "pointer",
            minHeight: 44,
            textAlign: "left",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 7, width: "100%" }}>
            <span style={text.tailCard}>{aircraft.tail_number}</span>
            <span style={{ marginLeft: "auto", display: "inline-flex" }}><ChevronDownIcon size={13} color={color.faint} /></span>
          </span>
          {type && (
            <span style={{ ...text.meta, color: color.dim, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {type}
            </span>
          )}
          {current && current !== "none" && <Pill tone={current}>{URGENCY_LABEL[current]}</Pill>}
        </button>
      ) : (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: color.surface,
            border: `1px solid ${color.hairline}`,
            borderRadius: radius.control - 1,
            padding: "8px 12px",
            color: color.ink,
            cursor: "pointer",
            minHeight: 44,
          }}
        >
          <span style={text.tailSwitcher}>{aircraft.tail_number}</span>
          <ChevronDownIcon size={13} color={color.faint} />
        </button>
        {type && (
          <span style={{ ...text.secondary, color: color.dim, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {type}
          </span>
        )}
      </div>
      )}

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.55)",
            zIndex: 60,
            display: "flex",
            alignItems: dialog ? "center" : "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: dialog ? 420 : undefined,
              background: color.surface,
              borderRadius: 20,
              borderBottomLeftRadius: dialog ? 20 : 0,
              borderBottomRightRadius: dialog ? 20 : 0,
              border: `1px solid ${color.hairline}`,
              padding: dialog ? "14px 16px 20px" : `14px 16px calc(20px + env(safe-area-inset-bottom))`,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ ...text.sectionLabel, color: color.faint, marginBottom: 2 }}>Switch aircraft</div>
            {fleet.map((a) => {
              const u = worst[a.id];
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    onSwitch(a);
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: a.id === aircraft.id ? color.surfaceRaised : "transparent",
                    border: `1px solid ${a.id === aircraft.id ? color.hairline : "transparent"}`,
                    borderRadius: radius.row,
                    padding: "12px 13px",
                    minHeight: 44,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontFamily: display, fontSize: 15, fontWeight: 700, color: color.ink }}>
                    {a.tail_number}
                  </span>
                  <span style={{ ...text.meta, color: color.dim, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[a.make, a.model].filter(Boolean).join(" ")}
                  </span>
                  <span style={{ marginLeft: "auto" }}>
                    {u && u !== "none" && <Pill tone={u}>{URGENCY_LABEL[u]}</Pill>}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => {
                onSeeAll();
                setOpen(false);
              }}
              style={{
                marginTop: 4,
                background: "transparent",
                border: `1px solid ${color.hairline}`,
                borderRadius: radius.row,
                padding: "12px",
                color: color.accent,
                fontFamily: text.rowTitle.fontFamily,
                fontSize: 14,
                fontWeight: 600,
                minHeight: 44,
                cursor: "pointer",
              }}
            >
              See all aircraft
            </button>
          </div>
        </div>
      )}
    </>
  );
}
