import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentHours } from "@/lib/aircraftHours";
import { urgencyLabel, type Urgency } from "@/lib/compliance";
import {
  buildStatusItems,
  sortStatusItems,
  daysUntil,
  hoursRemaining,
  type StatusItem,
} from "@/lib/status";

// Card border + accent per urgency — the at-a-glance color code.
const BORDER: Record<Urgency, string> = {
  overdue: "border-red-400 dark:border-red-600",
  due_soon: "border-amber-400 dark:border-amber-600",
  upcoming: "border-emerald-300 dark:border-emerald-700",
  none: "border-slate-200 dark:border-slate-800",
};
const DOT: Record<Urgency, string> = {
  overdue: "bg-red-500",
  due_soon: "bg-amber-500",
  upcoming: "bg-emerald-500",
  none: "bg-slate-300 dark:bg-slate-600",
};

function remainingText(item: StatusItem, currentHours: number | null): string {
  const parts: string[] = [];
  const days = daysUntil(item.nextDueDate);
  if (days != null) {
    parts.push(days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`);
  }
  const hrs = hoursRemaining(item.nextDueHours, currentHours);
  if (hrs != null) {
    parts.push(hrs < 0 ? `${Math.abs(hrs)} hrs overdue` : `${hrs} hrs left`);
  }
  if (parts.length === 0) return item.nextDueDate || item.nextDueHours != null ? "" : "not set";
  return parts.join(" · ");
}

export default async function StatusPage({
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

  const [{ data: items }, { data: ads }] = await Promise.all([
    supabase.from("maintenance_item").select("*").eq("aircraft_id", id),
    supabase
      .from("ad_compliance")
      .select("id, reference, kind, next_due_date, next_due_hours, status")
      .eq("aircraft_id", id)
      .eq("recurring", true)
      .not("status", "in", "(not_applicable,superseded)"),
  ]);

  const currentHours = await getCurrentHours(supabase, id, {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
  });

  const statusItems = sortStatusItems(
    buildStatusItems(items ?? [], ads ?? [], currentHours),
  );

  const counts = {
    overdue: statusItems.filter((s) => s.urgency === "overdue").length,
    due_soon: statusItems.filter((s) => s.urgency === "due_soon").length,
    current: statusItems.filter((s) => s.urgency === "upcoming" || s.urgency === "none").length,
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link
        href={`/aircraft/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← {aircraft.tail_number}
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-bold">Status</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Every recurring inspection, item, and AD at a glance — color-coded by
          urgency. Derived from your logs and entered last-done data; verify
          against the physical logbooks.
        </p>
      </header>

      {statusItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No status items yet. Seed the standard Part 91 items on the{" "}
          <Link href={`/aircraft/${id}/maintenance`} className="underline">
            maintenance forecast
          </Link>{" "}
          and record AD compliance to populate this.
        </p>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {counts.overdue} overdue
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {counts.due_soon} due soon
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {counts.current} current
            </span>
            <span className="ml-auto self-center text-xs text-slate-500 dark:text-slate-400">
              {currentHours != null ? `current ≈ ${currentHours} hrs` : "hours unknown"}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {statusItems.map((s) => {
              const href =
                s.source === "ad"
                  ? `/aircraft/${id}/compliance`
                  : `/aircraft/${id}/maintenance`;
              const rem = remainingText(s, currentHours);
              return (
                <Link
                  key={`${s.source}-${s.id}`}
                  href={href}
                  className={`flex flex-col gap-1 rounded-lg border-l-4 border border-slate-200 bg-white p-4 transition hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 ${BORDER[s.urgency]}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[s.urgency]}`} />
                    <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
                    {s.source === "ad" && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                        AD
                      </span>
                    )}
                    {!s.regulatory && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        advisory
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-medium">
                    {s.urgency === "none" ? (
                      <span className="text-slate-400">not scheduled</span>
                    ) : (
                      <span
                        className={
                          s.urgency === "overdue"
                            ? "text-red-600 dark:text-red-400"
                            : s.urgency === "due_soon"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400"
                        }
                      >
                        {urgencyLabel(s.urgency)}
                      </span>
                    )}
                    {rem && <span className="text-slate-500 dark:text-slate-400"> · {rem}</span>}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500">
                    {[
                      s.nextDueDate ? `due ${s.nextDueDate}` : null,
                      s.nextDueHours != null ? `at ${s.nextDueHours} hrs` : null,
                      s.lastDoneDate ? `last ${s.lastDoneDate}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "no schedule set"}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
