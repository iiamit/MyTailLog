import { useState } from "react";
import { color, text, radius, hit, accentGradient, tint, alpha } from "./tokens";
import { EnrollSheet } from "./enroll-sheet";

// First run — the screen an AirVenture booth visitor lands on.
//
// Promise the payoff, not the feature list. The demo aircraft matters: it lets a
// sceptic at a trade-show booth see a populated app before typing their tail
// number.

const STEPS = [
  { title: "Add your aircraft", detail: "Tail number is enough — we pull the rest from the registry." },
  { title: "Snap your logbook pages", detail: "Point, shoot, keep turning. Bad light is fine." },
  { title: "We read every entry", detail: "ADs, inspections and hours start tracking themselves." },
];

export function FirstRun({
  onAddAircraft,
  onDemo,
  onSignIn,
}: {
  /** Called once the aircraft actually exists, with its id. */
  onAddAircraft: (aircraftId?: string) => void;
  onDemo: () => void;
  onSignIn: () => void;
}) {
  const [enrolling, setEnrolling] = useState(false);
  return (
    <div style={{ position: "relative", padding: "36px 6px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
      <div aria-hidden style={{
        position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
        width: 320, height: 240, pointerEvents: "none",
        background: `radial-gradient(closest-side, ${alpha(color.accent, "2E")}, transparent)`,
      }} />

      <div style={{
        position: "relative", width: 52, height: 45, background: accentGradient,
        clipPath: "polygon(50% 0, 100% 86%, 0 86%)",
        filter: `drop-shadow(0 6px 22px ${alpha(color.accent, "66")})`,
      }} />

      <h1 style={{ ...text.screenTitle, fontSize: 27, lineHeight: 1.15, color: color.ink, textAlign: "center", margin: "18px 0 0" }}>
        Your logbooks,
        <br />
        off the shelf
      </h1>
      <p style={{ ...text.bodyText, fontSize: 14, color: color.dim, textAlign: "center", maxWidth: 250, margin: "10px 0 0" }}>
        Three steps and you&apos;ll know exactly when your next inspection is due.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "26px 0 0", alignSelf: "stretch" }}>
        {STEPS.map((s, i) => (
          <div key={s.title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{
              flex: "0 0 auto", width: 30, height: 30, borderRadius: "50%",
              background: tint.accent, border: `1px solid ${tint.accentBorder}`,
              display: "grid", placeItems: "center",
              fontFamily: text.countdown.fontFamily, fontSize: 13, fontWeight: 700, color: color.accent,
            }}>
              {i + 1}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ ...text.cardTitle, color: color.ink, display: "block" }}>{s.title}</span>
              <span style={{ ...text.secondary, color: color.dim, display: "block", marginTop: 2, lineHeight: 1.45 }}>
                {s.detail}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* The first promise the app makes. It now keeps it here rather than
          handing the owner back to the website. */}
      {enrolling && (
        <EnrollSheet
          onClose={() => setEnrolling(false)}
          onEnrolled={(id) => {
            setEnrolling(false);
            onAddAircraft(id);
          }}
        />
      )}

      <button
        onClick={() => setEnrolling(true)}
        style={{
          alignSelf: "stretch", marginTop: 26, minHeight: hit.primary, borderRadius: 15, border: "none",
          background: accentGradient, color: color.onAccent,
          fontFamily: text.button.fontFamily, fontSize: 16, fontWeight: 600, cursor: "pointer",
        }}
      >
        Add my aircraft
      </button>
      <button
        onClick={onDemo}
        style={{
          alignSelf: "stretch", marginTop: 10, minHeight: 50, borderRadius: 15,
          background: color.surface, border: `1px solid ${color.hairline}`, color: color.dim,
          fontFamily: text.rowTitle.fontFamily, fontSize: 15, fontWeight: 500, cursor: "pointer",
        }}
      >
        Look around with a demo aircraft
      </button>
      <p style={{ ...text.meta, color: color.faint, marginTop: 14 }}>
        Already have an account?{" "}
        <button onClick={onSignIn} style={{ background: "none", border: "none", color: color.accent, font: "inherit", cursor: "pointer", padding: 0 }}>
          Sign in
        </button>
      </p>
    </div>
  );
}
