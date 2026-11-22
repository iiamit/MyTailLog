#!/usr/bin/env python3
"""Real Postgres/RLS, commit, rollback and concurrency checks; no production connection.
Run: uv run --with pgserver --with 'psycopg[binary]' scripts/test-audit-database.py
pgserver's disposable Postgres lacks pgcrypto; gen_random_uuid is built in.
"""
from pathlib import Path
import concurrent.futures, json, os, tempfile, time, unittest, uuid
import pgserver, psycopg
from psycopg import sql
ROOT = Path(__file__).resolve().parents[1]
DATA = Path(tempfile.mkdtemp(prefix='mtl-audit-pg-',dir=os.environ.get('TMPDIR',str(Path.home()/'.cache'))))
PG = pgserver.get_server(DATA,cleanup_mode='delete')
URI = PG.get_uri()

def bootstrap():
 with psycopg.connect(URI,autocommit=True) as db:
  db.execute("create schema auth; create schema storage; create role anon; create role authenticated; create role service_role bypassrls;")
  db.execute("create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;")
  db.execute("create table storage.buckets(id text primary key,name text,public boolean); create table storage.objects(id uuid,bucket_id text,name text,owner uuid); create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;")
  for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):
   db.execute(path.read_text().replace('create extension if not exists "pgcrypto";',''))
  db.execute('grant usage on schema public,auth to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated; grant usage,select on all sequences in schema public to authenticated; grant execute on all functions in schema auth to authenticated;')

def connect(user=None):
 db=psycopg.connect(URI)
 if user:
  db.execute('set role authenticated')
  db.execute("select set_config('request.jwt.claim.sub',%s,false),set_config('request.jwt.claims',%s,false)",(str(user),json.dumps({'sub':str(user),'email':f'{user}@test.invalid'})))
 return db

def id(): return str(uuid.uuid4())
def fixture():
 user, aircraft = id(), id()
 with connect() as db:
  db.execute('insert into auth.users(id,email) values(%s,%s)',(user,f'{user}@test.invalid'))
  db.execute("insert into aircraft(id,owner_id,tail_number) values(%s,%s,'NTEST')",(aircraft,user))
  book=db.execute("insert into logbook(aircraft_id,type) values(%s,'engine') returning id",(aircraft,)).fetchone()[0]
  page=db.execute("insert into page(aircraft_id,logbook_id,storage_path,page_sequence) values(%s,%s,%s,1) returning id",(aircraft,book,f'{aircraft}/pages/one.jpg')).fetchone()[0]
 return user,aircraft,str(book),str(page)

def rpc(db,name,*args):
 statement=sql.SQL('select {}({})').format(sql.Identifier(name),sql.SQL(',').join([sql.Placeholder() for _ in args]))
 # psycopg.sql.Identifier quotes the function name; every value is bound. This is not SQLAlchemy.
 # nosemgrep: python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query
 return db.execute(statement,args).fetchone()[0]

