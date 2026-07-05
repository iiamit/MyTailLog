import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { AircraftShell } from "@/components/shell/AircraftShell";

// Wraps every /aircraft/[id]/* page in the persistent shell (context top bar +
// nav rail), loading the shared context once. 404s if the caller has no access.
export default async function AircraftLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const context = await getAircraftShellContext(supabase, id);
  if (!context) notFound();

  return (
    <AircraftShell context={context}>
      {children}
      <footer className="mx-auto mb-8 mt-2 flex max-w-6xl items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3.5 sm:mx-5 lg:mx-9">
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border border-line2 text-[12px] text-annun-amber">
          i
        </span>
        <span className="text-[11.5px] leading-relaxed text-faint">
          <b className="text-dim">Index, not the record.</b> The physical logbooks remain the system of
          record per 14 CFR 91.417. Every value is OCR-derived — confirm against the paper logbook
          before you rely on it.
        </span>
      </footer>
    </AircraftShell>
  );
}
