#!/usr/bin/env python3
"""Real database tests for generic inserts and compound page/component/squawk writes.
Run in the pgserver+psycopg environment used by test-audit-database.py.
"""
from pathlib import Path
import concurrent.futures, json, runpy, unittest, uuid
import psycopg
base=runpy.run_path(str(Path(__file__).with_name('test-audit-database.py')))
connect,fixture,rpc=(base[k] for k in ('connect','fixture','rpc'))
def uid(): return str(uuid.uuid4())

class RecordCommands(unittest.TestCase):
 @classmethod
 def setUpClass(cls): base['bootstrap']()
 def test_insert_defaults_and_natural_key_update_preserve_identity(self):
  user,ac,*_=fixture()
  fields={'source':'manual','external_ref':'phone-job','reading_date':'2026-11-21','tach':123.4}
  with connect(user) as db:
   first=rpc(db,'insert_records','hours_reading',ac,json.dumps([fields]),'aircraft_id,source,external_ref',False)
  with connect(user) as db:
   second=rpc(db,'insert_records','hours_reading',ac,json.dumps([{**fields,'tach':124.5}]),'aircraft_id,source,external_ref',False)
  self.assertEqual(first['row']['id'],second['row']['id'])
  self.assertEqual(second['row']['tach'],124.5)
 def test_id_conflict_cannot_change_another_editable_aircraft(self):
  user,ac,*_=fixture(); _,foreign,*_=fixture()
  with connect() as db:
   db.execute('update aircraft set owner_id=%s where id=%s',(user,foreign))
   row=db.execute("insert into oil_addition(aircraft_id,added_date,quarts) values(%s,'2026-11-21',1) returning id",(foreign,)).fetchone()[0]
  with connect(user) as db:
   with self.assertRaises(psycopg.errors.InsufficientPrivilege): rpc(db,'insert_records','oil_addition',ac,json.dumps([{'id':str(row),'added_date':'2026-11-21','quarts':3}]),'id',False)
  with connect() as db: self.assertEqual(db.execute('select quarts from oil_addition where id=%s',(row,)).fetchone()[0],1)
 def test_concurrent_create_without_resource_id_commits_one_row_and_receipt(self):
  user,ac,book,*_=fixture()
  mutation={'id':uid(),'aircraftId':ac,'type':'entry.create','payload':{'fields':{'description':'test'}}}
  args={'p_aircraft':ac,'p_table':'log_entry','p_rows':[{'logbook_id':book,'description':'test','owner_confirmed':True}],'p_conflict':'id','p_ignore':True}
  def apply(_):
   with connect(user) as db: return rpc(db,'apply_sync_write',json.dumps(mutation),'insert_records',json.dumps(args))
  with concurrent.futures.ThreadPoolExecutor() as pool: answers=list(pool.map(apply,range(2)))
  self.assertEqual(answers[0]['row']['id'],answers[1]['row']['id'])
  with connect() as db:
   self.assertEqual(db.execute('select count(*) from log_entry where aircraft_id=%s',(ac,)).fetchone()[0],1)
   self.assertEqual(db.execute('select count(*) from sync_mutation where user_id=%s and id=%s',(user,mutation['id'])).fetchone()[0],1)
 def test_squawk_and_photos_commit_together(self):
  user,ac,*_=fixture(); squawk,photo=uid(),uid()
  with connect(user) as db:
   result=rpc(db,'create_squawk',ac,json.dumps({'id':squawk,'description':'Inspect this','reported_by':user}),[photo])
   self.assertEqual(result['row']['id'],squawk)
  with connect() as db:
   self.assertEqual(db.execute('select storage_path from squawk_photo where id=%s',(photo,)).fetchone()[0],f'{ac}/squawks/{squawk}/{photo}.jpg')
 def test_photo_failure_rolls_back_squawk(self):
  user,ac,*_=fixture(); squawk=uid()
  with connect(user) as db:
   with self.assertRaises(psycopg.errors.InvalidTextRepresentation): rpc(db,'create_squawk',ac,json.dumps({'id':squawk,'description':'Inspect this','reported_by':user}),['not-a-uuid'])
  with connect() as db: self.assertEqual(db.execute('select count(*) from squawk where id=%s',(squawk,)).fetchone()[0],0)
 def test_page_failure_keeps_its_entries(self):
  user,ac,book,page=fixture()
  with connect() as db:
   db.execute("insert into log_entry(aircraft_id,logbook_id,page_id,description) values(%s,%s,%s,'keep me')",(ac,book,page))
   db.execute("create function fail_page_delete() returns trigger language plpgsql as $$begin raise exception 'injected'; end$$; create trigger fail_page before delete on page for each row execute function fail_page_delete();")
  try:
   with connect(user) as db:
    with self.assertRaises(psycopg.errors.RaiseException): rpc(db,'change_pages',ac,[page],'delete',None)
   with connect() as db: self.assertEqual(db.execute('select count(*) from log_entry where page_id=%s',(page,)).fetchone()[0],1)
  finally:
   with connect() as db: db.execute('drop trigger fail_page on page; drop function fail_page_delete()')
 def test_pending_document_cannot_be_bulk_confirmed_as_an_empty_page(self):
  user,ac,book,page=fixture()
  with connect() as db:
   row=db.execute("insert into log_entry(aircraft_id,logbook_id,page_id,description,confidence) values(%s,%s,%s,'clean',.99) returning id,updated_at",(ac,book,page)).fetchone()
   db.execute("insert into scanned_document(aircraft_id,page_id,doc_type,extracted,applied) values(%s,%s,'weight_balance','{}',false)",(ac,page))
  with connect(user) as db: result=rpc(db,'confirm_clean_entries',ac,json.dumps({str(row[0]):row[1].isoformat()}))
  self.assertEqual(result['row']['confirmed'],1)
  with connect() as db: self.assertEqual(db.execute('select review_status from page where id=%s',(page,)).fetchone()[0],'unreviewed')
 def test_service_reader_can_save_extraction_without_an_end_user_session(self):
  user,ac,book,page=fixture()
  with connect() as db:
   db.execute('grant usage on schema public to service_role; grant select,insert,update,delete on all tables in schema public to service_role; grant usage,select on all sequences in schema public to service_role')
   started=db.execute('select clock_timestamp()').fetchone()[0]
  with connect() as db:
   db.execute('set role service_role')
   rpc(db,'replace_page_extraction',page,started,'[]',json.dumps({'detected_page_count':1,'ocr_text':'background reader'}),[])
  with connect() as db: self.assertEqual(db.execute('select ocr_text from page where id=%s',(page,)).fetchone()[0],'background reader')

if __name__=='__main__': unittest.main(verbosity=2)
