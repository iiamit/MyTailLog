#!/usr/bin/env bash
# Replays every supabase/migrations/*.sql in filename order against a
# throwaway Postgres cluster, then runs checks.sql. Fails on the first error.
# Each file runs in its own transaction, as Supabase's apply_migration does,
# so an enum value used in the same file that adds it fails here too.
#
#   supabase/tests/run-migrations.sh            # needs Postgres 15+ binaries
#   PG_BIN=/opt/homebrew/opt/postgresql@17/bin supabase/tests/run-migrations.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
migrations="$here/../migrations"

if [[ -z "${PG_BIN:-}" ]]; then
  if command -v pg_ctl >/dev/null; then PG_BIN="$(dirname "$(command -v pg_ctl)")"
  else PG_BIN="$(brew --prefix postgresql@17 2>/dev/null)/bin"; fi
fi
[[ -x "$PG_BIN/pg_ctl" ]] || { echo "No Postgres binaries (set PG_BIN or: brew install postgresql@17)" >&2; exit 1; }

tmp="$(mktemp -d)"
port=$((20000 + RANDOM % 20000))
cleanup() { "$PG_BIN/pg_ctl" -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT

"$PG_BIN/initdb" -D "$tmp/data" -U postgres --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$tmp/data" -l "$tmp/log" -o "-p $port -k $tmp -c listen_addresses=''" -w start >/dev/null

psql() { "$PG_BIN/psql" -h "$tmp" -p "$port" -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
psql -d postgres -c "create database mtl_test"
psql -d postgres -c "alter database mtl_test set search_path = \"\$user\", public, extensions"

psql -d mtl_test -1 -f "$here/bootstrap.sql"
count=0
while IFS= read -r f; do
  # Optional data seeded just before a migration, so its back-fill has rows.
  seed="$here/seed-before-$(basename "$f")"
  [[ -f "$seed" ]] && psql -d mtl_test -1 -f "$seed"
  if ! out="$(psql -d mtl_test -1 -f "$f" 2>&1)"; then
    echo "FAIL $(basename "$f")"; echo "$out"; exit 1
  fi
  count=$((count + 1))
done < <(find "$migrations" -name '*.sql' | LC_ALL=C sort)
echo "applied $count migrations"

psql -d mtl_test -f "$here/checks.sql"
psql -d mtl_test -f "$here/owner-workspace.sql"
psql -d mtl_test -f "$here/logbook-identity.sql"
echo "checks passed"
