import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer } from "@/components/Disclaimer";
import { ImportBackup } from "./ImportBackup";
import { RemoveShared } from "./RemoveShared";
import { HeardAbout } from "./HeardAbout";
import { buildStatusItems, summarizeStatusItems } from "@/lib/status";
import { currentMetersFrom, toReadings } from "@/lib/aircraftHours";
import type { Meter } from "@/lib/hobbsTach";
import { LoadError } from "@/components/LoadError";

// Fleet "hangar" — every aircraft the user owns or is shared on, with an
// at-a-glance airworthiness pill and instrument readouts, matching the redesign.
export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: aircraft, error: aircraftError } = await supabase
    .from("aircraft")
    .select(
      "id, tail_number, make, model, year, home_base, enrollment_date, enrollment_tach, enrollment_hobbs, enrollment_airframe, owner_id, is_demo",
    )
    .order("created_at", { ascending: true });
  const list = aircraft ?? [];

  // New accounts (first 14 days) get a one-tap "how did you hear" card until answered.
  const { data: me } = user
    ? await supabase.from("profile").select("heard_about, created_at").eq("id", user.id).maybeSingle()
    : { data: null };
  const askHeardAbout =
    // eslint-disable-next-line react-hooks/purity -- server component: one timestamp for this request
    !!me && me.heard_about == null && Date.parse(me.created_at) > Date.now() - 14 * 86_400_000;

  const email = user?.email?.toLowerCase();
  const roleByAircraft = new Map<string, string>();
  if (email) {
    const { data: shares } = await supabase
      .from("aircraft_share")
      .select("aircraft_id, role")
      .eq("invited_email", email);
    for (const s of shares ?? []) roleByAircraft.set(s.aircraft_id, s.role);
  }

  // Per-aircraft rollups (RLS scopes every query to accessible rows).
  const entryCount = new Map<string, number>();
  const hoursMax = new Map<string, number>();
  const spanMin = new Map<string, number>();
  const spanMax = new Map<string, number>();
  const needsReview = new Map<string, number>();
  const statusByAircraft = new Map<string, ReturnType<typeof summarizeStatusItems>>();
  let statusUnavailable = false;
  let entriesUnavailable = false;

  if (list.length > 0) {
    const [entryResult, readingResult, itemResult, adResult, resetResult] = await Promise.all([
      supabase.from("log_entry").select("id, aircraft_id, page_id, owner_confirmed, hobbs, tach, airframe, entry_date, hours_reviewed_at, authored_superseded_by"),
      supabase.from("hours_reading").select("id, aircraft_id, hobbs, tach, airframe, reading_date, hours_reviewed_at, source"),
      supabase.from("maintenance_item").select("*"),
      supabase.from("ad_compliance").select("aircraft_id, id, reference, kind, next_due_date, next_due_hours, status, verified_report_page_id, verified_at").eq("recurring", true).not("status", "in", "(not_applicable,superseded)"),
      supabase.from("meter_reset").select("aircraft_id, meter, reset_date, prior_value, new_value").order("reset_date", { ascending: true }),
    ]);
    entriesUnavailable = Boolean(entryResult.error);
    statusUnavailable = [entryResult, readingResult, itemResult, adResult, resetResult].some((r) => r.error);
    const entries = entryResult.data ?? [];
    for (const e of entries) {
      entryCount.set(e.aircraft_id, (entryCount.get(e.aircraft_id) ?? 0) + 1);
      const yr = e.entry_date ? Number(e.entry_date.slice(0, 4)) : null;
      if (yr) {
        if (yr < (spanMin.get(e.aircraft_id) ?? Infinity)) spanMin.set(e.aircraft_id, yr);
        if (yr > (spanMax.get(e.aircraft_id) ?? 0)) spanMax.set(e.aircraft_id, yr);
      }
    }
    for (const a of list) {
      const aircraftEntries = entries.filter((e) => e.aircraft_id === a.id);
      needsReview.set(a.id, new Set(aircraftEntries.filter((e) => !e.owner_confirmed && e.page_id).map((e) => e.page_id)).size);
      if (statusUnavailable) continue;
      const raw = toReadings(aircraftEntries, (readingResult.data ?? []).filter((r) => r.aircraft_id === a.id), {
        hobbs: a.enrollment_hobbs, tach: a.enrollment_tach, airframe: a.enrollment_airframe, date: a.enrollment_date,
      });
      const resets = (resetResult.data ?? []).filter((r) => r.aircraft_id === a.id).map((r) => ({
        meter: r.meter as Meter, date: r.reset_date, prior: r.prior_value, next: r.new_value,
      }));
      const meters = currentMetersFrom(raw, resets);
      if (meters.face.tach != null) hoursMax.set(a.id, meters.face.tach);
      const status = buildStatusItems(
        (itemResult.data ?? []).filter((r) => r.aircraft_id === a.id),
        (adResult.data ?? []).filter((r) => r.aircraft_id === a.id),
        {
          tach: meters.tach.tach, hobbs: meters.hobbs.hobbs, airframe: meters.airframe.airframe,
          tachEstimated: meters.tach.estimated, hobbsEstimated: meters.hobbs.estimated, airframeEstimated: meters.airframe.estimated,
          baselineFor: meters.baselineFor, toTotalHours: meters.toTotalHours,
        },
      );
      statusByAircraft.set(a.id, summarizeStatusItems(status));
    }
  }

  const summaries = [...statusByAircraft.values()];
  const fleet = {
    aircraft: list.length,
    overdue: statusUnavailable ? "—" : summaries.reduce((n, s) => n + s.overdue, 0),
    due: statusUnavailable ? "—" : summaries.reduce((n, s) => n + s.due, 0),
    pending: entriesUnavailable ? "—" : [...needsReview.values()].reduce((n, count) => n + count, 0),
  };
  const greeting = list.length === 0 ? "Welcome to MyTailLog" : "Your hangar";

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-7">
      {/* Fleet header */}
      <header className="mb-6">
        <div className="eyebrow mb-2">Fleet</div>
        <h1 className="font-display text-[30px] font-semibold leading-none">{greeting}</h1>
        <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
          Choose an aircraft to review its records, check upcoming maintenance or add logbook pages.
        </p>
      </header>

      {askHeardAbout && <HeardAbout />}
      {(aircraftError || statusUnavailable) && (
        <div className="mb-5"><LoadError message={aircraftError ? "Your aircraft could not be loaded." : "Some records could not be loaded. Fleet status is unavailable."} href="/dashboard" /></div>
      )}

      {/* Fleet-wide summary tiles */}
      {list.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { n: fleet.aircraft, label: "Aircraft", tone: "", color: "text-ink" },
            { n: fleet.overdue, label: "Overdue fleet-wide", tone: "var(--red)", color: "text-annun-red" },
            { n: fleet.due, label: "Due soon", tone: "var(--amb)", color: "text-annun-amber" },
            { n: fleet.pending, label: "Pages to review", tone: "var(--amb)", color: "text-annun-amber" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-line bg-panel px-[18px] py-4"
              style={s.tone ? { borderLeft: `3px solid ${s.tone}` } : undefined}
            >
              <div className={`readout text-2xl ${s.color}`}>{s.n}</div>
              <div className="eyebrow mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-5">
        <Disclaimer />
      </div>

      {/* Aircraft cards */}
      <div className="eyebrow mb-3">
        {list.length > 0 ? "Aircraft" : "Get started"}
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((a) => {
          const shared = user ? a.owner_id !== user.id : false;
          const role = roleByAircraft.get(a.id) ?? "viewer";
          const summary = statusByAircraft.get(a.id);
          const review = needsReview.get(a.id) ?? 0;
          const tracked = summary ? summary.overdue + summary.due + summary.current + summary.unknown : 0;
          const status = !summary
            ? { color: "var(--dim)", text: "Status unavailable" }
            : summary.overdue > 0
              ? { color: "var(--red)", text: `${summary.overdue} overdue` }
              : summary.due > 0
                ? { color: "var(--amb)", text: `${summary.due} due soon` }
                : summary.unknown > 0
                  ? { color: "var(--dim)", text: `${summary.unknown} need information` }
                  : tracked === 0
                    ? { color: "var(--dim)", text: "Nothing tracked yet" }
                    : { color: "var(--grn)", text: "No tracked items overdue" };
          const tach = hoursMax.get(a.id);
          const lo = spanMin.get(a.id);
          const hi = spanMax.get(a.id);
          const span = lo ? (lo === hi ? `${lo}` : `${lo}–${hi}`) : "—";
          const nextMeta = entriesUnavailable ? "Review count unavailable" : review > 0 ? `${review} to review` : "";
          const type = [a.year, a.make, a.model].filter(Boolean).join(" ") || "Details not set";

          return (
            <div key={a.id} className="panel flex flex-col p-[18px]">
              <div className="mb-4 flex items-start gap-3.5">
                <div
                  className="relative h-[58px] w-[58px] shrink-0 rounded-full"
                  style={{ background: status.color }}
                >
                  <div className="absolute inset-[7px] flex items-center justify-center rounded-full border border-line bg-panel text-[19px]">
                    ✈
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="readout text-[19px] font-semibold tracking-[0.5px]">{a.tail_number}</span>
                    {a.is_demo ? (
                      <span className="rounded-sm border border-accent-soft bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] text-accent">
                        DEMO · VIEW ONLY
                      </span>
                    ) : shared ? (
                      <span className="rounded-sm bg-panel2 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] text-dim">
                        SHARED · {role === "editor" ? "CONTRIBUTE" : "VIEW"}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[12.5px] text-dim">{type}</div>
                </div>
              </div>

              <div
                className="mb-3 flex flex-wrap items-center gap-2 rounded-[9px] border bg-bg px-3 py-2.5"
                style={{ borderColor: status.color }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: status.color, boxShadow: `0 0 7px ${status.color}` }}
                />
                <span className="text-[12.5px] font-semibold" style={{ color: status.color }}>
                  {status.text}
                </span>
                {nextMeta && (
                  <span className="readout ml-auto text-[11px] text-faint">{nextMeta}</span>
                )}
              </div>

              {summary && (
                <p className="mb-3 text-xs text-dim">{tracked} tracked · {summary.unknown} need information. Verify against the logbooks.</p>
              )}
              <div className="mb-4 flex flex-wrap gap-4">
                {[
                  { v: tach != null ? tach.toFixed(1) : "—", l: "Tach hrs", dim: false },
                  { v: entriesUnavailable ? "—" : entryCount.get(a.id) ?? 0, l: "Entries", dim: true },
                  { v: span, l: "Records span", dim: true },
                ].map((st) => (
                  <div key={st.l}>
                    <div className={`readout text-sm ${st.dim ? "text-dim" : "text-ink"}`}>{st.v}</div>
                    <div className="eyebrow mt-0.5">{st.l}</div>
                  </div>
                ))}
              </div>

              <Link
                href={`/aircraft/${a.id}`}
                className="mt-auto rounded-[9px] border border-line2 bg-panel2 px-4 py-2 text-center text-[13px] font-medium hover:border-accent hover:text-accent"
              >
                Open aircraft →
              </Link>

              {!shared && !a.is_demo && (
                <Link
                  href={`/aircraft/${a.id}/share#delete-aircraft`}
                  className="mt-2 text-center text-[11px] text-faint underline decoration-line underline-offset-2 hover:text-ink"
                >
                  Manage / delete aircraft
                </Link>
              )}

              {/* Shared WITH you (incl. the read-only demo) → you can drop your
                  own grant. An aircraft you own has no share row to remove. */}
              {shared && (
                <div className="mt-2 text-center">
                  <RemoveShared aircraftId={a.id} tail={a.tail_number} />
                </div>
              )}
            </div>
          );
        })}

        {/* Enroll card */}
        <Link
          href="/aircraft/enroll"
          className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-[1.5px] border-dashed border-line2 p-6 text-center text-dim hover:border-accent"
        >
          <span className="flex h-[46px] w-[46px] items-center justify-center rounded-xl border border-line2 text-2xl text-accent">
            +
          </span>
          <span className="text-[15px] font-semibold text-ink">Enroll an aircraft</span>
          <span className="max-w-[200px] text-xs leading-relaxed text-faint">
            Add a tail number, then capture or upload its logbooks to start the index.
          </span>
        </Link>

        {/* Import backup card */}
        <ImportBackup />
      </div>
    </main>
  );
}
