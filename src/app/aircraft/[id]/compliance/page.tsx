import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AdKind, AdReference } from "@/lib/database.types";
import { ComplianceClient, type UntrackedRef } from "./ComplianceClient";

export default async function CompliancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number, enrollment_hobbs")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  const { data: records } = await supabase
    .from("ad_compliance")
    .select("*")
    .eq("aircraft_id", id)
    .order("reference", { ascending: true });

  // Installed/removed components, so an AD can be linked to the equipment it
  // concerns (removing that equipment then retires the AD).
  const { data: components } = await supabase
    .from("component")
    .select("id, name, make, is_installed")
    .eq("aircraft_id", id)
    .order("name", { ascending: true });

  // Current hours = highest hobbs seen in the logs, else the enrollment hobbs.
  // Also collect every AD/SB number referenced across entries, to surface any
  // that aren't tracked yet.
  const { data: entries } = await supabase
    .from("log_entry")
    .select("hobbs, ad_refs, sb_refs")
    .eq("aircraft_id", id);

  let maxHobbs: number | null = null;
  const refs = new Map<string, UntrackedRef>();
  for (const e of entries ?? []) {
    if (e.hobbs != null && (maxHobbs == null || e.hobbs > maxHobbs)) maxHobbs = e.hobbs;
    for (const r of e.ad_refs ?? []) refs.set(`ad:${r}`, { kind: "ad" as AdKind, reference: r });
    for (const r of e.sb_refs ?? []) refs.set(`sb:${r}`, { kind: "sb" as AdKind, reference: r });
  }
  const currentHours = maxHobbs ?? aircraft.enrollment_hobbs ?? null;

  const tracked = new Set((records ?? []).map((r) => `${r.kind}:${r.reference}`));
  const untracked = [...refs.entries()]
    .filter(([key]) => !tracked.has(key))
    .map(([, v]) => v);

  // Official FR references attached to any of these records.
  const refIds = [
    ...new Set((records ?? []).map((r) => r.ad_reference_id).filter(Boolean)),
  ] as string[];
  const adReferences: Record<string, AdReference> = {};
  if (refIds.length > 0) {
    const { data: refRows } = await supabase
      .from("ad_reference")
      .select("*")
      .in("id", refIds);
    for (const ref of refRows ?? []) adReferences[ref.id] = ref;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={`/aircraft/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← {aircraft.tail_number}
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-bold">AD / SB compliance</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Track Airworthiness Directives and Service Bulletins for this aircraft,
          their compliance status, and when recurring ones come due. This is your
          private tracking record, not an airworthiness determination — the
          physical logbooks and the FAA remain authoritative.
        </p>
      </header>

      <ComplianceClient
        aircraftId={id}
        records={records ?? []}
        untracked={untracked}
        currentHours={currentHours}
        adReferences={adReferences}
        components={components ?? []}
      />
    </main>
  );
}
