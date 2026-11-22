#!/usr/bin/env python3
"""Exercise review/undo receipts against disposable Postgres with full migrations/RLS."""
from pathlib import Path
from datetime import datetime
from contextlib import contextmanager
import json, runpy, unittest
import psycopg
from psycopg import sql
base = runpy.run_path(str(Path(__file__).with_name('test-audit-database.py')))
connect, fixture, rpc = (base[k] for k in ('connect', 'fixture', 'rpc'))

def instant(value):
 return datetime.fromisoformat(value.replace('Z', '+00:00')) if isinstance(value, str) else value

def entries(ac, book, page, count=2, confirmed=False):
 with connect() as db:
  return [(str(row[0]), row[1]) for row in (db.execute("insert into log_entry(aircraft_id,logbook_id,page_id,description,confidence,owner_confirmed) values(%s,%s,%s,%s,.99,%s) returning id,updated_at", (ac, book, page, f'entry {i}', confirmed)).fetchone() for i in range(count))]

def page_version(page):
 with connect() as db: return db.execute('select updated_at from page where id=%s', (page,)).fetchone()[0]

def confirm(user, ac, book, page, rows):
 writes=[{'id':entry, 'base':version.isoformat(), 'fields':{}, 'isNew':False} for entry,version in rows]
 with connect(user) as db: return rpc(db, 'confirm_review_entries', ac, page, book, page_version(page), json.dumps(writes), True)['row']

def undo(user, ac, result):
 with connect(user) as db: return rpc(db, 'undo_review_confirmation', ac, json.dumps(result['entryVersions']), json.dumps(result['pageVersions']))

