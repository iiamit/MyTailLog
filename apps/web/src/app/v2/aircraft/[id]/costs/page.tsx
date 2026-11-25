import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { Board, BoardHead, Leaves, Leaf, Spine } from "@/ui/Board";
import { aircraftTabs } from "@/lib/v2/tabs";
import { CostsClient } from "./CostsClient";
export default async function CostsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    db = await createClient(),
    ctx = await getAircraftShellContext(db, id);
  if (!ctx) notFound();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { data: aircraft } = await db
    .from("aircraft")
    .select("owner_id")
    .eq("id", id)
    .single();
  return (
    <Board section="aircraft">
      <BoardHead title="Aircraft" subTabs={aircraftTabs(id, "costs")} />
      <Spine
        tail={ctx.reg}
        context="Ownership costs"
        href={`/aircraft/${id}/logbooks/map`}
      />
      {user?.id === aircraft?.owner_id ? (
        <CostsClient key={id} aircraftId={id} />
      ) : (
        <Leaves>
          <Leaf className="col-span-full" label="Ownership costs">
            <p>
              Financial records are private to the aircraft owner. Your
              maintenance access does not include expenses.
            </p>
          </Leaf>
        </Leaves>
      )}
    </Board>
  );
}
