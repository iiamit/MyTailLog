#!/usr/bin/env python3
"""Replay migrations and owner-workspace security checks in disposable Postgres.

Uses the same pinned pgserver/psycopg environment as the CI database job.
Only pgcrypto's unsupported extension declaration is omitted; PostgreSQL provides
builtin gen_random_uuid. No external database connection or credentials are used.
"""
from pathlib import Path
import re
import subprocess
import tempfile

import pgserver
import psycopg

ROOT = Path(__file__).resolve().parents[1]


def without_pgcrypto(sql: str) -> str:
    return re.sub(
        r'create extension if not exists "?pgcrypto"?[^;]*;',
        '',
        sql,
        flags=re.IGNORECASE,
    )


def main() -> None:
    with tempfile.TemporaryDirectory(prefix='mtl-owner-pg-') as directory:
        server = pgserver.get_server(Path(directory) / 'data', cleanup_mode='delete')
        try:
            with psycopg.connect(server.get_uri(), autocommit=True) as db:
                db.execute('create database mtl_test')
                db.execute('alter database mtl_test set search_path = "$user",public,extensions')
            uri = server.get_uri(database='mtl_test')
            with psycopg.connect(uri, autocommit=True) as db:
                # Platform grants precede migrations: revoked privileges must
                # remain revoked when authenticated-role checks execute.
                db.execute(without_pgcrypto((ROOT / 'supabase/tests/bootstrap.sql').read_text()))
                for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
                    seed = ROOT / 'supabase/tests' / ('seed-before-' + migration.name)
                    if seed.exists():
                        db.execute(seed.read_text())
                    try:
                        with db.transaction():
                            db.execute(without_pgcrypto(migration.read_text()))
                    except Exception:
                        print(f'Failed migration: {migration.name}', flush=True)
                        raise
            print('All migrations applied', flush=True)
            psql = Path(pgserver.__file__).parent / 'pginstall/bin/psql'
            for name in ('checks.sql', 'owner-workspace.sql'):
                result = subprocess.run(
                    [str(psql), uri, '-X', '-q', '-v', 'ON_ERROR_STOP=1',
                     '-f', str(ROOT / 'supabase/tests' / name)],
                    text=True,
                    capture_output=True,
                )
                print(f'{name}\n{result.stdout}{result.stderr}', flush=True)
                if result.returncode:
                    raise RuntimeError(f'{name} failed')
            print('Owner workspace database gate passed', flush=True)
        finally:
            server.cleanup()


if __name__ == '__main__':
    main()
