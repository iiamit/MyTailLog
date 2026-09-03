import { color, text } from "./tokens";
import { GaugeIcon, PlusCircleIcon, FolderIcon, FlagIcon } from "./icons";

// The persistent tab bar that replaces the Back-stack.
//
// This is the structural change the redesign turns on: you used to reach every
// screen by pushing and popping a stack rooted at the fleet list, so getting
// from a scan to a squawk meant backing all the way out. Four tabs stay put, and
// the aircraft is switched in place from the header instead.

export type Tab = "status" | "log" | "records" | "squawks";

/** Shared with the iPad sidebar so both list the same four, in the same order. */
export const TABS: { id: Tab; label: string; Icon: typeof GaugeIcon }[] = [
  { id: "status", label: "Status", Icon: GaugeIcon },
  { id: "log", label: "Log", Icon: PlusCircleIcon },
  { id: "records", label: "Records", Icon: FolderIcon },
  { id: "squawks", label: "Squawks", Icon: FlagIcon },
];

export function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        // Labels are always visible — an icon-only bar makes people guess.
        background: `${color.bg}EB`, // 92%
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: `1px solid ${color.hairline}`,
        paddingBottom: "env(safe-area-inset-bottom)",
        zIndex: 40,
      }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const on = id === active;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-current={on ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              // Comfortably past the 44 minimum.
              minHeight: 52,
              padding: "8px 0 6px",
              background: "transparent",
              border: "none",
              color: on ? color.accent : color.faint,
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <Icon size={21} color={on ? color.accent : color.faint} />
            <span style={{ ...text.tabLabel, fontWeight: on ? 600 : 500 }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
