import { ownerJson } from "@/lib/owner/body";
import { isDeepStrictEqual } from "node:util";
import { NextResponse } from "next/server";
import { ownerAccess, ownerError } from "@/lib/owner/access";
import { buildEngineHistory } from "@/lib/owner/engineHistory";
import { loadRecordPages } from "@/lib/loadLogEntries";
import { loadLogEntries } from "@/lib/loadLogEntries";
import { ownerRows } from "@/lib/owner/load";
import { observationInput } from "@/lib/owner/observations";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    a = await ownerAccess(req, id);
  if (a.response) return a.response;
  try {
    const [components, events, entries, samples, additions, resets, pages] =
      await Promise.all([
        ownerRows(a.supabase, "component", id),
        ownerRows(a.supabase, "engine_observation", id),
        loadLogEntries(a.supabase, id),
        ownerRows(a.supabase, "oil_analysis_sample", id),
        ownerRows(a.supabase, "oil_addition", id),
        ownerRows(a.supabase, "meter_reset", id),
        loadRecordPages(a.supabase, id),
      ]);
    return NextResponse.json(
      {
        ...buildEngineHistory(
          components,
          events,
          entries,
          samples,
          additions,
          resets,
          a.canEdit,
        ),
        sources: {
          entries: entries
            .filter((e) => !e.authored_superseded_by)
            .map((e) => ({
              id: e.id,
              date: e.entry_date,
              description: (e.description ?? e.work_performed ?? "").slice(
                0,
                160,
              ),
              pageId: e.page_id,
            })),
          pages: pages.map((p) => ({
            id: p.id,
            label: `Page ${p.page_sequence ?? "unnumbered"}`,
          })),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return ownerError(e, 503);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    a = await ownerAccess(req, id, "edit");
  if (a.response) return a.response;
  try {
    const row = observationInput(await ownerJson(req));
    const { data: old, error: readError } = await a.supabase
      .from("engine_observation")
      .select("*")
      .eq("aircraft_id", id)
      .eq("id", row.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (old) {
      if (
        Object.entries(row).some(
          ([k, v]) => !isDeepStrictEqual(old[k as keyof typeof old], v),
        )
      )
        return ownerError(
          new Error(
            "This observation identifier already has different details.",
          ),
          409,
        );
      return NextResponse.json({ event: old, replayed: true });
    }
    const { data, error } = await a.supabase
      .from("engine_observation")
      .insert({ ...row, aircraft_id: id })
      .select("*")
      .single();
    if (error?.code === "23505") {
      const { data: replay } = await a.supabase
        .from("engine_observation")
        .select("*")
        .eq("aircraft_id", id)
        .eq("id", row.id)
        .maybeSingle();
      if (
        replay &&
        Object.entries(row).every(([k, v]) =>
          isDeepStrictEqual(replay[k as keyof typeof replay], v),
        )
      )
        return NextResponse.json({ event: replay, replayed: true });
      return ownerError(
        new Error("This observation identifier already has different details."),
        409,
      );
    }
    if (error) throw new Error(error.message);
    return NextResponse.json({ event: data });
  } catch (e) {
    return ownerError(e);
  }
}
