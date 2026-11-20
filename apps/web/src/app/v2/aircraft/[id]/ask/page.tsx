import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { aircraftTail } from "@/lib/v2/landing";
import { Board, BoardHead, Spine } from "@/ui/Board";
import { AskDesk } from "./AskDesk";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Ask the logbook · ${await aircraftTail(id)}` };
}

export default async function AskPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const db = await createClient();
  const context = await getAircraftShellContext(db, id);
  if (!context) notFound();
  return (
    <Board section="books">
      <BoardHead title="Search or ask" />
      <Spine tail={context.reg} context="confirmed entries" href={`/aircraft/${id}/logbooks/map`} />
      <AskDesk aircraftId={id} initialQuestion={q ?? ""} />
    </Board>
  );
}
