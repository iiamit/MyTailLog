import { ownerJson } from "@/lib/owner/body";
import { NextResponse } from "next/server";
import { ownerAccess, ownerError } from "@/lib/owner/access";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; component: string }> },
) {
  const { id, component } = await params,
    a = await ownerAccess(req, id, "edit");
  if (a.response) return a.response;
  try {
    const b = await ownerJson(req);
    if (
      typeof b.position !== "string" ||
      b.position.length > 80 ||
      typeof b.base !== "string"
    )
      throw new Error("Enter a position and reload the current engine first.");
    const { data, error } = await a.supabase
      .from("component")
      .update({ position: b.position.trim() || null })
      .eq("aircraft_id", id)
      .eq("id", component)
      .eq("category", "engine")
      .eq("updated_at", b.base)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data)
      return ownerError(
        new Error("Engine changed; reload before editing."),
        409,
      );
    return NextResponse.json({ component: data });
  } catch (e) {
    return ownerError(e);
  }
}

export const PATCH = POST;
