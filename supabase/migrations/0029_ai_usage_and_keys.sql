-- ===========================================================================
-- AI usage ledger + bring-your-own-key storage.
--
-- ai_usage — one row per Anthropic model call. Powers two things:
--   * per-user rate limiting (cost-DoS guard on the AI endpoints), and
--   * the BYOK usage/cost ledger shown to each user in Settings.
--   Rows are immutable from the client (no update/delete policy).
--
-- user_ai_key — a user's OWN Anthropic API key, encrypted at rest (app-layer
--   AES-256-GCM, see src/lib/crypto.ts). Written only by server actions that
--   encrypt; RLS confines each row to its owner.
-- ===========================================================================

create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  route text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  used_own_key boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_time_idx on ai_usage(user_id, created_at desc);

alter table ai_usage enable row level security;

create policy ai_usage_select on ai_usage for select
  using (user_id = auth.uid());
create policy ai_usage_insert on ai_usage for insert
  with check (user_id = auth.uid());
-- Deliberately no update/delete policy: a user cannot rewrite their own ledger.

create table if not exists user_ai_key (
  user_id uuid primary key references auth.users on delete cascade,
  key_cipher text not null,
  key_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_ai_key enable row level security;

create policy user_ai_key_select on user_ai_key for select
  using (user_id = auth.uid());
create policy user_ai_key_insert on user_ai_key for insert
  with check (user_id = auth.uid());
create policy user_ai_key_update on user_ai_key for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_ai_key_delete on user_ai_key for delete
  using (user_id = auth.uid());
