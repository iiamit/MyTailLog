import { createServiceClient } from "@/lib/supabase/service";
import { logRoomView, openRoom, roomRateLimited, visitorOf, type Room } from "@/lib/recordRoom";
import { loadShareInput, type ShareInput } from "@/lib/share/model";

/**
 * The share data behind a record room's summary or dossier (/r/{token}/summary, /dossier), or a Response to return
 * instead: 429 when rate limited, 404 when the link is unknown, revoked, ended or does not include `section`
 * (one answer for all, so nothing leaks why). Reads with the service client, scoped to the room's aircraft; the
 * builders apply the unconfirmed gate. Counts the view.
 */
export async function roomShare(req: Request, token: string, section: "summary" | "dossier"): Promise<{ room: Room; share: ShareInput } | Response> {
  const visitor = visitorOf(req.headers);
  const wait = roomRateLimited(visitor);
  if (wait) return new Response("Too many requests", { status: 429, headers: { "retry-after": String(wait) } });
  const room = await openRoom(token);
  if (!room || !(section === "summary" ? room.include_summary : room.include_dossier)) return new Response("Not found", { status: 404 });
  const svc = createServiceClient();
  const { data: ac } = await svc.from("aircraft").select("owner_id").eq("id", room.aircraft_id).maybeSingle();
  const share = ac && (await loadShareInput(svc, room.aircraft_id, ac.owner_id));
  if (!share) return new Response("Not found", { status: 404 });
  await logRoomView(room, `/${section}`, visitor, section);
  return { room, share };
}
