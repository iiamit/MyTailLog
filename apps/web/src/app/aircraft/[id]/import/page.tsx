import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logbookLabel } from "@/lib/logbooks";
import { getAircraftRole, canEditRole } from "@/lib/access";
import { extractionConfigured } from "@/lib/extraction/anthropic";
import { ImportCsvClient } from "./ImportCsvClient";

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("owner_id, tail_number")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  // Importing is a write — a viewer has nothing to do here. (The route enforces
  // this too; this only keeps the page out of their navigation.)
  const role = await getAircraftRole(supabase, id, aircraft.owner_id);
  if (!canEditRole(role)) redirect(`/aircraft/${id}`);

  const { data: logbooks } = await supabase
    .from("logbook")
    .select("id, type, title")
    .eq("aircraft_id", id)
    .order("type", { ascending: true });

  const { count: existingEntries } = await supabase
    .from("log_entry")
    .select("id", { count: "exact", head: true })
    .eq("aircraft_id", id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mt-2 mb-6">
        <div className="eyebrow mb-2">Add records</div>
        <h1 className="text-2xl font-bold">
          Import a CSV{aircraft.tail_number ? ` · ${aircraft.tail_number}` : ""}
        </h1>
        <p className="mt-1 text-sm text-dim">
          Coming from another platform, or from your own spreadsheet? Upload the CSV and
          we&apos;ll work out what each <em>column</em> means — you confirm that once, and every
          row is then converted in plain code, the same way every time. Imported entries land{" "}
          <span className="font-medium">unconfirmed</span>, so nothing drives a reminder or a
          forecast until you&apos;ve reviewed it.
        </p>
      </header>

      {!extractionConfigured() ? (
        <p className="rounded-lg border border-dashed border-line px-5 py-10 text-center text-sm text-dim">
          Column mapping needs an AI API key. Add one in Profile, or ask your operator to
          configure the server key.
        </p>
      ) : (
        <ImportCsvClient
          aircraftId={id}
          logbooks={(logbooks ?? []).map((l) => ({ id: l.id, label: logbookLabel(l.type, l.title) }))}
          existingEntries={existingEntries ?? 0}
        />
      )}
    </main>
  );
}
