import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CaptureClient, type CaptureLogbook } from "./CaptureClient";

const LOGBOOK_LABEL: Record<string, string> = {
  airframe: "Airframe",
  engine: "Engine",
  prop: "Propeller",
};

export default async function CapturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS restricts this to the owner; a non-owner id returns no row.
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number")
    .eq("id", id)
    .single();

  if (!aircraft) notFound();

  const { data: logbooks } = await supabase
    .from("logbook")
    .select("id, type, component_ref, title")
    .eq("aircraft_id", id)
    .order("type", { ascending: true });

  // Existing page counts per logbook seed the session's page-sequence counter,
  // so a second capture session continues numbering instead of restarting at 1.
  const { data: pages } = await supabase
    .from("page")
    .select("logbook_id")
    .eq("aircraft_id", id);

  const counts = new Map<string, number>();
  for (const p of pages ?? []) {
    counts.set(p.logbook_id, (counts.get(p.logbook_id) ?? 0) + 1);
  }

  const captureLogbooks: CaptureLogbook[] = (logbooks ?? []).map((lb) => ({
    id: lb.id,
    label: lb.title ?? LOGBOOK_LABEL[lb.type] ?? lb.type,
    componentRef: lb.component_ref,
    existingPages: counts.get(lb.id) ?? 0,
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={`/aircraft/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← {aircraft.tail_number}
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-3xl font-bold">Capture pages</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Photograph logbook pages one at a time. Each shot is checked for blur,
          glare, and resolution, then queued on-device and uploaded when you have
          signal — so you can digitize a whole logbook in a hangar offline.
        </p>
      </header>

      <CaptureClient aircraftId={id} logbooks={captureLogbooks} />
    </main>
  );
}
