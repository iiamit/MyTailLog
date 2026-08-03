import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  prepareAi, runWithAiContext, logAiUsage, reserveAiCall, releaseAiReservation, aiBudgetMessage,
} from "@/lib/extraction/aiContext";
import { TEXT_MODEL } from "@/lib/extraction/anthropic";
import { parseCsv } from "@/lib/csv/parse";
import {
  proposeMapping, sanitizeMapping, coerceRows, detectForMapping, type Mapping,
} from "@/lib/csv/map";
import type { DateFormat } from "@/lib/csv/dates";

export const runtime = "nodejs";
export const maxDuration = 120;

// CSV only. The scan routes accept PDF/JPEG/PNG and that restriction is
// deliberate there — this route is the one place a spreadsheet is accepted, and
// it accepts nothing else. Browsers disagree on the type of a .csv drag
// (text/csv, application/csv, or Excel's own), so the extension is accepted as
// corroboration — but the CONTENT still has to parse as a table below.
const ACCEPTED_TYPES = ["text/csv", "application/csv", "text/tab-separated-values"];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

const STEPS = ["analyze", "preview", "import"] as const;
type Step = (typeof STEPS)[number];

/**
 * CSV import of maintenance log entries, in three steps against the same file:
 *
 *   analyze — parse + ONE AI call proposing a column→field mapping
 *   preview — apply a confirmed mapping deterministically, report the counts
 *   import  — the same transform, then write the rows
 *
 * The file is re-posted each step rather than parked on the server: it's capped
 * at 5 MB, and a stateless route has no upload to expire, clean up, or leak.
 *
 * Imported entries land owner_confirmed = false — that flag gates reminders and
 * forecasts, and a foreign spreadsheet has not earned it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // RLS: no row means no access (or wrong aircraft).
  const { data: aircraft } = await supabase.from("aircraft").select("id").eq("id", id).single();
  if (!aircraft) return NextResponse.json({ error: "Aircraft not found." }, { status: 404 });

  // Import is a WRITE. RLS scopes rows, not columns, and a viewer can read this
  // aircraft — the edit gate is what stops them adding history to it.
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: id });
  if (!canEdit) {
    return NextResponse.json({ error: "You don't have edit access to this aircraft." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const rawStep = String(form?.get("step") ?? "analyze");
  const step: Step = (STEPS as readonly string[]).includes(rawStep) ? (rawStep as Step) : "analyze";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach a CSV file." }, { status: 400 });
  }
  // Browsers disagree on a .csv drag's type (text/csv, application/csv, or
  // Excel's own), so a csv/tsv extension corroborates — but one of the two must
  // hold, and the CONTENT still has to parse as a table below.
  if (!ACCEPTED_TYPES.includes(file.type) && !/\.(csv|tsv)$/.test(file.name.toLowerCase())) {
    return NextResponse.json(
      { error: "Unsupported file. Export your spreadsheet as CSV and upload that." },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That file is over the 5 MB limit. Split it and import the halves." },
      { status: 413 },
    );
  }

  const parsed = parseCsv(await file.text());
  if (parsed.header.length === 0 || parsed.rows.length === 0) {
    return NextResponse.json(
      { error: "That file has no data rows — it needs a header row and at least one row under it." },
      { status: 422 },
    );
  }
  if (parsed.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `That file has ${parsed.rows.length} rows; the limit is ${MAX_ROWS}. Split it and import the halves.` },
      { status: 413 },
    );
  }

  // --- Step 1: propose a mapping (the only paid call) ----------------------
  if (step === "analyze") {
    const gate = await prepareAi(supabase, user.id);
    if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const reservationId = await reserveAiCall(user.id, gate.ownKey);
    if (!reservationId) {
      return NextResponse.json({ error: aiBudgetMessage(gate.ownKey) }, { status: 429 });
    }
    let columns;
    try {
      columns = await runWithAiContext(
        { apiKey: gate.apiKey, onUsage: (u) => logAiUsage(user.id, "csv-import", u, gate.ownKey) },
        () => proposeMapping(parsed),
      );
    } catch (err) {
      console.error("csv mapping failed", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Couldn't read the columns of that file." },
        { status: 502 },
      );
    } finally {
      await releaseAiReservation(reservationId);
    }

    const mapping = columns.map((c) => c.field);
    return NextResponse.json({
      ok: true,
      delimiter: parsed.delimiter,
      header: parsed.header,
      sampleRows: parsed.rows.slice(0, 5).map((r) => r.slice(0, parsed.header.length)),
      rowCount: parsed.rows.length,
      columns,
      dates: detectForMapping(parsed, mapping),
      model: TEXT_MODEL,
    });
  }

  // --- Steps 2 & 3: the deterministic transform ----------------------------
  let rawMapping: unknown = [];
  try {
    rawMapping = JSON.parse(String(form?.get("mapping") ?? "[]"));
  } catch {
    return NextResponse.json({ error: "Malformed column mapping." }, { status: 400 });
  }
  const mapping: Mapping = sanitizeMapping(rawMapping, parsed.header.length);
  if (!mapping.includes("entry_date")) {
    return NextResponse.json(
      { error: "Map one column to Date. Without it there's nothing to place these entries on." },
      { status: 422 },
    );
  }
  if (!mapping.includes("description") && !mapping.includes("work_performed")) {
    return NextResponse.json(
      { error: "Map one column to Description (or Work performed) — an entry needs to say what was done." },
      { status: 422 },
    );
  }

  // The date reading is settled by the whole column, and only asked about when
  // every single row reads both ways. A user answer is accepted ONLY then.
  const detection = detectForMapping(parsed, mapping)!;
  let format: DateFormat;
  if (detection.kind === "resolved") {
    format = detection.format;
  } else if (detection.kind === "ambiguous") {
    const chosen = String(form?.get("dateFormat") ?? "");
    if (chosen !== "mdy" && chosen !== "dmy") {
      return NextResponse.json({ error: "Choose which way to read the dates.", dates: detection }, { status: 422 });
    }
    format = chosen;
  } else {
    return NextResponse.json(
      {
        error:
          detection.kind === "conflict"
            ? `That date column is inconsistent — row ${detection.mdyRows[0]} only reads as month/day and row ${detection.dmyRows[0]} only as day/month. Fix the dates in the source file and re-export.`
            : "That column doesn't hold dates we can read. Map the right column, or re-export the dates as YYYY-MM-DD.",
        dates: detection,
      },
      { status: 422 },
    );
  }

  const { entries, errors } = coerceRows(parsed, mapping, format);

  if (step === "preview") {
    return NextResponse.json({
      ok: true,
      dateFormat: format,
      willCreate: entries.length,
      skipped: errors.length,
      errors: errors.slice(0, 50),
      preview: entries.slice(0, 10),
    });
  }

  // --- Step 3: write -------------------------------------------------------
  const logbookId = String(form?.get("logbookId") ?? "");
  // logbook_id is NOT NULL — which logbook this file belongs to is a required
  // user choice, never something to infer from a spreadsheet.
  const { data: logbook } = await supabase
    .from("logbook")
    .select("id")
    .eq("id", logbookId)
    .eq("aircraft_id", id)
    .maybeSingle();
  if (!logbook) {
    return NextResponse.json({ error: "Choose which logbook these entries belong to." }, { status: 422 });
  }
  if (entries.length === 0) {
    return NextResponse.json({ error: "No importable rows in that file.", errors: errors.slice(0, 50) }, { status: 422 });
  }

  // page_id stays null — an imported entry has no scan behind it, and inventing
  // a fake page would put a phantom in the pages list forever.
  const rows = entries.map((e) => ({
    ...e,
    aircraft_id: id,
    logbook_id: logbook.id,
    page_id: null,
    owner_confirmed: false,
    confidence: null,
    field_confidence: null,
    field_boxes: null,
    extraction_model: null,
  }));

  let inserted = 0;
  // Chunked so one oversized statement can't stall the request; RLS applies to
  // every chunk under the caller's own session.
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await supabase.from("log_entry").insert(rows.slice(i, i + 500)).select("id");
    if (error) {
      return NextResponse.json(
        { error: `Imported ${inserted} entries, then stopped: ${error.message}` },
        { status: 500 },
      );
    }
    inserted += data?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    inserted,
    skipped: errors.length,
    errors: errors.slice(0, 50),
    dateFormat: format,
  });
}
