import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { AdminUserStat } from "@/lib/database.types";

export const metadata = { title: "Admin — MyTailLog" };

// System-owner dashboard. Gated to profile.is_admin; the cross-user aggregates
// come from the RLS-bypassing service client (same key as the cron), reading the
// locked-down admin_user_stats view. Identity is verified with the normal
// authed client FIRST, then elevated access is used only for the read.
export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { data: me } = await supabase
    .from("profile")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!me?.is_admin) notFound(); // don't reveal the page to non-admins

  const svc = createServiceClient();
  const { data } = await svc
    .from("admin_user_stats")
    .select("*")
    .order("entries", { ascending: false });
  const rows = (data ?? []) as AdminUserStat[];

  const totals = rows.reduce(
    (t, r) => ({
      users: t.users + 1,
      aircraft: t.aircraft + r.aircraft,
      logbooks: t.logbooks + r.logbooks,
      pages: t.pages + r.pages,
      entries: t.entries + r.entries,
    }),
    { users: 0, aircraft: 0, logbooks: 0, pages: 0, entries: 0 },
  );
  const active = rows.filter((r) => r.aircraft > 0).length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← Dashboard
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          System-wide usage. Aircraft counts are aircraft each user <em>owns</em>{" "}
          (shared-in planes count for the owner).
        </p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Users", totals.users],
          ["Active", active],
          ["Aircraft", totals.aircraft],
          ["Logbooks", totals.logbooks],
          ["Pages", totals.pages],
          ["Entries", totals.entries],
        ].map(([label, n]) => (
          <div
            key={label}
            className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="text-2xl font-bold">{Number(n).toLocaleString()}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
          </div>
        ))}
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-3 py-2 text-right font-medium">Aircraft</th>
              <th className="px-3 py-2 text-right font-medium">Logbooks</th>
              <th className="px-3 py-2 text-right font-medium">Pages</th>
              <th className="px-3 py-2 text-right font-medium">Entries</th>
              <th className="px-4 py-2 font-medium">Joined</th>
              <th className="px-4 py-2 font-medium">Last entry</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                <td className="px-4 py-2">
                  {r.email ?? r.id.slice(0, 8)}
                  {r.is_admin && (
                    <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      admin
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.aircraft}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.logbooks}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.pages}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.entries}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{r.joined?.slice(0, 10)}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                  {r.last_entry_at?.slice(0, 10) ?? "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
