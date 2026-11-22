#!/usr/bin/env python3
"""Actual PostgreSQL receipt/effect concurrency and injected-failure checks.
Run with the same pgserver + psycopg environment as test-audit-database.py.
"""
from pathlib import Path
import concurrent.futures
import json
import runpy
import unittest
import uuid
import psycopg

base = runpy.run_path(str(Path(__file__).with_name("test-audit-database.py")))
connect, fixture, rpc = (base[k] for k in ("connect", "fixture", "rpc"))

class SyncReceiptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): base["bootstrap"]()

    def rig(self):
        user, aircraft, *_ = fixture()
        with connect() as db:
            version = db.execute("select updated_at from aircraft where id=%s", (aircraft,)).fetchone()[0].isoformat()
        mutation = {"id": str(uuid.uuid4()), "aircraftId": aircraft, "type": "aircraft.setSituation", "base": version,
                    "payload": {"situation": "in_shop"}}
        args = {"p_table": "aircraft", "p_aircraft": aircraft, "p_id": aircraft, "p_base": version,
                "p_patch": {"situation_override": "in_shop"}, "p_delete": False}
        return user, aircraft, mutation, args

    def apply(self, user, mutation, args):
        with connect(user) as db:
            return rpc(db, "apply_sync_write", json.dumps(mutation), "write_record", json.dumps(args))

    def test_concurrent_same_id_applies_once_and_returns_the_same_acknowledged_row(self):
        user, aircraft, mutation, args = self.rig()
        with connect() as db:
            before = db.execute("select count(*) from change_log where row_id=%s", (aircraft,)).fetchone()[0]
        with concurrent.futures.ThreadPoolExecutor() as pool:
            responses = list(pool.map(lambda _: self.apply(user, mutation, args), range(2)))
        self.assertEqual(responses[0]["row"], responses[1]["row"])
        with connect() as db:
            self.assertEqual(db.execute("select count(*) from change_log where row_id=%s", (aircraft,)).fetchone()[0], before + 1)
            self.assertEqual(db.execute("select count(*) from sync_mutation where user_id=%s and id=%s", (user, mutation["id"])).fetchone()[0], 1)

    def test_receipt_failure_rolls_back_the_effect_and_retry_can_finish(self):
        user, aircraft, mutation, args = self.rig()
        with connect() as db:
            db.execute("create function test_fail_receipt() returns trigger language plpgsql as $$begin raise exception 'injected receipt failure'; end$$; create trigger fail_receipt before insert on sync_mutation for each row execute function test_fail_receipt()")
        try:
            with self.assertRaises(psycopg.errors.RaiseException): self.apply(user, mutation, args)
            with connect() as db:
                self.assertIsNone(db.execute("select situation_override from aircraft where id=%s", (aircraft,)).fetchone()[0])
                self.assertEqual(db.execute("select count(*) from sync_mutation where user_id=%s and id=%s", (user, mutation["id"])).fetchone()[0], 0)
        finally:
            with connect() as db: db.execute("drop trigger fail_receipt on sync_mutation; drop function test_fail_receipt()")
        self.assertEqual(self.apply(user, mutation, args)["status"], "ok")

    def test_a_late_error_cannot_replace_the_committed_success(self):
        user, aircraft, mutation, args = self.rig()
        expected = self.apply(user, mutation, args)
        with connect(user) as db:
            saved = rpc(db, "record_sync_result", json.dumps(mutation), json.dumps({"id": mutation["id"], "status": "error", "error": "response lost"}), None)
            self.assertEqual(saved["status"], "ok")
            self.assertEqual(saved["row"], expected["row"])
        self.assertEqual(self.apply(user, mutation, args)["row"], expected["row"])

    def test_reused_id_for_another_payload_is_not_acknowledged(self):
        user, aircraft, mutation, args = self.rig()
        self.apply(user, mutation, args)
        changed = {**mutation, "payload": {"situation": "preparing_sale"}}
        with self.assertRaises(psycopg.errors.InvalidParameterValue): self.apply(user, changed, args)
        with connect(user) as db:
            with self.assertRaises(psycopg.errors.InvalidParameterValue):
                rpc(db, "record_sync_result", json.dumps(changed), json.dumps({"id": mutation["id"], "status": "error"}), None)

if __name__ == "__main__": unittest.main(verbosity=2)
