import Link from "next/link";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { openRoom, roomEntries, logRoomView, roomRateLimited, visitorOf, ROOM_ENTRY_LIMIT } from "@/lib/recordRoom";
import { loadSummary, SummaryArticle } from "@/components/MaintenanceSummary";

export const metadata = { title: "Shared aircraft records — MyTailLog", robots: { index: false, follow: false } };

const LOGBOOK_LABEL: Record<string, string> = { airframe: "Airframe", engine: "Engine", prop: "Prop", avionics: "Avionics", other: "Other" };

// A record room as the recipient sees it: no account, read-only, only what the
// owner selected. All reads go through lib/recordRoom.ts (the service client
// bypasses RLS, so that module is the boundary).
export default async function RecordRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { token } = await params;
  const { tab: tabParam, q = "" } = await searchParams;
  const visitor = visitorOf(await headers());
  if (roomRateLimited(visitor)) return <Inactive title="Too many requests" line="Wait a minute, then reload the page." />;
  const room = await openRoom(token);
  if (!room) return <Inactive />;

  const svc = createServiceClient();
  const [{ data: aircraft }, { data: books }, { data: docs }] = await Promise.all([
    svc.from("aircraft").select("*").eq("id", room.aircraft_id).single(),
    svc.from("logbook").select("id, type, title").eq("aircraft_id", room.aircraft_id).in("id", room.logbook_ids.length ? room.logbook_ids : ["00000000-0000-0000-0000-000000000000"]),
    room.document_ids.length
      ? svc.from("document").select("id, type, title, file_name, document_date").eq("aircraft_id", room.aircraft_id).in("id", room.document_ids).order("document_date", { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] as { id: string; type: string; title: string | null; file_name: string | null; document_date: string | null }[] }),
  ]);
  if (!aircraft) return <Inactive />;

  const tabs = [
    ...(room.include_summary ? [{ key: "summary", label: "Summary" }] : []),
    ...(books ?? []).map((b) => ({ key: b.id, label: b.title || LOGBOOK_LABEL[b.type] || b.type })),
    ...(docs?.length ? [{ key: "docs", label: `Documents · ${docs.length}` }] : []),
  ];
  const tab = tabs.find((t) => t.key === tabParam)?.key ?? tabs[0]?.key;
  const base = `/r/${token}`;

  const section = !tab ? null : tab === "summary" ? "summary" : tab === "docs" ? "documents" : `logbook:${tab}`;
  await logRoomView(room, `/${tabParam ?? ""}`, visitor, section);
  const desc = [aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(" ");

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <p className="eyebrow mb-2">
        Records shared by the owner · expires {room.expires_at.slice(0, 10)}
      </p>
      <h1 className="font-display text-[27px] font-semibold leading-none">{aircraft.tail_number}</h1>
      <p className="mt-1 text-[13px] text-dim">
        {desc}
        {aircraft.serial_number ? ` · S/N ${aircraft.serial_number}` : ""}
      </p>
      <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-faint">
        The physical logbooks are the legal record (14 CFR 91.417). This page is an index the owner
        built from them and shows only entries the owner has confirmed. Check the originals before you rely on it.
      </p>

      <nav className="mt-6 flex flex-wrap gap-1.5 border-b border-line pb-2" aria-label="Sections">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`${base}?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-[13px] ${t.key === tab ? "bg-panel2 font-semibold text-ink" : "text-dim hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-5">
        {tab === "summary" && <SummaryArticle data={await loadSummary(svc, aircraft)} />}
        {tab === "docs" && (
          <ul className="divide-y divide-line">
            {(docs ?? []).map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-ink">{d.title || d.file_name || d.type}</span>
                <span className="readout text-[11px] text-faint">{d.document_date ?? ""}</span>
                <a href={`${base}/doc/${d.id}`} target="_blank" rel="noopener noreferrer" className="text-accent">Open ↗</a>
              </li>
            ))}
          </ul>
        )}
        {tab && tab !== "summary" && tab !== "docs" && <Entries room={room} logbookId={tab} q={q} base={base} />}
        {!tab && <p className="text-[13px] text-faint">The owner hasn&apos;t included any records in this link.</p>}
      </div>

      <Footer />
    </main>
  );
}

async function Entries({ room, logbookId, q, base }: { room: NonNullable<Awaited<ReturnType<typeof openRoom>>>; logbookId: string; q: string; base: string }) {
  const entries = await roomEntries(room, logbookId, q);
  return (
    <>
      <form className="mb-4 flex gap-2" action={base}>
        <input type="hidden" name="tab" value={logbookId} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search entries"
          aria-label="Search entries"
          className="min-w-0 flex-1 rounded-md border border-line bg-panel2 px-3 py-2 text-[13px] text-ink outline-hidden focus:border-accent"
        />
        <button className="rounded-md border border-line px-3 py-2 text-[13px] text-dim hover:text-ink">Search</button>
      </form>
      {entries.length ? (
        <ul className="divide-y divide-line">
          {entries.map((e) => (
            <li key={e.id} className="flex gap-3 py-2.5 text-[13px]">
              <span className="readout w-24 shrink-0 text-[12px] text-faint">{e.entry_date ?? "undated"}</span>
              <span className="min-w-0 flex-1 text-dim">
                {[e.description, e.work_performed].filter(Boolean).join(" · ")}
                {e.tach != null && <span className="readout ml-2 text-[11px] text-faint">tach {e.tach}</span>}
              </span>
              {room.include_scans && e.page_id && (
                <a href={`${base}/page/${e.page_id}`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-accent">
                  scan ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-faint">{q ? "No entries match that search." : "No confirmed entries in this logbook yet."}</p>
      )}
      {entries.length === ROOM_ENTRY_LIMIT && (
        <p className="mt-3 text-[12px] text-faint">Showing the newest {ROOM_ENTRY_LIMIT}. Search to find older entries.</p>
      )}
    </>
  );
}

function Inactive({ title = "This link is no longer active", line = "Ask the owner for a new one." }: { title?: string; line?: string }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="font-display text-[22px] font-semibold">{title}</h1>
      <p className="mt-2 text-[13.5px] text-dim">{line}</p>
      <Footer />
    </main>
  );
}

function Footer() {
  return (
    <footer className="mt-10 border-t border-line pt-4 text-[12.5px] text-dim">
      These records are kept with <strong className="text-ink">MyTailLog</strong>, a free logbook tracker for aircraft owners.{" "}
      <a href="https://mytaillog.com/?ref=record-room" className="text-accent">Track your own aircraft →</a>
    </footer>
  );
}
