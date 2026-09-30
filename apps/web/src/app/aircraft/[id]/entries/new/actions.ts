"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { missingTemplateFields, TEMPLATE_VERSION, TEMPLATES, type TemplateId } from "@/lib/authored-entries";
import { issueSigningChallenge, type SignRequest } from "@/lib/entry-signing-challenge";

export type SignInput = {
  id: string;
  aircraftId: string;
  logbookId: string;
  templateId: TemplateId;
  entryDate: string;
  hobbs: number | null;
  tach: number | null;
  airframe: number | null;
  work: string;
  answers: Record<string, string>;
  credentialId: string;
  performedBy: string;
  supersedesEntryId: string | null;
  attested: boolean;
};

function args(input: SignInput): SignRequest {
  return {
    p_id: input.id, p_aircraft_id: input.aircraftId, p_logbook_id: input.logbookId,
    p_template_id: input.templateId, p_template_version: TEMPLATE_VERSION,
    p_entry_date: input.entryDate, p_hobbs: input.hobbs, p_tach: input.tach,
    p_airframe: input.airframe, p_work: input.work.trim(), p_answers: input.answers,
    p_credential_id: input.credentialId, p_performed_by: input.performedBy.trim(),
    p_supersedes_entry_id: input.supersedesEntryId, p_attested: input.attested,
  };
}

export async function requestEntryCode(input: SignInput): Promise<{ id: string } | { error: string }> {
  const template = TEMPLATES.find((t) => t.id === input.templateId);
  if (!template) return { error: "Choose an entry template." };
  const missing = missingTemplateFields(input.templateId, input.answers);
  if (missing.length) return { error: `Complete: ${missing.join(", ")}.` };
  if (!input.work.trim() || !input.entryDate || !input.attested) return { error: "Review and confirm the complete entry before signing." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to sign an entry." };
  return issueSigningChallenge(supabase, user, args(input));
}

export async function signEntry(input: SignInput, challengeId: string, code: string): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to sign an entry." };
  const { data, error } = await supabase.rpc("sign_authored_entry", {
    ...args(input), p_challenge_id: challengeId, p_code: code.trim(),
  });
  if (error) return { error: error.message };
  if (!data) return { error: "The code is incorrect or expired, or the entry changed. Request a new code if needed." };
  revalidatePath(`/aircraft/${input.aircraftId}/timeline`);
  revalidatePath(`/aircraft/${input.aircraftId}`);
  return { id: data };
}
