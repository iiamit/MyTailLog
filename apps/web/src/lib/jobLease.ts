import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** The lease outlives the five-minute worker budget; a killed worker becomes retryable after 15 minutes. */
export async function withJobLease<T>(svc: SupabaseClient<Database>, key: string, work: () => Promise<T>): Promise<T | null> {
  const { data: token, error } = await svc.rpc("claim_background_job", { p_key: key });
  if (error) throw new Error(`claim_background_job: ${error.message}`);
  if (!token) return null;
  try {
    return await work();
  } finally {
    const { error } = await svc.rpc("release_background_job", { p_key: key, p_token: token });
    if (error) console.error(`Could not release job lease: ${error.message}`);
  }
}
