// Generate a signing JWKS for the OAuth provider (OIDC_JWKS secret).
//   node scripts/gen-oidc-jwks.mjs
// Copy the single-line JSON output into OIDC_JWKS (.env.local + Secret Manager).
// Keep it secret and stable — rotating it invalidates issued tokens.
import { generateKeyPairSync, randomUUID } from "node:crypto";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = privateKey.export({ format: "jwk" });
const jwks = { keys: [{ ...jwk, use: "sig", alg: "RS256", kid: randomUUID() }] };
console.log(JSON.stringify(jwks));
