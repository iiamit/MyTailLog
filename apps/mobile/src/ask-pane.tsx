import { useEffect, useRef, useState } from "react";
import { CapacitorHttp } from "@capacitor/core";
import { API_BASE, supabase } from "./supabase";
import { shortDate } from "./airworthiness";
import { aiAllowance } from "./actions";
import type { Aircraft } from "./types";
import { color, text, radius, hit, display, accentGradient } from "./tokens";

// Ask the logbooks a question. The answer comes from the extracted entries and
// cites the ones it used, so it can be checked against the paper — which is the
// only reason to trust it at all.
//
// Online only, and it says so rather than queueing: an answer produced three
// hours later, after the conversation that prompted the question has ended, is
// worth nothing. Everything else in this app works offline; this one is honest
// about needing signal.

type Citation = {
  id: string;
  date: string | null;
  label: string;
  snippet: string;
  pageId: string | null;
};

type Turn = {
  id: string;
  question: string;
  answer: string | null;
  citations: Citation[];
  error: string | null;
};

export function AskPane({
  aircraft,
  onOpenEntry,
}: {
  aircraft: Aircraft;
  /** Tapping a citation opens that entry, when the caller can show one. */
  onOpenEntry?: (entryId: string) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const allowance = aiAllowance();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  // A new aircraft is a new conversation — the entries the answers came from
  // are a different aeroplane's.
  useEffect(() => setTurns([]), [aircraft.id]);

  async function ask() {
    const q = question.trim();
    if (!q || asking) return;
    const id = `${Date.now()}`;
    setTurns((t) => [...t, { id, question: q, answer: null, citations: [], error: null }]);
    setQuestion("");
    setAsking(true);

    const patch = (fields: Partial<Turn>) =>
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, ...fields } : turn)));

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        patch({ error: "Sign in again to ask." });
        return;
      }
      const res = await CapacitorHttp.post({
        url: `${API_BASE}/api/aircraft/${aircraft.id}/ask`,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: { question: q },
      });
      const body = res.data as { answer?: string; citations?: Citation[]; error?: string } | undefined;
      if (res.status < 200 || res.status >= 300) {
        patch({ error: body?.error ?? "That didn't go through. Try again in a moment." });
        return;
      }
      patch({ answer: body?.answer ?? "", citations: body?.citations ?? [] });
    } catch {
      patch({ error: "Couldn't reach the server. Check your connection and ask again." });
    } finally {
      setAsking(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h2 style={{ fontFamily: display, fontSize: 19, fontWeight: 700, color: color.ink, margin: 0 }}>
          Ask the logbooks
        </h2>
      </div>

      {turns.length === 0 && (
        <p style={{ ...text.secondary, color: color.faint, lineHeight: 1.5, margin: 0 }}>
          Questions about what is written in the books — &ldquo;when was the vacuum pump last
          replaced?&rdquo;, &ldquo;has the ELT battery ever been changed?&rdquo;. Every answer names the
          entries it came from, so you can check it against the paper.
        </p>
      )}

      {turns.map((t) => (
        <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              alignSelf: "flex-end", maxWidth: "88%",
              background: color.surfaceRaised, border: `1px solid ${color.hairline}`,
              borderRadius: radius.card, padding: "10px 13px",
              ...text.secondary, color: color.ink, lineHeight: 1.45,
            }}
          >
            {t.question}
          </div>

          {t.error ? (
            <div style={{ ...text.secondary, color: color.danger, lineHeight: 1.45 }}>{t.error}</div>
          ) : t.answer === null ? (
            <div style={{ ...text.secondary, color: color.faint }}>Reading the logbooks…</div>
          ) : (
            <div
              style={{
                background: color.surface, border: `1px solid ${color.hairline}`,
                borderRadius: radius.card, padding: "13px 15px",
              }}
            >
              <div style={{ ...text.bodyText, color: color.ink, whiteSpace: "pre-wrap", textWrap: "pretty" }}>
                {t.answer}
              </div>
              {t.citations.length > 0 && (
                <div style={{ marginTop: 12, borderTop: `1px solid ${color.hairline}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ ...text.meta, color: color.faint }}>From these entries</div>
                  {t.citations.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onOpenEntry?.(c.id)}
                      disabled={!onOpenEntry}
                      style={{
                        textAlign: "left", minHeight: hit.min, background: "transparent",
                        border: "none", padding: 0, cursor: onOpenEntry ? "pointer" : "default",
                      }}
                    >
                      <span style={{ ...text.meta, color: color.accent, display: "block" }}>
                        {c.date ? shortDate(c.date) : "undated"} · {c.label}
                      </span>
                      <span style={{ ...text.meta, color: color.dim, display: "block", marginTop: 2, lineHeight: 1.45 }}>
                        {c.snippet}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <div ref={bottom} />

      {!online ? (
        <div
          style={{
            background: color.surface, border: `1px dashed ${color.hairline}`,
            borderRadius: radius.card, padding: "14px 15px",
            ...text.secondary, color: color.dim, lineHeight: 1.5,
          }}
        >
          Asking needs a connection — the answer is worked out on the server. Everything
          else on this screen still works offline.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {allowance && (
            // On the composer, not in a profile: this is where the cost is
            // incurred (design §19).
            <span style={{ ...text.meta, color: color.faint }}>
              Needs a connection · {Math.max(0, allowance.dailyCap - allowance.callsToday)} of{" "}
              {allowance.dailyCap} questions left today
            </span>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                ask();
              }
            }}
            placeholder="Ask about this aircraft's records"
            rows={2}
            style={{
              flex: 1, minWidth: 0, boxSizing: "border-box", minHeight: hit.stepper,
              background: color.bg, border: `1px solid ${color.hairline}`, borderRadius: radius.control,
              padding: "11px 12px", color: color.ink, resize: "vertical",
              fontFamily: text.rowTitle.fontFamily,
              // 16px minimum — WKWebView zooms a focused control below it (README).
              fontSize: 16,
            }}
          />
          <button
            onClick={ask}
            disabled={asking || !question.trim()}
            style={{
              flex: "none", minHeight: hit.stepper, padding: "0 18px", borderRadius: radius.control,
              border: "none", background: accentGradient, color: color.onAccent,
              fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600,
              opacity: asking || !question.trim() ? 0.4 : 1,
              cursor: asking || !question.trim() ? "default" : "pointer",
            }}
          >
            {asking ? "…" : "Ask"}
          </button>
          </div>
        </div>
      )}

      <p style={{ ...text.meta, color: color.faint, margin: 0, lineHeight: 1.45 }}>
        An index of the books, not the legal record. Check anything that matters against the paper.
      </p>
    </div>
  );
}
