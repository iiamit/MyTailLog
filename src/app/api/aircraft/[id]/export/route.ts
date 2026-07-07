import { createClient } from "@/lib/supabase/server";
import { logbookLabel } from "@/lib/logbooks";

export const runtime = "nodejs";

// CSV export of a data set (?type=entries|ad|equipment|maintenance). Plain text
// generation — no dependency. RLS scopes every query to the owner.

function csv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    let s = v == null ? "" : String(v);
    // Neutralize spreadsheet formula injection: a cell starting with = + - @
    // (or tab/CR) is executed as a formula by Excel/Sheets. A shared-aircraft
    // editor could plant =HYPERLINK(...) etc. in a description. Prefix with '.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const type = new URL(req.url).searchParams.get("type") ?? "entries";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number")
    .eq("id", id)
    .single();
  if (!aircraft) return new Response("Aircraft not found.", { status: 404 });

  let rows: (string | number | null)[][];

  if (type === "entries") {
    const { data: logbooks } = await supabase
      .from("logbook")
      .select("id, type, title")
      .eq("aircraft_id", id);
    const label = new Map(
      (logbooks ?? []).map((lb) => [lb.id, logbookLabel(lb.type, lb.title)]),
    );
    const { data } = await supabase
      .from("log_entry")
      .select("entry_date, logbook_id, hobbs, tach, description, work_performed, parts, signature_name, mechanic_cert_number, ad_refs, sb_refs, owner_confirmed")
      .eq("aircraft_id", id)
      .order("entry_date", { ascending: true, nullsFirst: true });
    rows = [
      ["Date", "Logbook", "Hobbs", "Tach", "Description", "Work performed", "Parts", "Signature", "Cert #", "AD refs", "SB refs", "Confirmed"],
      ...(data ?? []).map((e) => [
        e.entry_date, label.get(e.logbook_id) ?? "", e.hobbs, e.tach,
        e.description, e.work_performed, e.parts, e.signature_name, e.mechanic_cert_number,
        (e.ad_refs ?? []).join("; "), (e.sb_refs ?? []).join("; "),
        e.owner_confirmed ? "yes" : "no",
      ]),
    ];
  } else if (type === "ad") {
    const { data } = await supabase
      .from("ad_compliance")
      .select("kind, reference, title, status, recurring, interval_hours, interval_months, method, complied_date, complied_hours, next_due_date, next_due_hours, reason, status_changed_on")
      .eq("aircraft_id", id)
      .order("reference", { ascending: true });
    rows = [
      ["Kind", "Reference", "Title", "Status", "Recurring", "Interval hrs", "Interval mo", "Method", "Complied date", "Complied hrs", "Next due date", "Next due hrs", "Reason", "Status changed"],
      ...(data ?? []).map((a) => [
        a.kind, a.reference, a.title, a.status, a.recurring ? "yes" : "no",
        a.interval_hours, a.interval_months, a.method, a.complied_date, a.complied_hours,
        a.next_due_date, a.next_due_hours, a.reason, a.status_changed_on,
      ]),
    ];
  } else if (type === "equipment") {
    const { data } = await supabase
      .from("component")
      .select("name, make, category, part_number, serial_number, install_date, removal_date, is_installed, life_limit_value, life_limit_unit, notes")
      .eq("aircraft_id", id)
      .order("name", { ascending: true });
    rows = [
      ["Name", "Make", "Category", "Part #", "Serial #", "Installed date", "Removed date", "Installed?", "Life limit", "Life unit", "Notes"],
      ...(data ?? []).map((c) => [
        c.name, c.make, c.category, c.part_number, c.serial_number, c.install_date,
        c.removal_date, c.is_installed ? "yes" : "no", c.life_limit_value, c.life_limit_unit, c.notes,
      ]),
    ];
  } else if (type === "maintenance") {
    const { data } = await supabase
      .from("maintenance_item")
      .select("label, kind, regulatory, interval_months, interval_hours, last_done_date, last_done_hours, next_due_date, next_due_hours, notes")
      .eq("aircraft_id", id)
      .order("label", { ascending: true });
    rows = [
      ["Item", "Kind", "Regulatory", "Interval mo", "Interval hrs", "Last done date", "Last done hrs", "Next due date", "Next due hrs", "Notes"],
      ...(data ?? []).map((m) => [
        m.label, m.kind, m.regulatory ? "yes" : "no", m.interval_months, m.interval_hours,
        m.last_done_date, m.last_done_hours, m.next_due_date, m.next_due_hours, m.notes,
      ]),
    ];
  } else {
    return new Response("Unknown export type.", { status: 400 });
  }

  const filename = `${aircraft.tail_number}-${type}.csv`;
  return new Response(csv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
