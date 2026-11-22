# Reliability release gates — November 2026

This change keeps the current architecture and moves related authoritative writes into database transactions. No new runtime packages or scheduler framework are required.

## Before rollout

1. Apply repository migrations `0106` through the latest migration in this PR to the Supabase **test** project (`arpirbajxbrjbkldteaz`). Use an interactive database connection, not automatic CI deployment. Confirm the project reference before applying anything.
2. Run the web typecheck, lint and full unit suite. Run `v2-review.spec.ts` against the test database, including the stale review form case.
3. Run the disposable PostgreSQL suites below. They execute actual row-level security, transaction rollback, locks and concurrent commits. They need Python `pgserver` and `psycopg[binary]`, installed in a temporary environment outside the app.

   ```sh
   uv run --with pgserver --with 'psycopg[binary]' scripts/test-audit-database.py
   uv run --with pgserver --with 'psycopg[binary]' scripts/test-audit-record-commands.py
   uv run --with pgserver --with 'psycopg[binary]' scripts/test-audit-sync-receipts.py
   uv run --with pgserver --with 'psycopg[binary]' scripts/test-audit-review-versions.py
   uv run --with pgserver --with 'psycopg[binary]' scripts/test-audit-compliance.py
   ```

4. On `mytaillog-build`, run the iOS, Android and shared API/sync tests. Store release builds and any simulator checks also run there.
5. Review historical storage references before validating the new `NOT VALID` path constraints. They guard all new/updated references immediately; service read/delete checks also guard old references. Do not rewrite historical keys automatically.
6. Apply the same committed migrations to production only during an approved interactive release, then deploy the server. Publish native builds first to testers. Check crash reports, retry outcomes and queue counts before expanding rollout.

## Contracts to preserve

- A mutation effect and successful replay receipt commit together. A retry with the same ID and input returns the committed result; a different input cannot reuse that ID.
- A change-feed publication lock is acquired before source row locks. Statement triggers cover feed-producing tables. New feed tables and compound RPCs must follow the same lock order.
- Updates/deletes compare the rendered row version inside the write transaction. Web forms retain the version they displayed, and adopt the returned version after a successful local save. Undo uses exact versions from its own transaction.
- Authentication expiry requires reauthentication; it does not delete unsent captures or edits. Explicit device-data removal remains a separate user action.
- Structured AD/W&B readings remain pending until a person checks the source and approves them on the website. Native review links to that approval step.
- Batch completion and its durable inbox event commit together. Leases fence overlapping scheduled work. Failed delivery stays retryable.
- A backup contains the declared authoritative tables, paginated rows and referenced originals/photos. A missing source member or failed upload fails restore rather than reporting success.

## Remaining product limits

- APNs/FCM delivery can duplicate if a process dies after provider acceptance but before recording delivery. Durable inbox events are unique; database leases prevent concurrent delivery. There is no claim of exactly-once external push delivery.
- Backup collection spans multiple API reads, not one point-in-time database snapshot. An interrupted restore may leave a partially restored new aircraft; it reports failure explicitly.
- Managed download-all scan archives are still a separate native 2.0 acceptance milestone. Do not retire existing public clients or promise cold-launch offline scan parity until that feature and airplane-mode checks are complete.
- Simulator/unit tests do not replace physical-device background, camera and notification checks.
