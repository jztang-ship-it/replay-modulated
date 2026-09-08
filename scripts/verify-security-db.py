"""Real PostgreSQL security/concurrency tests. Never accepts a database URL.
Requires the disposable, network-disabled replaymod-security-audit-pg container.
Each run creates a fresh test database; no application data or volumes are mounted.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess,json,uuid
ROOT=Path(__file__).resolve().parents[1]
CONTAINER='replaymod-security-audit-pg'
info=json.loads(subprocess.check_output(['docker','inspect',CONTAINER],text=True))[0]
assert info['HostConfig']['NetworkMode']=='none' and not info['HostConfig']['PortBindings'], 'Not an isolated test container'
assert all(m['Type']!='bind' for m in info['Mounts']), 'Refusing host-mounted database'
DB='security_'+uuid.uuid4().hex

def execute(text,db=DB):
 p = subprocess.run(['docker','exec','-i',CONTAINER,'psql','-U','postgres','-d',db,'-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],input=text.encode('utf-8'),capture_output=True)
 p.stdout=p.stdout.decode('utf-8'); p.stderr=p.stderr.decode('utf-8')
 return p
def sql(text,db=DB):
 p=execute(text,db)
 assert p.returncode==0,p.stderr
 return p.stdout.strip()
def denied(text,reason=None):
 p=execute(text);assert p.returncode!=0,'Unexpected authorization/safety success'
 if reason:assert reason in p.stderr,p.stderr

def concurrent(text):
 with ThreadPoolExecutor(max_workers=2) as pool:return list(pool.map(execute,[text,text]))
sql('CREATE DATABASE '+DB,'postgres')
sql("""DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean DEFAULT false);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
""")
for f in sorted((ROOT/'supabase/migrations').glob('*.sql')):sql(f.read_text(encoding='utf-8-sig'))
print('PASS: all repository migrations execute on fresh PostgreSQL (optional catalog absent)')
# Exercise the separately imported legacy catalog as well as fresh installs.
import runpy
runpy.run_path(str(ROOT/'scripts/test-catalog-security-db.py'), init_globals={'sql':sql,'denied':denied,'ROOT':ROOT,'DB':DB})
U='11111111-1111-4111-8111-111111111111';V='22222222-2222-4222-8222-222222222222'
C='33333333-3333-4333-8333-333333333333';C2='44444444-4444-4444-8444-444444444444'
sql(f"INSERT INTO auth.users(id,is_anonymous) VALUES('{U}',true),('{V}',false); INSERT INTO public.player_state(id,balance) VALUES('{U}',1000),('{V}',1000);")
for role in ['anon','authenticated']:
 for table in ['hand_log','hand_sessions','challenge_attempts','shared_challenges','player_state','user_achievements','reward_claims','authoritative_bonus_pools']:
  for privilege in ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
   assert sql(f"SELECT has_table_privilege('{role}','public.{table}','{privilege}')")=='f',(role,table,privilege)
 for fn in ['increment_challenge_counters(uuid,boolean,numeric,text)','increment_challenges_defended(uuid)','start_authoritative_hand(uuid,text,uuid,text,text,text,uuid,integer,jsonb)','commit_authoritative_hand(uuid,text,integer,jsonb,boolean,text,numeric)','submit_authoritative_attempt(uuid,uuid,text,text,text)']:
  assert sql(f"SELECT has_function_privilege('{role}','public.{fn}','EXECUTE')")=='f',(role,fn)
 for col in ['challenges_defended','ftue_completed']:
  assert sql(f"SELECT has_column_privilege('{role}','public.player_profiles','{col}','UPDATE')")=='f'
print('PASS: browser table/column/RPC privileges revoked')
AUTH=f"SET ROLE authenticated; SET request.jwt.claim.sub='{U}';"
sql(AUTH+f"INSERT INTO public.player_profiles(id,nickname,is_anonymous) VALUES('{U}','Player',false) ON CONFLICT(id) DO UPDATE SET id=excluded.id,nickname=excluded.nickname,is_anonymous=excluded.is_anonymous;")
assert sql(f"SELECT is_anonymous FROM public.player_profiles WHERE id='{U}'")=='t'
denied(AUTH+f"UPDATE public.player_profiles SET challenges_defended=100 WHERE id='{U}'",'permission denied')
denied(AUTH+f"UPDATE public.player_profiles SET id='{V}' WHERE id='{U}'",'row-level security')
sql(f"INSERT INTO public.player_profiles(id,nickname) VALUES('{V}','Sender')")
print('PASS: nickname upsert works, auth status and business counters cannot be forged')
sql(AUTH+f"INSERT INTO public.feedback_submissions(user_id,answers,submission_number) VALUES('{U}','{{}}',1)")
results=concurrent(AUTH+"SELECT public.grant_coins(100,'feedback_v1')")
assert sum(r.returncode==0 for r in results)==1,[r.stderr for r in results]
assert sql(f"SELECT balance FROM public.player_state WHERE id='{U}'")=='1100'
denied(AUTH+"SELECT public.grant_coins(500,'feedback_v1')",'invalid reward')
denied(AUTH+"SELECT public.grant_coins(100,'other')",'invalid reward')
print('PASS: concurrent feedback claims grant exactly 100 once')
# Test-only trusted state represents the API output, not browser input.
roster=[{'basePlayerId':str(i),'actualFp':10,'position':'BAT'} for i in range(5)]
state=json.dumps({'roster':roster,'draws':0,'resolved':False})
final=json.dumps({'roster':roster,'draws':1,'resolved':True})
SERVICE='SET ROLE service_role;'
def start(hand,request,user=U,challenge='NULL',bet=10):
 return SERVICE+f"SELECT public.start_authoritative_hand('{user}','{hand}','{request}','baseball','2425',NULL,{challenge},{bet},'{state}'::jsonb)"
def commit(hand,revision=0,settle=True,user=U,roster_state=final):
 return SERVICE+f"SELECT public.commit_authoritative_hand('{user}','{hand}',{revision},'{roster_state}'::jsonb,{str(settle).lower()},'STARTER',2.5)"
request=str(uuid.uuid4())
results=concurrent(start('paid-hand',request));assert all(r.returncode==0 for r in results),[r.stderr for r in results]
assert sql(f"SELECT balance FROM public.player_state WHERE id='{U}'")=='1090'
assert sql("SELECT count(*) FROM public.hand_sessions WHERE hand_id='paid-hand'")=='1'
denied(start('different-hand',request,bet=30),'request context mismatch')
results=concurrent(commit('paid-hand'));assert all(r.returncode==0 for r in results),[r.stderr for r in results]
assert sql(f"SELECT balance FROM public.player_state WHERE id='{U}'")=='1115'
assert sql("SELECT count(*) FROM public.hand_log WHERE hand_id='paid-hand'")=='1'
assert float(sql("SELECT amount FROM public.authoritative_bonus_pools WHERE scope='baseball'"))==1000.5
assert sql(commit('paid-hand',roster_state='{}'))==sql(commit('paid-hand'))
print('PASS: concurrent start/settlement debit, payout, audit and pool contribution happen once')
sql(start('cas-hand',str(uuid.uuid4())))
results=concurrent(commit('cas-hand',settle=False));assert sum(r.returncode==0 for r in results)==1
assert sql("SELECT revision FROM public.hand_sessions WHERE hand_id='cas-hand'")=='1'
denied(commit('cas-hand',user=V),'unknown hand')
sql("UPDATE public.hand_sessions SET expires_at=now()-interval '1 hour' WHERE hand_id='cas-hand'")
denied(commit('cas-hand',revision=1),'hand expired')
print('PASS: revision CAS, ownership and expiry enforced')
for c in [C,C2]:sql(f"INSERT INTO public.shared_challenges(challenge_id,created_by,hand_id,sport,season,slate_seed,target_fp,authority_version) VALUES('{c}','{V}','sender','baseball','2425','',100,2)")
sql(start('challenge-hand',str(uuid.uuid4()),challenge=f"'{C}'",bet=0));sql(commit('challenge-hand'))
def attempt(challenge=C):return SERVICE+f"SELECT public.submit_authoritative_attempt('{U}','{challenge}','challenge-hand','Name',NULL)"
denied(attempt(C2),'hand not bound to challenge')
results=concurrent(attempt());assert all(r.returncode==0 for r in results),[r.stderr for r in results]
assert sql(f"SELECT count(*) FROM public.challenge_attempts WHERE challenge_id='{C}'")=='1'
assert sql(f"SELECT attempt_count FROM public.shared_challenges WHERE challenge_id='{C}'")=='1'
assert sql(f"SELECT challenges_defended FROM public.player_profiles WHERE id='{V}'")=='1'
assert sql(f"SELECT count(*) FROM public.user_notifications WHERE user_id='{V}'")=='1'
assert json.loads(sql(attempt()))['idempotent'] is True
print('PASS: challenge binding and concurrent retries preserve one attempt/counter/notification')
# Practice after a closed window must not increment counters or notify.
sql(f"UPDATE public.challenge_attempts SET created_at=now()-interval '2 hours' WHERE challenge_id='{C}'")
sql(start('practice-hand',str(uuid.uuid4()),challenge=f"'{C}'",bet=0));sql(commit('practice-hand'))
r=json.loads(sql(SERVICE+f"SELECT public.submit_authoritative_attempt('{U}','{C}','practice-hand','Name',NULL)"))
assert r['is_practice'] and r['attempt_count']==1 and not r['defended_bumped']
assert sql(f"SELECT count(*) FROM public.user_notifications WHERE user_id='{V}'")=='1'
print('PASS: closed-window practice does not grant counters/notifications')
denied(AUTH+"SELECT public.grant_coins(NULL,'feedback_v1')",'invalid reward')
denied(AUTH+"SELECT public.grant_coins(100,NULL)",'invalid reward')
sql("UPDATE public.hand_log SET authority_version=1 WHERE hand_id='practice-hand'")
denied(SERVICE+f"SELECT public.submit_authoritative_attempt('{U}','{C}','practice-hand','Name',NULL)",'hand not bound to challenge')
sql(f"UPDATE public.shared_challenges SET authority_version=1 WHERE challenge_id='{C2}'")
denied(attempt(C2),'legacy challenge requires recreation')
# Boss challenges have no human sender and must not notify/credit anyone.
sql(f"UPDATE public.shared_challenges SET sender_kind='boss',created_by=NULL,authority_version=1 WHERE challenge_id='{C2}'")
sql(start('boss-hand',str(uuid.uuid4()),challenge=f"'{C2}'",bet=0));sql(commit('boss-hand'))
boss_call=SERVICE+f"SELECT public.submit_authoritative_attempt('{U}','{C2}','boss-hand','Name',NULL)"
results=concurrent(boss_call);assert all(p.returncode==0 for p in results),[p.stderr for p in results]
assert sql(f"SELECT attempt_count FROM public.shared_challenges WHERE challenge_id='{C2}'")=='1'
assert sql(f"SELECT count(*) FROM public.user_notifications WHERE user_id='{V}'")=='1'
assert not json.loads(sql(boss_call))['defended_bumped']
print('PASS: null rewards/legacy authority rejected; boss retries do not notify or credit humans')
print('ALL DATABASE SECURITY CHECKS PASSED; disposable database:',DB)
