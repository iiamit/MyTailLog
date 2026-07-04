import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer } from "@/components/Disclaimer";
import { ImportBackup } from "./ImportBackup";
import { CameraIcon, SparklesIcon, CheckIcon } from "@/components/icons";

const ROLE_BADGE: Record<string, string> = {
  editor: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  viewer: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const today = () => new Date().toISOString().slice(0, 10);

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS returns aircraft the user owns OR is shared on.
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number, make, model, year, home_base, enrollment_date, owner_id, is_demo")
    .order("created_at", { ascending: true });

  const list = aircraft ?? [];

  // Role per shared aircraft, for the badge.
  const email = user?.email?.toLowerCase();
  const roleByAircraft = new Map<string, string>();
  if (email) {
    const { data: shares } = await supabase
      .from("aircraft_share")
      .select("aircraft_id, role")
      .eq("invited_email", email);
    for (const s of shares ?? []) roleByAircraft.set(s.aircraft_id, s.role);
  }

  // At-a-glance health per aircraft (RLS scopes all three to accessible rows).
  const entryCount = new Map<string, number>();
  const needsReview = new Map<string, number>();
  const annualStatus = new Map<string, "current" | "overdue">();
  if (list.length > 0) {
    const [{ data: entries }, { data: pages }, { data: annuals }] = await Promise.all([
      supabase.from("log_entry").select("aircraft_id"),
      supabase.from("page").select("aircraft_id, review_status, extraction_status"),
      supabase.from("maintenance_item").select("aircraft_id, next_due_date").eq("kind", "annual"),
    ]);
    for (const e of entries ?? [])
      entryCount.set(e.aircraft_id, (entryCount.get(e.aircraft_id) ?? 0) + 1);
    for (const p of pages ?? []) {
      if (p.extraction_status === "extracted" && p.review_status === "unreviewed") {
        needsReview.set(p.aircraft_id, (needsReview.get(p.aircraft_id) ?? 0) + 1);
      }
    }
    const t = today();
    for (const a of annuals ?? []) {
      if (!a.next_due_date) continue;
      annualStatus.set(a.aircraft_id, a.next_due_date < t ? "overdue" : "current");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Your aircraft</h1>
      </header>

      <div className="mb-6">
        <Disclaimer />
      </div>

      {list.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {list.map((a) => {
            const shared = user ? a.owner_id !== user.id : false;
            const role = roleByAircraft.get(a.id) ?? "viewer";
            const entries = entryCount.get(a.id) ?? 0;
            const review = needsReview.get(a.id) ?? 0;
            const annual = annualStatus.get(a.id);
            return (
              <li key={a.id}>
                <Link
                  href={`/aircraft/${a.id}`}
                  className="block rounded-lg border border-slate-200 bg-white px-5 py-4 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold">{a.tail_number}</span>
                    <div className="flex items-center gap-2">
                      {a.is_demo && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Demo
                        </span>
                      )}
                      {shared && !a.is_demo && (
                        <span className={`rounded-full px-2 py-0.5 text-xs ${ROLE_BADGE[role] ?? ROLE_BADGE.viewer}`}>
                          shared · {role === "editor" ? "contribute" : "view"}
                        </span>
                      )}
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        enrolled {a.enrollment_date}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {[a.year, a.make, a.model].filter(Boolean).join(" ") || "Details not set"}
                    {a.home_base ? ` · ${a.home_base}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {entries} {entries === 1 ? "entry" : "entries"}
                    </span>
                    {annual === "overdue" ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        annual overdue
                      </span>
                    ) : annual === "current" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        annual current
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        annual not set
                      </span>
                    )}
                    {review > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        {review} to review
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 px-6 py-8 dark:border-slate-700">
          <p className="text-center font-medium">Welcome to MyTailLog</p>
          <p className="mx-auto mt-1 max-w-md text-center text-sm text-slate-500 dark:text-slate-400">
            Turn your paper logbooks into a searchable, gap-auditable maintenance
            index. Here&apos;s how it works:
          </p>
          <ol className="mx-auto mt-5 grid max-w-xl gap-3 sm:grid-cols-3">
            {[
              { icon: <CheckIcon />, title: "1. Enroll", body: "Add your aircraft (FAA registry lookup fills the details)." },
              { icon: <CameraIcon />, title: "2. Capture", body: "Photograph or upload scans of your logbook pages." },
              { icon: <SparklesIcon />, title: "3. Extract & ask", body: "AI reads the entries; review, then ask your logbook anything." },
            ].map((s) => (
              <li key={s.title} className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-1 flex items-center gap-1.5 font-medium">
                  <span className="text-slate-400">{s.icon}</span>
                  {s.title}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/aircraft/enroll"
          className="inline-block rounded-md bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Enroll an aircraft
        </Link>
        <ImportBackup />
      </div>
    </main>
  );
}
