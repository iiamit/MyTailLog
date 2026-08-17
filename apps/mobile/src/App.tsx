import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import { pullAll } from "./sync";
import { initDb, applyChanges, getCursor, setCursor, actionCount, getRows } from "./db";
import { computeAirworthiness, buildVerdict } from "./airworthiness";
import type { Urgency } from "@/lib/compliance";
import { drainActions, refreshEditable } from "./actions";
import { prefetchAll } from "./blobs";
import { Hangar, EntryDetail, PageViewer } from "./screens";
import { Records } from "./records-screen";
import { TabBar, type Tab } from "./tabbar";
import { AircraftSwitcher } from "./switcher";
import { Status } from "./status-screen";
import { Documents } from "./documents-screen";
import { PdfViewer } from "./pdf-screen";
import { Record } from "./record-screen";
import { Squawks } from "./squawks-screen";
import { CompleteItem } from "./complete-screen";
import { CaptureScreen } from "./capture-screen";
import { Pending, PendingBanner } from "./pending";
import { Lightbox } from "./lightbox";
import type { StatusItem } from "@/lib/status";
import type { Aircraft, LogEntry, Page } from "./types";
import { Screen, Brand, input, primary, dim, amber, faint, line, panel2, text, display } from "./ui";
import { AccountMenu } from "./account-menu";
import { FirstRun } from "./first-run";

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

/** Records consolidates three former destinations behind one tab. */
export type Segment = "documents" | "scans" | "history";

/** Screens pushed ON TOP of a tab. Each tab keeps its own stack. */
type Sub =
  | { kind: "entry"; entry: LogEntry }
  | { kind: "page"; pages: Page[]; index: number }
  | { kind: "complete"; item: StatusItem }
  | { kind: "pdf"; doc: { id: string; title: string } };

// The Back-stack is gone: instead of a screen per node, there is a fleet list,
// and an aircraft context that holds a tab, a Records segment, and whatever is
// pushed on top of the current tab. Aircraft are changed in place from the
// header switcher rather than by backing out.
type Nav =
  | { screen: "hangar" }
  | { screen: "pending" }
  | { screen: "capture" }
  | { screen: "aircraft"; aircraft: Aircraft; tab: Tab; segment: Segment; sub: Sub | null };