class AuditDatabase(unittest.TestCase):
 @classmethod
 def setUpClass(cls): bootstrap()
 def test_cross_aircraft_storage_metadata_refused_by_rls_and_constraint(self):
  user,ac,book,page=fixture(); other,foreign,*_=fixture()
  with connect(user) as db:
   with self.assertRaises(psycopg.errors.CheckViolation):
    db.execute('update page set storage_path=%s where id=%s',(f'{foreign}/pages/private.jpg',page))
  with connect() as db:
   self.assertEqual(db.execute('select storage_path from page where id=%s',(page,)).fetchone()[0],f'{ac}/pages/one.jpg')
 def test_feed_blocks_later_commit_until_earlier_publication_commits(self):
  user,ac,*_=fixture(); _,other,*_=fixture()
  with connect() as read: cursor=read.execute('select max(seq) from change_log').fetchone()[0]
  a=connect(); a.execute("update aircraft set notes='A' where id=%s",(ac,))
  entered=__import__('threading').Event()
  def second():
   with connect() as b:
    entered.set(); b.execute("update aircraft set notes='B' where id=%s",(other,))
  with concurrent.futures.ThreadPoolExecutor() as pool:
   future=pool.submit(second); self.assertTrue(entered.wait(2)); time.sleep(.15)
   self.assertFalse(future.done())
   with connect() as read: self.assertEqual(read.execute('select count(*) from change_log where seq>%s',(cursor,)).fetchone()[0],0)
   a.commit(); a.close(); future.result(timeout=5)
  with connect() as read:
   self.assertEqual({str(x[0]) for x in read.execute('select row_id from change_log where seq>%s',(cursor,))},{ac,other})
 def test_two_same_version_writes_one_conflict(self):
  user,ac,*_=fixture()
  with connect() as db: version=db.execute('select updated_at from aircraft where id=%s',(ac,)).fetchone()[0]
  def write(note):
   with connect(user) as db:
    return rpc(db,'write_record','aircraft',ac,ac,version,json.dumps({'notes':note}),False)['status']
  with concurrent.futures.ThreadPoolExecutor() as pool:
   self.assertEqual(sorted(pool.map(write,['first','second'])),['conflict','ok'])
 def test_extraction_replace_rolls_back_on_insert_failure(self):
  user,ac,book,page=fixture()
  with connect() as db:
   old=db.execute("insert into log_entry(aircraft_id,logbook_id,page_id,description) values(%s,%s,%s,'original') returning id",(ac,book,page)).fetchone()[0]
   started=db.execute('select clock_timestamp()').fetchone()[0]
  with connect(user) as db:
   with self.assertRaises(psycopg.errors.InvalidDatetimeFormat):
    rpc(db,'replace_page_extraction',page,started,json.dumps([{'entry_date':'invalid','description':'new'}]),json.dumps({'detected_page_count':1}),[])
  with connect() as db:
   self.assertEqual(db.execute('select description from log_entry where id=%s',(old,)).fetchone()[0],'original')
 def test_extraction_does_not_remove_a_confirmation_made_during_read(self):
  user,ac,book,page=fixture()
  with connect() as db:
   entry=db.execute("insert into log_entry(aircraft_id,logbook_id,page_id,description) values(%s,%s,%s,'original') returning id",(ac,book,page)).fetchone()[0]
   started=db.execute('select clock_timestamp()').fetchone()[0]
  with connect() as db: db.execute('update log_entry set owner_confirmed=true where id=%s',(entry,))
  with connect(user) as db:
   with self.assertRaises(psycopg.DatabaseError) as caught: rpc(db,'replace_page_extraction',page,started,'[]',json.dumps({'detected_page_count':1}),[])
   self.assertEqual(caught.exception.sqlstate,'PT409')
  with connect() as db: self.assertTrue(db.execute('select owner_confirmed from log_entry where id=%s',(entry,)).fetchone()[0])
 def test_merge_relink_failure_rolls_back_text_and_deletion(self):
  user,ac,book,page=fixture()
  with connect() as db:
   h=db.execute("insert into log_entry(aircraft_id,logbook_id,page_id,description) values(%s,%s,%s,'head') returning id,updated_at",(ac,book,page)).fetchone()
   t=db.execute("insert into log_entry(aircraft_id,logbook_id,page_id,description) values(%s,%s,%s,'tail') returning id,updated_at",(ac,book,page)).fetchone()
   db.execute("insert into component(aircraft_id,name,install_entry_id) values(%s,'test',%s)",(ac,t[0]))
   db.execute("create function fail_test_relink() returns trigger language plpgsql as $$begin raise exception 'injected'; end$$; create trigger audit_fail before update on component for each row execute function fail_test_relink();")
  try:
   with connect(user) as db:
    with self.assertRaises(psycopg.errors.RaiseException): rpc(db,'merge_log_entry',ac,h[0],t[0],h[1],t[1],json.dumps({'description':'head tail','ad_refs':[],'sb_refs':[],'continues_next':False,'is_continuation':False}))
   with connect() as db:
    self.assertEqual(db.execute('select description from log_entry where id=%s',(h[0],)).fetchone()[0],'head')
    self.assertEqual(db.execute('select count(*) from log_entry where id=%s',(t[0],)).fetchone()[0],1)
  finally:
   with connect() as db: db.execute('drop trigger audit_fail on component; drop function fail_test_relink()')
 def test_document_is_pending_until_explicit_confirmation(self):
  user,ac,book,page=fixture()
  payload={'weight_balance':{'empty_weight':1800,'empty_weight_arm':42,'empty_weight_moment':75600,'method':'weighed'},'ads':[]}
  with connect() as db:
   version=db.execute("insert into scanned_document(aircraft_id,page_id,doc_type,document_date,extracted,applied) values(%s,%s,'weight_balance','2026-11-21',%s,false) returning updated_at",(ac,page,json.dumps(payload))).fetchone()[0]
   self.assertEqual(db.execute('select count(*) from weight_balance where aircraft_id=%s',(ac,)).fetchone()[0],0)
  for stale in ['2000-01-01T00:00:00Z',None]:
   with self.assertRaises(psycopg.DatabaseError) as caught:
    with connect(user) as db: rpc(db,'confirm_scanned_document',page,stale)
   self.assertEqual(caught.exception.sqlstate,'PT409')
  with connect(user) as db: rpc(db,'confirm_scanned_document',page,version)
  with connect() as db:
   self.assertEqual(db.execute('select empty_weight from weight_balance where aircraft_id=%s',(ac,)).fetchone()[0],1800)
   self.assertTrue(db.execute('select applied from scanned_document where page_id=%s',(page,)).fetchone()[0])

 def test_extraction_success_keeps_confirmed_rows(self):
  user,ac,book,page=fixture()
  with connect() as db:
   confirmed=db.execute("insert into log_entry(aircraft_id,logbook_id,page_id,description,owner_confirmed) values(%s,%s,%s,'confirmed',true) returning id",(ac,book,page)).fetchone()[0]
   db.execute("insert into log_entry(aircraft_id,logbook_id,page_id,description) values(%s,%s,%s,'old machine')",(ac,book,page))
   started=db.execute('select clock_timestamp()').fetchone()[0]
  fresh={'entry_index':0,'continues_next':False,'is_continuation':False,'entry_date':'2026-11-21','description':'replacement','ad_refs':[],'sb_refs':[],'extraction_schema_version':1}
  with connect(user) as db: rpc(db,'replace_page_extraction',page,started,json.dumps([fresh]),json.dumps({'detected_page_count':1,'ocr_text':'new transcript'}),[])
  with connect() as db:
   self.assertEqual({x[0] for x in db.execute('select description from log_entry where page_id=%s',(page,))},{'confirmed','replacement'})
   self.assertEqual(db.execute('select ocr_text from page where id=%s',(page,)).fetchone()[0],'new transcript')
 def test_ad_approval_rolls_back_all_lines_on_failure(self):
  user,ac,book,page=fixture()
  payload={'ads':[{'reference':'2026-01-01','status':'open','recurring':False},{'reference':'FAIL','status':'open','recurring':False}]}
  with connect() as db:
   version=db.execute("insert into scanned_document(aircraft_id,page_id,doc_type,document_date,extracted,applied) values(%s,%s,'ad_report','2026-11-21',%s,false) returning updated_at",(ac,page,json.dumps(payload))).fetchone()[0]
   db.execute("create function fail_test_ad() returns trigger language plpgsql as $$begin if new.reference='FAIL' then raise exception 'injected'; end if; return new; end$$; create trigger audit_fail_ad before insert on ad_compliance for each row execute function fail_test_ad();")
  try:
   with connect(user) as db:
    with self.assertRaises(psycopg.errors.RaiseException): rpc(db,'confirm_scanned_document',page,version)
   with connect() as db:
    self.assertEqual(db.execute('select count(*) from ad_compliance where aircraft_id=%s',(ac,)).fetchone()[0],0)
    self.assertFalse(db.execute('select applied from scanned_document where page_id=%s',(page,)).fetchone()[0])
  finally:
   with connect() as db: db.execute('drop trigger audit_fail_ad on ad_compliance; drop function fail_test_ad()')

 def test_job_lease_concurrent_claim_and_stale_release(self):
  key='test:'+id()
  def claim(_):
   with connect() as db: return rpc(db,'claim_background_job',key)
  with concurrent.futures.ThreadPoolExecutor() as pool: tokens=list(pool.map(claim,range(2)))
  token=next(x for x in tokens if x)
  self.assertEqual(sum(x is not None for x in tokens),1)
  with connect() as db: db.execute("update background_job_lease set expires_at=now()-interval '1 second' where key=%s",(key,))
  with connect() as db:
   replacement=rpc(db,'claim_background_job',key)
   rpc(db,'release_background_job',key,token)
   self.assertEqual(db.execute('select token from background_job_lease where key=%s',(key,)).fetchone()[0],replacement)
 def test_reading_completion_recovers_one_durable_inbox(self):
  user,ac,book,page=fixture(); batch=id()
  with connect() as db:
   db.execute("insert into scan_batch(id,aircraft_id,logbook_id,expected_pages,created_by,source) values(%s,%s,%s,1,%s,'web_upload')",(batch,ac,book,user))
   db.execute("update page set batch_id=%s,extraction_status='extracted' where id=%s",(batch,page))
  def complete(_):
   with connect() as db: return rpc(db,'complete_reading_batch',batch)
  with concurrent.futures.ThreadPoolExecutor() as pool: answers=list(pool.map(complete,range(2)))
  self.assertEqual(sorted(answers),[False,True])
  with connect() as db:
   self.assertEqual(db.execute("select count(*) from notification where payload->>'batchId'=%s",(batch,)).fetchone()[0],1)
   self.assertIsNotNone(db.execute('select completed_at from scan_batch where id=%s',(batch,)).fetchone()[0])
   self.assertEqual(db.execute("select title,body from notification where payload->>'batchId'=%s",(batch,)).fetchone(),('1 page read',"0 entries are ready to review. They don't count until you confirm them."))
   # Simulate an older worker that committed completion but died before inbox insert.
   db.execute("delete from notification where payload->>'batchId'=%s",(batch,))
  with connect() as db: rpc(db,'complete_reading_batch',batch)
  with connect() as db: self.assertEqual(db.execute("select count(*) from notification where payload->>'batchId'=%s",(batch,)).fetchone()[0],1)
 def test_reminder_receipt_conflict_rolls_back_new_inbox(self):
  user,ac,*_=fixture()
  notification={'user_id':user,'aircraft_id':ac,'kind':'lead','title':'Test','body':'Test','deep_link':'mytaillog://status','actions':[],'payload':{}}
  receipt={'user_id':user,'aircraft_id':ac,'item_key':'mx:'+id(),'due_signature':'cycle','kind':'lead','channel':'in_app','nth':1}
  with connect() as db: rpc(db,'commit_reminder_inbox',json.dumps([notification]),json.dumps([receipt]))
  with connect() as db:
   with self.assertRaises(psycopg.errors.UniqueViolation): rpc(db,'commit_reminder_inbox',json.dumps([notification]),json.dumps([receipt]))
  with connect() as db: self.assertEqual(db.execute('select count(*) from notification where aircraft_id=%s',(ac,)).fetchone()[0],1)


 def test_provider_failure_keeps_existing_default(self):
  user,ac,*_=fixture(); provider,new=id(),id()
  with connect(user) as db:
   db.execute("insert into service_provider(id,aircraft_id,name,kind,is_default) values(%s,%s,'Existing','mechanic',true)",(provider,ac))
  with connect(user) as db:
   with self.assertRaises(psycopg.errors.NotNullViolation):
    rpc(db,'save_service_provider',ac,new,None,json.dumps({'name':None,'kind':'mechanic','is_default':True}))
  with connect() as db:
   self.assertTrue(db.execute('select is_default from service_provider where id=%s',(provider,)).fetchone()[0])
   self.assertEqual(db.execute('select count(*) from service_provider where aircraft_id=%s',(ac,)).fetchone()[0],1)
 def test_provider_stale_base_changes_nothing(self):
  user,ac,*_=fixture(); provider=id()
  with connect(user) as db:
   db.execute("insert into service_provider(id,aircraft_id,name,kind,is_default) values(%s,%s,'Existing','mechanic',false)",(provider,ac))
  with connect(user) as db:
   result=rpc(db,'save_service_provider',ac,provider,'2000-01-01T00:00:00Z',json.dumps({'name':'Lost edit','is_default':True}))
   self.assertEqual(result['status'],'conflict')
  with connect() as db: self.assertEqual(db.execute('select name,is_default from service_provider where id=%s',(provider,)).fetchone(),('Existing',False))
 def test_visit_item_failure_rolls_back_parent_and_removed_items(self):
  user,ac,*_=fixture(); visit,other=id(),id(); keep,taken='mx:'+id(),'mx:'+id()
  with connect(user) as db:
   version=db.execute("insert into planned_visit(id,aircraft_id,week_of) values(%s,%s,'2026-12-07') returning updated_at",(visit,ac)).fetchone()[0]
   db.execute("insert into planned_visit(id,aircraft_id,week_of) values(%s,%s,'2026-12-14')",(other,ac))
   db.execute('insert into planned_visit_item(aircraft_id,visit_id,item_key) values(%s,%s,%s),(%s,%s,%s)',(ac,visit,keep,ac,other,taken))
  with connect(user) as db:
   with self.assertRaises(psycopg.errors.UniqueViolation):
    rpc(db,'save_planned_visit',ac,visit,version,json.dumps({'notes':'Must roll back'}),[taken],[keep])
  with connect() as db:
   self.assertEqual(db.execute('select notes,updated_at from planned_visit where id=%s',(visit,)).fetchone(),(None,version))
   self.assertEqual(db.execute('select item_key from planned_visit_item where visit_id=%s',(visit,)).fetchone()[0],keep)
 def test_maintenance_record_failure_rolls_back_item_and_reading(self):
  user,ac,book,_=fixture(); item,reading=id(),id()
  with connect(user) as db:
   version=db.execute("insert into maintenance_item(id,aircraft_id,kind,label) values(%s,%s,'oil_change','Oil') returning updated_at",(item,ac)).fetchone()[0]
  with connect(user) as db:
   with self.assertRaises(psycopg.errors.InvalidDatetimeFormat):
    rpc(db,'mark_maintenance_done',ac,item,version,json.dumps({'last_done_date':'2026-11-22'}),
      json.dumps({'id':reading,'reading_date':'invalid','hobbs':14.2}),None)
  with connect() as db:
   self.assertEqual(db.execute('select last_done_date,updated_at from maintenance_item where id=%s',(item,)).fetchone(),(None,version))
   self.assertEqual(db.execute('select count(*) from hours_reading where id=%s',(reading,)).fetchone()[0],0)
 def test_maintenance_completion_commits_reading_and_entry_together(self):
  user,ac,book,_=fixture(); item,reading=id(),id()
  with connect(user) as db:
   version=db.execute("insert into maintenance_item(id,aircraft_id,kind,label) values(%s,%s,'vor','VOR') returning updated_at",(item,ac)).fetchone()[0]
  with connect(user) as db:
   result=rpc(db,'mark_maintenance_done',ac,item,version,json.dumps({'last_done_date':'2026-11-22','last_done_hours':14.2}),
    json.dumps({'id':reading,'reading_date':'2026-11-22','tach':14.2}),json.dumps({'id':reading,'logbook_id':book,'entry_date':'2026-11-22','tach':14.2,'description':'VOR check'}))
   self.assertEqual(result['status'],'ok')
  with connect() as db:
   self.assertEqual(float(db.execute('select tach from hours_reading where id=%s',(reading,)).fetchone()[0]),14.2)
   self.assertEqual(db.execute('select description,owner_confirmed from log_entry where id=%s',(reading,)).fetchone(),('VOR check',True))
 def test_expected_hours_stale_base_does_not_change_projection(self):
  user,ac,*_=fixture()
  with connect(user) as db:
   result=rpc(db,'set_expected_hours_checked',ac,3,'2000-01-01T00:00:00Z')
   self.assertEqual(result['status'],'conflict')
  with connect() as db: self.assertIsNone(db.execute('select expected_hours_per_week from aircraft where id=%s',(ac,)).fetchone()[0])


 def test_visit_creation_failure_leaves_no_parent(self):
  user,ac,*_=fixture(); visit=id()
  with connect(user) as db:
   with self.assertRaises(psycopg.errors.CheckViolation):
    rpc(db,'create_planned_visit',ac,json.dumps({'id':visit,'week_of':'2026-12-07'}),['bad-key'])
  with connect() as db: self.assertEqual(db.execute('select count(*) from planned_visit where id=%s',(visit,)).fetchone()[0],0)
 def test_standard_seeding_concurrent_runs_do_not_duplicate_kinds(self):
  user,ac,*_=fixture()
  items=json.dumps([{'kind':'annual','label':'Annual','regulatory':True,'interval_months':12}, {'kind':'oil_change','label':'Oil','regulatory':False,'interval_hours':50}])
  def seed(_):
   with connect(user) as db: return rpc(db,'seed_maintenance_items',ac,items)['row']['added']
  with concurrent.futures.ThreadPoolExecutor() as pool: answers=list(pool.map(seed,range(2)))
  self.assertEqual(sorted(answers),[0,2])
  with connect() as db: self.assertEqual(db.execute('select count(*) from maintenance_item where aircraft_id=%s',(ac,)).fetchone()[0],2)


 def test_maintenance_history_and_visit_close_share_commit(self):
  user,ac,*_=fixture(); item,completion,visit=id(),id(),id()
  with connect(user) as db:
   version=db.execute("insert into maintenance_item(id,aircraft_id,kind,label) values(%s,%s,'annual','Annual') returning updated_at",(item,ac)).fetchone()[0]
   db.execute("insert into planned_visit(id,aircraft_id,status,week_of) values(%s,%s,'awaiting_records','2026-12-07')",(visit,ac))
   db.execute('insert into planned_visit_item(aircraft_id,visit_id,item_key) values(%s,%s,%s)',(ac,visit,'mx:'+item))
  with connect(user) as db:
   result=rpc(db,'mark_maintenance_done',ac,item,version,json.dumps({'last_done_date':'2026-11-22'}),None,None,
    json.dumps({'id':completion,'done_date':'2026-11-22','source':'mark_done'}))
   self.assertEqual(result['status'],'ok')
  with connect() as db:
   self.assertEqual(str(db.execute('select done_completion_id from planned_visit_item where visit_id=%s',(visit,)).fetchone()[0]),completion)
   self.assertEqual(str(db.execute('select visit_id from item_completion where id=%s',(completion,)).fetchone()[0]),visit)
   self.assertEqual(db.execute('select status from planned_visit where id=%s',(visit,)).fetchone()[0],'done')


 def test_publication_lock_precedes_source_and_rpc_tuple_locks(self):
  for use_rpc in (False,True):
   user,ac,*_=fixture(); component=id()
   with connect() as db:
    version=db.execute("insert into component(id,aircraft_id,name) values(%s,%s,'Original') returning updated_at",(component,ac)).fetchone()[0]
   a=connect(); a.execute("update aircraft set notes='first' where id=%s",(ac,))
   entered=__import__('threading').Event(); pid=[]
   def second():
    with connect(user) as b:
     b.execute("set local statement_timeout='5s'")
     pid.append(b.info.backend_pid); entered.set()
     if use_rpc: return rpc(b,'write_record','component',ac,component,version,json.dumps({'name':'Second'}),False)['status']
     b.execute("update component set name='Second' where id=%s",(component,)); return 'ok'
   try:
    with concurrent.futures.ThreadPoolExecutor() as pool:
     future=pool.submit(second); self.assertTrue(entered.wait(2))
     waiting=False
     for _ in range(100):
      with connect() as read: waiting=read.execute("select exists(select 1 from pg_locks where pid=%s and locktype='advisory' and not granted)",(pid[0],)).fetchone()[0]
      if waiting: break
      time.sleep(.02)
     self.assertTrue(waiting,'second writer must be waiting for publication')
     a.execute("set local lock_timeout='1s'")
     # A can relink the component: B did not retain its tuple while waiting for A's global lock.
     a.execute("update component set name='First' where id=%s",(component,)); a.commit()
     self.assertEqual(future.result(timeout=5),'conflict' if use_rpc else 'ok')
   finally: a.close()

if __name__=='__main__': unittest.main(verbosity=2)
