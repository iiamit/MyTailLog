import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import { pullAll } from "./sync";
import { initDb, applyChanges, getCursor, setCursor } from "./db";
import { Hangar, Entries, EntryDetail } from "./screens";
import type { Aircraft, LogEntry } from "./types";
import { Screen, Brand, ghost, input, primary, dim, amber } from "./ui";

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
  return session ? <Shell session={session} /> : <Login />;
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

type Nav = { screen: "hangar" } | { screen: "entries"; aircraft: Aircraft } | { screen: "entry"; aircraft: Aircraft; entry: LogEntry };

function Shell({ session }: { session: Session }) {
  const [dbReady, setDbReady] = useState(false);
  const [cursor, setCur] = useState(0);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nav, setNav] = useState<Nav>({ screen: "hangar" });

  useEffect(() => {
    if (!NATIVE) return;
    (async () => {
      await initDb();
      setCur(await getCursor());
      setDbReady(true);
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function sync() {
    setSyncing("Syncing…");
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("No session token.");
      const from = await getCursor();
      const res = await pullAll(token, from, (n) => setSyncing(`Syncing… ${n}`));
      await applyChanges(res.changes);
      await setCursor(res.cursor);
      setCur(res.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(null);
    }
  }

  if (!NATIVE) {
    return (
      <Screen>
        <Brand />
        <p style={{ color: amber, fontSize: 13, marginTop: 20 }}>
          On-device storage needs the iOS simulator — run via Xcode, not the desktop browser.
        </p>
      </Screen>
    );
  }

  return (
    <Screen>
      {nav.screen === "hangar" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Brand small />
            <button style={{ ...ghost, marginLeft: "auto" }} onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
          <p style={{ color: dim, fontSize: 12.5, marginTop: 6 }}>{session.user.email}</p>
          <Hangar
            onOpen={(a) => setNav({ screen: "entries", aircraft: a })}
            sync={sync}
            syncing={syncing}
            cursor={cursor}
            error={error}
          />
        </>
      )}

      {nav.screen === "entries" && (
        <Entries
          aircraft={nav.aircraft}
          onBack={() => setNav({ screen: "hangar" })}
          onOpen={(e) => setNav({ screen: "entry", aircraft: nav.aircraft, entry: e })}
        />
      )}

      {nav.screen === "entry" && (
        <EntryDetail entry={nav.entry} tail={nav.aircraft.tail_number} onBack={() => setNav({ screen: "entries", aircraft: nav.aircraft })} />
      )}
    </Screen>
  );
}
