import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { createServiceClient } from "@/lib/supabase/service";
import { dayOfMonthFor } from "@/lib/backup/schedule";

// "Back up now" for the native app (CONTRACT §3 C3 `backup.run`, online).
//
// The archive is built by the nightly sweep (api/cron/backup — service role,
// 300 s budget, lease per schedule). Running it inline from a phone request
// would need those service credentials on a user-facing route and a 5-minute
// request, so this endpoint pulls the user's schedule forward instead: every
// connected destination whose cadence is on gets next_run_at = now and the
// sweep picks it up on its next tick. The schedule is per user, not per
// aircraft (0050), so this runs every aircraft the owner has — [id] only proves
// the caller owns something worth backing up.
//
// Once a day, at most: backup_schedule has no write policy precisely so nobody
// can ask us to ship a full archive on every tap.
export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: owned } = await supabase.from("aircraft").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!owned) return NextResponse.json({ error: "Only the aircraft's owner can run a backup." }, { status: 403 });

  const { data: destinations, error } = await supabase.rpc("my_backup_destinations");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const active = (destinations ?? []).filter((d) => d.connected && d.frequency !== "off");
  if (!active.length) {
    return NextResponse.json({ error: "Set up a cloud backup in your profile first." }, { status: 400 });
  }
  const recent = active.find((d) => d.last_run_at && Date.now() - Date.parse(d.last_run_at) < DAY_MS);
  if (recent) return NextResponse.json({ error: "A backup already ran in the last day." }, { status: 429 });

  const now = new Date().toISOString();
  const service = createServiceClient();
  for (const d of active) {
    const { error: rpcErr } = await service.rpc("set_backup_schedule", {
      p_user_id: user.id,
      p_provider: d.provider,
      p_frequency: d.frequency,
      p_day_of_month: d.day_of_month ?? dayOfMonthFor(user.id),
      p_next_run_at: now,
    });
    if (rpcErr) return NextResponse.json({ error: "Couldn't start the backup." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, providers: active.map((d) => d.provider), message: "Your backup will run tonight." });
}
