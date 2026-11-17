import { useEffect, useState } from "react";
import { color, text, radius, hit, accentGradient, tint, alpha } from "./tokens";
import { EnrollSheet } from "./enroll-sheet";
import { supabase } from "./supabase";

// Empty account after a successful sync: the next action is adding an aircraft.

const STEPS = [
  { title: "Add your aircraft", detail: "Tail number is enough — we pull the rest from the registry." },
  { title: "Snap your logbook pages", detail: "Scan a page, check its crop, then keep turning." },
  { title: "Review the extracted entries", detail: "Confirm the readings before using them to track inspections, ADs and hours." },
];

// Mirrors HEARD_ABOUT in apps/web/src/lib/signupSource.ts (and the 0066 check).
const HEARD_ABOUT: [string, string][] = [
  ["reddit", "Reddit"], ["facebook_group", "Facebook group"], ["forum", "Pilots of America / forum"],
  ["type_club", "Type club"], ["search", "Search"], ["app_store", "App Store / Play"],
  ["friend_or_mechanic", "Friend or mechanic"], ["myflightbook", "MyFlightBook"], ["other", "Other"],
];

export function FirstRun({
  onAddAircraft,
  onSync,
  syncing,
  error,
}: {
  onAddAircraft: (aircraftId: string) => void;
  onSync: () => void;
  syncing: string | null;
  error: string | null;
}) {
  const [enrolling, setEnrolling] = useState(false);
  const [heard, setHeard] = useState(false);
  const [heardError, setHeardError] = useState(false);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profile").select("heard_about").eq("id", user.id).maybeSingle();
      if (mounted && data?.heard_about) setHeard(true);
    })();
    return () => { mounted = false; };
  }, []);
  const answer = async (value: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = user
      ? await supabase.from("profile").update({ heard_about: value }).eq("id", user.id)
      : { error: new Error("Not signed in") };
    if (error) setHeardError(true);
    else setHeard(true);
  };
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
        Add your first aircraft
      </h1>
      <p style={{ ...text.bodyText, fontSize: 14, color: color.dim, textAlign: "center", maxWidth: 250, margin: "10px 0 0" }}>
        Sync is complete and this account has no aircraft yet. Start with a tail number.
      </p>
      {syncing && <p style={{ ...text.secondary, color: color.dim }}>{syncing}</p>}
      {error && <p style={{ ...text.secondary, color: color.danger }}>{error}</p>}

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

      {!heard && (
        <div style={{ alignSelf: "stretch", marginTop: 24, paddingTop: 16, borderTop: `1px solid ${color.hairline}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <span style={{ ...text.cardTitle, color: color.ink }}>How did you hear about MyTailLog?</span>
            <button onClick={() => answer("dismissed")} style={{ ...text.secondary, color: color.dim, background: "none", border: "none", cursor: "pointer" }}>
              Skip
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {HEARD_ABOUT.map(([value, label]) => (
              <button
                key={value}
                onClick={() => answer(value)}
                style={{
                  ...text.secondary, color: color.dim, background: color.surface, cursor: "pointer",
                  border: `1px solid ${color.hairline}`, borderRadius: radius.pill, padding: "6px 12px",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {heardError && <p style={{ ...text.secondary, color: color.danger, marginTop: 8 }}>Couldn&apos;t save that. Try again when online.</p>}
        </div>
      )}

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
        onClick={onSync}
        disabled={!!syncing}
        style={{
          alignSelf: "stretch", marginTop: 10, minHeight: 50, borderRadius: 15,
          background: color.surface, border: `1px solid ${color.hairline}`, color: color.dim,
          fontFamily: text.rowTitle.fontFamily, fontSize: 15, fontWeight: 500, cursor: "pointer",
        }}
      >
        Sync again
      </button>
    </div>
  );
}
