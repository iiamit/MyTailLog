import { useState } from "react";
import { CapacitorHttp } from "@capacitor/core";
import { API_BASE, supabase } from "./supabase";
import { color, text, radius, hit, accentGradient } from "./tokens";

// ===========================================================================
// "Add my aircraft" — the button first-run has always promised.
//
// Tail number, then the FAA's own answer to confirm against, then it's enrolled.
// The registry lookup is the whole trick: an owner should never type a make, a
// model, a year and a serial number that the government already knows.
//
// Both steps need the network (the registry is a live lookup and enrolment
// creates the row the rest of the app hangs off), so this does NOT go through
// the offline action queue — see the PR note. What it does instead is say so
// plainly rather than pretending to have saved something.
// ===========================================================================

type Record_ = {
  tailNumber: string;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  year: number | null;
  engineMake: string | null;
  engineModel: string | null;
  registrantName: string | null;
};

type Step =
  | { at: "ask"; error?: string }
  | { at: "looking" }
  | { at: "confirm"; record: Record_ }
  | { at: "manual"; tail: string }
  | { at: "saving" };

export function EnrollSheet({
  onClose,
  onEnrolled,
}: {
  onClose: () => void;
  /** The new aircraft's id, so the caller can sync and open it. */
  onEnrolled: (aircraftId: string) => void;
}) {
  const [tail, setTail] = useState("");
  const [step, setStep] = useState<Step>({ at: "ask" });

  async function lookUp() {
    const t = tail.trim().toUpperCase();
    if (!t) return;
    setStep({ at: "looking" });
    const r = await api<{ record?: Record_; error?: string }>("GET", `/api/registry?tail=${encodeURIComponent(t)}`);
    if (r?.record) return setStep({ at: "confirm", record: r.record });
    // A 404 here is ordinary: experimentals, a fresh registration, a foreign
    // tail. It is not a dead end, so offer the way through.
    setStep({ at: "manual", tail: t });
  }

  async function enroll(fields: Record<string, unknown>) {
    setStep({ at: "saving" });
    const r = await api<{ aircraft?: { id: string }; error?: string }>("POST", "/api/aircraft/enroll", fields);
    if (r?.aircraft?.id) return onEnrolled(r.aircraft.id);
    setStep({ at: "ask", error: r?.error ?? "Couldn't add it. Check your signal and try again." });
  }

  return (
    <Sheet onClose={onClose} title="Add my aircraft">
      {step.at === "ask" || step.at === "looking" ? (
        <>
          <label htmlFor="tail" style={{ ...text.secondary, color: color.dim, display: "block", marginBottom: 8 }}>
            Tail number
          </label>
          <input
            id="tail"
            value={tail}
            onChange={(e) => setTail(e.target.value.toUpperCase())}
            placeholder="N12345"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            onKeyDown={(e) => {
              if (e.key === "Enter") void lookUp();
            }}
            style={{
              width: "100%", minHeight: hit.primary, background: color.surfaceRaised,
              border: `1px solid ${color.hairline}`, borderRadius: radius.control,
              padding: "0 14px", color: color.ink,
              // 16px minimum: WKWebView zooms a focused control below it.
              fontFamily: text.tailCard.fontFamily, fontSize: 19, fontWeight: 700, letterSpacing: "0.04em",
            }}
          />
          {step.at === "ask" && step.error && (
            <p style={{ ...text.secondary, color: color.danger, margin: "10px 0 0" }}>{step.error}</p>
          )}
          <p style={{ ...text.meta, color: color.faint, margin: "10px 0 0", lineHeight: 1.45 }}>
            We look it up in the FAA registry so you don&apos;t type the make, model and serial.
          </p>
          <Primary onClick={lookUp} disabled={!tail.trim() || step.at === "looking"}>
            {step.at === "looking" ? "Looking it up…" : "Look it up"}
          </Primary>
        </>
      ) : null}

      {step.at === "confirm" && (
        <>
          <div style={{ ...text.tailCard, color: color.ink, marginBottom: 10 }}>N{strip(step.record.tailNumber)}</div>
          <Fact label="Aircraft" value={[step.record.year, step.record.make, step.record.model].filter(Boolean).join(" ")} />
          <Fact label="Serial number" value={step.record.serialNumber} />
          <Fact label="Engine" value={[step.record.engineMake, step.record.engineModel].filter(Boolean).join(" ")} />
          <Fact label="Registered to" value={step.record.registrantName} />
          <Primary
            onClick={() =>
              enroll({
                tail_number: `N${strip(step.record.tailNumber)}`,
                make: step.record.make,
                model: step.record.model,
                serial_number: step.record.serialNumber,
                year: step.record.year,
              })
            }
          >
            That&apos;s my aircraft
          </Primary>
          <Ghost onClick={() => setStep({ at: "ask" })}>Try another tail number</Ghost>
        </>
      )}

      {step.at === "manual" && (
        <>
          <p style={{ ...text.bodyText, color: color.dim, margin: 0 }}>
            The FAA registry has no match for <strong style={{ color: color.ink }}>{step.tail}</strong> right now.
            You can still add it and fill in the details later.
          </p>
          <Primary onClick={() => enroll({ tail_number: step.tail })}>Add {step.tail} anyway</Primary>
          <Ghost onClick={() => setStep({ at: "ask" })}>Change the tail number</Ghost>
        </>
      )}

      {step.at === "saving" && (
        <p style={{ ...text.bodyText, color: color.dim, margin: 0 }}>Adding it…</p>
      )}
    </Sheet>
  );
}

const strip = (t: string) => t.replace(/^N/i, "");

async function api<T>(method: "GET" | "POST", path: string, data?: unknown): Promise<T | null> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) return null;
  try {
    const res = await CapacitorHttp.request({
      method,
      url: `${API_BASE}${path}`,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(data ? { data } : {}),
    });
    return res.data as T;
  } catch {
    return null;
  }
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${color.hairline}` }}>
      <span style={{ ...text.secondary, color: color.dim }}>{label}</span>
      <span style={{ ...text.rowTitle, color: color.ink, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function Primary({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", marginTop: 18, minHeight: hit.primary, borderRadius: 15, border: "none",
        background: accentGradient, color: color.onAccent, opacity: disabled ? 0.55 : 1,
        fontFamily: text.button.fontFamily, fontSize: 16, fontWeight: 600, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Ghost({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", marginTop: 10, minHeight: hit.min, borderRadius: radius.row,
        background: "transparent", border: `1px solid ${color.hairline}`, color: color.dim,
        fontFamily: text.rowTitle.fontFamily, fontSize: 15, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 70, display: "flex", alignItems: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 560, margin: "0 auto", background: color.surface,
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          border: `1px solid ${color.hairline}`,
          padding: "18px 18px calc(22px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ ...text.screenTitleCompact, color: color.ink }}>{title}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              minWidth: hit.min, minHeight: hit.min, background: "transparent", border: "none",
              color: color.dim, fontSize: 22, cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
