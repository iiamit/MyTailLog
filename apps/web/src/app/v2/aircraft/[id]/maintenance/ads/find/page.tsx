import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { dueSnapshot } from "@/lib/due/load";
import { aircraftTail } from "@/lib/v2/landing";
import { maintTabs } from "@/lib/v2/tabs";
import { Board, BoardHead, Spine } from "@/ui/Board";
import { FindClient } from "./FindClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Find ADs · ${await aircraftTail(id)}` };
}

/** W-MAINT-02 Find ADs: FAA sources searched for the aircraft and every installed part; track what applies. */
export default async function FindAdsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  if (!context.canEdit) redirect(`${a}/maintenance/ads`);

  const [{ data: aircraft }, { data: parts }, due] = await Promise.all([
    supabase.from("aircraft").select("make, model").eq("id", id).maybeSingle(),
    supabase.from("component").select("name, make").eq("aircraft_id", id).eq("is_installed", true),
    dueSnapshot(id, auth.user.id).catch(() => null),
  ]);
  const annual = due?.snap.items.find((i) => i.source === "maintenance" && i.kind === "annual");

  return (
    <Board section="maint">
      <BoardHead title="Maintenance" subTabs={maintTabs(id, "ads", { squawks: due?.snap.counts.openSquawks })} />
      <Spine tail={context.reg} context="The whole life" href={`${a}/logbooks/map`} />
      <Link href={`${a}/maintenance/ads`} className="mb-2 inline-flex items-center gap-1 px-1 text-small font-semibold text-on-board">
        <ChevronLeft aria-hidden size={16} /> ADs and SBs
      </Link>
      <FindClient
        aircraftId={id}
        tail={context.reg}
        make={aircraft?.make ?? null}
        model={aircraft?.model ?? null}
        parts={(parts ?? []).filter((p) => p.make?.trim()).map((p) => ({ name: p.name, make: p.make!.trim() }))}
        annualDue={annual?.calendar?.dueDate ?? null}
      />
    </Board>
  );
}
