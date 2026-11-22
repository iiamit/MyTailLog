import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logbookLabel } from "@/lib/logbooks";
import { dueSnapshot } from "@/lib/due/load";

/** Shared access gate and form data for the old and new entry composers. */
export async function entryComposerProps(id: string, corrects?: string, opts: { book?: string; template?: string; closes?: string } = {}) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();
  const [{ data: aircraft }, { data: books }, { data: profile }, { data: credentials }, { data: squawks }] = await Promise.all([
    db.from("aircraft").select("id, tail_number").eq("id", id).maybeSingle(),
    db.from("logbook").select("id, type, title").eq("aircraft_id", id),
    db.from("profile").select("full_name").eq("id", user.id).maybeSingle(),
    db.from("signing_credential").select("*").eq("user_id", user.id),
    db.from("squawk").select("id, description, updated_at").eq("aircraft_id", id).eq("status", "open").order("created_at", { ascending: false }).limit(100),
  ]);
  if (!aircraft) notFound();
  const { data: canEdit } = await db.rpc("can_edit_aircraft", { target_aircraft: id });
  if (!canEdit) notFound();
  let correctionId: string | null = null;
  if (corrects) {
    const { data } = await db.from("log_entry").select("id").eq("id", corrects).eq("aircraft_id", id).not("authored_signed_at", "is", null).maybeSingle();
    correctionId = data?.id ?? null;
  }
  const due = await dueSnapshot(id, user.id).catch(() => null);
  const initialMeters = {
    tach: due?.snap.meters.tach.face?.toString() ?? "",
    hobbs: due?.snap.meters.hobbs.face?.toString() ?? "",
    airframe: due?.snap.meters.airframe.face?.toString() ?? "",
  };
  return {
    aircraftId: id, tailNumber: aircraft.tail_number,
    books: (books ?? []).map((b) => ({ id: b.id, type: b.type, label: logbookLabel(b.type, b.title) })),
    fullName: profile?.full_name ?? "", credentials: credentials ?? [], correctionId, initialMeters,
    initialBookId: opts.book, initialTemplateId: opts.template, initialSquawkId: opts.closes,
    openSquawks: squawks ?? [],
  };
}
