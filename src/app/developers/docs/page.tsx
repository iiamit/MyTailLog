import Link from "next/link";
import { AccountShell } from "@/components/shell/AccountShell";
import { DATA_SCOPES, SCOPE_LABELS } from "@/lib/oauth/scopes";

export const dynamic = "force-dynamic";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="readout overflow-x-auto rounded-md border border-line bg-panel2 p-3 text-[12px] leading-relaxed text-ink">
      {children}
    </pre>
  );
}

export default function DeveloperDocsPage() {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mytaillog.com").replace(/\/$/, "");
  const issuer = `${origin}/api/oidc`;

  return (
    <AccountShell>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8 text-[14px] leading-relaxed">
        <header>
          <div className="eyebrow mb-2">Developer API</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">API documentation</h1>
          <p className="mt-2 text-dim">
            Read a user&apos;s aircraft airworthiness data, with their per-aircraft consent, over
            OAuth 2.1 (Authorization Code + PKCE). <Link href="/developers" className="underline">Register an app →</Link>
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Discovery</h2>
          <p className="text-dim">Server metadata (endpoints, scopes, PKCE methods):</p>
          <Code>{`${origin}/.well-known/oauth-authorization-server
${issuer}/.well-known/openid-configuration`}</Code>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">1 · Register</h2>
          <p className="text-dim">
            Create an app under <Link href="/developers" className="underline">Developer API</Link>: a name,
            exact redirect URI(s), and the scopes you need. You get a <code>client_id</code>. Apps are
            <strong> public clients</strong> — no secret; use PKCE.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">2 · Authorize</h2>
          <p className="text-dim">Send the user to the authorization endpoint with a PKCE challenge:</p>
          <Code>{`${issuer}/auth
  ?response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=YOUR_REGISTERED_URI
  &scope=openid airworthiness:read
  &code_challenge=BASE64URL(SHA256(verifier))
  &code_challenge_method=S256`}</Code>
          <p className="text-dim">
            They sign in, pick which aircraft to share, and are redirected back with <code>?code=…</code>.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">3 · Exchange the code for a token</h2>
          <Code>{`curl -X POST ${issuer}/token \\
  -d grant_type=authorization_code \\
  -d code=THE_CODE \\
  -d redirect_uri=YOUR_REGISTERED_URI \\
  -d client_id=YOUR_CLIENT_ID \\
  -d code_verifier=THE_VERIFIER`}</Code>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">4 · Call the API</h2>
          <p className="text-dim">Send the access token as a bearer:</p>
          <Code>{`curl ${origin}/api/v1/aircraft \\
  -H "Authorization: Bearer ACCESS_TOKEN"`}</Code>
          <p className="text-dim">Per-aircraft endpoints (only aircraft the user granted you):</p>
          <Code>{`GET /api/v1/aircraft
GET /api/v1/aircraft/{id}/airworthiness
GET /api/v1/aircraft/{id}/equipment
GET /api/v1/aircraft/{id}/hours
GET /api/v1/aircraft/{id}/oil
GET /api/v1/aircraft/{id}/weightbalance`}</Code>
          <p className="text-dim">
            A request for an aircraft the user didn&apos;t grant returns <code>404</code>; a missing scope
            returns <code>403</code>; a bad/expired token returns <code>401</code>.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Scopes</h2>
          <ul className="flex flex-col gap-1 text-dim">
            {DATA_SCOPES.map((s) => (
              <li key={s}>
                <code className="text-ink">{s}</code> — {SCOPE_LABELS[s]}
              </li>
            ))}
          </ul>
          <p className="text-faint text-[12px]">
            Log entries (the transcribed history) are never shared. All access is read-only.
          </p>
        </section>
      </main>
    </AccountShell>
  );
}
