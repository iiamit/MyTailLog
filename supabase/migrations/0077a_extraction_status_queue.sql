-- 0077a — enum values only, in their own file/transaction (09 §2.9, §7):
-- 0077b's queue index uses them, which Postgres refuses in the transaction
-- that adds them. Clients must treat unknown values as "being read".
alter type extraction_status add value if not exists 'queued';
alter type extraction_status add value if not exists 'waiting_allowance';
