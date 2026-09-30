import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyEntryPrintToken } from "@/lib/entry-print-token";
import { logbookLabel } from "@/lib/logbooks";
import { EntrySticker } from "@/components/EntrySticker";
import { PrintNow } from "./PrintNow";

export const dynamic = "force-dynamic";

export default async function MobilePrintPage({ params, searchParams }: {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { entryId } = await params;
  const { token } = await searchParams;
  if (!token || !verifyEntryPrintToken(token, entryId)) notFound();
  const db = createServiceClient();
  const { data: entry } = await db.from("log_entry").select("*").eq("id", entryId).not("authored_signed_at", "is", null).maybeSingle();
  if (!entry) notFound();
  const [{ data: aircraft }, { data: book }] = await Promise.all([
    db.from("aircraft").select("tail_number").eq("id", entry.aircraft_id).maybeSingle(),
    db.from("logbook").select("type, title").eq("id", entry.logbook_id).maybeSingle(),
  ]);
  if (!aircraft) notFound();
  return <main className="mx-auto max-w-3xl p-5">
    <PrintNow />
    <EntrySticker entry={entry} tailNumber={aircraft.tail_number} logbookName={book ? logbookLabel(book.type, book.title) : "Logbook"} />
    <style>{`@media print { .no-print { display: none !important } body { background: white !important } main { max-width: none !important; padding: 0 !important } .sticker { margin: 0 !important; break-inside: avoid; } @page { size: letter; margin: 0.25in; } }`}</style>
  </main>;
}
