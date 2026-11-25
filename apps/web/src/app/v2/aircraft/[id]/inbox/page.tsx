import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { Board, BoardHead, Spine } from "@/ui/Board";
import { InboxClient } from "./InboxClient";
export default async function InboxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    db = await createClient(),
    ctx = await getAircraftShellContext(db, id);
  if (!ctx) notFound();
  return (
    <Board section="docs">
      <BoardHead
        title="Document inbox"
        actions={<Link href={`/aircraft/${id}/documents`}>Documents</Link>}
      />
      <Spine
        tail={ctx.reg}
        context="Upload once, review before adding"
        href={`/aircraft/${id}/logbooks/map`}
      />
      <InboxClient key={id} aircraftId={id} />
    </Board>
  );
}
