import { ownerJson } from "@/lib/owner/body";
import { NextResponse } from "next/server";
import { ownerAccess, ownerError } from "@/lib/owner/access";
import { stagePage } from "@/lib/owner/inbox";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; item: string }> },
) {
  const { id, item } = await params,
    a = await ownerAccess(req, id, "edit");
  if (a.response) return a.response;
  try {
    const { data, error } = await a.supabase
      .from("aircraft_inbox")
      .select("id,state")
      .eq("aircraft_id", id)
      .eq("id", item)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return ownerError(new Error("Inbox item not found."), 404);
    if (data.state === "approved")
      return ownerError(new Error("Already approved."), 409);
    const b = await ownerJson(req, 17_000_000);
    if (typeof b.image !== "string" || b.image.length > 17_000_000)
      throw new Error("Attach a rendered JPEG page.");
    return NextResponse.json({
      item: await stagePage(
        a.supabase,
        id,
        item,
        Number(b.index),
        Buffer.from(b.image, "base64"),
      ),
    });
  } catch (e) {
    return ownerError(e);
  }
}