function Shell({ session }: { session: Session }) {
  const [cursor, setCur] = useState(0);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nav, setNav] = useState<Nav>({ screen: "hangar" });
  const [dl, setDl] = useState<{ done: number; total: number } | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  // Lifted out of Hangar: the header switcher needs the same fleet + urgency.
  const [fleet, setFleet] = useState<Aircraft[]>([]);
  const [worst, setWorst] = useState<Record<string, Urgency>>({});
  const [summaries, setSummaries] = useState<Record<string, { urgency: Urgency; line: string }>>({});
  const [menu, setMenu] = useState(false);
  const zoomRef = useRef<string | null>(null);
  zoomRef.current = zoom;

  useEffect(() => {
    if (!NATIVE) return;
    (async () => {
      await initDb();
      setCur(await getCursor());
      setPending(await actionCount());
      await loadFleet();
      // Best-effort: offline, canEdit() falls back to allowing, and the server
      // still refuses what it must.
      refreshEditable().catch(() => {});
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // One place computes the previous screen — used by the back button AND the
  // left-edge swipe below.
  function back() {
    setNav((n) => {
      if (n.screen === "aircraft") {
        // Pop what's pushed on the tab; only leave the aircraft when nothing is.
        return n.sub ? { ...n, sub: null } : { screen: "hangar" };
      }
      return { screen: "hangar" };
    });
  }

  // Native-style swipe: start within 24px of the left edge, drag right → back.
  // Skipped while the lightbox is open (it owns its own touches).
  useEffect(() => {
    let sx = 0, sy = 0, active = false;
    function start(e: TouchEvent) {
      const t = e.touches[0];
      active = !zoomRef.current && !!t && t.clientX <= 24;
      if (active && t) {
        sx = t.clientX;
        sy = t.clientY;
      }
    }
    function end(e: TouchEvent) {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      if (t && t.clientX - sx > 64 && Math.abs(t.clientY - sy) < 55) back();
    }
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchend", end);
    };
  }, []);

  async function loadFleet() {
    const rows = await getRows<Aircraft>("aircraft").catch(() => []);
    const sorted = rows.sort((a, b) => (a.tail_number || "").localeCompare(b.tail_number || ""));
    setFleet(sorted);
    const out: Record<string, Urgency> = {};
    const sum: Record<string, { urgency: Urgency; line: string }> = {};
    for (const a of sorted) {
      const d = await computeAirworthiness(a.id).catch(() => null);
      if (!d) continue;
      const w = d.worst ?? "none";
      out[a.id] = w;
      // The single line an owner needs: what drives this aircraft's status.
      const v = buildVerdict(d.lines);
      sum[a.id] = { urgency: w, line: d.lines.length === 0 ? "Nothing tracked yet" : v.detail };
    }
    setWorst(out);
    setSummaries(sum);
  }

  async function bumpPending() {
    setPending(await actionCount());
  }

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
      // Push before pull: otherwise a reading typed at the aircraft would be
      // overwritten in the UI by a pull that predates it.
      setSyncing("Uploading…");
      const drained = await drainActions();
      setPending(await actionCount());
      await loadFleet();
      if (drained.failed > 0) {
        setError(`${drained.failed} queued change${drained.failed === 1 ? "" : "s"} was refused — see the pending list.`);
      }

      const from = await getCursor();
      const res = await pullAll(token, from, (n) => setSyncing(`Syncing… ${n}`));
      await applyChanges(res.changes);
      await setCursor(res.cursor);
      setCur(res.cursor);
      refreshEditable().catch(() => {});
      await loadFleet();
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

  // The bar is part of the aircraft context, and only shows with nothing pushed
  // on top — a pushed viewer owns the whole screen.
  const tabBar =
    nav.screen === "aircraft" && !nav.sub ? (
      <TabBar active={nav.tab} onChange={(tab) => setNav({ ...nav, tab, sub: null })} />
    ) : null;

  return (
    <Screen tabBar={tabBar}>
      {nav.screen === "hangar" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
            <Brand small />
            {/* Sign out lives in here — it must not be a top-level button. */}
            <button
              onClick={() => setMenu(true)}
              aria-label="Account"
              style={{
                marginLeft: "auto", width: 34, height: 34, borderRadius: "50%",
                background: panel2, border: `1px solid ${line}`, color: dim,
                fontFamily: display, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              {(session.user.email ?? "?").slice(0, 2).toUpperCase()}
            </button>
          </div>

          <PendingBanner count={pending} onOpen={() => setNav({ screen: "pending" })} />

          {fleet.length === 0 && cursor > 0 ? (
            <FirstRun
              onAddAircraft={() => setNav({ screen: "capture" })}
              onDemo={sync}
              onSignIn={() => setMenu(true)}
            />
          ) : (
          <Hangar
            fleet={fleet}
            summaries={summaries}
            onOpen={(a) => setNav({ screen: "aircraft", aircraft: a, tab: "status", segment: "documents", sub: null })}
            syncing={syncing}
            syncedLabel={cursor > 0 ? "Synced" : "Not synced yet"}
            error={error}
          />
          )}

          {/* Add aircraft — dashed, so it reads as a slot rather than a card. */}
          <button
            onClick={() => setNav({ screen: "capture" })}
            style={{
              width: "100%", marginTop: 16, minHeight: 48, background: "transparent",
              border: `1px dashed ${line}`, borderRadius: 14, color: dim,
              fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: 500, cursor: "pointer",
            }}
          >
            + Add pages to an aircraft
          </button>

          {menu && (
            <AccountMenu
              email={session.user.email ?? ""}
              onClose={() => setMenu(false)}
              onSync={() => { setMenu(false); sync(); }}
              onDownloadAll={() => { setMenu(false); downloadAll(); }}
              dl={dl}
              onSignOut={() => supabase.auth.signOut()}
            />
          )}
        </>
      )}

      {nav.screen === "aircraft" && (
        <>
          {/* The header switcher is what replaces backing out to the fleet. */}
          <AircraftSwitcher
            aircraft={nav.aircraft}
            fleet={fleet}
            worst={worst}
            onSwitch={(a) => setNav({ ...nav, aircraft: a, sub: null })}
            onSeeAll={() => setNav({ screen: "hangar" })}
          />

          <div style={{ marginTop: 18 }}>
            {/* Anything pushed wins over the tab's own root screen. */}
            {nav.sub?.kind === "entry" ? (
              <EntryDetail entry={nav.sub.entry} tail={nav.aircraft.tail_number} onBack={back} onZoom={setZoom} />
            ) : nav.sub?.kind === "page" ? (
              <PageViewer pages={nav.sub.pages} index={nav.sub.index} onBack={back} onZoom={setZoom} />
            ) : nav.sub?.kind === "complete" ? (
              <CompleteItem aircraft={nav.aircraft} item={nav.sub.item} onBack={back} onQueued={bumpPending} />
            ) : nav.sub?.kind === "pdf" ? (
              <PdfViewer documentId={nav.sub.doc.id} title={nav.sub.doc.title} onBack={back} onZoom={setZoom} />
            ) : nav.tab === "status" ? (
              <Status
                aircraft={nav.aircraft}
                onComplete={(item) => setNav({ ...nav, sub: { kind: "complete", item } })}
              />
            ) : nav.tab === "log" ? (
              <Record aircraft={nav.aircraft} onQueued={bumpPending} />
            ) : nav.tab === "squawks" ? (
              <Squawks aircraft={nav.aircraft} onQueued={bumpPending} />
            ) : (
              <Records
                aircraft={nav.aircraft}
                segment={nav.segment}
                onSegment={(segment) => setNav({ ...nav, segment })}
                onOpenEntry={(entry) => setNav({ ...nav, sub: { kind: "entry", entry } })}
                onOpenPage={(pages, index) => setNav({ ...nav, sub: { kind: "page", pages, index } })}
                onOpenPdf={(doc) => setNav({ ...nav, sub: { kind: "pdf", doc } })}
                onCapture={() => setNav({ screen: "capture" })}
                onZoom={setZoom}
              />
            )}
          </div>
        </>
      )}

      {nav.screen === "capture" && <CaptureScreen onBack={back} onSynced={sync} />}

      {nav.screen === "pending" && <Pending onBack={back} onChanged={bumpPending} />}

      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </Screen>
  );
}
