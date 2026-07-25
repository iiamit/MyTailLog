import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { DocumentsClient } from "./DocumentsClient";

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const ctx = await getAircraftShellContext(supabase, id);
  if (!ctx) notFound();

  const { data: docs } = await supabase
    .from("document")
    .select(
      "id, type, title, reference, document_date, notes, file_name, mime_type, size_bytes, log_entry_id, created_at",
    )
    .eq("aircraft_id", id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Aircraft</div>
        <h1 className="font-display text-[27px] font-semibold leading-none">Records Vault</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-dim">
          The aircraft&apos;s permanent records in one place — airworthiness certificate,
          registration, POH/AFM, weight &amp; balance, STCs, 337s, and more. These sit alongside
          your logbook scans, so the paperwork you&apos;d otherwise dig a binder for is a click away.
        </p>
      </header>

      <DocumentsClient aircraftId={id} canEdit={ctx.canEdit} docs={docs ?? []} />
    </main>
  );
}
