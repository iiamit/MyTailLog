import { encode } from "uqr";

/**
 * A QR code for a link (08 §3.16, the Add pages phone hand-off), drawn as one SVG path in ink on leaf with the
 * four-module quiet zone scanners need. Generated where it renders, from the URL alone; nothing is sent anywhere.
 */
export function Qr({ value, size = 160, label }: { value: string; size?: number; label: string }) {
  const { data } = encode(value, { ecc: "M", border: 4 });
  const n = data.length;
  let d = "";
  data.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x} ${y}h1v1h-1z`; }));
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges" className="block shrink-0 rounded-[var(--radius-s)] bg-leaf text-ink">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
