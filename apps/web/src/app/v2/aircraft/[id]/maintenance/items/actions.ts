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

/** Save the item and its book, shop and reminder settings together. */
export async function saveItem(aircraftId: string, itemId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const picked = pickItemForm((k) => (form.has(k) ? String(form.get(k)) : undefined));
  if ("error" in picked) return { error: picked.error };
  const { supabase, user, ctx } = await writeSession(aircraftId);
  if (!user) return { error: "Not signed in." };
  const r = await maintenance.upsert(supabase, ctx, { id: itemId ?? undefined, item: { ...picked.item, ...picked.extras } }, String(form.get("base") ?? "") || undefined);
  if (r.status !== "ok") return { error: failMessage(r) };
  const id = String(r.row?.id ?? itemId);
  refresh(aircraftId);
  redirect(`${base(aircraftId)}?item=${id}&saved=1`);
}

export async function stopTracking(aircraftId: string, itemId: string, version: string) {
  const { supabase, ctx } = await writeSession(aircraftId);
  const r = await maintenance.remove(supabase, ctx, { itemId }, version);
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
export async function saveProvider(aircraftId: string, providerId: string | null, renderedBase: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, user, ctx } = await writeSession(aircraftId);
  if (!user) return { error: "Not signed in." };
  if (providerId && !renderedBase) return { error: "Reload this shop before editing it." };
  const s = (k: string) => String(form.get(k) ?? "");
  const r = await providers.upsert(supabase, ctx, {
    id: providerId ?? undefined,
    fields: {
      name: s("name"), kind: s("kind"), certNumber: s("certNumber"), airport: s("airport"),
      email: s("email"), phone: s("phone"), isDefault: form.get("isDefault") === "on",
    },
  }, renderedBase ?? undefined);
  if (r.status !== "ok") return { error: failMessage(r) };
  refresh(aircraftId);
  redirect(`${base(aircraftId)}?providerSaved=1`);
}

export async function removeProvider(aircraftId: string, providerId: string, renderedBase: string) {
  const { supabase, ctx } = await writeSession(aircraftId);
  if (!renderedBase) redirect(`${base(aircraftId)}?error=Reload%20this%20shop%20before%20deleting%20it.`);
  const r = await providers.remove(supabase, ctx, { providerId }, renderedBase);
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
