import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import { pullAll } from "./sync";
import { deliveryDecision } from "./sync-policy";
import { initDb, applyChanges, resetLocal, healMirrorIfStale, getCursor, setCursor, actionCount, captureCount, getRows } from "./db";
import { computeAirworthiness, buildVerdict } from "./airworthiness";
import type { Urgency } from "@/lib/compliance";
import { drainActions, refreshEditable } from "./actions";
import { drainCaptures } from "./capture";
import { prefetchAll } from "./blobs";
import { Hangar, EntryDetail, PageViewer } from "./screens";
import { Records } from "./records-screen";
import { TabBar, TABS, type Tab } from "./tabbar";
import { AircraftSwitcher } from "./switcher";
import { Sidebar, RegularFrame, TwoPane, PanePlaceholder, useSizeClass, useShortcuts } from "./layout";
import { PageReview } from "./review-pane";
import type { FieldBox } from "@/lib/extraction/schema";
import type { ShortcutMap } from "./shortcuts";
import { Status, AllItems } from "./status-screen";
import { Documents } from "./documents-screen";
import { PdfViewer } from "./pdf-screen";
import { Record, RecentReadingsPane } from "./record-screen";
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
  | { screen: "aircraft"; aircraft: Aircraft; tab: Tab; segment: Segment; sub: Sub | null };

