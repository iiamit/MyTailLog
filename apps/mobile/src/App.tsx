import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import { pullAll } from "./sync";
import { initDb, applyChanges, getCursor, setCursor, countByTable, getRows } from "./db";

// Slice 2: the pulled feed is applied into on-device SQLite and the cursor is
// persisted. So data survives a relaunch, syncs are incremental, and the counts
// below are read from the LOCAL db — i.e. they show with the network off.

const NATIVE = Capacitor.isNativePlatform();

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

type LocalState = { cursor: number; counts: { table_name: string; n: number }[]; tails: string[] };

function Home({ session }: { session: Session }) {
  const [dbReady, setDbReady] = useState(false);
  const [local, setLocal] = useState<LocalState | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function reloadLocal() {
    const [cursor, counts, aircraft] = await Promise.all([getCursor(), countByTable(), getRows("aircraft")]);
    const tails = aircraft.map((a) => a.tail_number).filter((t): t is string => typeof t === "string");
    setLocal({ cursor, counts, tails });
  }

  useEffect(() => {
    if (!NATIVE) return;
    (async () => {
      await initDb();
      setDbReady(true);
      await reloadLocal();
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function sync() {
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("No session token.");
      const from = await getCursor(); // incremental — resume where we left off
      const res = await pullAll(token, from, setProgress);
      await applyChanges(res.changes);
      await setCursor(res.cursor);
      await reloadLocal();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Brand small />
        <button style={{ ...ghost, marginLeft: "auto" }} onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
      <p style={{ color: dim, fontSize: 13, marginTop: 8 }}>Signed in as {session.user.email}</p>

      {!NATIVE && (
        <p style={{ color: "#ffb020", fontSize: 13, marginTop: 16 }}>
          On-device storage needs the iOS simulator — run via Xcode, not the desktop browser.
        </p>
      )}

      {NATIVE && (
        <>
          <button style={{ ...primary, marginTop: 18 }} onClick={sync} disabled={busy || !dbReady}>
            {busy ? `Syncing… ${progress}` : local && local.cursor > 0 ? "Sync again" : "Sync now"}
          </button>
          {error && <p style={{ color: "#ff6b6b", fontSize: 13, marginTop: 10 }}>{error}</p>}

          {local && (
            <div style={{ marginTop: 20 }}>
              <Row label="Stored on device" value={`${local.counts.reduce((s, c) => s + c.n, 0)} records`} />
              <Row label="Sync cursor" value={String(local.cursor)} />
              {local.tails.length > 0 && <Row label="Aircraft" value={local.tails.join(", ")} />}
              <div style={{ marginTop: 14, color: faint, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>By table (local)</div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {local.counts.map((c) => (
                  <div key={c.table_name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: dim }}>{c.table_name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{c.n}</span>
                  </div>
                ))}
                {local.counts.length === 0 && <p style={{ color: faint, fontSize: 13 }}>Nothing stored yet — tap Sync now.</p>}
              </div>
              <p style={{ color: faint, fontSize: 11, marginTop: 16 }}>
                These counts are read from on-device SQLite — quit &amp; reopen the app (or go offline) and they persist.
              </p>
            </div>
          )}
        </>
      )}
    </Screen>
  );
}

// --- chrome (inline styles; real design system arrives with the shell) ---
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
