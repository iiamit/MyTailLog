import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentHours } from "@/lib/aircraftHours";
import {
  auditAnnuals,
  auditContinuity,
  auditADs,
  type Finding,
  type AuditEntry,
  type AdRow,
} from "@/lib/audit";

// Left-border accent color per severity — worst-first, at-a-glance triage.
const SEVERITY_COLOR: Record<Finding["severity"], string> = {
  warning: "var(--amb)",
  info: "var(--line2)",
};

export default async function AuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number, enrollment_hobbs, enrollment_tach")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  const { data: entryRows } = await supabase
    .from("log_entry")
    .select("entry_date, description, work_performed")
    .eq("aircraft_id", id);
  const entries: AuditEntry[] = (entryRows ?? []).map((e) => ({
    date: e.entry_date,
    text: `${e.description ?? ""} ${e.work_performed ?? ""}`.toLowerCase(),
  }));

  const { data: adRows } = await supabase
    .from("ad_compliance")
    .select("reference, kind, recurring, status, next_due_date, next_due_hours, complied_date")
    .eq("aircraft_id", id);

  const currentHours = await getCurrentHours(supabase, id, {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
  });

  const findings: Finding[] = [
    ...auditAnnuals(entries),
    ...auditContinuity(entries),
    ...auditADs((adRows ?? []) as AdRow[], currentHours),
  ];
  // Warnings first, then by category.
  findings.sort(
    (a, b) =>
      (a.severity === "warning" ? 0 : 1) - (b.severity === "warning" ? 0 : 1) ||
      a.category.localeCompare(b.category),
  );

  const warnings = findings.filter((f) => f.severity === "warning").length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Airworthiness</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">
            Records gap audit
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
            Suspected gaps in the digitized records — missing annuals, timeline
            gaps, and AD-compliance gaps — measured against the 91.417(b)
            retention baseline. These are advisory heuristics over the
            extracted entries, not an airworthiness determination; verify
            against the physical logbooks. A flagged gap may simply mean the
            relevant pages aren&apos;t digitized yet.
          </p>
        </div>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-5 py-8 text-center text-sm text-dim">
          No extracted entries yet — capture and extract pages first, then run the
          audit.
        </p>
      ) : findings.length === 0 ? (
        <div className="rounded-lg border border-annun-green/40 bg-(--grn-bg) px-5 py-8 text-center text-sm text-annun-green">
          No suspected gaps found across {entries.length} entries. (This checks
          annual continuity, record timeline, and AD compliance — it can&apos;t
          catch everything.)
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="eyebrow">
            {warnings > 0 ? `${warnings} warning${warnings === 1 ? "" : "s"} · ` : ""}
            {findings.length} finding{findings.length === 1 ? "" : "s"} across {entries.length} entries
          </p>
          {findings.map((f, i) => (
            <div
              key={i}
              className="flex items-start gap-4 rounded-xl border border-line bg-panel p-4"
              style={{ borderLeft: `3px solid ${SEVERITY_COLOR[f.severity]}` }}
            >
              <span
                className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md border text-[13px]"
                style={{ borderColor: SEVERITY_COLOR[f.severity], color: SEVERITY_COLOR[f.severity] }}
              >
                !
              </span>
              <div className="flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{f.title}</span>
                  <span className="text-xs text-faint">· {f.category}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      f.severity === "warning"
                        ? "bg-(--amb-bg) text-annun-amber"
                        : "bg-panel2 text-dim"
                    }`}
                  >
                    {f.severity === "warning" ? "gap" : "note"}
                  </span>
                </div>
                <div className="text-[13px] leading-relaxed text-dim">{f.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
