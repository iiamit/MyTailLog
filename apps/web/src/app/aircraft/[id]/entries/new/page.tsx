import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logbookLabel } from "@/lib/logbooks";
import { EntryComposer } from "./EntryComposer";

export default async function NewEntryPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ corrects?: string }>;
}) {
  const { id } = await params;
  const { corrects } = await searchParams;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();
  const [{ data: aircraft }, { data: books }, { data: profile }, { data: credentials }] = await Promise.all([
    db.from("aircraft").select("id, tail_number").eq("id", id).maybeSingle(),
    db.from("logbook").select("id, type, title").eq("aircraft_id", id),
    db.from("profile").select("full_name").eq("id", user.id).maybeSingle(),
    db.from("signing_credential").select("*").eq("user_id", user.id),
  ]);
  if (!aircraft) notFound();
  const { data: canEdit } = await db.rpc("can_edit_aircraft", { target_aircraft: id });
  if (!canEdit) notFound();
  let correctionId: string | null = null;
  if (corrects) {
    const { data } = await db.from("log_entry").select("id").eq("id", corrects).eq("aircraft_id", id).not("authored_signed_at", "is", null).maybeSingle();
    correctionId = data?.id ?? null;
  }
  return <EntryComposer
    aircraftId={id} tailNumber={aircraft.tail_number}
    books={(books ?? []).map((b) => ({ id: b.id, type: b.type, label: logbookLabel(b.type, b.title) }))}
    fullName={profile?.full_name ?? ""} credentials={credentials ?? []}
    correctionId={correctionId}
  />;
}
