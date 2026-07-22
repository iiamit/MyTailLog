-- ===========================================================================
-- Lock down the BYOK key ciphertext column (L2).
--
-- user_ai_key_select (0029) lets a user read their own row via the anon/authed
-- browser client — including the full AES ciphertext (key_cipher). The UI only
-- ever needs key_last4, so exposing key_cipher to the browser only creates an
-- XSS-exfiltration path: injected JS could read the ciphertext for an offline
-- brute-force attack (compounding a weak ENCRYPTION_KEY).
--
-- Revoke column-level SELECT on key_cipher from the browser roles. Row-level
-- access (the RLS policy) and the other columns (key_last4, timestamps) are
-- unchanged, and INSERT/UPDATE of key_cipher by server actions still work
-- (column SELECT privilege is separate from write privilege). The one legitimate
-- server-side reader, getUserAiKey (src/lib/extraction/aiContext.ts), now reads
-- via the service-role client with an explicit user_id filter, so it is
-- unaffected.
-- ===========================================================================

revoke select (key_cipher) on user_ai_key from authenticated, anon;
