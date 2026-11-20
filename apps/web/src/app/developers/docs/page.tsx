import Link from "next/link";
import { InformationShell } from "@/components/InformationShell";
import { CodeWell, ReadSection } from "@/components/public/Read";
import { DATA_SCOPES, SCOPE_LABELS } from "@/lib/oauth/scopes";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "API documentation",
  description: "Read an owner's aircraft data, with their per-aircraft consent, over OAuth 2.1 with PKCE.",
};

export default function DeveloperDocsPage() {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mytaillog.com").replace(/\/$/, "");
  const issuer = `${origin}/api/oidc`;

  return (
    <InformationShell
      group="share"
      path="/developers/docs"
      title="API documentation"
      lede={
        <p>
          Read an owner&apos;s maintenance status, equipment, hours, oil analysis and weight and balance, with their consent
          for each aircraft, over OAuth 2.1 (authorization code with PKCE). <Link href="/developers">Register an app</Link>.
        </p>
      }
      toc={[
        { id: "discovery", title: "Discovery" },
        { id: "register", title: "Register" },
        { id: "authorize", title: "Authorize" },
        { id: "token", title: "Exchange the code" },
        { id: "call", title: "Call the API" },
        { id: "confidential", title: "Server-to-server apps" },
        { id: "scopes", title: "Scopes" },
      ]}
    >
      <ReadSection id="discovery" title="Discovery" first>
        <p>Server metadata (endpoints, scopes, PKCE methods):</p>
        <CodeWell label="Discovery URLs">{`${origin}/.well-known/oauth-authorization-server
${issuer}/.well-known/openid-configuration`}</CodeWell>
      </ReadSection>

      <ReadSection id="register" title="Register">
        <p>
          Create an app under <Link href="/developers">API keys</Link>: a name, the exact redirect URIs, and the scopes you
          need. You get a <code>client_id</code>. Apps are <strong>public clients</strong>{" "}by default: no secret, so use PKCE.
        </p>
      </ReadSection>

      <ReadSection id="authorize" title="Authorize">
        <p>Send the owner to the authorization endpoint with a PKCE challenge:</p>
        <CodeWell label="Authorization request">{`${issuer}/auth
  ?response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=YOUR_REGISTERED_URI
  &scope=openid airworthiness:read
  &code_challenge=BASE64URL(SHA256(verifier))
  &code_challenge_method=S256`}</CodeWell>
        <p>
          They sign in, pick which aircraft to share, and come back to your redirect URI with <code>?code=…</code>. The
          scope name <code>airworthiness:read</code>{" "}is an identifier kept for existing apps; it grants the maintenance
          status the owner&apos;s records show, not a determination about the aircraft.
        </p>
      </ReadSection>

      <ReadSection id="token" title="Exchange the code">
        <CodeWell label="Token request">{`curl -X POST ${issuer}/token \\
  -d grant_type=authorization_code \\
  -d code=THE_CODE \\
  -d redirect_uri=YOUR_REGISTERED_URI \\
  -d client_id=YOUR_CLIENT_ID \\
  -d code_verifier=THE_VERIFIER`}</CodeWell>
      </ReadSection>

      <ReadSection id="call" title="Call the API">
        <p>Send the access token as a bearer token:</p>
        <CodeWell label="API request">{`curl ${origin}/api/v1/aircraft \\
  -H "Authorization: Bearer ACCESS_TOKEN"`}</CodeWell>
        <p>Endpoints for each aircraft (only the aircraft the owner granted you):</p>
        <CodeWell label="Endpoints">{`GET /api/v1/aircraft
GET /api/v1/aircraft/{id}/airworthiness
GET /api/v1/aircraft/{id}/equipment
GET /api/v1/aircraft/{id}/hours
GET /api/v1/aircraft/{id}/oil
GET /api/v1/aircraft/{id}/weightbalance`}</CodeWell>
        <p>
          A request for an aircraft the owner didn&apos;t grant returns <code>404</code>, a missing scope returns{" "}
          <code>403</code>, and a bad or expired token returns <code>401</code>.
        </p>
      </ReadSection>

      <ReadSection id="confidential" title="Server-to-server apps">
        <p>
          Check <strong>Confidential</strong>{" "}when registering to get a <strong>client secret</strong>. It is shown once;
          rotate it any time. Server apps authenticate the token request with HTTP Basic (<code>client_id:client_secret</code>)
          as well as PKCE:
        </p>
        <CodeWell label="Confidential token request">{`curl -X POST ${issuer}/token \\
  -u YOUR_CLIENT_ID:YOUR_CLIENT_SECRET \\
  -d grant_type=authorization_code \\
  -d code=THE_CODE \\
  -d redirect_uri=YOUR_REGISTERED_URI \\
  -d code_verifier=THE_VERIFIER`}</CodeWell>
        <p>Public apps skip the secret and rely on PKCE. Either way, access is per aircraft and read-only.</p>
      </ReadSection>

      <ReadSection id="scopes" title="Scopes">
        <table>
          <thead><tr><th scope="col">Scope</th><th scope="col">Grants</th></tr></thead>
          <tbody>
            {DATA_SCOPES.map((s) => (
              <tr key={s}><td><code>{s}</code></td><td>{SCOPE_LABELS[s]}</td></tr>
            ))}
          </tbody>
        </table>
        <p>Log entries (the transcribed history) are never shared. All access is read-only, except <code>hours:write</code>, which adds hour readings.</p>
      </ReadSection>
    </InformationShell>
  );
}
