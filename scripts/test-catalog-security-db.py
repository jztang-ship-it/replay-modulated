"""Invoked by verify-security-db.py, only inside its isolated disposable database."""
import json
from pathlib import Path
migration=(ROOT/'supabase/migrations/020_catalog_read_only.sql').read_text(encoding='utf-8')
sql("""
CREATE TABLE public.players(id text PRIMARY KEY, name text NOT NULL, team text,
 cost numeric DEFAULT 0, pos text, active boolean DEFAULT true, created_at timestamptz DEFAULT now());
CREATE TABLE public.game_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 player_id text REFERENCES public.players(id), game_date date, matchup text,
 pts numeric DEFAULT 0, reb numeric DEFAULT 0, ast numeric DEFAULT 0, stl numeric DEFAULT 0,
 blk numeric DEFAULT 0, turnovers numeric DEFAULT 0, created_at timestamptz DEFAULT now(), min numeric DEFAULT 0);
CREATE FUNCTION public.get_random_log(target_player_id text) RETURNS json LANGUAGE plpgsql AS $$
DECLARE result json; BEGIN SELECT row_to_json(g) INTO result FROM game_logs g
 WHERE g.player_id=target_player_id ORDER BY random() LIMIT 1; RETURN result; END; $$;
GRANT ALL ON public.players,public.game_logs TO PUBLIC;
GRANT INSERT(name),UPDATE(name),REFERENCES(name) ON public.players TO PUBLIC,anon,authenticated;
GRANT INSERT(pts),UPDATE(pts),REFERENCES(pts) ON public.game_logs TO PUBLIC,anon,authenticated;
INSERT INTO public.players(id,name) VALUES('fixture-player','Catalog fixture');
INSERT INTO public.game_logs(id,player_id,pts) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture-player',42);
""")
def snapshot():
 return sql("""SELECT jsonb_build_object('players',(SELECT jsonb_agg(p ORDER BY id) FROM public.players p),
 'logs',(SELECT jsonb_agg(g ORDER BY id) FROM public.game_logs g),
 'acl',(SELECT jsonb_agg(jsonb_build_array(relname,relrowsecurity,relacl) ORDER BY relname)
 FROM pg_class WHERE oid IN ('public.players'::regclass,'public.game_logs'::regclass)))""")
before=snapshot()
# Independent inherited privileges must abort, not silently leave a bypass.
writer_role='catalog_writer_'+DB
sql(f"CREATE ROLE {writer_role} NOLOGIN; GRANT UPDATE ON public.players TO {writer_role}; GRANT {writer_role} TO authenticated;")
inherited_before=snapshot()
denied(migration,'Inherited browser privilege remains')
assert snapshot()==inherited_before, 'Failed migration did not roll back table ACL/RLS/data'
sql(f"REVOKE ALL ON public.players FROM {writer_role}; GRANT UPDATE(name) ON public.players TO {writer_role};")
inherited_before=snapshot()
denied(migration,'Inherited browser column privilege remains')
assert snapshot()==inherited_before
sql(f"REVOKE UPDATE(name) ON public.players FROM {writer_role}; GRANT MAINTAIN ON public.players TO {writer_role};")
inherited_before=snapshot()
denied(migration,'Inherited MAINTAIN privilege remains')
assert snapshot()==inherited_before
sql(f"REVOKE {writer_role} FROM authenticated; REVOKE ALL ON public.players FROM {writer_role}; DROP ROLE {writer_role};")
# Test the exact browser rollout generator against a current local metadata export.
# Fake history exists only in this disposable fixture, never in production.
import runpy,tempfile,csv
builder=runpy.run_path(str(ROOT/'scripts/build-catalog-security-rollout.py'))
sql("""CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES
 ('016','server_authority_boundary'),('017','authoritative_challenge_attempt_hands'),
 ('018','security_permissions_and_rewards'),('019','authoritative_sessions');""")
assert (ROOT/'docs/sql/PRECHECK-020-WEB.sql').read_text(encoding='utf-8')==builder['precheck_sql']()
q=builder['metadata_query']()
row=json.loads(sql("SET search_path=pg_catalog,public; WITH snapshot AS ("+q+"""), export AS (
SELECT 'replaymod-catalog-before-020-v1' AS format,clock_timestamp() AS captured_at,
 current_user AS exported_by,current_setting('server_version_num') AS server_version_num,
 payload::text AS payload,md5(payload::text) AS payload_md5 FROM snapshot)
SELECT row_to_json(export) FROM export"""))
with tempfile.TemporaryDirectory(prefix='replay-catalog-test-') as directory:
 path=Path(directory)/'metadata.csv'
 def write_export(value):
  with path.open('w',encoding='utf-8',newline='') as f:
   writer=csv.DictWriter(f,fieldnames=value.keys());writer.writeheader();writer.writerow(value)
 write_export(row)
 rollout=builder['build_sql'](path)
 write_export(dict(row,payload_md5='0'*32))
 try:builder['build_sql'](path)
 except ValueError as e:assert 'checksum' in str(e)
 else:raise AssertionError('Corrupt snapshot accepted')
 write_export(dict(row,captured_at='2000-01-01T00:00:00+00:00'))
 try:builder['build_sql'](path)
 except ValueError as e:assert 'stale' in str(e)
 else:raise AssertionError('Stale snapshot accepted')
