import { cronDenied, json } from "@/lib/cronAuth";
import { createServiceClient } from "@/lib/supabase/service";
import { onboardingCandidates, runOnboardingEmails } from "@/lib/onboardingEmails";

export const runtime = "nodejs";
export const maxDuration = 300;

// Preview the exact recipient set before the first catch-up send.
export async function GET(req: Request) {
  const denied = cronDenied(req);
  if (denied) return denied;
  try {
    const candidates = await onboardingCandidates(createServiceClient(), true);
    return json({ count: candidates.length, candidates: candidates.map((c) => ({
      email: c.email, stage: c.stage, isCatchup: c.is_catchup, tail: c.tail_number,
    })) });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
}

// Manual batch trigger; unique DB claims prevent overlap with the daily cron.
export async function POST(req: Request) {
  const denied = cronDenied(req);
  if (denied) return denied;
  try {
    return json({ sent: await runOnboardingEmails(createServiceClient()) });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
}
