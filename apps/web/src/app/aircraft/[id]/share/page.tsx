import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShareClient, type ShareRow } from "./ShareClient";
import { RoomsPanel, type RoomRow } from "./RoomsPanel";
import { tryDecryptSecret } from "@/lib/crypto";
import { roomActive, roomUrl } from "@/lib/recordRoom";
import { documentTypeLabel } from "@/lib/documents";

const LOGBOOK_LABEL: Record<string, string> = { airframe: "Airframe", engine: "Engine", prop: "Prop", avionics: "Avionics", other: "Other" };

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ room?: string }>;
}) {
  const { id } = await params;
  const { room: roomLabel = "" } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/aircraft/${id}/share`);

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number, owner_id")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  // Sharing is owner-only; a shared user who navigates here goes back.
  if (aircraft.owner_id !== user.id) redirect(`/aircraft/${id}`);

  const { data: shares } = await supabase
    .from("aircraft_share")
    .select("id, invited_email, role, created_at")
    .eq("aircraft_id", id)
    .order("created_at", { ascending: true });

  const [{ data: rooms }, { data: views }, { data: books }, { data: entries }, { data: docs }] = await Promise.all([
    supabase.from("record_room").select("id, label, token_enc, expires_at, revoked_at").eq("aircraft_id", id).order("created_at", { ascending: false }),
    // shortcut: counts views client-side from the newest 5,000; move to a view if rooms get busy.
    supabase.from("record_room_view").select("room_id, created_at").order("created_at", { ascending: false }).limit(5000),
    supabase.from("logbook").select("id, type, title").eq("aircraft_id", id).order("created_at"),
    supabase.from("log_entry").select("logbook_id, owner_confirmed").eq("aircraft_id", id).is("authored_superseded_by", null),
    supabase.from("document").select("id, type, title, file_name").eq("aircraft_id", id).not("storage_path", "is", null).order("created_at"),
  ]);
  if ((views ?? []).length >= 5000) console.warn("[shortcut-trigger]", { at: "app/aircraft/[id]/share/page.tsx:51", views: views!.length });
  const roomRows: RoomRow[] = (rooms ?? []).map((r) => {
    const mine = (views ?? []).filter((v) => v.room_id === r.id);
    const token = tryDecryptSecret(r.token_enc);
    return {
      id: r.id,
      label: r.label,
      url: token ? roomUrl(token) : null,
      expiresAt: r.expires_at,
      active: roomActive(r),
      revoked: !!r.revoked_at,
      views: mine.length,
      lastView: mine[0]?.created_at ?? null,
    };
  });
  const confirmed = (bookId: string) => (entries ?? []).filter((e) => e.logbook_id === bookId && e.owner_confirmed).length;

  const rows: ShareRow[] = (shares ?? []).map((s) => ({
    id: s.id,
    email: s.invited_email,
    role: s.role,
  }));

  const ownerEmail = user.email ?? "";

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Manage</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">
            Sharing, transfer &amp; delete
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
            Send a read-only link to {aircraft.tail_number}&apos;s records, invite people to view or
            contribute, hand the aircraft to a new owner, or delete it.
          </p>
        </div>
      </header>

      <RoomsPanel
        aircraftId={id}
        rooms={roomRows}
        books={(books ?? []).map((b) => ({ id: b.id, label: b.title || LOGBOOK_LABEL[b.type] || b.type, confirmed: confirmed(b.id) }))}
        docs={(docs ?? []).map((d) => ({ id: d.id, label: d.title || d.file_name || documentTypeLabel(d.type) }))}
        unconfirmed={(entries ?? []).filter((e) => !e.owner_confirmed).length}
        initialLabel={roomLabel.slice(0, 80)}
      />

      <ShareClient aircraftId={id} tail={aircraft.tail_number} shares={rows} ownerEmail={ownerEmail} />
    </main>
  );
}
