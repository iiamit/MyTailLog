import { toNode, toFetchResponse } from "@/lib/oauth/bridge";
import { getOAuthProvider } from "@/lib/oauth/provider";
import { createClient } from "@/lib/supabase/server";

// Handles the consent form submission: resolves the oidc login+consent
// interaction and records the per-aircraft grant (the Resource Server's authz
// boundary). oidc-provider needs Node req/res, so this is a route handler, not
// a server action.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ uid: string }> }): Promise<Response> {
  const { uid } = await params;
  try {
    return await decide(request, uid);
  } catch (err) {
    // A one-time consent interaction that's already been completed or has expired
    // (e.g. a Back-button re-submit) makes interactionDetails/interactionFinished
    // throw. Send them to the consent page's friendly "expired" state instead of
    // a raw 500 — and log the real error so a genuine server-side failure in the
    // authorize→consent→redirect chain is diagnosable (not swallowed).
    console.error("[oidc] consent decide failed:", err);
    return Response.redirect(new URL(`/oauth/consent/${uid}`, request.url), 303);
  }
}

async function decide(request: Request, uid: string): Promise<Response> {
  const form = await request.clone().formData();
  const approve = form.get("decision") === "approve";
  const aircraftIds = form.getAll("aircraft").map(String).filter(Boolean);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { req, res } = toNode(request);
  const provider = getOAuthProvider();
  const details = await provider.interactionDetails(req, res);

  if (!user) {
    // Session lapsed between rendering and submitting — bounce to login.
    return Response.redirect(new URL(`/login?next=/oauth/consent/${uid}`, request.url), 303);
  }

  // Only an explicit Deny refuses. Approving with no aircraft is allowed — a new
  // account may not have added one yet; the client is still authorized and the
  // API just returns empty results until an aircraft is shared (re-consent adds
  // it). Blocking here stranded first-time users mid-signup (reported by MFB).
  if (!approve) {
    await provider.interactionFinished(
      req,
      res,
      { error: "access_denied", error_description: "The owner declined to share access." },
      { mergeWithLastSubmission: false },
    );
    return toFetchResponse(res);
  }

  const accountId = user.id;
  const clientId = String(details.params.client_id);
  const requested = String(details.params.scope ?? "").split(" ").filter(Boolean);

  // NEVER trust the submitted aircraft ids: a tampered form could list aircraft
  // the user doesn't own. Keep only aircraft this user actually OWNS — possibly
  // none, which is fine: a brand-new account can still authorize the client. RLS
  // (0035) enforces the same on write; this is a clean filter + defense in depth.
  let ownedIds: string[] = [];
  if (aircraftIds.length > 0) {
    const { data: owned } = await supabase
      .from("aircraft")
      .select("id")
      .eq("owner_id", accountId)
      .in("id", aircraftIds);
    ownedIds = (owned ?? []).map((a) => a.id);
  }

  // The oidc grant carries the requested scopes; the per-aircraft restriction is
  // ours (oauth_aircraft_grant), enforced by the Resource Server (P2).
  const grant = new provider.Grant({ accountId, clientId });
  grant.addOIDCScope(requested.join(" "));
  const grantId = await grant.save();

  const dataScopes = requested.filter((s) => s !== "openid" && s !== "offline_access");

  // Upsert grants for the selected owned aircraft (if any).
  if (ownedIds.length > 0) {
    const rows = ownedIds.map((aircraft_id) => ({
      account_id: accountId,
      client_id: clientId,
      aircraft_id,
      scopes: dataScopes,
      revoked_at: null,
    }));
    // Authed client → RLS enforces account_id = auth.uid() AND ownership; onConflict re-consents.
    const { error } = await supabase
      .from("oauth_aircraft_grant")
      .upsert(rows, { onConflict: "account_id,client_id,aircraft_id" });
    if (error) {
      await provider.interactionFinished(
        req,
        res,
        { error: "server_error", error_description: "Could not save consent." },
        { mergeWithLastSubmission: false },
      );
      return toFetchResponse(res);
    }
  }

  // Re-consent must be able to NARROW sharing: revoke this client's active grants
  // for any aircraft the owner did NOT re-select — ALL of them when none was
  // selected. The consent UI promises "only the aircraft you check will be shared".
  let revoke = supabase
    .from("oauth_aircraft_grant")
    .update({ revoked_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .eq("client_id", clientId)
    .is("revoked_at", null);
  if (ownedIds.length > 0) {
    revoke = revoke.not("aircraft_id", "in", `(${ownedIds.join(",")})`);
  }
  await revoke;

  await provider.interactionFinished(
    req,
    res,
    { login: { accountId }, consent: { grantId } },
    { mergeWithLastSubmission: false },
  );
  return toFetchResponse(res);
}
