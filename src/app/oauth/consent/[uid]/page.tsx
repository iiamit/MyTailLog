import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getOAuthProvider } from "@/lib/oauth/provider";
import { toNode } from "@/lib/oauth/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Load the pending interaction using oidc-provider's own logic (reads the signed
// _interaction cookie → uid → interaction), rebuilding a Node request from the
// incoming cookies. Same source of truth as the /decide handler. Returns null
// when the request is missing/expired.
async function loadInteraction(uid: string) {
  const jar = await cookies();
  const cookieHeader = jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const request = new Request(`${site}/oauth/consent/${uid}`, { headers: { cookie: cookieHeader } });
  const { req, res } = toNode(request);
  try {
    return await getOAuthProvider().interactionDetails(req, res);
  } catch {
    return null;
  }
}

// Plain-English labels for the scopes an app can request (see docs/oauth-api-plan).
const SCOPE_LABELS: Record<string, string> = {
  "airworthiness:read": "Airworthiness — AD/inspection status, due dates, current hours",
  "aircraft:read": "Aircraft details — tail, make/model, serial numbers, home base",
  "equipment:read": "Installed equipment & components",
  "hours:read": "Current hours (hobbs / tach)",
  "oil:read": "Oil-analysis samples & wear-metal trends",
  "weightbalance:read": "Weight & balance",
};

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <div className="flex flex-col gap-4 rounded-lg border border-line p-6">{children}</div>
    </main>
  );
}

export default async function ConsentPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/oauth/consent/${uid}`);

  const details = await loadInteraction(uid);
  const clientId = details?.params?.client_id ? String(details.params.client_id) : null;
  if (!clientId) {
    // ponytail: E2E-gated diagnostic (never rendered in prod) to pin why the
    // interaction didn't load. Remove once the flow is green.
    let debug: string | null = null;
    if (process.env.E2E_STUB_AI) {
      const svc = createServiceClient();
      const byId = await svc
        .from("oidc_payloads")
        .select("id, uid, type, expires_at, payload")
        .eq("id", uid)
        .maybeSingle();
      const inter = await svc
        .from("oidc_payloads")
        .select("id, uid, type, expires_at")
        .eq("type", "Interaction")
        .limit(5);
      debug = JSON.stringify({
        uid,
        detailsNull: !details,
        byIdErr: byId.error?.message ?? null,
        byIdFound: !!byId.data,
        byIdType: byId.data?.type ?? null,
        byIdPayloadKeys: byId.data?.payload ? Object.keys(byId.data.payload) : null,
        byIdHasParams: !!(byId.data?.payload as { params?: unknown } | null)?.params,
        interErr: inter.error?.message ?? null,
        interRows: inter.data,
      });
    }
    return (
      <Frame>
        <h1 className="font-display text-lg font-semibold">Request expired</h1>
        <p className="text-sm text-dim">
          This authorization request is no longer valid. Please start again from the app.
        </p>
        {debug && (
          <pre data-testid="oauth-debug" style={{ whiteSpace: "pre-wrap", fontSize: 10 }}>
            {debug}
          </pre>
        )}
      </Frame>
    );
  }

  const requested = String(details!.params.scope ?? "").split(" ").filter(Boolean);
  const dataScopes = requested.filter((s) => s !== "openid" && s !== "offline_access");

  // Client display name — service client because oauth_client RLS is owner-scoped
  // (the developer), not the consenting user.
  const { data: client } = await createServiceClient()
    .from("oauth_client")
    .select("name")
    .eq("client_id", clientId)
    .maybeSingle();
  const appName = client?.name ?? "An application";

  // Aircraft the user OWNS (only an owner consents to share their aircraft).
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number, make, model")
    .eq("owner_id", user.id)
    .order("tail_number");

  return (
    <Frame>
      <div>
        <div className="eyebrow mb-1">Authorize access</div>
        <h1 className="font-display text-xl font-semibold leading-tight">
          {appName} wants to read your aircraft data
        </h1>
        <p className="mt-1 text-sm text-dim">Signed in as {user.email}. Read-only — no changes are ever made.</p>
      </div>

      <form action={`/oauth/consent/${uid}/decide`} method="post" className="flex flex-col gap-4">
        <section>
          <div className="text-xs font-medium uppercase tracking-wide text-faint">It will be able to read</div>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {dataScopes.map((s) => (
              <li key={s} className="text-ink">
                • {SCOPE_LABELS[s] ?? s}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <div className="text-xs font-medium uppercase tracking-wide text-faint">For these aircraft</div>
          {aircraft && aircraft.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {aircraft.map((a) => (
                <li key={a.id}>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="aircraft" value={a.id} defaultChecked />
                    <span className="text-ink">{a.tail_number}</span>
                    <span className="text-faint">
                      {[a.make, a.model].filter(Boolean).join(" ")}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-dim">You have no aircraft to share.</p>
          )}
          <p className="mt-2 text-xs text-faint">Only the aircraft you check will be shared. You can revoke anytime in your profile.</p>
        </section>

        <div className="flex gap-2">
          <button
            type="submit"
            name="decision"
            value="approve"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
          >
            Allow access
          </button>
          <button
            type="submit"
            name="decision"
            value="deny"
            className="rounded-md border border-line px-4 py-2 text-sm text-dim hover:text-ink"
          >
            Deny
          </button>
        </div>
      </form>
    </Frame>
  );
}
