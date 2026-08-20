import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { AdminGrowthFunnel, AdminUserStat } from "@/lib/database.types";
import { saveSharedAiProvider } from "./actions";

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
  const { data: aiSetting } = await svc.from("app_setting").select("value").eq("key", "shared_ai_provider").maybeSingle();
  const { data: funnelData } = await svc.from("admin_growth_funnel").select("*").single();
  const funnel = funnelData as AdminGrowthFunnel | null;
  const sharedAiProvider = aiSetting?.value ?? "anthropic";

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
  // Signup velocity — the number to watch during launch pushes.
  const joinedWithin = (days: number) => {
    // eslint-disable-next-line react-hooks/purity -- server component: renders once per request, so Date.now() is deterministic here
    const cutoff = Date.now() - days * 86_400_000;
    return rows.filter((r) => r.joined && Date.parse(r.joined) >= cutoff).length;
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-faint hover:text-dim"
      >
        ← Dashboard
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-dim">
          System-wide usage. Aircraft counts are aircraft each user <em>owns</em>{" "}
          (shared-in planes count for the owner).
        </p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Users", totals.users],
          ["New (7d)", joinedWithin(7)],
          ["New (30d)", joinedWithin(30)],
          ["Active", active],
          ["Aircraft", totals.aircraft],
          ["Logbooks", totals.logbooks],
          ["Pages", totals.pages],
          ["Entries", totals.entries],
        ].map(([label, n]) => (
          <div key={label} className="panel p-4">
            <div className="readout text-2xl font-bold">{Number(n).toLocaleString()}</div>
            <div className="text-xs text-faint">{label}</div>
          </div>
        ))}
      </section>

      {funnel && (
        <section className="panel mb-8 p-4">
          <h2 className="font-semibold">Activation funnel</h2>
          <p className="mb-3 text-xs text-faint">Unique accounts reaching each durable milestone. No page-view tracking.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Signed up", funnel.signed_up],
              ["Aircraft", funnel.added_aircraft],
              ["Uploaded", funnel.uploaded_pages],
              ["Reviewed", funnel.reviewed_pages],
              ["Summary", funnel.shared_summary],
            ].map(([label, n]) => (
              <div key={label}>
                <div className="readout text-xl font-bold">{Number(n).toLocaleString()}</div>
                <div className="text-xs text-faint">{label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel mb-8 p-4">
        <h2 className="font-semibold">Shared AI</h2>
        <p className="mb-3 text-xs text-faint">
          Choose which subsidized platform key serves users without their own key. Keys remain deployment secrets.
        </p>
        <form action={saveSharedAiProvider} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>Provider</span>
            <select name="provider" defaultValue={sharedAiProvider} className="rounded-md border border-line bg-panel px-3 py-2">
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg">Save</button>
          <span className="text-xs text-faint">
            Anthropic key: {process.env.ANTHROPIC_API_KEY ? "configured" : "missing"} · OpenAI key: {process.env.OPENAI_API_KEY ? "configured" : "missing"}
          </span>
        </form>
      </section>

      <section className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-panel2 text-left text-xs uppercase tracking-wide text-faint">
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
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-panel2">
                <td className="px-4 py-2">
                  {r.email ?? r.id.slice(0, 8)}
                  {r.is_admin && (
                    <span className="ml-2 rounded-full bg-panel2 px-1.5 py-0.5 text-[10px] text-faint">
                      admin
                    </span>
                  )}
                </td>
                <td className="readout px-3 py-2 text-right tabular-nums">{r.aircraft}</td>
                <td className="readout px-3 py-2 text-right tabular-nums">{r.logbooks}</td>
                <td className="readout px-3 py-2 text-right tabular-nums">{r.pages}</td>
                <td className="readout px-3 py-2 text-right tabular-nums">{r.entries}</td>
                <td className="readout px-4 py-2 text-faint">{r.joined?.slice(0, 10)}</td>
                <td className="readout px-4 py-2 text-faint">
                  {r.last_entry_at?.slice(0, 10) ?? "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-faint">
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
