// The design maps every icon to an SF Symbol. This app renders in a webview, so
// those aren't available — these are the equivalents, drawn to the same optical
// weight (1.6 stroke at 21px) so the tab bar reads like a native one.
//
// Design → SF Symbol → here:
//   Status  → gauge.medium  → GaugeIcon
//   Log     → plus.circle   → PlusCircleIcon
//   Records → folder        → FolderIcon
//   Squawks → flag          → FlagIcon

type IconProps = { size?: number; color?: string };

const svg = (size: number, color: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  // A var() is not substituted in an SVG presentation attribute, and every
  // token is one. Paint the CSS `color` property and stroke with currentColor.
  stroke: "currentColor",
  style: { color },
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function GaugeIcon({ size = 21, color = "currentColor" }: IconProps) {
  return (
    <svg {...svg(size, color)} aria-hidden="true">
      <path d="M3.5 15a8.5 8.5 0 1 1 17 0" />
      <path d="M12 15l4-4.5" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlusCircleIcon({ size = 21, color = "currentColor" }: IconProps) {
  return (
    <svg {...svg(size, color)} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

export function FolderIcon({ size = 21, color = "currentColor" }: IconProps) {
  return (
    <svg {...svg(size, color)} aria-hidden="true">
      <path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h3.6a1.5 1.5 0 0 1 1.2.6l.9 1.2h7.8a1.5 1.5 0 0 1 1.5 1.5v8.2a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
    </svg>
  );
}

export function FlagIcon({ size = 21, color = "currentColor" }: IconProps) {
  return (
    <svg {...svg(size, color)} aria-hidden="true">
      <path d="M5.5 21V4" />
      <path d="M5.5 4.8h11.2l-2.1 3.9 2.1 3.9H5.5" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 13, color = "currentColor" }: IconProps) {
  return (
    <svg {...svg(size, color)} aria-hidden="true">
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg {...svg(size, color)} aria-hidden="true">
      <path d="M9.5 5l6.5 7-6.5 7" />
    </svg>
  );
}

export function CameraIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <svg {...svg(size, color)} aria-hidden="true">
      <path d="M3.5 8.8A1.5 1.5 0 0 1 5 7.3h2.2l1.1-1.8h7.4l1.1 1.8H19a1.5 1.5 0 0 1 1.5 1.5v8.4A1.5 1.5 0 0 1 19 18.7H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}
