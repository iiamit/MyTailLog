import { useEffect, useRef, useState } from "react";
import { CapacitorHttp } from "@capacitor/core";
import { API_BASE, supabase } from "./supabase";
import { getByAircraft } from "./db";
import { enqueue } from "./mutations";
import { canEdit } from "./actions";
import { patchLocal, deleteLocal } from "./review-local";
import { useShortcuts } from "./layout";
import { shortDate } from "./airworthiness";
import { EntryEditor, CheckChip } from "./entry-editor";
import {
  entriesOn, entryBadge, fieldChip, readAllowance, extractLabel, spotlightStyle, drawerSnap,
  type ReviewPage, type ReviewEntry, type EntryForm, type Allowance,
} from "./review-rules";
import type { FieldBox } from "@/lib/extraction/schema";
import type { Page } from "./types";
import { color, text, radius, hit, tint, accentGradient, tabular, alpha } from "./tokens";

// Reviewing a scanned page on the phone.
//
// Three exported pieces so the iPad shell can compose them beside the scan:
//   ReviewPane      — the entries on a page as cards, every field tappable to
//                     edit, ◎ per located field to spotlight it on the scan.
//   PageReview      — ReviewPane that loads its own page + entries from the mirror.
//   SpotlightRing   — the overlay PageViewer draws over the image.
//   EntriesDrawer   — compact only: swipes up over the page viewer.
//
// Every write goes through enqueue() and is mirrored locally at once.

export type Locate = (box: FieldBox | null, key: string | null) => void;

const FIELD_ROWS: { key: keyof EntryForm; label: string; value: (e: ReviewEntry) => string | null }[] = [
  { key: "entry_date", label: "Date", value: (e) => (e.entry_date ? shortDate(e.entry_date) : null) },
  { key: "tach", label: "Tach", value: (e) => (e.tach == null ? null : e.tach.toFixed(1)) },
  { key: "hobbs", label: "Hobbs", value: (e) => (e.hobbs == null ? null : e.hobbs.toFixed(1)) },
  { key: "airframe", label: "Airframe total", value: (e) => (e.airframe == null ? null : e.airframe.toFixed(1)) },
  { key: "description", label: "What was done", value: (e) => e.description },
  { key: "work_performed", label: "Details", value: (e) => e.work_performed },
  { key: "parts", label: "Parts", value: (e) => e.parts },
  { key: "signature_name", label: "Signed by", value: (e) => e.signature_name },
  { key: "mechanic_cert_number", label: "Certificate", value: (e) => e.mechanic_cert_number },
  { key: "ad_refs", label: "Airworthiness directives", value: (e) => e.ad_refs?.join(", ") || null },
  { key: "sb_refs", label: "Service bulletins", value: (e) => e.sb_refs?.join(", ") || null },
];
/** Rows shown even when empty — the two things every entry must have. */
const ALWAYS: (keyof EntryForm)[] = ["entry_date", "description"];