class ReviewVersions(unittest.TestCase):
 @contextmanager
 def conflict(self):
  with self.assertRaises(psycopg.DatabaseError) as caught:
   yield
  self.assertEqual(caught.exception.sqlstate, "PT409", "business conflicts must not trigger PostgREST serialization retries")
 @classmethod
 def setUpClass(cls): base['bootstrap']()
 def assert_receipt(self, result, expected_entries, expected_pages):
  self.assertEqual(set(result['entryVersions']), set(expected_entries))
  self.assertEqual(set(result['pageVersions']), set(expected_pages))
  with connect() as db:
   for table,key in [('log_entry','entryVersions'), ('page','pageVersions')]:
    for record,version in result[key].items():
     # Fixed test table names are quoted by psycopg.sql.Identifier; record is bound.
     # nosemgrep: python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query
     self.assertEqual(db.execute(sql.SQL('select updated_at from {} where id=%s').format(sql.Identifier(table)), (record,)).fetchone()[0], instant(version))
 def test_an_entry_added_after_rendering_cannot_be_silently_page_confirmed(self):
  user,ac,book,page=fixture(); rows=entries(ac,book,page,1); unseen=entries(ac,book,page,1)
  with self.conflict(): confirm(user,ac,book,page,rows)
  with connect() as db:
   self.assertEqual(db.execute('select count(*) from log_entry where page_id=%s and owner_confirmed',(page,)).fetchone()[0],0)
   self.assertEqual(db.execute('select review_status from page where id=%s',(page,)).fetchone()[0],'unreviewed')
 def test_later_entry_failure_rolls_back_earlier_entry_and_page(self):
  user,ac,book,page=fixture(); rows=entries(ac,book,page); before=page_version(page)
  with connect() as db: db.execute("update log_entry set description='changed meanwhile' where id=%s", (rows[-1][0],))
  with self.conflict(): confirm(user,ac,book,page,rows)
  with connect() as db:
   self.assertEqual(db.execute('select count(*) from log_entry where page_id=%s and owner_confirmed', (page,)).fetchone()[0], 0)
   self.assertEqual(db.execute('select review_status,updated_at from page where id=%s', (page,)).fetchone(), ('unreviewed',before))
 def test_later_write_error_rolls_back_an_earlier_successful_update(self):
  user,ac,book,page=fixture(); rows=entries(ac,book,page); before=page_version(page)
  writes=[{'id':entry,'base':version.isoformat(),'fields':{}} for entry,version in rows]
  writes[-1]['fields']={'entry_date':'not-a-date'}
  with connect(user) as db:
   with self.assertRaises(psycopg.errors.InvalidDatetimeFormat): rpc(db,'confirm_review_entries',ac,page,book,before,json.dumps(writes),True)
  with connect() as db:
   for entry,version in rows:
    self.assertEqual(db.execute('select owner_confirmed,updated_at from log_entry where id=%s', (entry,)).fetchone(), (False,version))
   self.assertEqual(db.execute('select review_status,updated_at from page where id=%s', (page,)).fetchone(), ('unreviewed',before))
 def test_success_receipt_contains_exact_versions_and_undo_changes_both(self):
  user,ac,book,page=fixture(); rows=entries(ac,book,page)
  result=confirm(user,ac,book,page,rows)
  self.assertEqual(set(result['confirmed']), {row[0] for row in rows})
  self.assert_receipt(result, [row[0] for row in rows], [page])
  self.assertEqual(undo(user,ac,result)['status'], 'ok')
  with connect() as db:
   self.assertEqual(db.execute('select count(*) from log_entry where page_id=%s and owner_confirmed', (page,)).fetchone()[0], 0)
   self.assertEqual(db.execute('select review_status from page where id=%s', (page,)).fetchone()[0], 'unreviewed')
 def test_edit_after_confirm_prevents_entire_undo(self):
  user,ac,book,page=fixture(); rows=entries(ac,book,page)
  result=confirm(user,ac,book,page,rows)
  with connect() as db: db.execute("update log_entry set description='edited after confirmation' where id=%s", (rows[-1][0],))
  with self.conflict(): undo(user,ac,result)
  with connect() as db:
   self.assertEqual(db.execute('select count(*) from log_entry where page_id=%s and owner_confirmed', (page,)).fetchone()[0], 2)
   self.assertEqual(db.execute('select review_status,updated_at from page where id=%s', (page,)).fetchone(), ('confirmed',instant(result['pageVersions'][page])))
   self.assertEqual(db.execute('select updated_at from log_entry where id=%s', (rows[0][0],)).fetchone()[0], instant(result['entryVersions'][rows[0][0]]))
 def test_page_edit_after_confirm_prevents_entries_being_undone(self):
  user,ac,book,page=fixture(); rows=entries(ac,book,page)
  result=confirm(user,ac,book,page,rows)
  with connect() as db: db.execute('update page set needs_look=true where id=%s', (page,))
  with self.conflict(): undo(user,ac,result)
  with connect() as db: self.assertEqual(db.execute('select count(*) from log_entry where page_id=%s and owner_confirmed', (page,)).fetchone()[0], 2)
 def test_bulk_clean_only_receipts_rows_and_pages_actually_changed(self):
  user,ac,book,page=fixture(); rows=entries(ac,book,page,1); already=entries(ac,book,page,1,True)
  with connect() as db:
   other_page=str(db.execute("insert into page(aircraft_id,logbook_id,storage_path,page_sequence,review_status) values(%s,%s,%s,2,'confirmed') returning id", (ac,book,f'{ac}/pages/two.jpg')).fetchone()[0])
  other_rows=entries(ac,book,other_page,1,True)
  versions={entry:version.isoformat() for entry,version in rows+already+other_rows}
  with connect(user) as db: result=rpc(db,'confirm_clean_entries',ac,json.dumps(versions))['row']
  self.assertEqual(result['confirmed'], 1)
  self.assert_receipt(result, [rows[0][0]], [page])
  undo(user,ac,result)
  with connect() as db:
   self.assertTrue(db.execute('select owner_confirmed from log_entry where id=%s', (already[0][0],)).fetchone()[0])
   self.assertTrue(db.execute('select owner_confirmed from log_entry where id=%s', (other_rows[0][0],)).fetchone()[0])
   self.assertEqual(db.execute('select review_status from page where id=%s', (other_page,)).fetchone()[0], 'confirmed')
 def test_manual_review_preserves_previously_confirmed_rows_on_undo(self):
  user,ac,book,page=fixture(); pending=entries(ac,book,page,1); unchanged=entries(ac,book,page,1,True); edited=entries(ac,book,page,1,True)
  rows=pending+unchanged+edited
  writes=[{'id':entry,'base':version.isoformat(),'fields':{}} for entry,version in rows]
  writes[-1]['fields']={'description':'corrected an already confirmed entry'}
  with connect(user) as db: result=rpc(db,'confirm_review_entries',ac,page,book,page_version(page),json.dumps(writes),True)['row']
  self.assert_receipt(result,[pending[0][0]],[page])
  self.assertEqual(set(result['updatedVersions']), {row[0] for row in rows})
  with connect() as db:
   self.assertEqual(db.execute('select updated_at from log_entry where id=%s',(unchanged[0][0],)).fetchone()[0], unchanged[0][1])
   self.assertEqual(db.execute('select updated_at from log_entry where id=%s',(edited[0][0],)).fetchone()[0], instant(result['updatedVersions'][edited[0][0]]))
  undo(user,ac,result)
  with connect() as db:
   self.assertFalse(db.execute('select owner_confirmed from log_entry where id=%s',(pending[0][0],)).fetchone()[0])
   self.assertTrue(db.execute('select owner_confirmed from log_entry where id=%s',(unchanged[0][0],)).fetchone()[0])
   self.assertEqual(db.execute('select owner_confirmed,description from log_entry where id=%s',(edited[0][0],)).fetchone(), (True,'corrected an already confirmed entry'))
 def test_manual_review_does_not_receipt_already_confirmed_page(self):
  user,ac,book,page=fixture(); rows=entries(ac,book,page,1,True)
  with connect() as db: db.execute("update page set review_status='confirmed' where id=%s",(page,))
  before=page_version(page)
  result=confirm(user,ac,book,page,rows)
  self.assert_receipt(result,[],[])
  undo(user,ac,result)
  with connect() as db: self.assertEqual(db.execute('select review_status,updated_at from page where id=%s',(page,)).fetchone(), ('confirmed',before))
 def test_stale_rendered_page_version_cannot_confirm(self):
  user,ac,book,page=fixture(); rows=entries(ac,book,page); old=page_version(page)
  with connect() as db: db.execute('update page set needs_look=true where id=%s', (page,))
  writes=[{'id':entry,'base':version.isoformat(),'fields':{}} for entry,version in rows]
  with connect(user) as db:
   with self.conflict(): rpc(db,'confirm_review_entries',ac,page,book,old,json.dumps(writes),True)
 def test_stale_bulk_entry_version_changes_nothing(self):
  user,ac,book,page=fixture(); rows=entries(ac,book,page)
  with connect() as db: db.execute("update log_entry set description='changed' where id=%s", (rows[-1][0],))
  with connect(user) as db: result=rpc(db,'confirm_clean_entries',ac,json.dumps({entry:version.isoformat() for entry,version in rows}))
  self.assertEqual(result['status'], 'conflict')
  with connect() as db: self.assertEqual(db.execute('select count(*) from log_entry where page_id=%s and owner_confirmed', (page,)).fetchone()[0], 0)
 def test_null_receipt_version_cannot_bypass_undo_check(self):
  user,ac,book,page=fixture(); rows=entries(ac,book,page)
  result=confirm(user,ac,book,page,rows)
  result['entryVersions'][rows[0][0]]=None
  with self.conflict(): undo(user,ac,result)
 def test_null_bulk_version_cannot_bypass_confirmation_check(self):
  user,ac,book,page=fixture(); rows=entries(ac,book,page,1)
  with connect(user) as db: result=rpc(db,'confirm_clean_entries',ac,json.dumps({rows[0][0]:None}))
  self.assertEqual(result['status'], 'conflict')
  with connect() as db: self.assertFalse(db.execute('select owner_confirmed from log_entry where id=%s', (rows[0][0],)).fetchone()[0])

if __name__ == '__main__': unittest.main(verbosity=2)
