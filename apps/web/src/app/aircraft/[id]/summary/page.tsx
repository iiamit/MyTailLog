import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMeters } from "@/lib/aircraftHours";
import { AD_STATUS_LABEL, urgencyLabel, type Urgency } from "@/lib/compliance";
import { buildStatusItems, sortStatusItems, daysUntil, hoursRemaining, type StatusItem } from "@/lib/status";
import { usefulLoad } from "@/lib/weightBalance";
import { PrintButton } from "@/components/PrintButton";
import { ShareSummaryButton } from "@/components/ShareSummaryButton";
import { maintenanceSummaryText } from "@/lib/summaryShare";
import type { AdStatus } from "@/lib/database.types";

export const metadata = { title: "Maintenance summary — MyTailLog" };

// ===========================================================================
// The one-document maintenance summary: what an owner hands a buyer, an
// insurer, or an IA at annual. Deliberately NOT the full records export (that
// lives at ../export and runs to every logbook entry) — this is the top sheet.
//
// ponytail: no PDF library. The page is print-first and globals.css re-points
// the design tokens to a light ramp under @media print, so the browser's
// "Save as PDF" is the exporter.
// ===========================================================================

const H2 = "mb-2 mt-7 border-b border-line pb-1 text-[15px] font-bold text-ink first:mt-0";
const TH = "py-1 pr-3 text-left font-medium";
const TD = "py-1 pr-3 align-top";

const URGENCY_COLOR: Record<Urgency, string> = {
  overdue: "text-annun-red",
  due_soon: "text-annun-amber",
  upcoming: "text-annun-green",
  none: "text-faint",
};