export function ReviewPane({
  page, entries, onLocate, activeKey, onChanged, onQueued,
}: {
  page: ReviewPage;
  entries: ReviewEntry[];
  onLocate: Locate;
  /** `${entryId}:${field}` of the field currently spotlighted, or null. */
  activeKey?: string | null;
  /** Re-read the mirror after a write. */
  onChanged: () => Promise<void>;
  /** App's writeFinished — drains the queue when connected. Optional until the shell wires it. */
  onQueued?: () => Promise<"synced" | "pending">;
}) {
  const editable = canEdit(page.aircraft_id);
  const [editing, setEditing] = useState<{ entry: ReviewEntry | null; focus?: keyof EntryForm } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const allowance = useAllowance();

  async function after(label?: string) {
    await onChanged();
    const r = await onQueued?.();
    setNote(label ? `${label} · ${r === "synced" ? "synced" : "saved on this phone, uploads when connected"}` : null);
  }

  async function confirm(e: ReviewEntry, confirmed: boolean) {
    await enqueue("entry.confirm", page.aircraft_id, { entryId: e.id, confirmed }, { base: e.updated_at });
    await patchLocal<ReviewEntry>("log_entry", page.aircraft_id, e.id, { owner_confirmed: confirmed });
    await after(confirmed ? "Entry confirmed" : "Confirmation removed");
  }
  async function remove(e: ReviewEntry) {
    await enqueue("entry.delete", page.aircraft_id, { entryId: e.id }, { base: e.updated_at });
    await deleteLocal("log_entry", e.id);
    await after("Entry deleted");
  }
  async function merge(e: ReviewEntry) {
    await enqueue("entry.merge", page.aircraft_id, { tailEntryId: e.id }, { base: e.updated_at, label: "Log entry merged with the previous page" });
    // NOT deleted locally. A merge is the one write here the server refuses for
    // ordinary reasons an owner will hit — the page has no sequence number, or
    // it is the first page in the book — and a refused write emits no change_log
    // row, so nothing would ever put an optimistically-deleted entry back. The
    // server deletes the tail when the merge lands and the pull removes it then.
    await after("Merging into the previous page");
  }
  async function review(status: ReviewPage["review_status"]) {
    await enqueue("page.review", page.aircraft_id, { pageId: page.id, status }, { base: page.updated_at });
    await patchLocal<ReviewPage>("page", page.aircraft_id, page.id, { review_status: status });
    await after(status === "confirmed" ? "Page marked reviewed" : status === "disputed" ? "Page flagged" : "Review reopened");
  }
  const [reading, setReading] = useState(false);
  // Reading a page is online-only: it spends an AI call on the server and has
  // nothing to queue. validateMutation refuses every online-only type, so an
  // enqueue()d `page.extract` would park in "Waiting to upload" forever and the
  // pane would sit on a "processing" status no pull could ever correct.
  async function extract() {
    if (reading) return;
    setReading(true);
    setNote(null);
    try {
      const r = await runExtract(page.id);
      if ("error" in r) { setNote(r.error); return; }
      await onQueued?.();          // pull the entries the server just wrote
      await onChanged();
      setNote("Page read — the entries are below");
    } finally {
      setReading(false);
    }
  }

  const ext = extractLabel(allowance);
  const unconfirmed = entries.filter((e) => !e.owner_confirmed);
  const unreviewed = unconfirmed.length;
  const next = unconfirmed[0];

  // ⌘↩ on a keyboard: confirm the next entry that still needs it, then mark the
  // page reviewed. Registered here, not in the shell, because the entries are
  // this component's state (CONTRACT §11).
  useShortcuts({
    "cmd+enter":
      !editable || editing
        ? undefined
        : next
          ? () => { void confirm(next, true); }
          : page.extraction_status === "extracted" && page.review_status !== "confirmed"
            ? () => { void review("confirmed"); }
            : undefined,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ ...text.cardTitle, color: color.ink }}>
          {entries.length === 0 ? "No entries on this page" : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
        </span>
        <span style={{ ...text.meta, color: page.review_status === "disputed" ? color.warning : unreviewed ? color.dim : color.success, marginLeft: "auto" }}>
          {page.review_status === "disputed" ? "Flagged" : page.review_status === "confirmed" ? "Reviewed" : unreviewed ? `${unreviewed} to check` : "Nothing to check"}
        </span>
      </div>

      {/* 0052: the scan had sideways writing the reader could not finish. A
          missed entry has nothing to review against, so say so out loud. */}
      {page.unread_rotated_content === true && (
        <p style={{ ...text.meta, color: color.warning, margin: 0, lineHeight: 1.45 }}>
          Some writing on this page runs sideways and wasn&apos;t fully read. Check the scan for anything missing.
        </p>
      )}

      {page.extraction_status !== "extracted" && (
        <div style={{ background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.row, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ ...text.secondary, color: color.dim }}>
            {page.extraction_status === "processing" ? "Being read now — entries appear on the next sync."
              : page.extraction_status === "failed" ? "Reading this page didn't work last time. Try again?"
              : "This page hasn't been read yet."}
          </span>
          {editable && (page.extraction_status !== "processing" || reading) && (
            <button onClick={extract} disabled={ext.exhausted || reading} style={{ ...primaryBtn, opacity: ext.exhausted || reading ? 0.4 : 1 }}>
              {reading ? "Reading the page…" : ext.label}
            </button>
          )}
        </div>
      )}

      {entries.map((e) => (
        <EntryCard
          key={e.id}
          entry={e}
          editable={editable}
          activeKey={activeKey ?? null}
          onLocate={onLocate}
          onEdit={(focus) => setEditing({ entry: e, focus })}
          onConfirm={(c) => confirm(e, c)}
          onDelete={() => remove(e)}
          onMerge={() => merge(e)}
        />
      ))}

      {editable && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <button onClick={() => setEditing({ entry: null })} style={ghostBtn}>Missed an entry?</button>
          {page.extraction_status === "extracted" && (
            <div style={{ display: "flex", gap: 8 }}>
              {page.review_status === "confirmed" ? (
                <button onClick={() => review("unreviewed")} style={{ ...ghostBtn, flex: 1 }}>Reopen review</button>
              ) : (
                <button onClick={() => review("confirmed")} style={{ ...primaryBtn, flex: 1 }}>Mark page reviewed</button>
              )}
              {page.review_status === "disputed" ? (
                <button onClick={() => review("unreviewed")} style={{ ...ghostBtn, flex: 1 }}>Clear the flag</button>
              ) : (
                <button onClick={() => review("disputed")} style={{ ...ghostBtn, flex: 1, color: color.warning }}>Something's wrong</button>
              )}
            </div>
          )}
        </div>
      )}
      {!editable && <p style={{ ...text.meta, color: color.warning, margin: 0 }}>View-only access — nothing here can be changed.</p>}
      {note && <p style={{ ...text.meta, color: color.faint, margin: 0, textAlign: "center" }}>{note}</p>}

      {editing && (
        <EntryEditor
          aircraftId={page.aircraft_id}
          logbookId={page.logbook_id}
          pageId={page.id}
          ocrText={page.ocr_text}
          entry={editing.entry}
          focus={editing.focus}
          onClose={() => setEditing(null)}
          onSaved={() => after(editing.entry ? "Entry saved" : "Entry added")}
        />
      )}
    </div>
  );
}

