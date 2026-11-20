import type { Metadata } from "next";
import { Board, BoardHead, Spine } from "@/ui/Board";
import { Button } from "@/ui/Button";
import { aircraftTail } from "@/lib/v2/landing";
import { entryComposerProps } from "@/lib/entryComposerProps";
import { EntryComposer } from "@/app/aircraft/[id]/entries/new/EntryComposer";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Write an entry · ${await aircraftTail(id)}` };
}

export default async function NewEntryPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ corrects?: string; book?: string; template?: string; closes?: string }>;
}) {
  const { id } = await params;
  const { corrects, book, template, closes } = await searchParams;
  const props = await entryComposerProps(id, corrects, { book, template, closes });
  return <Board section="books">
    <BoardHead title={corrects ? "Correct a signed entry" : "Write an entry"} actions={<Button variant="on-board" href={`/aircraft/${id}/logbooks/list`}>Back to entries</Button>} />
    <Spine tail={props.tailNumber} context="today" href={`/aircraft/${id}/logbooks/map`} />
    <EntryComposer {...props} v2 />
  </Board>;
}
