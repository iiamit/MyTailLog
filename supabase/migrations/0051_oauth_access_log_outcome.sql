-- Record DENIED resource-server calls, not just successful ones.
--
-- Why: `logAccess` runs only AFTER a request has passed `guard()` and written
-- its data, so oauth_access_log held nothing but successes. When MyFlightBook
-- reported pushing hobbs/tach nightly for a week and we could see only two
-- calls, there was no way to tell "the partner stopped sending" from "every
-- call since was rejected and we kept no record" — the two look identical from
-- here. That ambiguity is the bug this fixes.
--
-- Existing rows are all successes, so `status` defaults to 200 and the backfill
-- is the default itself. `error` holds the OAuth error CODE only
-- (invalid_token, insufficient_scope, not_found, rate_limited) — never a token,
-- never a caller-supplied string, because this table is owner-readable.

alter table oauth_access_log
  add column if not exists status smallint not null default 200;

alter table oauth_access_log
  add column if not exists error text;

comment on column oauth_access_log.status is
  'HTTP status of the resource-server call. 200 = served; 4xx = denied by guard().';
comment on column oauth_access_log.error is
  'OAuth error code for a denial (invalid_token | insufficient_scope | not_found | rate_limited). Never a token or caller-supplied text.';

-- Denials are the interesting rows when debugging a partner, and they are rare
-- next to successes, so index them on their own.
create index if not exists oauth_access_log_denied_idx
  on oauth_access_log (created_at desc)
  where status >= 400;

-- RLS is unchanged: `oauth_access_log_select` still scopes reads to
-- account_id = auth.uid(), and there is still no insert policy for
-- `authenticated` — only the service role writes here.
--
-- NOTE ON WHAT IS *NOT* LOGGED: a 401 from an unidentifiable token has no
-- client_id or account_id to attribute, so writing a row per attempt would let
-- anyone on the internet grow this table without bound. Those are emitted to
-- the server log instead (see src/lib/oauth/resource.ts). Rows here always
-- belong to a known client.
