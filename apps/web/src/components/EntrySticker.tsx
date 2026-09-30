import type { LogEntry } from "@/lib/database.types";

export function EntrySticker({ entry, tailNumber, logbookName, widthIn = 4 }: {
  entry: Pick<LogEntry, "id" | "entry_date" | "tach" | "hobbs" | "airframe" | "work_performed" | "signature_name" | "mechanic_cert_number" | "authored_cert_kind" | "authored_cert_rating" | "authored_signed_at" | "authored_digest" | "authored_payload" | "supersedes_entry_id">;
  tailNumber: string; logbookName: string; widthIn?: number;
}) {
  return <article className="sticker mx-auto border border-black bg-white p-3 font-sans text-black" style={{ width: `${widthIn}in`, maxWidth: "100%", fontSize: "10pt", overflowWrap: "anywhere" }}>
    <div className="flex justify-between gap-3 border-b border-black pb-1 font-bold"><span>{tailNumber} · {logbookName}</span><span>{entry.entry_date}</span></div>
    <div className="my-1 flex flex-wrap gap-x-3 text-[9pt]">
      {entry.tach != null && <span>Tach {entry.tach}</span>}
      {entry.hobbs != null && <span>Hobbs {entry.hobbs}</span>}
      {entry.airframe != null && <span>Airframe {entry.airframe}</span>}
    </div>
    <p className="whitespace-pre-wrap leading-snug">{entry.work_performed}</p>
    {typeof entry.authored_payload?.performed_by === "string" && entry.authored_payload.performed_by !== entry.signature_name && <p className="mt-1">Work performed by: {entry.authored_payload.performed_by}</p>}
    {entry.supersedes_entry_id && <p className="mt-1">Corrects signed entry {entry.supersedes_entry_id.slice(0, 8)}.</p>}
    <div className="mt-2 border-t border-black pt-1 text-[9pt]">
      <p>Electronically signed by {entry.signature_name} · {entry.authored_cert_kind?.replaceAll("_", " ")}{entry.authored_cert_rating ? ` (${entry.authored_cert_rating})` : ""} #{entry.mechanic_cert_number}</p>
      <p>Signature approves return to service only for the work described above.</p>
      <p>{entry.authored_signed_at ? new Date(entry.authored_signed_at).toISOString().replace("T", " ").slice(0, 19) : ""} UTC</p>
      <p>MTL ENTRY ID: {entry.id}</p>
      <p>MTL DIGEST: {entry.authored_digest?.slice(0, 16)}</p>
      <p className="mt-1">Physical signature: ______________________________</p>
    </div>
  </article>;
}
