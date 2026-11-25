import { ownerJson } from "@/lib/owner/body";
import { NextResponse } from "next/server";
import { ownerAccess, ownerError } from "@/lib/owner/access";
import { expenseInput, UUID } from "@/lib/owner/validation";
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; expense: string }> },
) {
  const { id, expense } = await params,
    a = await ownerAccess(req, id, "owner");
  if (a.response) return a.response;
  try {
    const b = await ownerJson(req);
    if (!UUID.test(expense) || typeof b.base !== "string")
      throw new Error("Reload the expense before editing.");
    const row = expenseInput({ ...b, id: expense });
    const { data, error } = await a.supabase
      .from("aircraft_expense")
      .update(row)
      .eq("aircraft_id", id)
      .eq("id", expense)
      .eq("updated_at", b.base)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data)
      return ownerError(
        new Error("This expense changed; reload before editing."),
        409,
      );
    return NextResponse.json({ expense: data });
  } catch (e) {
    return ownerError(e);
  }
}
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; expense: string }> },
) {
  const { id, expense } = await params,
    a = await ownerAccess(req, id, "owner");
  if (a.response) return a.response;
  const base = new URL(req.url).searchParams.get("base");
  if (!UUID.test(expense) || !base)
    return ownerError(new Error("Reload the expense before deleting."));
  const { data, error } = await a.supabase
    .from("aircraft_expense")
    .delete()
    .eq("aircraft_id", id)
    .eq("id", expense)
    .eq("updated_at", base)
    .select("id");
  if (error) return ownerError(new Error(error.message));
  if (!data?.length)
    return ownerError(
      new Error("This expense changed; reload before deleting."),
      409,
    );
  return NextResponse.json({ ok: true });
}
