import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { aircraftTabs } from "@/lib/v2/tabs";
import { Board, BoardHead, Spine } from "@/ui/Board";
import { EngineHistoryClient } from "./EngineHistoryClient";

export default async function EngineHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await createClient();
  const context = await getAircraftShellContext(db, id);
  if (!context) notFound();
  return (
    <Board section="aircraft">
      <BoardHead
        title="Aircraft"
        subTabs={aircraftTabs(id, "engine-history")}
      />
      <Spine
        tail={context.reg}
        context="Engine history"
        href={`/aircraft/${id}/logbooks/map`}
      />
      <EngineHistoryClient key={id} aircraftId={id} />
    </Board>
  );
}