function EntryCard({
  entry: e, editable, activeKey, onLocate, onEdit, onConfirm, onDelete, onMerge,
}: {
  entry: ReviewEntry; editable: boolean; activeKey: string | null; onLocate: Locate;
  onEdit: (focus: keyof EntryForm) => void; onConfirm: (c: boolean) => void; onDelete: () => void; onMerge: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const badge = entryBadge(e);
  const tone = e.owner_confirmed ? color.success : e.is_continuation || badge === "Needs a look" ? color.warning : color.dim;

  return (
    <div style={{ background: color.surface, border: `1px solid ${e.owner_confirmed ? tint.successBorder : color.hairline}`, borderRadius: radius.card, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ ...text.chip, color: tone, background: `${alpha(tone, "1F")}`, border: `1px solid ${alpha(tone, "4D")}`, borderRadius: 6, padding: "3px 7px" }}>{badge}</span>
      </div>

      {FIELD_ROWS.map((f) => {
        const value = f.value(e);
        if (value == null && !ALWAYS.includes(f.key)) return null;
        const box = e.field_boxes?.[f.key] ?? null;
        const key = `${e.id}:${f.key}`;
        const active = activeKey === key;
        const located = spotlightStyle(box) != null;
        return (
          <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: hit.min, borderTop: `1px solid ${color.hairline}` }}>
            <button
              onClick={() => editable && onEdit(f.key)}
              style={{ flex: 1, minWidth: 0, minHeight: hit.min, background: "transparent", border: "none", padding: "6px 0", textAlign: "left", cursor: editable ? "pointer" : "default" }}
            >
              <span style={{ ...text.meta, color: color.faint, display: "flex", gap: 6, alignItems: "baseline" }}>
                {f.label}
                {fieldChip(e.field_confidence, f.key) && <CheckChip />}
              </span>
              <span style={{ ...text.bodyText, color: value == null ? color.faint : color.ink, display: "block", whiteSpace: "pre-wrap", ...(f.key === "tach" || f.key === "hobbs" || f.key === "airframe" ? tabular : {}) }}>
                {value ?? "—"}
              </span>
            </button>
            {located && (
              <button
                aria-label={`Show ${f.label} on the scan`}
                onClick={() => onLocate(active ? null : box, active ? null : key)}
                style={{
                  width: hit.min, height: hit.min, flex: "0 0 auto", borderRadius: radius.control,
                  background: active ? tint.accent : color.surfaceRaised, border: `1px solid ${active ? color.accent : color.hairline}`,
                  color: active ? color.accent : color.dim, fontSize: 18, cursor: "pointer",
                }}
              >
                ◎
              </button>
            )}
          </div>
        );
      })}

      {editable && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {e.owner_confirmed ? (
            <button onClick={() => onConfirm(false)} style={ghostBtn}>Undo confirm</button>
          ) : (
            <button onClick={() => onConfirm(true)} style={{ ...primaryBtn, flex: 1 }}>Confirm</button>
          )}
          {e.is_continuation && (
            <button onClick={onMerge} style={{ ...ghostBtn, flex: "1 1 100%" }}>Merge into the entry on the previous page</button>
          )}
          {armed ? (
            <>
              <button onClick={onDelete} style={{ ...ghostBtn, color: color.danger, borderColor: tint.dangerBorder }}>Yes, delete it</button>
              <button onClick={() => setArmed(false)} style={ghostBtn}>Keep</button>
            </>
          ) : (
            <button onClick={() => setArmed(true)} style={{ ...ghostBtn, color: color.faint }}>Delete</button>
          )}
        </div>
      )}
    </div>
  );
}

