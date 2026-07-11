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

  // Deny, or approve with no aircraft selected → nothing to share → treat as denied.
  if (!approve || aircraftIds.length === 0) {
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

  // The oidc grant carries the requested scopes; the per-aircraft restriction is
  // ours (oauth_aircraft_grant), enforced by the Resource Server (P2).
  const grant = new provider.Grant({ accountId, clientId });
  grant.addOIDCScope(requested.join(" "));
  const grantId = await grant.save();

  const dataScopes = requested.filter((s) => s !== "openid" && s !== "offline_access");
  const rows = aircraftIds.map((aircraft_id) => ({
    account_id: accountId,
    client_id: clientId,
    aircraft_id,
    scopes: dataScopes,
    revoked_at: null,
  }));
  // Authed client → RLS enforces account_id = auth.uid(); onConflict re-consents.
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

  await provider.interactionFinished(
    req,
    res,
    { login: { accountId }, consent: { grantId } },
    { mergeWithLastSubmission: false },
  );
  return toFetchResponse(res);
}
