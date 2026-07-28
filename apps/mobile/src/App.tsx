import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import { pullAll } from "./sync";
import { initDb, applyChanges, getCursor, setCursor } from "./db";
import { prefetchAll } from "./blobs";
import { Hangar, Entries, EntryDetail, Pages, PageViewer } from "./screens";
import type { Aircraft, LogEntry, Page } from "./types";
import { Screen, Brand, ghost, input, primary, dim, amber, faint, accent, line, panel } from "./ui";

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

type Nav =
  | { screen: "hangar" }
  | { screen: "entries"; aircraft: Aircraft }
  | { screen: "entry"; aircraft: Aircraft; entry: LogEntry }
  | { screen: "pages"; aircraft: Aircraft }
  | { screen: "page"; aircraft: Aircraft; pages: Page[]; index: number };

function Shell({ session }: { session: Session }) {
  const [cursor, setCur] = useState(0);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nav, setNav] = useState<Nav>({ screen: "hangar" });
  const [dl, setDl] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!NATIVE) return;
    (async () => {
      await initDb();
      setCur(await getCursor());
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function downloadAll() {
    setDl({ done: 0, total: 0 });
    try {
      await prefetchAll((done, total) => setDl({ done, total }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

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
          <div style={{ marginTop: 22, borderTop: `1px solid ${line}`, paddingTop: 16 }}>
            {!dl || (dl.total > 0 && dl.done >= dl.total) ? (
              <button
                onClick={downloadAll}
                style={{ width: "100%", background: panel, color: accent, border: `1px solid ${line}`, borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600 }}
              >
                {dl && dl.done >= dl.total ? "✓ All scans downloaded — tap to refresh" : "⤓ Download all scans for offline"}
              </button>
            ) : (
              <>
                <div style={{ color: dim, fontSize: 13 }}>Downloading scans… {dl.done}{dl.total ? ` / ${dl.total}` : ""}</div>
                <div style={{ height: 6, background: line, borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: dl.total ? `${(dl.done / dl.total) * 100}%` : "0%", background: accent }} />
                </div>
              </>
            )}
            <p style={{ color: faint, fontSize: 11, marginTop: 8 }}>Fetches every page &amp; document once so the full record browses with no signal. Safe to leave running.</p>
          </div>
        </>
      )}

      {nav.screen === "entries" && (
        <Entries
          aircraft={nav.aircraft}
          onBack={() => setNav({ screen: "hangar" })}
          onOpen={(e) => setNav({ screen: "entry", aircraft: nav.aircraft, entry: e })}
          onScans={() => setNav({ screen: "pages", aircraft: nav.aircraft })}
        />
      )}

      {nav.screen === "entry" && (
        <EntryDetail entry={nav.entry} tail={nav.aircraft.tail_number} onBack={() => setNav({ screen: "entries", aircraft: nav.aircraft })} />
      )}

      {nav.screen === "pages" && (
        <Pages
          aircraft={nav.aircraft}
          onBack={() => setNav({ screen: "entries", aircraft: nav.aircraft })}
          onOpen={(pages, index) => setNav({ screen: "page", aircraft: nav.aircraft, pages, index })}
        />
      )}

      {nav.screen === "page" && (
        <PageViewer pages={nav.pages} index={nav.index} onBack={() => setNav({ screen: "pages", aircraft: nav.aircraft })} />
      )}
    </Screen>
  );
}
