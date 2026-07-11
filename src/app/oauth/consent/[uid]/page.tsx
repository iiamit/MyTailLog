import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

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

  // Read the pending interaction server-side. The uid is unguessable and the
  // real grant is cookie-verified on POST (interactionDetails), so rendering by
  // uid is safe. oidc_payloads is server-only (service client).
  const svc = createServiceClient();
  const { data: rec } = await svc
    .from("oidc_payloads")
    .select("payload, expires_at")
    .eq("type", "Interaction")
    .eq("id", uid)
    .maybeSingle();

  const payload = rec?.payload as { params?: { client_id?: string; scope?: string } } | null;
  const expired = rec?.expires_at ? Date.parse(rec.expires_at) <= Date.now() : false;
  if (!payload?.params?.client_id || expired) {
    return (
      <Frame>
        <h1 className="font-display text-lg font-semibold">Request expired</h1>
        <p className="text-sm text-dim">
          This authorization request is no longer valid. Please start again from the app.
        </p>
      </Frame>
    );
  }

  const clientId = payload.params.client_id;
  const requested = (payload.params.scope ?? "").split(" ").filter(Boolean);
  const dataScopes = requested.filter((s) => s !== "openid" && s !== "offline_access");

  const { data: client } = await svc
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
