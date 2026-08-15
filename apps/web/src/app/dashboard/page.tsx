import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer } from "@/components/Disclaimer";
import { ImportBackup } from "./ImportBackup";
import { RemoveShared } from "./RemoveShared";

const today = () => new Date().toISOString().slice(0, 10);
const DUE_SOON_DAYS = 30;

// Fleet "hangar" — every aircraft the user owns or is shared on, with an
// at-a-glance airworthiness pill and instrument readouts, matching the redesign.
export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select(
      "id, tail_number, make, model, year, home_base, enrollment_date, enrollment_tach, enrollment_hobbs, owner_id, is_demo",
    )
    .order("created_at", { ascending: true });
  const list = aircraft ?? [];

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
  const overdue = new Map<string, number>();
  const dueSoon = new Map<string, number>();

  if (list.length > 0) {
    const t = today();
    const soon = new Date();
    soon.setDate(soon.getDate() + DUE_SOON_DAYS);
    const soonStr = soon.toISOString().slice(0, 10);

    const [{ data: entries }, { data: pages }, { data: items }] = await Promise.all([
      supabase.from("log_entry").select("aircraft_id, hobbs, tach, entry_date"),
      supabase.from("page").select("aircraft_id, review_status, extraction_status"),
      supabase.from("maintenance_item").select("aircraft_id, next_due_date"),
    ]);

    for (const e of entries ?? []) {
      entryCount.set(e.aircraft_id, (entryCount.get(e.aircraft_id) ?? 0) + 1);
      const h = Math.max(e.hobbs ?? 0, e.tach ?? 0);
      if (h > (hoursMax.get(e.aircraft_id) ?? 0)) hoursMax.set(e.aircraft_id, h);
      const yr = e.entry_date ? Number(e.entry_date.slice(0, 4)) : null;
      if (yr) {
        if (yr < (spanMin.get(e.aircraft_id) ?? Infinity)) spanMin.set(e.aircraft_id, yr);
        if (yr > (spanMax.get(e.aircraft_id) ?? 0)) spanMax.set(e.aircraft_id, yr);
      }
    }
    for (const p of pages ?? []) {
      if (p.extraction_status === "extracted" && p.review_status === "unreviewed")
        needsReview.set(p.aircraft_id, (needsReview.get(p.aircraft_id) ?? 0) + 1);
    }
    for (const it of items ?? []) {
      if (!it.next_due_date) continue;
      if (it.next_due_date < t)
        overdue.set(it.aircraft_id, (overdue.get(it.aircraft_id) ?? 0) + 1);
      else if (it.next_due_date <= soonStr)
        dueSoon.set(it.aircraft_id, (dueSoon.get(it.aircraft_id) ?? 0) + 1);
    }
  }

  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const fleet = {
    aircraft: list.length,
    overdue: sum(overdue),
    due: sum(dueSoon),
    pending: sum(needsReview),
  };
  const greeting = list.length === 0 ? "Welcome to MyTailLog" : "Your hangar";

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-7">
      {/* Fleet header */}
      <header className="mb-6">
        <div className="eyebrow mb-2">Fleet</div>
        <h1 className="font-display text-[30px] font-semibold leading-none">{greeting}</h1>
        <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
          Photograph or upload your logbook pages, confirm what the extractor reads, and
          MyTailLog tracks what&apos;s due — annuals, ADs, the transponder cert, TBO. It&apos;s an
          index of your records, never a replacement for the paper.
        </p>
      </header>

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
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((a) => {
          const shared = user ? a.owner_id !== user.id : false;
          const role = roleByAircraft.get(a.id) ?? "viewer";
          const over = overdue.get(a.id) ?? 0;
          const soon = dueSoon.get(a.id) ?? 0;
          const review = needsReview.get(a.id) ?? 0;
          // Airworthiness pill: overdue → red, due-soon → amber, else green.
          const status = over > 0
            ? { color: "var(--red)", text: `${over} overdue` }
            : soon > 0
              ? { color: "var(--amb)", text: `${soon} due soon` }
              : { color: "var(--grn)", text: "On top of it" };
          const tach = hoursMax.get(a.id);
          const lo = spanMin.get(a.id);
          const hi = spanMax.get(a.id);
          const span = lo ? (lo === hi ? `${lo}` : `${lo}–${hi}`) : "—";
          const nextMeta = review > 0 ? `${review} to review` : "";
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
                className="mb-3 flex items-center gap-2 rounded-[9px] border bg-bg px-3 py-2.5"
                style={{ borderColor: status.color + "55" }}
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

              <div className="mb-4 flex gap-4">
                {[
                  { v: tach != null ? tach.toFixed(1) : "—", l: "Tach hrs", dim: false },
                  { v: entryCount.get(a.id) ?? 0, l: "Entries", dim: true },
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
