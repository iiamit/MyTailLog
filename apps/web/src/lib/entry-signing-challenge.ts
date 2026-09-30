import { createHash, randomInt, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email";
import { missingTemplateFields, TEMPLATES, type TemplateId } from "@/lib/authored-entries";

export type SignRequest = Omit<Database["public"]["Functions"]["sign_authored_entry"]["Args"], "p_challenge_id" | "p_code">;

const SIGN_KEYS = [
  "p_id", "p_aircraft_id", "p_logbook_id", "p_template_id", "p_template_version",
  "p_entry_date", "p_hobbs", "p_tach", "p_airframe", "p_work", "p_answers",
  "p_credential_id", "p_performed_by", "p_supersedes_entry_id", "p_attested",
] as const;

export function validateSignRequest(value: unknown): value is SignRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const template = TEMPLATES.find((t) => t.id === v.p_template_id);
  return !!template && Object.keys(v).length === SIGN_KEYS.length && Object.keys(v).every((key) => SIGN_KEYS.includes(key as typeof SIGN_KEYS[number])) &&
    v.p_template_version === 1 && v.p_attested === true &&
    ["p_id", "p_aircraft_id", "p_logbook_id", "p_credential_id", "p_entry_date", "p_performed_by", "p_work"].every((k) => typeof v[k] === "string") &&
    typeof v.p_work === "string" && v.p_work.trim().length >= 20 && v.p_work.length <= 10000 &&
    v.p_answers != null && typeof v.p_answers === "object" && !Array.isArray(v.p_answers) &&
    Object.values(v.p_answers).every((answer) => typeof answer === "string") &&
    !missingTemplateFields(v.p_template_id as TemplateId, v.p_answers as Record<string, string>).length &&
    ["p_hobbs", "p_tach", "p_airframe"].every((k) => v[k] === null || (typeof v[k] === "number" && Number.isFinite(v[k]) && (v[k] as number) >= 0)) &&
    (v.p_supersedes_entry_id === null || typeof v.p_supersedes_entry_id === "string");
}

export async function issueSigningChallenge(
  db: SupabaseClient<Database>, user: { id: string; email?: string }, request: unknown,
): Promise<{ id: string } | { error: string }> {
  if (!validateSignRequest(request)) return { error: "Complete the entry before requesting a signing code." };
  if (!user.email) return { error: "An email address is required to sign an entry." };
  const { data: allowed } = await db.rpc("can_edit_aircraft", { target_aircraft: request.p_aircraft_id });
  if (!allowed) return { error: "No edit access to this aircraft." };
  const [{ data: book }, { data: credential }, { data: profile }] = await Promise.all([
    db.from("logbook").select("id").eq("id", request.p_logbook_id).eq("aircraft_id", request.p_aircraft_id).maybeSingle(),
    db.from("signing_credential").select("id, kind, certificate_number, rating").eq("id", request.p_credential_id).eq("user_id", user.id).maybeSingle(),
    db.from("profile").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  if (!book || !credential || !profile?.full_name?.trim()) return { error: "Select a valid logbook and certificate, and set your full name." };
  if (!request.p_performed_by.trim()) return { error: "Enter the person who performed the work." };
  if (credential.kind === "sport_pilot" || (credential.kind !== "mechanic" && request.p_template_id === "general")) {
    return { error: "This credential cannot sign the selected template." };
  }
  if (credential.kind !== "mechanic" && request.p_performed_by.trim() !== profile.full_name.trim()) {
    return { error: "A pilot may sign only preventive maintenance they performed." };
  }
  const service = createServiceClient();
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count } = await service.from("entry_signing_challenge").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= 5) return { error: "Too many signing codes requested. Try again later." };
  const id = randomUUID();
  const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
  const codeHash = createHash("sha256").update(id + code).digest("hex");
  const { error } = await service.from("entry_signing_challenge").insert({
    id, user_id: user.id, request: request as unknown as Record<string, unknown>, code_hash: codeHash,
    signer_name: profile.full_name.trim(), cert_kind: credential.kind,
    cert_number: credential.certificate_number, cert_rating: credential.rating,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) return { error: "Could not prepare the signing code." };
  const sent = await sendEmail({ to: user.email, subject: "Your MyTailLog logbook signing code", html: `<p>Your logbook signing code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. Enter it only in MyTailLog to sign the entry you just reviewed.</p>` });
  if (!sent) {
    await service.from("entry_signing_challenge").delete().eq("id", id);
    return { error: "Could not email the signing code. Try again shortly." };
  }
  return { id };
}
