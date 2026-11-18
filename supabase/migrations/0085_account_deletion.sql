-- ===========================================================================
-- 0085 — Let an account be deleted (App Store 5.1.1(v); 09 §8 item 10).
--
-- squawk.reported_by (0043) is "not null … on delete set null": deleting a user
-- who ever reported a squawk on someone else's aircraft fails with a not-null
-- violation. Relax it to nullable, which is what its FK always meant; the insert
-- policy still requires reported_by = auth.uid(), and reporter_name keeps the
-- display name. (Relaxing NOT NULL is additive: every existing value is valid.)
-- ===========================================================================

alter table squawk alter column reported_by drop not null;
