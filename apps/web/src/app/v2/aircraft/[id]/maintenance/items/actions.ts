"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeSession } from "@/lib/v2/session";
import { failMessage } from "@/lib/writes/entries";
import * as maintenance from "@/lib/writes/maintenance";
import * as providers from "@/lib/writes/providers";
import { pickItemForm } from "@/lib/v2/items";

export type FormState = { error?: string } | null;

const base = (id: string) => `/aircraft/${id}/maintenance/items`;
function refresh(id: string) {
  revalidatePath(`/v2/aircraft/${id}`, "layout");
  revalidatePath(`/aircraft/${id}`, "layout");
}

/** Item form (W-MAINT-06): the base write, then the Direction D columns that write doesn't carry yet. */
export async function saveItem(aircraftId: string, itemId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const picked = pickItemForm((k) => (form.has(k) ? String(form.get(k)) : undefined));
  if ("error" in picked) return { error: picked.error };
  const { supabase, user, ctx } = await writeSession(aircraftId);
  if (!user) return { error: "Not signed in." };
  const r = await maintenance.upsert(supabase, ctx, { id: itemId ?? undefined, item: picked.item });
  if (r.status !== "ok") return { error: failMessage(r) };
  const id = String(r.row?.id ?? itemId);
  // shortcut: second write until lib/writes/maintenance picks the 0071 columns; RLS still gates it.
  const { error } = await supabase.from("maintenance_item").update(picked.extras).eq("id", id).eq("aircraft_id", aircraftId);
  if (error) return { error: "The item was saved, but its book, shop and reminder settings were not. Try again." };
  refresh(aircraftId);
  redirect(`${base(aircraftId)}?item=${id}&saved=1`);
}

export async function stopTracking(aircraftId: string, itemId: string) {
  const { supabase, ctx } = await writeSession(aircraftId);
  const r = await maintenance.remove(supabase, ctx, { itemId });
  if (r.status !== "ok") redirect(`${base(aircraftId)}?item=${itemId}&error=${encodeURIComponent(failMessage(r))}`);
  refresh(aircraftId);
  redirect(`${base(aircraftId)}?stopped=1`);
}

export async function seedStandard(aircraftId: string) {
  const { supabase, ctx } = await writeSession(aircraftId);
  const r = await maintenance.seedStandard(supabase, ctx);
  if (r.status !== "ok") redirect(`${base(aircraftId)}?error=${encodeURIComponent(failMessage(r))}`);
  refresh(aircraftId);
  redirect(`${base(aircraftId)}?seeded=1`);
}

/** Provider form (W-MAINT-06 Shops and mechanics; `provider.upsert`). */
export async function saveProvider(aircraftId: string, providerId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, user, ctx } = await writeSession(aircraftId);
  if (!user) return { error: "Not signed in." };
  const s = (k: string) => String(form.get(k) ?? "");
  const r = await providers.upsert(supabase, ctx, {
    id: providerId ?? undefined,
    fields: {
      name: s("name"), kind: s("kind"), certNumber: s("certNumber"), airport: s("airport"),
      email: s("email"), phone: s("phone"), isDefault: form.get("isDefault") === "on",
    },
  });
  if (r.status !== "ok") return { error: failMessage(r) };
  refresh(aircraftId);
  redirect(`${base(aircraftId)}?providerSaved=1`);
}

export async function removeProvider(aircraftId: string, providerId: string) {
  const { supabase, ctx } = await writeSession(aircraftId);
  const r = await providers.remove(supabase, ctx, { providerId });
  if (r.status !== "ok") redirect(`${base(aircraftId)}?error=${encodeURIComponent(failMessage(r))}`);
  refresh(aircraftId);
  redirect(`${base(aircraftId)}?providerRemoved=1`);
}

/** "Found in the logs: … Add": a signer becomes a mechanic, only when the owner says so. */
export async function addProposal(aircraftId: string, name: string, certNumber: string | null) {
  const { supabase, ctx } = await writeSession(aircraftId);
  const r = await providers.upsert(supabase, ctx, { fields: { name, kind: "mechanic", certNumber } });
  if (r.status !== "ok") redirect(`${base(aircraftId)}?error=${encodeURIComponent(failMessage(r))}`);
  refresh(aircraftId);
  redirect(`${base(aircraftId)}?providerSaved=1`);
}
