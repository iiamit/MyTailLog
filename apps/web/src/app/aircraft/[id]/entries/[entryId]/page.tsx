import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logbookLabel } from "@/lib/logbooks";
import { StickerControls } from "./StickerControls";

export default async function SignedEntryPage({ params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params;
  const db = await createClient();
  const [{ data: aircraft }, { data: entry }] = await Promise.all([
    db.from("aircraft").select("id, tail_number").eq("id", id).maybeSingle(),
    db.from("log_entry").select("*").eq("id", entryId).eq("aircraft_id", id).not("authored_signed_at", "is", null).maybeSingle(),
  ]);
  if (!aircraft || !entry) notFound();
  const [{ data: book }, { data: scans }] = await Promise.all([
    db.from("logbook").select("type, title").eq("id", entry.logbook_id).maybeSingle(),
    db.from("signed_entry_scan").select("page_id").eq("entry_id", entryId),
  ]);
  return <main className="mx-auto max-w-3xl px-6 py-8">
    <div className="no-print">
      <Link href={`/aircraft/${id}/timeline`} className="text-sm text-accent">← Logbook timeline</Link>
      <h1 className="mt-5 font-display text-2xl font-semibold">Signed logbook entry</h1>
      {entry.authored_superseded_by && <p className="mt-2 text-sm text-dim">This entry has been superseded by a signed correction.</p>}
      <p className="mt-2 text-sm text-dim">This entry is locked. To fix an error, create a correcting entry that points back to it.</p>
      {scans?.length ? <p className="mt-2 text-sm text-dim">Physical logbook scan: {scans.map((scan, i) => <span key={scan.page_id}>{i > 0 ? ", " : ""}<Link className="text-accent underline" href={`/aircraft/${id}/pages/${scan.page_id}/review`}>view page {i + 1}</Link></span>)}</p> : <p className="mt-2 text-sm text-dim">No physical page scan linked yet.</p>}
      <div className="my-6 flex flex-wrap gap-3">
        <Link className="rounded border border-line px-3 py-2 text-sm text-accent" href={`/aircraft/${id}/entries/new?corrects=${entryId}`}>Create correction</Link>
      </div>
    </div>
    <StickerControls entry={entry} tailNumber={aircraft.tail_number} logbookName={book ? logbookLabel(book.type, book.title) : "Logbook"} />
  </main>;
}
