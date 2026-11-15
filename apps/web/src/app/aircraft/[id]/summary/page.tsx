import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/PrintButton";
import { ShareSummaryButton } from "@/components/ShareSummaryButton";
import { loadSummary, SummaryArticle } from "@/components/MaintenanceSummary";

export const metadata = { title: "Maintenance summary — MyTailLog" };

// ===========================================================================
// The one-document maintenance summary: what an owner hands a buyer, an
// insurer, or an IA at annual. Deliberately NOT the full records export (that
// lives at ../export and runs to every logbook entry) — this is the top sheet.
//
// ponytail: no PDF library. The page is print-first and globals.css re-points
// the design tokens to a light ramp under @media print, so the browser's
// "Save as PDF" is the exporter.
// ===========================================================================

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase.from("aircraft").select("*").eq("id", id).single();
  if (!aircraft) notFound();

  const data = await loadSummary(supabase, aircraft);
  const { shareText } = data;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <div className="eyebrow mb-2">Manage</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">Maintenance summary</h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
            The one-page picture of the aircraft — status, open squawks, ADs, what&apos;s
            coming due, installed equipment and current weight &amp; balance. Print it
            for a buyer, an insurer, or your IA at annual. For the full entry-by-entry
            record, use the records export on the Export &amp; backup page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShareSummaryButton title={`${aircraft.tail_number} maintenance summary`} text={shareText} />
          <PrintButton />
        </div>
      </header>

      <SummaryArticle data={data} refTag="summary" />
    </main>
  );
}
