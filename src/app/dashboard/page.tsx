import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer } from "@/components/Disclaimer";
import { ImportBackup } from "./ImportBackup";

const ROLE_BADGE: Record<string, string> = {
  editor: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  viewer: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS returns aircraft the user owns OR is shared on.
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number, make, model, year, home_base, enrollment_date, owner_id")
    .order("created_at", { ascending: true });

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

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your aircraft</h1>
        <Link
          href="/profile"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Profile
        </Link>
      </header>

      <div className="mb-6">
        <Disclaimer />
      </div>

      {aircraft && aircraft.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {aircraft.map((a) => {
            const shared = user ? a.owner_id !== user.id : false;
            const role = roleByAircraft.get(a.id) ?? "viewer";
            return (
              <li key={a.id}>
                <Link
                  href={`/aircraft/${a.id}`}
                  className="block rounded-lg border border-slate-200 bg-white px-5 py-4 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold">{a.tail_number}</span>
                    <div className="flex items-center gap-2">
                      {shared && (
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
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 px-5 py-8 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No aircraft enrolled yet.
        </p>
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
