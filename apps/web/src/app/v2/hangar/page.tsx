import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { dueSnapshot } from "@/lib/due/load";
import { Board, BoardHead } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { StatusMark } from "@/ui/Marks";
import { HangarShell, loadHangarUser } from "@/ui/HangarShell";
import { HeardAboutWell, ImportCard, RemoveFromHangar } from "./HangarClient";

export const metadata: Metadata = { title: "Hangar" };

type Card = {
  id: string;
  tail: string;
  role: "owner" | "editor" | "viewer";
  demo: boolean;
  typeLine: string;
  verdict: string | null;
  overdue: number | null;
  dueSoon: number | null;
  waiting: number;
  confirmed: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const ROLE_LINE = { owner: "you are the owner", editor: "you can add and confirm entries", viewer: "you can view" } as const;

/**
 * W-HANGAR-01 Hangar: every aircraft as a binder on the shelf with its verdict and what waits, plus add and import.
 * Zero aircraft is the first-run screen: "Add an aircraft" first, the demo after it.
 * shortcut: the card's life strip and Facts list are left out (a map model per aircraft per visit); add them with a
 * fleet summary endpoint.
 */
export default async function HangarPage() {
  const { supabase, user, profile, fleet } = await loadHangarUser("/hangar");
  const email = user.email?.toLowerCase() ?? "";

  const [{ data: shares }, { data: entries }, { data: me }] = await Promise.all([
    email ? supabase.from("aircraft_share").select("aircraft_id, role").ilike("invited_email", email) : Promise.resolve({ data: [] }),
    supabase.from("log_entry").select("aircraft_id, page_id, owner_confirmed"),
    supabase.from("profile").select("heard_about, created_at").eq("id", user.id).maybeSingle(),
  ]);
  const roleOf = new Map((shares ?? []).map((s) => [s.aircraft_id, s.role]));
  // eslint-disable-next-line react-hooks/purity -- server component: one timestamp for this request
  const askHeard = !!me && me.heard_about == null && Date.parse(me.created_at) > Date.now() - 14 * 86_400_000;

  const cards: Card[] = await Promise.all(
    fleet.map(async (a) => {
      const role: Card["role"] = a.owner_id === user.id ? "owner" : roleOf.get(a.id) === "editor" ? "editor" : "viewer";
      const mine = (entries ?? []).filter((e) => e.aircraft_id === a.id);
      const due = await dueSnapshot(a.id, user.id).catch(() => null);
      const type = [a.year, a.make, a.model].filter(Boolean).join(" ");
      return {
        id: a.id,
        tail: a.tail_number,
        role,
        demo: Boolean(a.is_demo),
        typeLine: `${type || "Details not set"} · ${ROLE_LINE[role]}`,
        verdict: due?.snap.verdict.text ?? null,
        overdue: due?.snap.counts.overdue ?? null,
        dueSoon: due?.snap.counts.dueSoon ?? null,
        waiting: new Set(mine.filter((e) => !e.owner_confirmed && e.page_id).map((e) => e.page_id)).size,
        confirmed: mine.filter((e) => e.owner_confirmed).length,
      };
    }),
  );
  const rank = (c: Card) => (c.demo ? 2 : c.role === "owner" ? 0 : 1);
  cards.sort((x, y) => rank(x) - rank(y) || x.tail.localeCompare(y.tail));
  const shelf = cards.filter((c) => !c.demo);
  const demo = cards.filter((c) => c.demo);
  const empty = shelf.length === 0;

  const addCard = (
    <Link
      href="/aircraft/new"
      className={`state-layer flex min-h-[112px] flex-col justify-center gap-1 rounded-leaf px-6 py-4 ${
        empty ? "bg-leaf text-ink shadow-leaf" : "border-2 border-dashed border-on-board-2 text-on-board"
      }`}
    >
      <span className="flex items-center gap-2 text-heading">
        <Plus aria-hidden size={20} /> Add an aircraft
      </span>
      <span className={`text-body ${empty ? "text-ink-2" : "text-on-board-2"}`}>
        Type the tail number. The FAA registry fills in the rest and we set up its five logbooks.
      </span>
    </Link>
  );

  return (
    <HangarShell user={user} profile={profile} fleet={fleet} hangarOpen>
      <Board section="setup">
        <BoardHead
          title={empty ? "Welcome to MyTailLog" : "Hangar"}
          spine={false}
          actions={
            !empty && (
              <>
                <a href="#import" className={buttonClass("on-board", "m")}>Import a backup</a>
                <Button variant="on-board" href="/aircraft/new">Add an aircraft</Button>
              </>
            )
          }
        />
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          <div className="mx-auto grid max-w-[1180px] gap-2.5">
            {askHeard && <HeardAboutWell />}
            {empty && <p className="max-w-[60ch] text-lede text-on-board">Add your aircraft to start. You need the tail number; everything else can come later.</p>}
            {empty ? addCard : shelf.map((c) => <HangarCard key={c.id} c={c} />)}
            <div className={`grid gap-2.5 ${empty ? "" : "md:grid-cols-2"}`}>
              {!empty && addCard}
              <ImportCard />
            </div>
            {demo.length > 0 && (
              <>
                {empty && <h2 className="mt-4 text-section text-on-board">Look around first</h2>}
                {demo.map((c) => <HangarCard key={c.id} c={c} />)}
              </>
            )}
            <p className="mt-2 text-small text-on-board-2">
              MyTailLog is an index of your logbooks. The paper logbooks remain the record (14 CFR 91.417).
            </p>
          </div>
        </div>
      </Board>
    </HangarShell>
  );
}

/** HangarCard: tail, tags, type and role, the Status verdict, what waits, and Open. */
function HangarCard({ c }: { c: Card }) {
  const tags = [c.demo && "Demo aircraft", !c.demo && c.role !== "owner" && `Shared with you, ${c.role}`].filter(Boolean) as string[];
  return (
    <article aria-labelledby={`tail-${c.id}`} className="rounded-leaf bg-leaf px-6 py-5 text-ink shadow-leaf">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`tail-${c.id}`} className="text-[24px] leading-tight font-extrabold">
          <Link href={`/aircraft/${c.id}/status`} className="hover:underline">{c.tail}</Link>
        </h2>
        {tags.map((t) => (
          <span key={t} className="rounded-[3px] border border-rule-2 px-1.5 py-px text-caption font-semibold text-ink-2">{t}</span>
        ))}
        <span className="text-small text-ink-3">{c.typeLine}</span>
      </div>
      <p className="mt-2 max-w-[80ch] text-body font-semibold">
        {c.verdict ?? "Status could not be worked out. Open the aircraft to check."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {c.overdue == null ? (
          <span className="text-small text-ink-3">–</span>
        ) : (
          <>
            {c.overdue > 0 && <StatusMark kind="overdue" label={`${c.overdue} overdue`} />}
            {c.dueSoon! > 0 && <StatusMark kind="due_soon" label={`${c.dueSoon} due soon`} />}
            {c.overdue === 0 && c.dueSoon === 0 && <StatusMark kind="current" label="Nothing due soon" />}
          </>
        )}
        {c.role !== "viewer" && (
          <span className="text-small text-ink-2">{c.waiting ? `${plural(c.waiting, "page")} waiting for review` : "No pages waiting"}</span>
        )}
        <span className="text-small text-ink-2">{plural(c.confirmed, "confirmed entry", "confirmed entries")}</span>
        <span className="ml-auto flex items-center gap-2">
          {c.role === "owner" && !c.demo ? (
            <Link href={`/aircraft/${c.id}/details`} className={buttonClass("quiet", "s")}>Edit details</Link>
          ) : (
            <RemoveFromHangar aircraftId={c.id} tail={c.tail} />
          )}
          <Button size="s" href={`/aircraft/${c.id}/status`}>Open {c.tail}</Button>
        </span>
      </div>
    </article>
  );
}
