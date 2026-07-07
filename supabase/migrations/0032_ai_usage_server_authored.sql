-- ===========================================================================
-- Make the AI usage ledger server-authored (fixes N1: forgeable cost ledger).
--
-- The shared-key budget guard shared_key_cost_today() (0030) sums cost_usd
-- across ALL users to enforce the global $ ceiling. With a client-writable
-- ledger (0029 granted insert to `authenticated` with only a user_id check),
-- any signed-in user could PostgREST-insert forged rows:
--   * { used_own_key: false, cost_usd: -1000000 } → sum goes negative → the
--     ceiling never trips → the shared Anthropic key can be driven to unbounded
--     spend; or
--   * { used_own_key: false, cost_usd: 999999 } → sum reads as exhausted →
--     every non-BYOK user is refused AI (cross-user DoS).
--
-- Fix: revoke the client's write path entirely. logAiUsage now writes via the
-- service-role client (src/lib/extraction/aiContext.ts), with token counts taken
-- from the real Anthropic response — so the ledger is fully trusted. Reads are
-- unchanged: users still SELECT their own rows (for the per-user call cap and
-- the BYOK cost display), and there is still no update/delete path.
-- ===========================================================================

revoke insert on ai_usage from authenticated;
drop policy if exists ai_usage_insert on ai_usage;

-- Defense in depth: even the trusted writer can't store nonsense values that
-- would skew the ledger or the budget guard.
alter table ai_usage
  add constraint ai_usage_nonneg
  check (cost_usd >= 0 and input_tokens >= 0 and output_tokens >= 0);
