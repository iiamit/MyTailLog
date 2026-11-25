import { ownerJson } from "@/lib/owner/body";
import { NextResponse } from "next/server";
import { ownerAccess, ownerError } from "@/lib/owner/access";
import { observationInput } from "@/lib/owner/observations";
import { UUID } from "@/lib/owner/validation";
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; observation: string }> },
) {
  const { id, observation } = await params,
    a = await ownerAccess(req, id, "edit");
  if (a.response) return a.response;
  try {
    const b = await ownerJson(req);
    if (typeof b.base !== "string")
      throw new Error("Reload the observation first.");
    const row = observationInput({ ...b, id: observation });
    const { data, error } = await a.supabase
      .from("engine_observation")
      .update(row)
      .eq("aircraft_id", id)
      .eq("id", observation)
      .eq("updated_at", b.base)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data)
      return ownerError(
        new Error("Observation changed; reload before editing."),
        409,
      );
    return NextResponse.json({ event: data });
  } catch (e) {
    return ownerError(e);
  }
}
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; observation: string }> },
) {
  const { id, observation } = await params,
    a = await ownerAccess(req, id, "edit");
  if (a.response) return a.response;
  const base = new URL(req.url).searchParams.get("base");
  if (!base || !UUID.test(observation))
    return ownerError(new Error("Reload the observation first."));
  const { data, error } = await a.supabase
    .from("engine_observation")
    .delete()
    .eq("aircraft_id", id)
    .eq("id", observation)
    .eq("updated_at", base)
    .select("id");
  if (error) return ownerError(new Error(error.message));
  if (!data?.length)
    return ownerError(
      new Error("Observation changed; reload before deleting."),
      409,
    );
  return NextResponse.json({ ok: true });
}
