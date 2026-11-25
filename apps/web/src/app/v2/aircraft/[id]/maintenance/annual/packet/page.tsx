import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAnnualPacket } from "@/lib/annualPacketLoad";
import { maintTabs } from "@/lib/v2/tabs";
import { Board, BoardHead, Spine } from "@/ui/Board";
import { PacketClient } from "./PacketClient";

export const metadata: Metadata = { title: "Annual packet" };
export default async function AnnualPacketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) notFound();
  const loaded = await loadAnnualPacket(client, id, user.id);
  if (!loaded) notFound();
  return (
    <Board section="maint">
      <BoardHead title="Maintenance" subTabs={maintTabs(id, "annual")} />
      <Spine
        tail={loaded.packet.tail}
        context="annual packet"
        href={`/aircraft/${id}/logbooks/map`}
      />
      <PacketClient aircraftId={id} packet={loaded.packet} />
    </Board>
  );
}