/** ReviewPane that reads its page and entries from the mirror. The one the shell places beside PageViewer. */
export function PageReview({ page, onLocate, activeKey, onQueued }: { page: Page; onLocate: Locate; activeKey?: string | null; onQueued?: () => Promise<"synced" | "pending"> }) {
  const [row, setRow] = useState<ReviewPage | null>(null);
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  async function load() {
    const [pages, all] = await Promise.all([
      getByAircraft<ReviewPage>("page", page.aircraft_id),
      getByAircraft<ReviewEntry>("log_entry", page.aircraft_id),
    ]);
    setRow(pages.find((p) => p.id === page.id) ?? null);
    setEntries(entriesOn(all, page.id));
  }
  useEffect(() => { load(); }, [page.id]);
  if (!row) return <p style={{ ...text.secondary, color: color.faint, margin: 0 }}>Loading…</p>;
  return <ReviewPane page={row} entries={entries} onLocate={onLocate} activeKey={activeKey} onChanged={load} onQueued={onQueued} />;
}

/** The ring PageViewer draws over the image. Parent must be position: relative around the <img>. */
export function SpotlightRing({ box }: { box: FieldBox | null }) {
  const s = spotlightStyle(box);
  if (!s) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute", ...s, pointerEvents: "none", borderRadius: 4,
        border: `2px solid ${color.accent}`, boxShadow: "0 0 0 9999px rgba(4,10,20,0.55)",
        transition: "left .2s, top .2s, width .2s, height .2s",
      }}
    />
  );
}

/**
 * Compact: the review sits in a drawer over the page viewer. Peeks at the
 * bottom; swipe the handle up (or tap it) to open, down to close. Open, the
 * page above stays visible so a spotlight can be seen while reading a field.
 */
