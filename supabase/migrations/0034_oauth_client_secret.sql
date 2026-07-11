-- ===========================================================================
-- Confidential OAuth clients (P4 — server-to-server apps like MyFlightBook).
--
-- oidc-provider must reproduce a client's secret to authenticate it at the token
-- endpoint, so the secret is stored ENCRYPTED (AES-256-GCM, reversible — same
-- pattern as mfb_connection secrets and users' Anthropic keys), NOT hashed. The
-- ENCRYPTION_KEY lives in Secret Manager, so a DB-only leak doesn't expose it.
--
-- Replaces the never-populated `client_secret_hash` column (all clients were
-- public + PKCE until now) with a correctly-named `client_secret_cipher`.
-- ===========================================================================
alter table oauth_client drop column if exists client_secret_hash;
alter table oauth_client add column if not exists client_secret_cipher text;
comment on column oauth_client.client_secret_cipher is
  'AES-256-GCM ciphertext (v1:) of the client secret for confidential clients. '
  'Encrypted, not hashed, because the provider reproduces it to authenticate the client.';
