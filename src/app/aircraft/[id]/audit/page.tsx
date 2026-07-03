import Link from "next/link";
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

const SEVERITY_STYLE: Record<Finding["severity"], string> = {
  warning: "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30",
  info: "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={`/aircraft/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← {aircraft.tail_number}
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-bold">Records gap audit</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Suspected gaps in the digitized records — missing annuals, timeline
          gaps, and AD-compliance gaps — measured against the 91.417(b) retention
          baseline. These are advisory heuristics over the extracted entries, not
          an airworthiness determination; verify against the physical logbooks.
          A flagged gap may simply mean the relevant pages aren&apos;t digitized
          yet.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No extracted entries yet — capture and extract pages first, then run the
          audit.
        </p>
      ) : findings.length === 0 ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50/50 px-5 py-8 text-center text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          No suspected gaps found across {entries.length} entries. (This checks
          annual continuity, record timeline, and AD compliance — it can&apos;t
          catch everything.)
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {warnings > 0 ? `${warnings} warning${warnings === 1 ? "" : "s"} · ` : ""}
            {findings.length} finding{findings.length === 1 ? "" : "s"} across {entries.length} entries.
          </p>
          {findings.map((f, i) => (
            <div key={i} className={`rounded-lg border p-4 ${SEVERITY_STYLE[f.severity]}`}>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    f.severity === "warning"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {f.severity === "warning" ? "gap" : "note"}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{f.category}</span>
              </div>
              <p className="text-sm font-medium">{f.title}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{f.detail}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