export function EntriesDrawer({ title, open, onOpen, children }: { title: string; open: boolean; onOpen: (o: boolean) => void; children: React.ReactNode }) {
  const startY = useRef<number | null>(null);
  return (
    <div
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
        height: open ? "62vh" : "calc(60px + env(safe-area-inset-bottom))",
        background: color.surface, borderTop: `1px solid ${color.hairline}`,
        borderTopLeftRadius: 18, borderTopRightRadius: 18, boxShadow: "0 -10px 30px rgba(0,0,0,.45)",
        display: "flex", flexDirection: "column", transition: "height .22s ease",
      }}
    >
      <div
        onTouchStart={(e) => { startY.current = e.touches[0]?.clientY ?? null; }}
        onTouchEnd={(e) => {
          const t = e.changedTouches[0];
          if (startY.current == null || !t) return;
          const dy = t.clientY - startY.current;
          const next = drawerSnap(open, dy);
          if (next === open && Math.abs(dy) < 8) onOpen(!open); // a tap toggles
          else onOpen(next);
          startY.current = null;
        }}
        // No onClick: iOS fires click after touchend and the tap would toggle twice.
        style={{ minHeight: 60, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", cursor: "pointer", flex: "0 0 auto" }}
      >
        <span aria-hidden style={{ position: "absolute", top: 7, left: "50%", width: 36, height: 4, marginLeft: -18, borderRadius: 2, background: color.hairline }} />
        <span style={{ ...text.rowTitle, color: color.ink }}>{title}</span>
        <span style={{ ...text.meta, color: color.accent, marginLeft: "auto" }}>{open ? "Hide" : "Review"}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px calc(16px + env(safe-area-inset-bottom))", visibility: open ? "visible" : "hidden" }}>
        {children}
      </div>
    </div>
  );
}

// --- Allowance ------------------------------------------------------------------

const ALLOWANCE_KEY = "mytaillog.allowance";

/**
 * Today's remaining page-reading allowance, from GET /api/sync/access (core sync
 * is adding `allowance`). Cached so the button still says something offline;
 * absent → the plain label.
 */
function useAllowance(): Allowance | null {
  const [a, setA] = useState<Allowance | null>(() => {
    try { return readAllowance({ allowance: JSON.parse(localStorage.getItem(ALLOWANCE_KEY) ?? "null") }); } catch { return null; }
  });
  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await CapacitorHttp.get({ url: `${API_BASE}/api/sync/access`, headers: { Authorization: `Bearer ${token}` } });
      if (res.status < 200 || res.status >= 300) return;
      const next = readAllowance(res.data);
      if (!live) return;
      setA(next);
      try { localStorage.setItem(ALLOWANCE_KEY, JSON.stringify(next)); } catch { /* storage full or blocked — the label degrades to plain */ }
    })().catch(() => {});
    return () => { live = false; };
  }, []);
  return a;
}

/**
 * Read a scanned page. Online only, and NOT queued: the work is a paid model
 * call on the server, so there is nothing sensible to replay later — the push
 * endpoint refuses every online-only type for exactly this reason (CONTRACT §12,
 * same call shape as runScan / enroll).
 */
async function runExtract(pageId: string): Promise<{ ok: true } | { error: string }> {
  if (!navigator.onLine) return { error: "Reading a page needs a connection. Try again when you're back online." };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: "Sign in again to read this page." };
  try {
    const res = await CapacitorHttp.post({
      url: `${API_BASE}/api/pages/${pageId}/extract`,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {},
    });
    if (res.status < 200 || res.status >= 300) {
      return { error: typeof res.data?.error === "string" ? res.data.error : `The server answered ${res.status}.` };
    }
    return { ok: true };
  } catch {
    return { error: "Reading a page needs a connection. Try again when you're back online." };
  }
}

// --- Buttons ------------------------------------------------------------------------

const primaryBtn: React.CSSProperties = {
  minHeight: hit.min, borderRadius: radius.control, border: "none", padding: "0 14px",
  background: accentGradient, color: color.onAccent,
  fontFamily: text.button.fontFamily, fontSize: 15, fontWeight: 600, cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  minHeight: hit.min, borderRadius: radius.control, padding: "0 14px",
  background: color.surfaceRaised, border: `1px solid ${color.hairline}`, color: color.dim,
  fontFamily: text.button.fontFamily, fontSize: 14, fontWeight: 500, cursor: "pointer",
};

