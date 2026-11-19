import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { openLink, viewIpHash } from "@/lib/mechanicLink";
import { loadDueInput } from "@/lib/due/load";
import { computeStatus, fmtDate, type DueItem } from "@/lib/due/engine";

export const metadata = { title: "Shared squawks — MyTailLog", robots: { index: false, follow: false } };

const SEVERITY: Record<string, string> = { low: "Low", medium: "Watch", high: "Ground" };

// The mechanic link page (W-MAINT-03 "Mechanic link page", 09 §4.12): no account, read-only, only what
// the owner chose. The service client bypasses RLS, so every read is scoped to the link's aircraft
// and to the squawks or visit the link names. Each open is counted (not the creator's own previews).
// shortcut: no related-entry page crops yet (08 "related entries"); the visit shows the last-done page label.
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
      <section className="mt-6">
        <h2 className="font-display text-[19px] font-semibold">Week of {fmtDate(visit.week_of)}{place ? ` at ${place}` : ""}</h2>
        {visit.visit_date && <p className="text-[13px] text-dim">On {fmtDate(visit.visit_date)}</p>}
        <ul className="mt-3 divide-y divide-line">
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

  return (
    <main className="mx-auto max-w-[760px] px-6 py-8">
      <h1 className="font-display text-[27px] font-semibold leading-none">
        {aircraft.tail_number}{[aircraft.year, aircraft.make, aircraft.model].some(Boolean) ? `, ${[aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(" ")}` : ""}
      </h1>
      <p className="mt-2 text-[13px] text-dim">
        Shared by {owner?.full_name || "the owner"} for {link.recipient_label} · Read-only · open until {fmtDate(link.expires_at.slice(0, 10))}
      </p>
      {visitBlock}
      {(squawks ?? []).map((s) => (
        <section key={s.id} className="mt-6 border-t border-line pt-4">
          <h2 className="text-[16px] font-semibold text-ink">{s.description}</h2>
          <p className="text-[13px] text-dim">
            {SEVERITY[s.severity] ?? s.severity} · Reported {fmtDate(s.reported_at.slice(0, 10))}
            {link.include_reporter && s.reporter_name ? ` by ${s.reporter_name}` : ""}
            {s.status === "resolved" ? " · Resolved" : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(photos ?? []).filter((p) => p.squawk_id === s.id).map((p) => (
              <a key={p.id} href={`${base}/photo/${p.id}`} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, uncached, link-authorized image */}
                <img src={`${base}/photo/${p.id}?thumb`} alt={`Photo of: ${s.description}`} width={120} height={90} className="h-[90px] w-[120px] rounded object-cover" />
              </a>
            ))}
          </div>
        </section>
      ))}
      <footer className="mt-10 border-t border-line pt-4 text-[12.5px] text-dim">
        The paper logbooks are the legal record. This page shows what the owner chose to share.
      </footer>
    </main>
  );
}

function VisitItem({ item }: { item: DueItem }) {
  const limits = [
    item.calendar ? `by ${fmtDate(item.calendar.dueDate)}` : null,
    item.hours ? `at ${item.hours.meter} ${item.hours.dueAt.toFixed(1)} (${item.hours.remaining.toFixed(1)} h left)` : null,
  ].filter(Boolean).join(" or ");
  return (
    <li className="py-2 text-[13.5px]">
      <span className="font-semibold text-ink">{item.label}</span>
      <span className="text-dim"> · {item.rule}{limits ? ` · due ${limits}` : ""}</span>
      {item.lastDone?.date && (
        <span className="block text-[12.5px] text-faint">
          Last done {fmtDate(item.lastDone.date)}{item.lastDone.pageLabel ? `, ${item.lastDone.pageLabel}` : ""}
        </span>
      )}
    </li>
  );
}

function Ended() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="font-display text-[22px] font-semibold">This link has ended. Ask the owner for a new one.</h1>
    </main>
  );
}
