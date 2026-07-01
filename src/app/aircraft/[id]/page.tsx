import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer } from "@/components/Disclaimer";

const LOGBOOK_LABEL: Record<string, string> = {
  airframe: "Airframe",
  engine: "Engine",
  prop: "Propeller",
};

export default async function AircraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS restricts this to the owner; a non-owner id simply returns no row.
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("*")
    .eq("id", id)
    .single();

  if (!aircraft) notFound();

  const { data: logbooks } = await supabase
    .from("logbook")
    .select("id, type, component_ref, title")
    .eq("aircraft_id", id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← All aircraft
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-3xl font-bold">{aircraft.tail_number}</h1>
        <p className="text-slate-600 dark:text-slate-300">
          {[aircraft.year, aircraft.make, aircraft.model]
            .filter(Boolean)
            .join(" ") || "Details not set"}
          {aircraft.serial_number ? ` · S/N ${aircraft.serial_number}` : ""}
        </p>
      </header>

      <div className="mb-8">
        <Disclaimer />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Logbooks</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {logbooks?.map((lb) => (
            <li
              key={lb.id}
              className="rounded-lg border border-slate-200 bg-white px-4 py-5 text-center dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="font-medium">
                {lb.title ?? LOGBOOK_LABEL[lb.type] ?? lb.type}
              </div>
              {lb.component_ref && (
                <div className="text-xs text-slate-500">{lb.component_ref}</div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Page capture, extraction, and the unified timeline are coming next in
        Phase 1. This aircraft and its logbooks are ready to receive pages.
      </section>
    </main>
  );
}