/** "42 days left · 11.3 hrs left" — the same countdown the Status page shows. */
function remainingText(item: StatusItem): string {
  const parts: string[] = [];
  const days = daysUntil(item.nextDueDate);
  if (days != null) parts.push(days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`);
  if (item.hoursUnreliable) {
    parts.push("check last-done reading");
  } else {
    const hrs = hoursRemaining(item.nextDueForItem, item.currentForItem);
    if (hrs != null) {
      const est = item.currentEstimated ? " est." : "";
      parts.push(hrs < 0 ? `${Math.abs(hrs)} hrs overdue${est}` : `${hrs} hrs left${est}`);
    }
  }
  return parts.join(" · ");
}

function dueAt(date: string | null, hours: number | null): string {
  return [date, hours != null ? `${hours} hrs` : null].filter(Boolean).join(" / ") || "—";
}

function Tile({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <div className={`readout text-[22px] font-semibold leading-none ${color}`}>{n}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-faint">{label}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11.5px] text-faint">{children}</p>;
}

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase.from("aircraft").select("*").eq("id", id).single();
  if (!aircraft) notFound();

  const [{ data: mxItems }, { data: recurringAds }, { data: allAds }, { data: squawks }, { data: components }, { data: wb }] =
    await Promise.all([
      supabase.from("maintenance_item").select("*").eq("aircraft_id", id),
      // Only recurring, still-applicable ADs carry a countdown — same filter the
      // Status page uses, so the two views can't disagree.
      supabase
        .from("ad_compliance")
        .select("id, reference, kind, next_due_date, next_due_hours, status, verified_report_page_id, verified_at")
        .eq("aircraft_id", id)
        .eq("recurring", true)
        .not("status", "in", "(not_applicable,superseded)"),
      supabase
        .from("ad_compliance")
        .select("kind, reference, title, status, recurring, complied_date, next_due_date, next_due_hours")
        .eq("aircraft_id", id)
        .order("reference", { ascending: true }),
      supabase
        .from("squawk")
        .select("description, severity, reporter_name, reported_at")
        .eq("aircraft_id", id)
        .eq("status", "open")
        .order("reported_at", { ascending: false }),
      supabase
        .from("component")
        .select("name, make, part_number, serial_number, install_date")
        .eq("aircraft_id", id)
        .eq("is_installed", true)
        .order("name", { ascending: true }),
      supabase
        .from("weight_balance")
        .select("*")
        .eq("aircraft_id", id)
        .order("revision_date", { ascending: false })
        .limit(1),
    ]);

  const { tach: ct, hobbs: ch, airframe: ca, baselineFor, toTotalHours } = await getCurrentMeters(supabase, id, {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
    airframe: aircraft.enrollment_airframe,
    date: aircraft.enrollment_date,
  });

  const statusItems = sortStatusItems(
    buildStatusItems(mxItems ?? [], recurringAds ?? [], {
      tach: ct.tach,
      hobbs: ch.hobbs,
      airframe: ca.airframe,
      tachEstimated: ct.estimated,
      hobbsEstimated: ch.estimated,
      airframeEstimated: ca.estimated,
      baselineFor,
      toTotalHours,
    }),
  );

  const overdue = statusItems.filter((s) => s.urgency === "overdue");
  const dueSoon = statusItems.filter((s) => s.urgency === "due_soon");
  const openSquawks = squawks ?? [];
  const current = wb?.[0] ?? null;
  const load = current ? usefulLoad(current.empty_weight, current.max_gross_weight) : null;

  const desc = [aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(" ");
  const meters = [
    ct.tach != null ? `tach ${ct.tach}${ct.estimated ? " est." : ""}` : null,
    ch.hobbs != null ? `hobbs ${ch.hobbs}${ch.estimated ? " est." : ""}` : null,
    ca.airframe != null ? `airframe ${ca.airframe}` : null,
  ].filter((meter): meter is string => Boolean(meter));
  const generated = new Date().toISOString().slice(0, 10);
  const shareText = maintenanceSummaryText({
    tailNumber: aircraft.tail_number,
    description: desc,
    generated,
    meters,
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    current: statusItems.length - overdue.length - dueSoon.length,
    openSquawks: openSquawks.length,
    adCount: allAds?.length ?? 0,
    equipmentCount: components?.length ?? 0,
    attention: [...overdue, ...dueSoon].map((item) => ({
      label: item.label,
      status: item.urgency === "overdue" ? urgencyLabel("overdue") : urgencyLabel("due_soon"),
      nextDue: dueAt(item.nextDueDate, item.nextDueHours),
      remaining: remainingText(item) || "check records",
    })),
    weightBalance: current?.empty_weight != null
      ? `Weight & balance: empty ${current.empty_weight} lbs${load != null ? ` · useful load ${load} lbs` : ""}`
      : undefined,
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <div className="eyebrow mb-2">Manage</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">Maintenance summary</h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
            The one-page picture of the aircraft — status, open squawks, ADs, what&apos;s
            coming due, installed equipment and current weight &amp; balance. Print it
            for a buyer, an insurer, or your IA at annual. For the full entry-by-entry
            record, use the records export on the Export &amp; backup page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShareSummaryButton title={`${aircraft.tail_number} maintenance summary`} text={shareText} />
          <PrintButton />
        </div>
      </header>

      <article className="text-[12px] leading-relaxed text-dim">
        <header className="border-b-2 border-line2 pb-2">
          <h2 className="font-display text-[20px] font-bold text-ink">
            {aircraft.tail_number} — maintenance summary
          </h2>
          <p className="mt-0.5 text-[12px]">
            {desc}
            {aircraft.serial_number ? ` · S/N ${aircraft.serial_number}` : ""}
            {aircraft.engine_serials?.length ? ` · engine S/N ${aircraft.engine_serials.join(", ")}` : ""}
            {aircraft.prop_serials?.length ? ` · prop S/N ${aircraft.prop_serials.join(", ")}` : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-faint">
            Generated {generated}
            {meters.length > 0 ? ` · ${meters.join(" · ")}` : ""}
          </p>
        </header>

        {/* Status grid */}
        <h3 className={H2}>Status at a glance</h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Tile n={overdue.length} label="Overdue" color="text-annun-red" />
          <Tile n={dueSoon.length} label="Due soon" color="text-annun-amber" />
          <Tile n={statusItems.length - overdue.length - dueSoon.length} label="Current" color="text-annun-green" />
          <Tile n={openSquawks.length} label="Open squawks" color={openSquawks.length ? "text-annun-amber" : "text-annun-green"} />
        </div>

        {/* Upcoming & overdue */}
        <h3 className={H2}>Inspections, items &amp; recurring ADs ({statusItems.length})</h3>
        {statusItems.length > 0 ? (
          <table className="w-full break-inside-avoid text-left text-[11.5px]">
            <thead className="text-faint">
              <tr className="border-b border-line">
                <th className={TH}>Item</th>
                <th className={TH}>Last done</th>
                <th className={TH}>Next due</th>
                <th className={TH}>Remaining</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {statusItems.map((s) => (
                <tr key={`${s.source}-${s.id}`} className="border-b border-line">
                  <td className={`${TD} font-medium text-ink`}>
                    {s.label}
                    {s.regulatory && <span className="ml-1.5 text-[10px] text-faint">req&apos;d</span>}
                  </td>
                  <td className={TD}>{dueAt(s.lastDoneDate, s.lastDoneHours)}</td>
                  <td className={TD}>{dueAt(s.nextDueDate, s.nextDueHours)}</td>
                  <td className={TD}>{remainingText(s) || "—"}</td>
                  <td className={`${TD} ${URGENCY_COLOR[s.urgency]}`}>
                    {s.urgency === "none" ? "—" : urgencyLabel(s.urgency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No inspections or maintenance items tracked yet.</Empty>
        )}

        {/* Open squawks */}
        <h3 className={H2}>Open squawks ({openSquawks.length})</h3>
        {openSquawks.length > 0 ? (
          <table className="w-full break-inside-avoid text-left text-[11.5px]">
            <thead className="text-faint">
              <tr className="border-b border-line">
                <th className={TH}>Reported</th>
                <th className={TH}>Severity</th>
                <th className={TH}>Discrepancy</th>
                <th className={TH}>By</th>
              </tr>
            </thead>
            <tbody>
              {openSquawks.map((s, i) => (
                <tr key={i} className="border-b border-line">
                  <td className={TD}>{s.reported_at?.slice(0, 10) ?? ""}</td>
                  <td className={`${TD} ${s.severity === "high" ? "text-annun-red" : s.severity === "medium" ? "text-annun-amber" : ""}`}>
                    {s.severity}
                  </td>
                  <td className={`${TD} text-ink`}>{s.description}</td>
                  <td className={TD}>{s.reporter_name ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No open squawks.</Empty>
        )}

        {/* AD / SB compliance */}
        <h3 className={H2}>AD / SB compliance ({allAds?.length ?? 0})</h3>
        {allAds && allAds.length > 0 ? (
          <table className="w-full text-left text-[11.5px]">
            <thead className="text-faint">
              <tr className="border-b border-line">
                <th className={TH}>Ref</th>
                <th className={TH}>Title</th>
                <th className={TH}>Status</th>
                <th className={TH}>Complied</th>
                <th className={TH}>Next due</th>
              </tr>
            </thead>
            <tbody>
              {allAds.map((a, i) => (
                <tr key={i} className="break-inside-avoid border-b border-line">
                  <td className={`${TD} whitespace-nowrap font-medium text-ink`}>
                    {a.kind.toUpperCase()} {a.reference}
                    {a.recurring && <span className="ml-1 text-[10px] text-faint">rec</span>}
                  </td>
                  <td className={TD}>{a.title ?? ""}</td>
                  <td className={TD}>{AD_STATUS_LABEL[a.status as AdStatus] ?? a.status}</td>
                  <td className={TD}>{a.complied_date ?? ""}</td>
                  <td className={TD}>{a.recurring ? dueAt(a.next_due_date, a.next_due_hours) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No ADs or SBs recorded.</Empty>
        )}

        {/* Installed equipment */}
        <h3 className={H2}>Installed equipment ({components?.length ?? 0})</h3>
        {components && components.length > 0 ? (
          <table className="w-full text-left text-[11.5px]">
            <thead className="text-faint">
              <tr className="border-b border-line">
                <th className={TH}>Component</th>
                <th className={TH}>Make</th>
                <th className={TH}>Part no.</th>
                <th className={TH}>Serial no.</th>
                <th className={TH}>Installed</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c, i) => (
                <tr key={i} className="break-inside-avoid border-b border-line">
                  <td className={`${TD} font-medium text-ink`}>{c.name}</td>
                  <td className={TD}>{c.make ?? ""}</td>
                  <td className={TD}>{c.part_number ?? ""}</td>
                  <td className={TD}>{c.serial_number ?? ""}</td>
                  <td className={TD}>{c.install_date ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No installed equipment recorded.</Empty>
        )}

        {/* Weight & balance */}
        <h3 className={H2}>Current weight &amp; balance</h3>
        {current ? (
          <div className="break-inside-avoid">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11.5px] sm:grid-cols-4">
              {[
                ["Revision date", current.revision_date],
                ["Method", current.method ?? "—"],
                ["Empty weight", current.empty_weight != null ? `${current.empty_weight} lb` : "—"],
                ["Empty CG (arm)", current.empty_weight_arm != null ? `${current.empty_weight_arm} in` : "—"],
                ["Empty moment", current.empty_weight_moment != null ? String(current.empty_weight_moment) : "—"],
                ["Max gross", current.max_gross_weight != null ? `${current.max_gross_weight} lb` : "—"],
                ["Useful load", load != null ? `${load} lb` : "—"],
                ["Reference", current.reference ?? "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] uppercase tracking-[0.12em] text-faint">{k}</dt>
                  <dd className="readout text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            {current.reason && <p className="mt-1.5 text-[11px]">Reason: {current.reason}</p>}
          </div>
        ) : (
          <Empty>No weight &amp; balance revision recorded.</Empty>
        )}

        <p className="mt-7 border-t border-line pt-2 text-[10.5px] italic text-faint">
          Generated by MyTailLog from an index of {aircraft.tail_number}&apos;s physical logbooks.
          This is <b>not</b> the legal maintenance record and <b>not</b> an airworthiness
          determination — the paper logbooks remain the system of record under 14 CFR 91.417.
          Every value here is OCR-derived; verify against the original logbooks before relying
          on it.
        </p>
      </article>
    </main>
  );
}
