import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { WriteCtx } from "@/lib/writes/entries";

/** The signed-in user and a write context for one aircraft; server actions call the shared writes with it. */
export async function writeSession(aircraftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user, ctx: { aircraftId, userId: user?.id ?? "" } as WriteCtx };
}
