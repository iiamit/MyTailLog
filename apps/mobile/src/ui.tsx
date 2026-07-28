// Shared chrome + tokens (inline styles for now; the real design system lands
// with the shell). Dark "glass cockpit" to match the web app.

export const bg = "#090c12";
export const panel = "#131a26";
export const panel2 = "#1b2432";
export const line = "#26303f";
export const ink = "#e8eef7";
export const dim = "#9fb0c6";
export const faint = "#647890";
export const accent = "#5aa0ff";
export const amber = "#ffb020";

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: bg,
        color: ink,
        padding: "max(20px, env(safe-area-inset-top)) 18px calc(20px + env(safe-area-inset-bottom))",
        fontFamily: "-apple-system, system-ui, sans-serif",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

export function Brand({ small }: { small?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span
        style={{
          width: small ? 18 : 24,
          height: small ? 18 : 24,
          background: `conic-gradient(from 45deg, ${accent}, #8ec8ff)`,
          clipPath: "polygon(50% 0,100% 86%,0 86%)",
        }}
      />
      <span style={{ fontWeight: 800, fontSize: small ? 17 : 22, letterSpacing: -0.3 }}>MyTailLog</span>
    </div>
  );
}

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 30 }}>
      {onBack && (
        <button onClick={onBack} style={{ ...ghost, padding: "6px 10px" }} aria-label="Back">
          ‹ Back
        </button>
      )}
      <span style={{ fontWeight: 700, fontSize: 17 }}>{title}</span>
      {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
    </div>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: `1px solid ${line}` }}>
      <span style={{ color: dim, fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export function Card({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: panel,
        border: `1px solid ${line}`,
        borderRadius: 12,
        padding: "12px 14px",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {children}
    </div>
  );
}

export const input: React.CSSProperties = { background: panel, border: `1px solid ${line}`, borderRadius: 10, padding: "12px 14px", color: ink, fontSize: 16 };
export const primary: React.CSSProperties = { background: accent, color: "#071018", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700 };
export const ghost: React.CSSProperties = { background: "transparent", color: dim, border: `1px solid ${line}`, borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer" };
export const mono: React.CSSProperties = { fontFamily: "ui-monospace, Menlo, monospace", fontVariantNumeric: "tabular-nums" };
