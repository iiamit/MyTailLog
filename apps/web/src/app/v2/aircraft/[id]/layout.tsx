import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { loadRailCounts, railTabs } from "@/lib/v2/rail";
import { Rail, PhoneTabs, type RailAircraft } from "@/ui/Rail";

/** The binder for one aircraft: cover rail on the left, the open section's board on the right (03 §2). */
export default async function V2AircraftLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const context = await getAircraftShellContext(supabase, id);
  if (!context) notFound();

  const [counts, { data: fleet }, { data: auth }] = await Promise.all([
    loadRailCounts(supabase, context),
    supabase.from("aircraft").select("id, tail_number, make, model").order("tail_number"),
    supabase.auth.getUser(),
  ]);
  const { data: profile } = auth.user
    ? await supabase.from("profile").select("full_name").eq("id", auth.user.id).maybeSingle()
    : { data: null };

  const tabs = railTabs(id, counts, context.isOwner);
  const role = context.isOwner ? "" : context.canEdit ? " · Editor" : " · Viewer";
  const plateLine = `${context.type}${context.demo ? " · Demo" : ""}${role}`;
  const aircraft: RailAircraft[] = (fleet ?? []).map((a) => ({
    id: a.id,
    tail: a.tail_number,
    model: [a.make, a.model].filter(Boolean).join(" "),
  }));

  return (
    <div className="flex h-dvh max-md:flex-col">
      <Rail
        aircraftId={id}
        tail={context.reg}
        plateLine={plateLine}
        tabs={tabs}
        aircraft={aircraft}
        canEdit={context.canEdit}
        userShortName={shortName(profile?.full_name, auth.user?.email)}
      />
      <PhoneTabs tail={context.reg} tabs={tabs} />
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** "Dana Morgan" → "Dana M."; falls back to the email's local part. */
function shortName(full: string | null | undefined, email: string | undefined) {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  return parts[0] ?? email?.split("@")[0] ?? "Account";
}
