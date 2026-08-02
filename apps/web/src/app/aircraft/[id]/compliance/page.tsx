import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AdKind, AdReference } from "@/lib/database.types";
import { getCurrentMeters } from "@/lib/aircraftHours";
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
    .select("id, tail_number, enrollment_hobbs, enrollment_tach, enrollment_airframe, enrollment_date")
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

  // Collect every AD/SB number referenced across entries, to surface any that
  // aren't tracked yet.
  const { data: entries } = await supabase
    .from("log_entry")
    .select("ad_refs, sb_refs")
    .eq("aircraft_id", id);

  const refs = new Map<string, UntrackedRef>();
  for (const e of entries ?? []) {
    for (const r of e.ad_refs ?? []) refs.set(`ad:${r}`, { kind: "ad" as AdKind, reference: r });
    for (const r of e.sb_refs ?? []) refs.set(`sb:${r}`, { kind: "sb" as AdKind, reference: r });
  }
  // ADs run on TACH (the airworthiness meter), plus the utilization rate that
  // turns an hours-remaining figure into an approximate calendar date.
  const { tach, utilization } = await getCurrentMeters(supabase, id, {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
    airframe: aircraft.enrollment_airframe,
    date: aircraft.enrollment_date,
  });
  const currentHours = tach.tach;

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
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Airworthiness</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">
            AD / SB compliance
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
            Airworthiness Directives and Service Bulletins found in your logs,
            with compliance method and next due. This is your private tracking
            record, not an airworthiness determination — the physical logbooks
            and the FAA remain authoritative.
          </p>
        </div>
        <Link
          href={`/aircraft/${id}/compliance/explore`}
          className="rounded-md border border-line2 bg-panel2 px-4 py-2 text-sm font-medium text-ink hover:border-accent"
        >
          Explore applicable ADs →
        </Link>
      </header>

      <ComplianceClient
        aircraftId={id}
        records={records ?? []}
        untracked={untracked}
        currentHours={currentHours}
        utilization={utilization}
        adReferences={adReferences}
        components={components ?? []}
      />
    </main>
  );
}
