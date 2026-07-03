import Link from "next/link";
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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={`/aircraft/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← {aircraft.tail_number}
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-bold">Ask your logbook</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Ask a plain-English question about {aircraft.tail_number}&apos;s history.
          Answers are drawn only from your extracted entries and cite the entries
          they came from — verify against the physical logbooks.
        </p>
      </header>

      <AskClient
        aircraftId={id}
        configured={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </main>
  );
}
