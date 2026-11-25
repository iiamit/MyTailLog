import { publicOrigin } from "@/lib/publicOrigin";
import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { UUID } from "./validation";
export async function ownerAccess(
  req: Request,
  aircraftId: string,
  level: "read" | "edit" | "owner" = "read",
) {
  if (!UUID.test(aircraftId))
    return {
      response: NextResponse.json(
        { error: "Aircraft not found." },
        { status: 404 },
      ),
    };
  const origin = req.headers.get("origin");
  if (
    !["GET", "HEAD"].includes(req.method) &&
    origin &&
    origin !== publicOrigin(req)
  )
    return {
      response: NextResponse.json(
        { error: "Unrecognized request origin." },
        { status: 403 },
      ),
    };
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  const { data: aircraft, error } = await supabase
    .from("aircraft")
    .select("id,owner_id,tail_number")
    .eq("id", aircraftId)
    .maybeSingle();
  if (error)
    return {
      response: NextResponse.json(
        { error: "Could not load aircraft." },
        { status: 503 },
      ),
    };
  if (!aircraft)
    return {
      response: NextResponse.json(
        { error: "Aircraft not found." },
        { status: 404 },
      ),
    };
  const { data: canEdit, error: editError } = await supabase.rpc(
    "can_edit_aircraft",
    { target_aircraft: aircraftId },
  );
  if (editError)
    return {
      response: NextResponse.json(
        { error: "Could not check access." },
        { status: 503 },
      ),
    };
  if (
    (level === "owner" && aircraft.owner_id !== user.id) ||
    (level === "edit" && !canEdit)
  )
    return {
      response: NextResponse.json(
        {
          error:
            level === "owner"
              ? "Only the aircraft owner can access finances."
              : "You need edit access to this aircraft.",
        },
        { status: 403 },
      ),
    };
  return { supabase, user, aircraft, canEdit: !!canEdit };
}
export const ownerError = (error: unknown, status = 400) =>
  NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Could not complete that request.",
    },
    { status: error instanceof RangeError ? 413 : status },
  );