function Shell({ session }: { session: Session }) {
  const [cursor, setCur] = useState(0);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nav, setNav] = useState<Nav>({ screen: "hangar" });
  const [dl, setDl] = useState<{ done: number; total: number } | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  // undefined = closed. null = open with no aircraft in context (fleet entry).
  const [capture, setCapture] = useState<Aircraft | null | undefined>(undefined);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  // Lifted out of Hangar: the header switcher needs the same fleet + urgency.
  const [fleet, setFleet] = useState<Aircraft[]>([]);
  const [worst, setWorst] = useState<Record<string, Urgency>>({});
  const [summaries, setSummaries] = useState<Record<string, { urgency: Urgency; line: string }>>({});
  const [menu, setMenu] = useState(false);
  const zoomRef = useRef<string | null>(null);
  const syncTask = useRef<Promise<void> | null>(null);
  const syncLatest = useRef<(() => Promise<void>) | null>(null);
  zoomRef.current = zoom;
  const regular = useSizeClass() === "regular";

  // ⌘1–4 switch tabs from anywhere in an aircraft. Screens claim the other
  // chords (⌘↩ ⌘→ ⌘← ⌘N ⌘F) themselves and win over these when mounted; until
  // they do, ⌘N and ⌘F at least land on the tab where the squawk composer and
  // the document search live.
  const tabChords: ShortcutMap = {};
  if (nav.screen === "aircraft") {
    const a = nav;
    TABS.forEach(({ id }, i) => {
      tabChords[`cmd+${i + 1}` as keyof ShortcutMap] = () => setNav({ ...a, tab: id, sub: null });
    });
    tabChords["cmd+n"] = () => setNav({ ...a, tab: "squawks", sub: null });
    tabChords["cmd+f"] = () => setNav({ ...a, tab: "records", segment: "documents", sub: null });
  }
  useShortcuts(tabChords);

  useEffect(() => {
    if (!NATIVE) return;
    (async () => {
      await initDb();
      // A mirror built before the deleted-aircraft fix can hold rows the feed
      // will never retract, so it is dropped once and rebuilt.
      const healed = await healMirrorIfStale();
      setCur(await getCursor());
      await updatePending();
      await loadFleet();
      // Best-effort: offline, canEdit() falls back to allowing, and the server
      // still refuses what it must.
      refreshEditable().catch(() => {});
      // The wipe left nothing to show, so refill it now rather than leaving an
      // empty fleet until someone thinks to sync. Offline, this fails quietly
      // and the mirror stays empty until there is signal — unavoidable, and the
      // reason the heal only ever runs once.
      if (healed) sync().catch(() => {});
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

  async function updatePending(): Promise<number> {
    const [actions, captures] = await Promise.all([actionCount(), captureCount()]);
    const total = actions + captures;
    setPending(total);
    return total;
  }

  async function writeFinished(): Promise<"synced" | "pending"> {
    const count = await updatePending();
    const decision = deliveryDecision(navigator.onLine, count);
    if (decision === "synced") return "synced";
    if (decision === "pending") {
      setOnline(false);
      return "pending";
    }
    await sync();
    return (await updatePending()) === 0 ? "synced" : "pending";
  }

  async function downloadAll() {
    setDl({ done: 0, total: 0 });
    try {
      await prefetchAll((done, total) => setDl({ done, total }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Wipe the mirror and re-pull from zero. A deleted aircraft simply never
  // arrives (every change row for it is unreadable), so the rebuild converges on
  // the server's truth rather than trying to replay a delete the device already
  // scrolled past.
  async function rebuild() {
    setSyncing("Rebuilding…");
    try {
      await resetLocal();
      setCur(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSyncing(null);
      return;
    }
    await sync();
  }

  async function performSync() {
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
      const captures = await drainCaptures((done, total) => setSyncing(`Uploading pages… ${done} of ${total}`));
      await updatePending();
      await loadFleet();
      if (drained.failed > 0) {
        setError(`${drained.failed} queued change${drained.failed === 1 ? "" : "s"} was refused — see the pending list.`);
      } else if (captures.failed > 0 && !drained.offline) {
        setError(`${captures.failed} scanned page${captures.failed === 1 ? "" : "s"} is still waiting to upload.`);
      }

      const from = await getCursor();
      const res = await pullAll(token, from, (n) => setSyncing(`Syncing… ${n}`));
      await applyChanges(res.changes);
      await setCursor(res.cursor);
      setCur(res.cursor);
      setOnline(true);
      refreshEditable().catch(() => {});
      await loadFleet();
    } catch (e) {
      setOnline(false);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(null);
    }
  }

  function sync(): Promise<void> {
    if (syncTask.current) return syncTask.current;
    const task = performSync().finally(() => {
      if (syncTask.current === task) syncTask.current = null;
    });
    syncTask.current = task;
    return task;
  }
  syncLatest.current = sync;

  useEffect(() => {
    const connected = () => {
      setOnline(true);
      void syncLatest.current?.();
    };
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, []);

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
  // on top — a pushed viewer owns the whole screen. At regular width the
  // sidebar takes its place and nothing is ever pushed: what the phone pushes,
  // the iPad shows in the second pane.
  const tabBar =
    !regular && nav.screen === "aircraft" && !nav.sub ? (
      <TabBar active={nav.tab} onChange={(tab) => setNav({ ...nav, tab, sub: null })} />
    ) : null;

  const accountMenu = menu && (
    <AccountMenu
      email={session.user.email ?? ""}
      onClose={() => setMenu(false)}
      onSync={() => { setMenu(false); sync(); }}
      onDownloadAll={() => { setMenu(false); downloadAll(); }}
      dl={dl}
      onRebuild={() => { setMenu(false); rebuild(); }}
      onSignOut={() => supabase.auth.signOut()}
    />
  );

  const overlays = (
    <>
      {capture !== undefined && (
        <CaptureScreen aircraft={capture} onClose={() => setCapture(undefined)} onChanged={writeFinished} />
      )}
      {nav.screen === "pending" && (
        <div style={regular ? { maxWidth: 640, margin: "0 auto" } : undefined}>
          <Pending onBack={back} onChanged={updatePending} />
        </div>
      )}
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
      {accountMenu}
    </>
  );

  if (regular && nav.screen === "aircraft") {
    const a = nav;
    const panes = aircraftPanes(a, {
      setNav,
      back,
      onZoom: setZoom,
      onQueued: writeFinished,
      onCapture: () => setCapture(a.aircraft),
    });
    return (
      <RegularFrame
        sidebar={
          <Sidebar
            aircraft={a.aircraft}
            fleet={fleet}
            worst={worst}
            active={a.tab}
            onTab={(tab) => setNav({ ...a, tab, sub: null })}
            onSwitch={(x) => setNav({ ...a, aircraft: x, sub: null })}
            onSeeAll={() => setNav({ screen: "hangar" })}
            onAccount={() => setMenu(true)}
          />
        }
      >
        <div style={{ marginBottom: pending > 0 ? 18 : 0 }}>
          <PendingBanner count={pending} onOpen={() => setNav({ screen: "pending" })} />
        </div>
        <TwoPane primary={panes.primary} secondary={panes.secondary} ratio={panes.ratio} />
        {overlays}
      </RegularFrame>
    );
  }

  return (
    <Screen tabBar={tabBar}>
      {nav.screen === "hangar" && (
        // On an iPad the fleet list is read at a phone's width, centred, rather
        // than stretched across the whole screen.
        <div style={regular ? { maxWidth: 640, margin: "0 auto" } : undefined}>
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
              onAddAircraft={() => setCapture(null)}
              onDemo={sync}
              onSignIn={() => setMenu(true)}
            />
          ) : (
          <Hangar
            fleet={fleet}
            summaries={summaries}
            onOpen={(a) => setNav({ screen: "aircraft", aircraft: a, tab: "status", segment: "documents", sub: null })}
            syncing={syncing}
            syncedLabel={!online ? "Offline" : cursor > 0 ? "Synced" : "Not synced yet"}
            error={error}
          />
          )}

          {/* Add aircraft — dashed, so it reads as a slot rather than a card. */}
          <button
            onClick={() => setCapture(null)}
            style={{
              width: "100%", marginTop: 16, minHeight: 48, background: "transparent",
              border: `1px dashed ${line}`, borderRadius: 14, color: dim,
              fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: 500, cursor: "pointer",
            }}
          >
            + Add pages to an aircraft
          </button>
        </div>
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
              <PageViewer pages={nav.sub.pages} index={nav.sub.index} onBack={back} onZoom={setZoom} onQueued={writeFinished} />
            ) : nav.sub?.kind === "complete" ? (
              <CompleteItem aircraft={nav.aircraft} item={nav.sub.item} onBack={back} onQueued={writeFinished} />
            ) : nav.sub?.kind === "pdf" ? (
              <PdfViewer documentId={nav.sub.doc.id} title={nav.sub.doc.title} onBack={back} onZoom={setZoom} />
            ) : nav.tab === "status" ? (
              <Status
                aircraft={nav.aircraft}
                onComplete={(item) => setNav({ ...nav, sub: { kind: "complete", item } })}
                onQueued={writeFinished}
              />
            ) : nav.tab === "log" ? (
              <Record aircraft={nav.aircraft} onQueued={writeFinished} />
            ) : nav.tab === "squawks" ? (
              <Squawks aircraft={nav.aircraft} onQueued={writeFinished} />
            ) : (
              <Records
                aircraft={nav.aircraft}
                segment={nav.segment}
                onSegment={(segment) => setNav({ ...nav, segment })}
                onOpenEntry={(entry) => setNav({ ...nav, sub: { kind: "entry", entry } })}
                onOpenPage={(pages, index) => setNav({ ...nav, sub: { kind: "page", pages, index } })}
                onOpenPdf={(doc) => setNav({ ...nav, sub: { kind: "pdf", doc } })}
                onCapture={() => setCapture(nav.aircraft)}
                onZoom={setZoom}
              />
            )}
          </div>
        </>
      )}

      {overlays}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Regular width: what each tab becomes. The primary pane is the phone's tab
// root, unchanged; the secondary pane is what the phone would have pushed.
// ---------------------------------------------------------------------------

type AircraftNav = Extract<Nav, { screen: "aircraft" }>;

function aircraftPanes(
  nav: AircraftNav,
  h: {
    setNav: (n: Nav) => void;
    back: () => void;
    onZoom: (src: string) => void;
    onQueued: () => Promise<"synced" | "pending">;
    onCapture: () => void;
  },
): { primary: ReactNode; secondary: ReactNode; ratio: "50/50" | "55/45" | "40/60" } {
  const { aircraft, sub } = nav;

  if (nav.tab === "status") {
    return {
      ratio: "55/45",
      primary: (
        <Status
          aircraft={aircraft}
          onComplete={(item) => h.setNav({ ...nav, sub: { kind: "complete", item } })}
          onQueued={h.onQueued}
          onShowAll={() => h.setNav({ ...nav, sub: null })}
        />
      ),
      secondary:
        sub?.kind === "complete" ? (
          <CompleteItem aircraft={aircraft} item={sub.item} onBack={h.back} onQueued={h.onQueued} />
        ) : (
          <AllItems aircraft={aircraft} onQueued={h.onQueued} />
        ),
    };
  }

  if (nav.tab === "log") {
    return {
      ratio: "55/45",
      primary: <Record aircraft={aircraft} onQueued={h.onQueued} />,
      secondary: <RecentReadingsPane aircraft={aircraft} onQueued={h.onQueued} />,
    };
  }

  if (nav.tab === "squawks") {
    return {
      ratio: "50/50",
      primary: <Squawks aircraft={aircraft} onQueued={h.onQueued} />,
      secondary: <SquawkDetailSlot aircraft={aircraft} />,
    };
  }

  // Records: the segmented control stays in the primary pane; the secondary
  // follows the segment. Changing segment drops whatever the old one had open.
  const primary = (
    <Records
      aircraft={aircraft}
      segment={nav.segment}
      onSegment={(segment) => h.setNav({ ...nav, segment, sub: null })}
      onOpenEntry={(entry) => h.setNav({ ...nav, sub: { kind: "entry", entry } })}
      onOpenPage={(pages, index) => h.setNav({ ...nav, sub: { kind: "page", pages, index } })}
      onOpenPdf={(doc) => h.setNav({ ...nav, sub: { kind: "pdf", doc } })}
      onCapture={h.onCapture}
      onZoom={h.onZoom}
    />
  );

  if (nav.segment === "scans") {
    return {
      ratio: "40/60",
      primary,
      secondary:
        sub?.kind === "page" ? (
          <ScansPane pages={sub.pages} index={sub.index} onBack={h.back} onZoom={h.onZoom} onQueued={h.onQueued} />
        ) : (
          <PanePlaceholder>Pick a page to read it here.</PanePlaceholder>
        ),
    };
  }

  if (nav.segment === "documents") {
    return {
      ratio: "40/60",
      primary,
      secondary:
        sub?.kind === "pdf" ? (
          <PdfViewer documentId={sub.doc.id} title={sub.doc.title} onBack={h.back} onZoom={h.onZoom} />
        ) : (
          <DocumentViewerSlot aircraft={aircraft} />
        ),
    };
  }

  return {
    ratio: "40/60",
    primary,
    secondary:
      sub?.kind === "entry" ? (
        <EntryDetail entry={sub.entry} tail={aircraft.tail_number} onBack={h.back} onZoom={h.onZoom} />
      ) : (
        <PanePlaceholder>Pick an entry to read it here.</PanePlaceholder>
      ),
  };
}

// ---- Slots ------------------------------------------------------------------
// Secondary panes other streams are building in parallel. Each slot names its
// owner and the exact props the shell passes; the owner replaces the body (or
// the shell swaps in their export at integration) and keeps the signature.

/** records-ui — the open squawk's detail, or the composer. */
function SquawkDetailSlot(_p: { aircraft: Aircraft }) {
  return <PanePlaceholder>Pick a squawk to read it here.</PanePlaceholder>;
}

/** records-ui — an image or PDF document viewer. */
function DocumentViewerSlot(_p: { aircraft: Aircraft }) {
  return <PanePlaceholder>Pick a document to read it here.</PanePlaceholder>;
}

/**
 * Scans at regular width: the page rail is the 40% primary, and this is the
 * 60% secondary — itself split 55/45 into the scan and the review beside it
 * (the three-way layout of design spec §15, which one TwoPane cannot express).
 *
 * The spotlight lives here because it spans both halves: the review pane says
 * which field to light, the scan draws the ring. Turning the page clears it.
 */
function ScansPane({
  pages, index, onBack, onZoom, onQueued,
}: {
  pages: Page[];
  index: number;
  onBack: () => void;
  onZoom: (src: string) => void;
  onQueued: () => Promise<"synced" | "pending">;
}) {
  const [spot, setSpot] = useState<{ box: FieldBox | null; key: string | null }>({ box: null, key: null });
  const [shown, setShown] = useState<Page>(pages[index]);
  return (
    <TwoPane
      ratio="55/45"
      primary={
        <PageViewer
          pages={pages}
          index={index}
          onBack={onBack}
          onZoom={onZoom}
          onQueued={onQueued}
          review="external"
          spot={spot.box}
          onPage={(p) => {
            setShown(p);
            setSpot({ box: null, key: null });
          }}
        />
      }
      secondary={
        <PageReview
          page={shown}
          onLocate={(box, key) => setSpot({ box, key })}
          activeKey={spot.key}
          onQueued={onQueued}
        />
      }
    />
  );
}
