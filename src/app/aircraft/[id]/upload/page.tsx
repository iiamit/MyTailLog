import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CaptureLogbook } from "../capture/CaptureClient";
import { UploadClient } from "./UploadClient";

const LOGBOOK_LABEL: Record<string, string> = {
  airframe: "Airframe",
  engine: "Engine",
  prop: "Propeller",
};

export default async function UploadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

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

  const { data: pages } = await supabase
    .from("page")
    .select("logbook_id")
    .eq("aircraft_id", id);

  const counts = new Map<string, number>();
  for (const p of pages ?? []) {
    counts.set(p.logbook_id, (counts.get(p.logbook_id) ?? 0) + 1);
  }

  const uploadLogbooks: CaptureLogbook[] = (logbooks ?? []).map((lb) => ({
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
        <h1 className="text-3xl font-bold">Upload scans</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Already have your logbooks scanned? Upload PDFs or images. Multi-page
          PDFs are split into individual pages, queued on-device, and uploaded —
          the same pipeline as camera capture, so pages are reviewed and
          extracted together later.
        </p>
      </header>

      <UploadClient aircraftId={id} logbooks={uploadLogbooks} />
    </main>
  );
}
