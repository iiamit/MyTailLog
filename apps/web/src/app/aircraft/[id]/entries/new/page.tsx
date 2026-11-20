import { entryComposerProps } from "@/lib/entryComposerProps";
import { EntryComposer } from "./EntryComposer";

export default async function NewEntryPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ corrects?: string }>;
}) {
  const { id } = await params;
  const { corrects } = await searchParams;
  return <EntryComposer {...await entryComposerProps(id, corrects)} />;
}