# Detect live metadata drift before making any changes.
sql('ALTER TABLE public.players ENABLE ROW LEVEL SECURITY')
denied(rollout,'drift since backup')
sql('ALTER TABLE public.players DISABLE ROW LEVEL SECURITY')
# A failure after ALL DDL and the history INSERT must roll everything back.
forced=rollout.replace('-- FAILPOINT_020:', "SELECT 1/0; -- FAILPOINT_020:")
denied(forced,'division by zero')
assert snapshot()==before
assert sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='020'")=='0'
assert sql("SELECT proconfig IS NULL FROM pg_proc WHERE oid='public.get_random_log(text)'::regprocedure")=='t'
assert 'APPLIED_020|020|catalog_read_only' in sql(rollout)
denied(rollout,'020 already applied')
assert sql('SELECT count(*) FROM supabase_migrations.schema_migrations')=='5'
print('PASS: web rollout validates fresh export, rejects corruption/drift/duplicates, and rolls back late failure including RPC/history')
after=json.loads(snapshot());old=json.loads(before)
assert after['players']==old['players'] and after['logs']==old['logs'], 'Catalog rows changed'
for role in ['anon','authenticated']:
 for table in ['players','game_logs']:
  assert sql(f"SELECT relrowsecurity FROM pg_class WHERE oid='public.{table}'::regclass")=='t'
  for privilege in ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']:
   assert sql(f"SELECT has_table_privilege('{role}','public.{table}','{privilege}')")=='f',(role,table,privilege)
  for privilege in ['INSERT','UPDATE','REFERENCES']:
   assert sql(f"SELECT has_any_column_privilege('{role}','public.{table}','{privilege}')")=='f'
  assert sql(f"SET ROLE {role}; SELECT count(*) FROM public.{table}")=='1'
  for operation in [f"INSERT INTO public.{table} DEFAULT VALUES", f"UPDATE public.{table} SET id=id", f"DELETE FROM public.{table}", f"TRUNCATE public.{table}"]:
   denied(f"SET ROLE {role}; {operation}",'permission denied')
 assert json.loads(sql(f"SET ROLE {role}; SELECT public.get_random_log('fixture-player')"))['pts']==42
 assert sql(f"SET ROLE {role}; SELECT public.get_random_log('missing') IS NULL")=='t'
 # Even accidental table re-grants do not introduce an RLS write policy.
 denied(f"BEGIN; GRANT INSERT ON public.players TO {role}; SET ROLE {role}; INSERT INTO public.players(id,name) VALUES('blocked','blocked');",'row-level security')
 assert sql(f"BEGIN; GRANT UPDATE,DELETE ON public.players TO {role}; SET ROLE {role}; WITH changed AS (UPDATE public.players SET name='blocked' RETURNING *) SELECT count(*) FROM changed; ROLLBACK;")=='0'
 assert sql(f"BEGIN; GRANT DELETE ON public.game_logs TO {role}; SET ROLE {role}; WITH changed AS (DELETE FROM public.game_logs RETURNING *) SELECT count(*) FROM changed; ROLLBACK;")=='0'
 # An invoker-controlled search_path must not redirect the catalog RPC.
 assert json.loads(sql(f"SET ROLE {role}; CREATE TEMP TABLE game_logs(player_id text,pts numeric); INSERT INTO game_logs VALUES('fixture-player',999); SET search_path=pg_temp,public; SELECT public.get_random_log('fixture-player')"))['pts']==42
assert sql("SELECT NOT prosecdef AND proconfig @> ARRAY['search_path=\"\"'] FROM pg_proc WHERE oid='public.get_random_log(text)'::regprocedure")=='t'
assert sql("SELECT count(*) FROM pg_proc p, LATERAL aclexplode(p.proacl) a WHERE p.oid='public.get_random_log(text)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'")=='0'
sql("SET ROLE service_role; INSERT INTO public.players(id,name) VALUES('service-fixture','Backend'); INSERT INTO public.game_logs(player_id,pts) VALUES('service-fixture',7); UPDATE public.game_logs SET pts=8 WHERE player_id='service-fixture'; DELETE FROM public.game_logs WHERE player_id='service-fixture'; DELETE FROM public.players WHERE id='service-fixture';")
assert json.loads(snapshot())==after
# A direct rerun is safe; the web history wrapper separately rejects duplicates.
sql(migration)
assert json.loads(snapshot())==after
verification=(ROOT/'docs/sql/VERIFY-020-WEB.sql').read_text(encoding='utf-8')
checks=sql(verification)
assert 'ALL_CHECKS_PASSED|t' in checks and '|f' not in checks,checks
bad=sql('BEGIN; GRANT UPDATE(name) ON public.players TO anon;'+verification+'ROLLBACK;')
assert 'ALL_CHECKS_PASSED|f' in bad, 'Postcheck missed an independent column grant'
print('PASS: catalog RLS/read compatibility, RPC shadowing, service ingestion, all table/column/MAINTAIN revokes and inherited-grant rollback')
