import { ownerJson } from "@/lib/owner/body";
import { NextResponse } from "next/server";
import { ownerAccess, ownerError } from "@/lib/owner/access";
import { loadLogEntries } from "@/lib/loadLogEntries";
import { periodUsage } from "@/lib/owner/usage";
import { ownerRows } from "@/lib/owner/load";
import {
  expenseInput,
  expenseTotals,
  expensesCsv,
  isDate,
} from "@/lib/owner/validation";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    a = await ownerAccess(req, id, "owner");
  if (a.response) return a.response;
  const q = new URL(req.url).searchParams,
    from = q.get("from"),
    to = q.get("to");
  if (
    (from && !isDate(from)) ||
    (to && !isDate(to)) ||
    (from && to && from > to)
  )
    return ownerError(new Error("Choose a valid reporting period."));
  let data, denominator, entries, documents;
  try {
    data = (
      await ownerRows(a.supabase, "aircraft_expense", id, { from, to })
    ).sort((a, b) => b.date.localeCompare(a.date));
    const [readings, resets] = await Promise.all([
      ownerRows(a.supabase, "hours_reading", id),
      ownerRows(a.supabase, "meter_reset", id),
    ]);
    denominator = periodUsage(readings, resets, from, to);
    const [entryRows, docs] = await Promise.all([
      loadLogEntries(a.supabase, id),
      ownerRows(a.supabase, "document", id),
    ]);
    entries = entryRows
      .filter((e) => e.owner_confirmed && !e.authored_superseded_by)
      .sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? ""))
      .map((e) => ({
        id: e.id,
        date: e.entry_date,
        description: (e.description ?? e.work_performed ?? "").slice(0, 160),
      }));
    documents = docs.map((d) => ({
      id: d.id,
      title: d.title ?? d.file_name ?? "Document",
    }));
  } catch (e) {
    return ownerError(e, 503);
  }
  if (q.get("format") === "csv")
    return new Response(expensesCsv(data ?? []), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="aircraft-expenses.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  let totals;
  try {
    totals = expenseTotals(data ?? []);
  } catch (e) {
    return ownerError(e, 413);
  }
  return NextResponse.json(
    {
      expenses: data ?? [],
      totals: totals.map((t) => ({
        ...t,
        actual_per_hour_minor: denominator.hours
          ? Math.round(t.actual_minor / denominator.hours)
          : null,
      })),
      canManage: true,
      entries,
      documents,
      period: { from, to },
      denominator,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    a = await ownerAccess(req, id, "owner");
  if (a.response) return a.response;
  try {
    const row = expenseInput(await ownerJson(req));
    const { data: existing, error: readError } = await a.supabase
      .from("aircraft_expense")
      .select("*")
      .eq("aircraft_id", id)
      .eq("id", row.id)
      .maybeSingle();
    if (readError) return ownerError(new Error(readError.message), 503);
    if (existing) {
      if (
        Object.entries(row).some(
          ([k, v]) => existing[k as keyof typeof existing] !== v,
        )
      )
        return ownerError(
          new Error("This expense identifier already has different details."),
          409,
        );
      return NextResponse.json({ expense: existing, replayed: true });
    }
    const { data, error } = await a.supabase
      .from("aircraft_expense")
      .insert({ ...row, aircraft_id: id })
      .select("*")
      .single();
    if (error?.code === "23505") {
      const { data: replay } = await a.supabase
        .from("aircraft_expense")
        .select("*")
        .eq("aircraft_id", id)
        .eq("id", row.id)
        .maybeSingle();
      if (
        replay &&
        Object.entries(row).every(
          ([k, v]) => replay[k as keyof typeof replay] === v,
        )
      )
        return NextResponse.json({ expense: replay, replayed: true });
      return ownerError(
        new Error("This expense identifier already has different details."),
        409,
      );
    }
    if (error)
      return ownerError(
        new Error(error.message),
        error.code === "23505" ? 409 : 400,
      );
    return NextResponse.json({ expense: data });
  } catch (e) {
    return ownerError(e);
  }
}
