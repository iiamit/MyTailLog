import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { openLink, viewIpHash } from "@/lib/mechanicLink";
import { loadDueInput } from "@/lib/due/load";
import { computeStatus, fmtDate, type DueItem } from "@/lib/due/engine";
import { BOOK_NAME, clip, entryTitle } from "@/lib/v2/books";
import { relatedEntries } from "@/lib/v2/squawks";
import { StatusMark } from "@/ui/Marks";

export const metadata = { title: "Shared squawks — MyTailLog", robots: { index: false, follow: false } };

const SEVERITY: Record<string, string> = { low: "Low", medium: "Watch", high: "Ground" };
const SEVERITY_LINE: Record<string, string> = {
  low: "Fix at the next convenient visit.",
  medium: "The owner checks it before each flight.",
  high: "The owner has chosen not to fly until it is looked at.",
};

// The mechanic link page (W-MAINT-03 "Mechanic link page", 09 §4.12): no account, read-only, only what
// the owner chose. The service client bypasses RLS, so every read is scoped to the link's aircraft
// and to the squawks or visit the link names. Each open is counted (not the creator's own previews).
// shortcut: related entries show their text and page label, no page crops yet (08 "related entries"); add the crop
// when a mechanic says the label alone isn't enough to find the entry.
export default async function MechanicLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const svc = createServiceClient();
  const link = await openLink(svc, token);
  if (!link) return <Ended />;
  const { data: aircraft } = await svc.from("aircraft").select("tail_number, year, make, model, owner_id").eq("id", link.aircraft_id).maybeSingle();
  if (!aircraft) return <Ended />;

  const { data: { user } } = await (await createClient()).auth.getUser();
  if (user?.id !== link.created_by) {
    const h = await headers();
    await svc.from("mechanic_link_view").insert({
      link_id: link.id, ip_hash: viewIpHash(h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null),
      user_agent: h.get("user-agent")?.slice(0, 200) ?? null,
    });
  }
  const { data: owner } = await svc.from("profile").select("full_name").eq("id", aircraft.owner_id).maybeSingle();
  const base = `/m/${token}`;

  // Squawks: the chosen ones, or those riding on the visit.
  let squawkIds = link.squawk_ids;
  let visitBlock: React.ReactNode = null;
  if (link.kind === "visit") {
    const [{ data: visit }, { data: rows }] = await Promise.all([
      svc.from("planned_visit").select("id, week_of, visit_date, airport, provider_id").eq("id", link.visit_id ?? "").eq("aircraft_id", link.aircraft_id).maybeSingle(),
      svc.from("planned_visit_item").select("item_key").eq("visit_id", link.visit_id ?? "").eq("aircraft_id", link.aircraft_id),
    ]);
    if (!visit) return <Ended />;
    const keys = (rows ?? []).map((r) => r.item_key);
    squawkIds = keys.filter((k) => k.startsWith("squawk:")).map((k) => k.slice(7));
    const loaded = await loadDueInput(svc, link.aircraft_id, link.created_by);
    const items = loaded ? computeStatus(loaded.input, loaded.today).items.filter((i) => keys.includes(i.key)) : [];
    const { data: provider } = visit.provider_id
      ? await svc.from("service_provider").select("name, airport").eq("id", visit.provider_id).maybeSingle()
      : { data: null };
    const place = [provider?.name, provider?.airport ?? visit.airport].filter(Boolean).join(", ");
    visitBlock = (
      <section className="mt-6 border-t-2 border-ink pt-4">
        <h2 className="text-heading">Week of {fmtDate(visit.week_of)}{place ? ` at ${place}` : ""}</h2>
        {visit.visit_date && <p className="text-small text-ink-3">On {fmtDate(visit.visit_date)}</p>}
        <ul className="mt-3 divide-y divide-rule">
          {items.map((i) => <VisitItem key={i.key} item={i} />)}
        </ul>
      </section>
    );
  }

  const [{ data: squawks }, { data: photos }] = await Promise.all([
    squawkIds.length
      ? svc.from("squawk").select("id, description, severity, status, reported_at, reporter_name").eq("aircraft_id", link.aircraft_id).in("id", squawkIds).order("reported_at")
      : Promise.resolve({ data: [] as { id: string; description: string; severity: string; status: string; reported_at: string; reporter_name: string | null }[] }),
    link.include_photos && squawkIds.length
      ? svc.from("squawk_photo").select("id, squawk_id").eq("aircraft_id", link.aircraft_id).in("squawk_id", squawkIds).order("created_at")
      : Promise.resolve({ data: [] as { id: string; squawk_id: string }[] }),
  ]);

  // Related entries: confirmed entries of this aircraft only, matched to each squawk's words.
  const [{ data: entries }, { data: books }] = squawks?.length
    ? await Promise.all([
        svc.from("log_entry").select("id, entry_date, description, work_performed, logbook_id, entry_kind")
          .eq("aircraft_id", link.aircraft_id).eq("owner_confirmed", true).is("replaced_by_entry_id", null),
        svc.from("logbook").select("id, type").eq("aircraft_id", link.aircraft_id),
      ])
    : [{ data: [] }, { data: [] }];
  const bookOf = new Map((books ?? []).map((b) => [b.id, BOOK_NAME[b.type as string] ?? "Other"]));
  const kind = [aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(" ");

  return (
    <main className="mx-auto min-h-full max-w-[760px] px-4 py-8 sm:py-12">
      <article className="rounded-leaf bg-leaf px-6 pt-7 pb-6 text-ink shadow-leaf sm:px-9">
        <p className="text-caption font-bold tracking-wide text-ink-3 uppercase">MyTailLog · for your mechanic</p>
        <h1 className="mt-2 text-board-title">
          {aircraft.tail_number}{kind ? `, ${kind}` : ""}
        </h1>
        <p className="mt-2 text-body text-ink-2">
          Shared by {owner?.full_name || "the owner"} for {link.recipient_label}
        </p>
        <p className="text-small text-ink-3">Read-only · open until {fmtDate(link.expires_at.slice(0, 10))}</p>
        {visitBlock}
        {(squawks ?? []).length > 0 && (
          <h2 className="mt-7 text-section">{link.kind === "visit" ? "Squawks for this visit" : (squawks ?? []).length === 1 ? "Squawk" : "Squawks"}</h2>
        )}
        {(squawks ?? []).map((s, i) => {
          const related = relatedEntries(s.description, entries ?? [], 4).filter((e) => e.entry_date! <= s.reported_at.slice(0, 10));
          const shots = (photos ?? []).filter((p) => p.squawk_id === s.id);
          return (
            <section key={s.id} className={`py-5 ${i === 0 ? "border-t-2 border-ink" : "border-t border-rule"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="max-w-[52ch] text-heading">{s.description}</h3>
                <span
                  className={`rounded-[3px] px-2 py-0.5 text-caption font-bold ${
                    s.severity === "high" ? "bg-alarm text-on-alarm" : s.severity === "medium" ? "border border-ink text-ink" : "text-ink-2"
                  }`}
                >
                  {SEVERITY[s.severity] ?? s.severity}
                </span>
              </div>
              <p className="mt-1 text-small text-ink-3">
                Reported {fmtDate(s.reported_at.slice(0, 10))}
                {link.include_reporter && s.reporter_name ? ` by ${s.reporter_name}` : ""}
                {s.status === "resolved" ? " · Resolved" : ""}
                {SEVERITY_LINE[s.severity] ? ` · ${SEVERITY_LINE[s.severity]}` : ""}
              </p>
              {shots.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2.5">
                  {shots.map((p, n) => (
                    <li key={p.id}>
                      <a href={`${base}/photo/${p.id}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-[var(--radius-s)]">
                        {/* eslint-disable-next-line @next/next/no-img-element -- private, uncached, link-authorized image */}
                        <img src={`${base}/photo/${p.id}?thumb`} alt={`Photo ${n + 1} of: ${s.description}. Opens full size.`} width={120} height={90} className="h-[90px] w-[120px] bg-leaf-2 object-cover" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {related.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-label text-ink-2">Related entries</h4>
                  <ul className="mt-1.5 space-y-2">
                    {related.map((e) => (
                      <li key={e.id} className="text-small">
                        <span className="font-semibold text-ink">{fmtDate(e.entry_date!)} · {entryTitle(e)}</span>
                        <span className="text-ink-3"> · {bookOf.get(e.logbook_id) ?? "Logbook"}</span>
                        {(e.work_performed || e.description) && (
                          <span className="block font-paper text-ink-2">&ldquo;{clip((e.work_performed || e.description)!, 180)}&rdquo;</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
        <footer className="mt-6 border-t border-rule pt-4 text-small text-ink-3">
          The paper logbooks are the legal record. This page shows what the owner chose to share.
        </footer>
      </article>
    </main>
  );
}

function VisitItem({ item }: { item: DueItem }) {
  const limits = [
    item.calendar ? `by ${fmtDate(item.calendar.dueDate)}` : null,
    item.hours ? `at ${item.hours.meter} ${item.hours.dueAt.toFixed(1)} (${item.hours.remaining.toFixed(1)} h left)` : null,
  ].filter(Boolean).join(" or ");
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-body-strong">{item.label}</span>
        <span className="block text-small text-ink-3">{item.rule}{limits ? ` · due ${limits}` : ""}</span>
        {item.lastDone?.date && (
          <span className="block text-small text-ink-3">
            Last done {fmtDate(item.lastDone.date)}{item.lastDone.pageLabel ? `, ${item.lastDone.pageLabel}` : ""}
          </span>
        )}
      </span>
      <StatusMark kind={item.advisory ? "advisory" : item.status} compact />
    </li>
  );
}

function Ended() {
  return (
    <main className="mx-auto max-w-[560px] px-4 py-16">
      <div className="rounded-leaf bg-leaf px-8 py-10 text-center text-ink shadow-leaf">
        <h1 className="text-heading">This link has ended. Ask the owner for a new one.</h1>
      </div>
    </main>
  );
}
