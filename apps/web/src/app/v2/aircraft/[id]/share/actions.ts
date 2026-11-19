"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createRoom, updateRoom } from "@/lib/recordRoom";
import { loadDueInput } from "@/lib/due/load";
import { computeStatus } from "@/lib/due/engine";
import { addShare, deleteRoom, removeShare } from "@/app/aircraft/[id]/share/actions";

// W-SHARE-01 writes. Record rooms go through lib/recordRoom.ts, the same owner-only rules as the API (09 §4.11);
// people reuse today's share actions. Results come back in the URL so the page stays a server page.

const hub = (id: string, q = "") => `/aircraft/${id}/share${q}`;
const enc = encodeURIComponent;

export type MakeState = { error?: string } | null;

/** "Make the link" (create form). The body is the API's, so validation and presets stay in one place. */
export async function makeRoom(aircraftId: string, _prev: MakeState, form: FormData): Promise<MakeState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const on = (k: string) => form.get(k) === "on";
  const ends = String(form.get("ends") ?? "");
  const body = {
    label: String(form.get("label") ?? ""),
    audience: String(form.get("audience") ?? "other"),
    mapWindow: String(form.get("mapWindow") ?? "whole_life"),
    includeSummary: on("summary"),
    includeDossier: on("dossier"),
    includeScans: on("scans"),
    includeSquawks: on("squawks"),
    includeReporters: on("reporters"),
    logbookIds: form.getAll("logbook").map(String),
    documentIds: form.getAll("document").map(String),
    ...(ends === "date" ? { expiresAt: String(form.get("endsOn") ?? "") } : /^\d+$/.test(ends) ? { expiresInDays: Number(ends) } : {}),
  };
  if (ends === "date" && !form.get("endsOn")) return { error: "Pick the date the link ends." };
  const r = await createRoom(supabase, {
    aircraftId, userId: user.id, body,
    annualDue: async () => {
      const loaded = await loadDueInput(supabase, aircraftId, user.id);
      return loaded ? computeStatus(loaded.input, loaded.today).items.find((i) => i.kind === "annual")?.calendar?.dueDate ?? null : null;
    },
  });
  if ("error" in r) return { error: r.error };
  revalidatePath(hub(aircraftId));
  redirect(hub(aircraftId, `?room=${r.id}&made=1`));
}

/** Extend 30 days, revoke, or rename one link. */
export async function changeRoom(aircraftId: string, roomId: string, op: "extend" | "revoke" | "rename", form?: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const body = op === "extend" ? { extendDays: 30 } : op === "revoke" ? { revoke: true } : { label: String(form?.get("label") ?? "") };
  const r = user ? await updateRoom(supabase, { aircraftId, roomId, userId: user.id, body }) : { error: "Not signed in." };
  revalidatePath(hub(aircraftId));
  const note = "error" in r ? `err=${enc(r.error)}` : `note=${op === "extend" ? "extended" : op === "revoke" ? "revoked" : "renamed"}`;
  redirect(hub(aircraftId, `?room=${roomId}&${note}`));
}

/** "Delete this link" for an inactive one. */
export async function removeRoom(aircraftId: string, roomId: string) {
  const r = await deleteRoom(aircraftId, roomId);
  redirect(hub(aircraftId, r.error ? `?room=${roomId}&err=${enc(r.error)}` : ""));
}

/** Invite by email (People with an account). */
export async function invite(aircraftId: string, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = form.get("role") === "editor" ? "editor" : "viewer";
  const r = await addShare(aircraftId, email, role);
  if (r.error) redirect(hub(aircraftId, `?perr=${enc(r.error)}#people`));
  redirect(hub(aircraftId, `?pnote=${enc(r.emailSent ? `Invitation sent to ${email}.` : `Access added, but the email didn't send. Tell them to sign in with ${email}.`)}#people`));
}

/** Segmented "Can edit" / "Can view": changes the role at once, no re-invite. */
export async function setRole(aircraftId: string, email: string, role: "viewer" | "editor") {
  const supabase = await createClient();
  const { error, data } = await supabase.from("aircraft_share").update({ role }).eq("aircraft_id", aircraftId).eq("invited_email", email).select("id");
  revalidatePath(hub(aircraftId));
  if (error || !data?.length) redirect(hub(aircraftId, `?perr=${enc("Only the owner can change access.")}#people`));
  redirect(hub(aircraftId, `?pnote=${enc(`${email} can now ${role === "editor" ? "edit" : "view"}.`)}#people`));
}

export async function removePerson(aircraftId: string, email: string) {
  const r = await removeShare(aircraftId, email);
  redirect(hub(aircraftId, r.error ? `?perr=${enc(r.error)}#people` : `?pnote=${enc(`${email} no longer has access.`)}#people`));
}
