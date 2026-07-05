import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AskClient } from "./AskClient";

export default async function AskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Records</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">
            Ask your logbook
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
            Ask a plain-English question about {aircraft.tail_number}&apos;s history.
            Answers are drawn only from your extracted entries and cite the entries
            they came from — verify against the physical logbooks.
          </p>
        </div>
      </header>

      <AskClient
        aircraftId={id}
        configured={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </main>
  );
}
