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

  // NEVER trust the submitted aircraft ids: a tampered form could list aircraft
  // the user doesn't own. Keep only aircraft this user actually OWNS (the consent
  // page only *displays* owned aircraft — it is not the security boundary). RLS
  // (0035) enforces the same, but we filter here for a clean deny + defense in depth.
  const { data: owned } = await supabase
    .from("aircraft")
    .select("id")
    .eq("owner_id", accountId)
    .in("id", aircraftIds);
  const ownedIds = (owned ?? []).map((a) => a.id);
  if (ownedIds.length === 0) {
    await provider.interactionFinished(
      req,
      res,
      { error: "access_denied", error_description: "No aircraft you own were selected." },
      { mergeWithLastSubmission: false },
    );
    return toFetchResponse(res);
  }

  // The oidc grant carries the requested scopes; the per-aircraft restriction is
  // ours (oauth_aircraft_grant), enforced by the Resource Server (P2).
  const grant = new provider.Grant({ accountId, clientId });
  grant.addOIDCScope(requested.join(" "));
  const grantId = await grant.save();

  const dataScopes = requested.filter((s) => s !== "openid" && s !== "offline_access");
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
  if (!error) {
    // Re-consent must be able to NARROW sharing: revoke this client's grants for
    // any aircraft the owner did NOT re-select. The consent UI promises exactly
    // this ("only the aircraft you check will be shared"); without it, un-checking
    // an aircraft silently left the old grant live. ownedIds are DB-sourced UUIDs.
    await supabase
      .from("oauth_aircraft_grant")
      .update({ revoked_at: new Date().toISOString() })
      .eq("account_id", accountId)
      .eq("client_id", clientId)
      .is("revoked_at", null)
      .not("aircraft_id", "in", `(${ownedIds.join(",")})`);
  }
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
