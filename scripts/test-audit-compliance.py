#!/usr/bin/env python3
"""AD history + summary are one conditional transaction under authenticated RLS."""
from pathlib import Path
from datetime import datetime
import concurrent.futures, json, runpy, unittest
import psycopg
base=runpy.run_path(str(Path(__file__).with_name('test-audit-database.py')))
connect,fixture,rpc=(base[k] for k in ('connect','fixture','rpc'))

def ad_fixture():
 user,ac,book,page=fixture()
 with connect() as db:
  ad,version=db.execute("insert into ad_compliance(aircraft_id,kind,reference,recurring,interval_months,interval_hours,status,complied_date,complied_hours,next_due_date,next_due_hours) values(%s,'ad','2026-01-01',true,1,50,'complied','2026-01-15',100,'2026-02-15',150) returning id,updated_at",(ac,)).fetchone()
 return user,ac,str(ad),version,book,page

def record(user,ac,ad,version,date='2026-10-31',hours=200,entry=None):
 with connect(user) as db: return rpc(db,'record_ad_compliance',ac,ad,version,date,hours,entry,'inspected')

class AtomicCompliance(unittest.TestCase):
 @classmethod
 def setUpClass(cls): base['bootstrap']()
 def test_success_seeds_prior_history_and_updates_current_summary(self):
  user,ac,ad,version,*_=ad_fixture()
  result=record(user,ac,ad,version)
  self.assertEqual(result['status'],'ok')
  self.assertEqual(result['row']['next_due_date'],'2026-12-01') # JS calendar rollover parity.
  self.assertEqual(result['row']['next_due_hours'],250)
  with connect() as db:
   rows=db.execute('select done_date::text,done_hours,source from item_completion where ad_compliance_id=%s order by done_date',(ad,)).fetchall()
   self.assertEqual(rows,[('2026-01-15',100,'import'),('2026-10-31',200,'mark_done')])
   actual=db.execute('select updated_at from ad_compliance where id=%s',(ad,)).fetchone()[0]
   self.assertEqual(actual,datetime.fromisoformat(result['row']['updated_at']))
 def test_stale_rendered_version_creates_no_history(self):
  user,ac,ad,version,*_=ad_fixture()
  with connect() as db: db.execute("update ad_compliance set notes='newer edit' where id=%s",(ad,))
  self.assertEqual(record(user,ac,ad,version)['status'],'conflict')
  with connect() as db: self.assertEqual(db.execute('select count(*) from item_completion where ad_compliance_id=%s',(ad,)).fetchone()[0],0)
 def test_completion_insert_failure_rolls_back_summary_and_seed(self):
  user,ac,ad,version,*_=ad_fixture()
  with connect() as db: db.execute("create function fail_ad_completion() returns trigger language plpgsql as $$begin if NEW.source='mark_done' then raise exception 'injected completion failure'; end if; return NEW; end$$; create trigger fail_ad_completion before insert on item_completion for each row execute function fail_ad_completion();")
  try:
   with self.assertRaises(psycopg.errors.RaiseException): record(user,ac,ad,version)
   with connect() as db:
    self.assertEqual(db.execute('select complied_date::text,complied_hours,updated_at from ad_compliance where id=%s',(ad,)).fetchone(),('2026-01-15',100,version))
    self.assertEqual(db.execute('select count(*) from item_completion where ad_compliance_id=%s',(ad,)).fetchone()[0],0)
  finally:
   with connect() as db: db.execute('drop trigger fail_ad_completion on item_completion; drop function fail_ad_completion()')
 def test_cross_aircraft_entry_refused_without_partial_writes(self):
  user,ac,ad,version,*_=ad_fixture(); _,foreign,book,page=fixture()
  with connect() as db:
   db.execute('update aircraft set owner_id=%s where id=%s',(user,foreign))
   entry=db.execute("insert into log_entry(aircraft_id,logbook_id,page_id,description) values(%s,%s,%s,'foreign entry') returning id",(foreign,book,page)).fetchone()[0]
  with self.assertRaises(psycopg.errors.InsufficientPrivilege): record(user,ac,ad,version,entry=entry)
  with connect() as db: self.assertEqual(db.execute('select count(*) from item_completion where ad_compliance_id=%s',(ad,)).fetchone()[0],0)
 def test_older_history_preserves_summary_and_consumes_rendered_version(self):
  user,ac,ad,version,*_=ad_fixture()
  result=record(user,ac,ad,version,date='2025-12-01',hours=50)
  self.assertEqual(result['row']['complied_date'],'2026-01-15')
  self.assertEqual(result['row']['next_due_date'],'2026-02-15')
  self.assertNotEqual(datetime.fromisoformat(result['row']['updated_at']),version)
  self.assertEqual(record(user,ac,ad,version,date='2025-12-01',hours=50)['status'],'conflict')
  with connect() as db: self.assertEqual(db.execute('select count(*) from item_completion where ad_compliance_id=%s',(ad,)).fetchone()[0],2)
 def test_same_version_concurrent_submissions_only_commit_once(self):
  user,ac,ad,version,*_=ad_fixture()
  with concurrent.futures.ThreadPoolExecutor() as pool: results=list(pool.map(lambda _:record(user,ac,ad,version),range(2)))
  self.assertEqual(sorted(r['status'] for r in results),['conflict','ok'])
  with connect() as db: self.assertEqual(db.execute('select count(*) from item_completion where ad_compliance_id=%s',(ad,)).fetchone()[0],2)
 def test_nonfinite_hours_rejected(self):
  user,ac,ad,version,*_=ad_fixture()
  with self.assertRaises(psycopg.errors.RaiseException): record(user,ac,ad,version,hours='NaN')
  with connect() as db: self.assertEqual(db.execute('select count(*) from item_completion where ad_compliance_id=%s',(ad,)).fetchone()[0],0)

if __name__=='__main__': unittest.main(verbosity=2)
