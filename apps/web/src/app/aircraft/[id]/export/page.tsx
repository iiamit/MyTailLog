import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logbookLabel } from "@/lib/logbooks";
import { getCurrentHours } from "@/lib/aircraftHours";
import { urgencyOf } from "@/lib/compliance";
import { effectiveNextDue } from "@/lib/maintenance";
import { AD_STATUS_LABEL } from "@/lib/compliance";
import { FormattedEntry } from "@/components/FormattedEntry";
import type { AdStatus } from "@/lib/database.types";
import { PrintBar } from "./PrintBar";

export default async function ExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("*")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  const { data: logbooks } = await supabase
    .from("logbook")
    .select("id, type, title")
    .eq("aircraft_id", id);
  const label = new Map(
    (logbooks ?? []).map((lb) => [lb.id, logbookLabel(lb.type, lb.title)]),
  );

  const { data: entries } = await supabase
    .from("log_entry")
    .select("id, entry_date, logbook_id, hobbs, tach, description, work_performed, signature_name")
    .eq("aircraft_id", id)
    .order("entry_date", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  const { data: ads } = await supabase
    .from("ad_compliance")
    .select("kind, reference, title, status, complied_date, next_due_date, next_due_hours")
    .eq("aircraft_id", id)
    .order("reference", { ascending: true });

  const { data: components } = await supabase
    .from("component")
    .select("name, make, part_number, serial_number, install_date, removal_date, is_installed")
    .eq("aircraft_id", id)
    .order("is_installed", { ascending: false })
    .order("name", { ascending: true });

  const { data: mxItems } = await supabase
    .from("maintenance_item")
    .select("*")
    .eq("aircraft_id", id);

  const currentHours = await getCurrentHours(supabase, id, {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
    airframe: aircraft.enrollment_airframe,
    date: aircraft.enrollment_date,
  });

  const mxList = mxItems ?? [];
  const forecast = mxList
    .map((m) => {
      const due = effectiveNextDue(m, mxList);
      return { label: m.label, due, urgency: urgencyOf(due, currentHours) };
    })
    .sort((a, b) => (a.due.next_due_date ?? "9999").localeCompare(b.due.next_due_date ?? "9999"));

  const H2 = "mt-8 mb-2 border-b border-line pb-1 text-lg font-bold";

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <div className="eyebrow mb-2">Manage</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">
            Export &amp; backup
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
            Your data is yours. Print a status report, pull a spreadsheet, or
            take a complete re-importable archive — no lock-in.
          </p>
        </div>
      </header>

      <PrintBar aircraftId={id} />

      {/* Printable report — hidden on screen (the cards above are the on-screen
          view); rendered for "Generate PDF" / Cmd+P, which prints this page. */}
      <div className="hidden print:block">
        <header>
          <h1 className="text-2xl font-bold">{aircraft.tail_number} — records export</h1>
          <p className="text-sm text-dim">
            {[aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(" ")}
            {aircraft.serial_number ? ` · S/N ${aircraft.serial_number}` : ""}
          </p>
          <p className="mt-1 text-xs text-faint">
            Generated {new Date().toISOString().slice(0, 10)} · current hours ≈{" "}
            {currentHours ?? "—"}
            {aircraft.engine_serials?.length ? ` · engine S/N ${aircraft.engine_serials.join(", ")}` : ""}
            {aircraft.prop_serials?.length ? ` · prop S/N ${aircraft.prop_serials.join(", ")}` : ""}
          </p>
          <p className="mt-2 text-xs italic text-faint">
            This is an index of the physical logbooks, not the legal maintenance
            record or an airworthiness determination (14 CFR 91.417). Verify
            against the original logbooks.
          </p>
        </header>

        {/* AD / SB compliance */}
      <h2 className={H2}>AD / SB compliance ({ads?.length ?? 0})</h2>
      {ads && ads.length > 0 ? (
        <table className="w-full text-left text-xs">
          <thead className="text-faint">
            <tr>
              <th className="py-1 pr-2">Ref</th>
              <th className="py-1 pr-2">Title</th>
              <th className="py-1 pr-2">Status</th>
              <th className="py-1 pr-2">Complied</th>
              <th className="py-1">Next due</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((a, i) => (
              <tr key={i} className="border-t border-line align-top">
                <td className="py-1 pr-2 font-medium">{a.kind.toUpperCase()} {a.reference}</td>
                <td className="py-1 pr-2">{a.title ?? ""}</td>
                <td className="py-1 pr-2">{AD_STATUS_LABEL[a.status as AdStatus] ?? a.status}</td>
                <td className="py-1 pr-2">{a.complied_date ?? ""}</td>
                <td className="py-1">
                  {[a.next_due_date, a.next_due_hours != null ? `${a.next_due_hours} hrs` : null].filter(Boolean).join(" / ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-faint">None tracked.</p>
      )}

      {/* Equipment */}
      <h2 className={H2}>Equipment ({components?.length ?? 0})</h2>
      {components && components.length > 0 ? (
        <table className="w-full text-left text-xs">
          <thead className="text-faint">
            <tr>
              <th className="py-1 pr-2">Component</th>
              <th className="py-1 pr-2">Make</th>
              <th className="py-1 pr-2">P/N · S/N</th>
              <th className="py-1 pr-2">Installed</th>
              <th className="py-1">State</th>
            </tr>
          </thead>
          <tbody>
            {components.map((c, i) => (
              <tr key={i} className="border-t border-line align-top">
                <td className="py-1 pr-2 font-medium">{c.name}</td>
                <td className="py-1 pr-2">{c.make ?? ""}</td>
                <td className="py-1 pr-2">{[c.part_number, c.serial_number].filter(Boolean).join(" · ")}</td>
                <td className="py-1 pr-2">{c.install_date ?? ""}</td>
                <td className="py-1">{c.is_installed ? "installed" : `removed ${c.removal_date ?? ""}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-faint">None tracked.</p>
      )}

      {/* Maintenance forecast */}
      <h2 className={H2}>Maintenance forecast ({forecast.length})</h2>
      {forecast.length > 0 ? (
        <table className="w-full text-left text-xs">
          <thead className="text-faint">
            <tr>
              <th className="py-1 pr-2">Item</th>
              <th className="py-1 pr-2">Next due</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {forecast.map((f, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1 pr-2 font-medium">{f.label}</td>
                <td className="py-1 pr-2">
                  {[f.due.next_due_date, f.due.next_due_hours != null ? `${f.due.next_due_hours} hrs` : null].filter(Boolean).join(" / ") || "—"}
                </td>
                <td className="py-1">{f.urgency === "none" ? "" : f.urgency.replace("_", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-faint">No items.</p>
      )}

      {/* Logbook entries */}
      <h2 className={H2}>Logbook entries ({entries?.length ?? 0})</h2>
      <div className="flex flex-col divide-y divide-line">
        {(entries ?? []).map((e) => (
          <div key={e.id} className="break-inside-avoid py-2">
            <div className="flex flex-wrap items-baseline gap-x-3 text-xs text-faint">
              <span className="font-medium text-dim">
                {e.entry_date ?? "undated"}
              </span>
              <span>{label.get(e.logbook_id) ?? ""}</span>
              {e.hobbs != null && <span>Hobbs {e.hobbs}</span>}
              {e.tach != null && <span>Tach {e.tach}</span>}
              {e.signature_name && <span>· {e.signature_name}</span>}
            </div>
            <FormattedEntry text={[e.description, e.work_performed].filter(Boolean).join("\n")} />
          </div>
        ))}
      </div>
      </div>
    </main>
  );
}
