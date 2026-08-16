import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LOGBOOK_LABEL } from "@/lib/logbooks";
import { CaptureClient, type CaptureLogbook } from "./CaptureClient";

export default async function CapturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ logbook?: string }>;
}) {
  const { id } = await params;
  // ?logbook=<id> arrives from the "Capture into this logbook" button on the
  // aircraft page, so you land here with the right book already chosen instead
  // of picking it out of a dropdown you've just navigated away from.
  const { logbook: requestedLogbook } = await searchParams;
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
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Add records</div>
        <h1 className="font-display text-[27px] font-semibold leading-none">
          Capture pages
        </h1>
        <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
          Photograph logbook pages one at a time. Each shot is checked for blur,
          glare, and resolution, then queued on-device and uploaded when you have
          signal — so you can digitize a whole logbook in a hangar offline.
        </p>
      </header>

      <CaptureClient
        aircraftId={id}
        logbooks={captureLogbooks}
        initialLogbookId={
          captureLogbooks.some((lb) => lb.id === requestedLogbook) ? requestedLogbook : undefined
        }
        tailNumber={aircraft.tail_number}
      />
    </main>
  );
}
