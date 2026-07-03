import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftRole, canEditRole } from "@/lib/access";
import { staleWBChanges, usefulLoad, type EquipChange } from "@/lib/weightBalance";
import { WeightBalanceClient } from "./WeightBalanceClient";

export default async function WeightBalancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number, owner_id")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  const role = await getAircraftRole(supabase, id, aircraft.owner_id);
  const canEdit = canEditRole(role);

  const { data: revisions } = await supabase
    .from("weight_balance")
    .select("*")
    .eq("aircraft_id", id)
    .order("revision_date", { ascending: false });

  // Equipment changes (log-derived) that may not be reflected in the current W&B.
  const { data: components } = await supabase
    .from("component")
    .select("name, install_date, removal_date")
    .eq("aircraft_id", id);

  const changes: EquipChange[] = [];
  for (const c of components ?? []) {
    if (c.install_date) changes.push({ name: c.name, date: c.install_date, kind: "install" });
    if (c.removal_date) changes.push({ name: c.name, date: c.removal_date, kind: "removal" });
  }

  const rows = revisions ?? [];
  const current = rows[0] ?? null;
  const latestWBDate = current?.revision_date ?? null;
  const stale = staleWBChanges(latestWBDate, changes);
  const current_useful_load = current
    ? usefulLoad(current.empty_weight, current.max_gross_weight)
    : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={`/aircraft/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← {aircraft.tail_number}
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-bold">Weight &amp; balance</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          A history of your W&amp;B revisions and the current empty weight and CG.
          This is an index, not a loading calculator or the legal W&amp;B record —
          confirm against the aircraft&apos;s official weight &amp; balance data.
        </p>
      </header>

      <WeightBalanceClient
        aircraftId={id}
        revisions={rows}
        current={current}
        currentUsefulLoad={current_useful_load}
        stale={stale}
        latestWBDate={latestWBDate}
        canEdit={canEdit}
      />
    </main>
  );
}
