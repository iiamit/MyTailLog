import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { pullAll, type SyncChange } from "./sync";

// First vertical slice: sign in → pull the whole change feed → show a summary.
// Proves auth + the self-hosted sync API + the Capacitor toolchain end-to-end.
// SQLite persistence, blob caching, and capture come next.

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <Screen><p style={{ color: dim }}>Loading…</p></Screen>;
  return session ? <Home session={session} /> : <Login />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <Screen>
      <Brand />
      <form onSubmit={signIn} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
        <input style={input} type="email" placeholder="Email" autoCapitalize="none" autoCorrect="off"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={input} type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button style={primary} disabled={busy || !email || !password}>{busy ? "Signing in…" : "Sign in"}</button>
        {error && <p style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</p>}
      </form>
    </Screen>
  );
}

function Home({ session }: { session: Session }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<SyncChange[] | null>(null);
  const [cursor, setCursor] = useState(0);

  async function sync() {
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("No session token.");
      const res = await pullAll(token, 0, setProgress);
      setChanges(res.changes);
      setCursor(res.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const summary = useMemo(() => summarize(changes ?? []), [changes]);

  return (
    <Screen>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Brand small />
        <button style={{ ...ghost, marginLeft: "auto" }} onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
      <p style={{ color: dim, fontSize: 13, marginTop: 8 }}>Signed in as {session.user.email}</p>

      <button style={{ ...primary, marginTop: 18 }} onClick={sync} disabled={busy}>
        {busy ? `Syncing… ${progress}` : changes ? "Sync again" : "Sync now"}
      </button>
      {error && <p style={{ color: "#ff6b6b", fontSize: 13, marginTop: 10 }}>{error}</p>}

      {changes && (
        <div style={{ marginTop: 20 }}>
          <Row label="Changes pulled" value={String(changes.length)} />
          <Row label="Cursor (tip)" value={String(cursor)} />
          {summary.aircraft.length > 0 && (
            <Row label="Aircraft" value={summary.aircraft.join(", ")} />
          )}
          <div style={{ marginTop: 14, color: faint, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>By table</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {summary.byTable.map(([t, n]) => (
              <div key={t} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: ink }}>
                <span style={{ color: dim }}>{t}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Screen>
  );
}

function summarize(changes: SyncChange[]) {
  const counts = new Map<string, number>();
  const aircraft: string[] = [];
  for (const c of changes) {
    counts.set(c.table, (counts.get(c.table) ?? 0) + 1);
    if (c.table === "aircraft" && c.op === "upsert" && typeof c.row.tail_number === "string") {
      aircraft.push(c.row.tail_number);
    }
  }
  return { byTable: [...counts.entries()].sort((a, b) => b[1] - a[1]), aircraft };
}

// --- bits of chrome (inline styles; the real design system arrives with the shell) ---
const bg = "#090c12", panel = "#131a26", line = "#26303f";
const ink = "#e8eef7", dim = "#9fb0c6", faint = "#647890", accent = "#5aa0ff";

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: bg, color: ink, padding: "max(24px, env(safe-area-inset-top)) 20px 24px",
      fontFamily: "-apple-system, system-ui, sans-serif", boxSizing: "border-box" }}>
      {children}
    </div>
  );
}
function Brand({ small }: { small?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span style={{ width: small ? 18 : 24, height: small ? 18 : 24, background: `conic-gradient(from 45deg, ${accent}, #8ec8ff)`, clipPath: "polygon(50% 0,100% 86%,0 86%)" }} />
      <span style={{ fontWeight: 800, fontSize: small ? 17 : 22, letterSpacing: -0.3 }}>MyTailLog</span>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: `1px solid ${line}` }}>
      <span style={{ color: dim, fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}
const input: React.CSSProperties = { background: panel, border: `1px solid ${line}`, borderRadius: 10, padding: "12px 14px", color: ink, fontSize: 16 };
const primary: React.CSSProperties = { background: accent, color: "#071018", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700 };
const ghost: React.CSSProperties = { background: "transparent", color: dim, border: `1px solid ${line}`, borderRadius: 8, padding: "7px 12px", fontSize: 13 };
