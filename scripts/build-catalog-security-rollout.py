"""Build a guarded SQL Editor rollout of 020 from a NEW metadata-only CSV export.
No network/database connections. Backups and generated production SQL stay outside Git.
"""
from pathlib import Path
import argparse,csv,datetime,hashlib,json
ROOT=Path(__file__).resolve().parents[1]
FORMAT='replaymod-catalog-before-020-v1'

def metadata_query():
 return (ROOT/'scripts/sql/catalog-security-metadata.sql').read_text(encoding='utf-8-sig').strip().rstrip(';')

def precheck_sql():
 return '''-- ReplayMod: confirm hnhrpwwznzokkfagfumb / main PRODUCTION in Dashboard.
-- Run the ENTIRE file as postgres. Export the single result row as CSV and keep it outside Git.
-- READ ONLY: backs up catalog ACLs/RLS/policies/columns, RPC definition and migration history.
-- NOT a full database/data backup. Migration 020 makes no changes to catalog rows.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;
WITH snapshot AS (
'''+metadata_query()+'''
)
SELECT 'replaymod-catalog-before-020-v1' AS format,
 clock_timestamp() AS captured_at, current_user AS exported_by,
 current_setting('server_version_num') AS server_version_num,
 payload::text AS payload, md5(payload::text) AS payload_md5
FROM snapshot;
COMMIT;
'''

def load_snapshot(path):
 raw=path.read_bytes()
 with path.open(encoding='utf-8-sig',newline='') as handle:
  rows=list(csv.DictReader(handle))
 if len(rows)!=1:
  raise ValueError('Expected exactly one metadata export row')
 row=rows[0]
 if row.get('format')!=FORMAT or row.get('exported_by')!='postgres':
  raise ValueError('Wrong export format or SQL Editor role')
 if int(row.get('server_version_num','0'))<170000:
  raise ValueError('This production preflight expects PostgreSQL 17 or newer')
 payload=row['payload']; digest=hashlib.md5(payload.encode('utf-8')).hexdigest()
 if digest!=row.get('payload_md5'):
  raise ValueError('CSV metadata checksum mismatch: re-export without editing')
 captured=datetime.datetime.fromisoformat(row['captured_at'].replace('Z','+00:00'))
 if captured.tzinfo is None:
  raise ValueError('Snapshot timestamp must include timezone')
 age=(datetime.datetime.now(datetime.timezone.utc)-captured).total_seconds()
 if not -300<=age<=86400:
  raise ValueError('Snapshot is stale or in the future; export a fresh snapshot (within 24h)')
 data=json.loads(payload)
 tables=data.get('tables') or []
 if len(tables)!=2 or {t['name'] for t in tables}!={'players','game_logs'}:
  raise ValueError('Expected both existing legacy catalog tables')
 if any(t['kind']!='r' or t['owner']!='postgres' for t in tables):
  raise ValueError('Unexpected catalog kind or owner: manual review required')
 if any(t.get('policies') for t in tables):
  raise ValueError('Unexpected existing catalog policies: manual compatibility review required')
 rpc=data.get('rpc')
 if not rpc or rpc['owner']!='postgres' or rpc['security_definer']:
  raise ValueError('Unexpected legacy RPC: manual review required')
 history={h['version']:h['name'] for h in data.get('history') or []}
 expected={'016':'server_authority_boundary','017':'authoritative_challenge_attempt_hands',
           '018':'security_permissions_and_rewards','019':'authoritative_sessions'}
 if any(history.get(v)!=n for v,n in expected.items()) or any(v.isdigit() and int(v)>=20 for v in history):
  raise ValueError('Expected completed 016-019 and no 020/later migration; do not replay or fabricate history')
 roles={r['name']:r for r in data.get('roles') or []}
 if not {'anon','authenticated','service_role'}<=roles.keys() or any(roles[r]['superuser'] or roles[r]['bypassrls'] for r in ['anon','authenticated']):
  raise ValueError('Unexpected browser role configuration')
 return row,hashlib.sha256(raw).hexdigest()

def build_sql(snapshot_path):
 row,backup_sha=load_snapshot(snapshot_path)
 source=(ROOT/'supabase/migrations/020_catalog_read_only.sql').read_text(encoding='utf-8-sig').strip()
 if not source.startswith('BEGIN;') or not source.endswith('COMMIT;'):
  raise ValueError('Expected one outer migration transaction')
 body=source[len('BEGIN;'):-len('COMMIT;')].strip()
 for tag in ['$migration020$','$preflight020$']:
  if tag in source: raise ValueError('SQL delimiter collision')
 deadline=datetime.datetime.fromisoformat(row['captured_at'].replace('Z','+00:00'))+datetime.timedelta(hours=24)
 return f'''-- ReplayMod: apply ONLY 020, target hnhrpwwznzokkfagfumb / main PRODUCTION.
-- Confirm project in Dashboard: database name "postgres" alone CANNOT identify a Supabase project.
-- This file is generated after validating a fresh metadata backup; keep that CSV offline.
-- CSV SHA256: {backup_sha}
-- No data rows modified; catalog rows are NOT backed up by the metadata CSV.
-- Pause catalog imports; run ENTIRE file ONCE as postgres. On error stop and report it.
-- Do NOT run CLI db push or record historical 001-015 using this script.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL idle_in_transaction_session_timeout='90s';
SET LOCAL search_path=pg_catalog,public;
SELECT pg_advisory_xact_lock(hashtextextended('replaymod:security:020',0));
LOCK TABLE public.game_logs,public.players,supabase_migrations.schema_migrations IN ACCESS EXCLUSIVE MODE;
DO $preflight020$
DECLARE got text;
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Use the postgres SQL Editor role'; END IF;
 IF clock_timestamp() > '{deadline.isoformat()}'::timestamptz THEN
   RAISE EXCEPTION 'Metadata backup expired; export again and regenerate'; END IF;
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='020') THEN
   RAISE EXCEPTION '020 already applied; do not rerun'; END IF;
 SELECT md5(payload::text) INTO got FROM (
{metadata_query()}
 ) snapshot;
 IF got IS DISTINCT FROM '{row['payload_md5']}' THEN
   RAISE EXCEPTION 'Catalog/role/history drift since backup; export again and review'; END IF;
END;
$preflight020$;
{body}
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES('020','catalog_read_only',ARRAY[$migration020${source}$migration020$]);
-- FAILPOINT_020: regression tests insert a forced error here to verify full rollback.
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT 'APPLIED_020' AS status, version, name
FROM supabase_migrations.schema_migrations WHERE version='020';
'''

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--snapshot',type=Path,help='Fresh Supabase SQL Editor CSV, outside Git')
 parser.add_argument('--precheck',action='store_true',help='Generate the read-only export SQL instead')
 parser.add_argument('--out',required=True,type=Path)
 args=parser.parse_args()
 if args.precheck == bool(args.snapshot): parser.error('Choose exactly one: --precheck or --snapshot')
 if args.snapshot and (args.out.resolve().is_relative_to(ROOT) or args.snapshot.resolve().is_relative_to(ROOT)):
  parser.error('Production metadata backups/generated rollout must stay outside the repository')
 text=precheck_sql() if args.precheck else build_sql(args.snapshot)
 # Never replace an existing backup or reviewed rollout file silently.
 with args.out.open('x',encoding='utf-8',newline='\n') as handle:handle.write(text)
 print('Created:',args.out)
 print('SHA256:',hashlib.sha256(text.encode('utf-8')).hexdigest())
if __name__=='__main__':main()
