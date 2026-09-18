// Run: PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node scripts/tests/free-play-db.mjs
// Disposable in-memory PostgreSQL: never connects to Supabase or the mother database.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
const migration=n=>readFileSync(new URL(`../../supabase/migrations/${n}`,import.meta.url),'utf8');
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE TABLE public.shared_challenges(challenge_id uuid PRIMARY KEY);
CREATE TABLE public.challenge_attempts(id uuid PRIMARY KEY);`);
// Exercise the real legacy wallet, reward and settlement functions before removal.
await db.exec(migration('001_player_tables.sql'));
await db.exec(migration('002_server_side_extension.sql'));
await db.exec(migration('019_authoritative_sessions.sql').split('-- Legacy authority is explicitly excluded')[0]+'COMMIT;');
await db.exec(migration('003_inbox.sql'));
const rewards=migration('018_security_permissions_and_rewards.sql');
await db.exec(rewards.slice(rewards.indexOf('CREATE TABLE public.reward_claims')));
await db.exec(`INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO player_state(id,balance) VALUES ('22222222-2222-4222-8222-222222222222',4321);`);
await db.exec(migration('021_free_play_sessions.sql'));
await assert.rejects(db.exec(migration('022_remove_economy.sql')),/dedicated free-play database/);
await db.exec('ROLLBACK');
await db.exec("SET replay.free_play_database='true'");
await assert.rejects(db.exec(migration('022_remove_economy.sql')),/nonempty economy table/);
await db.exec('ROLLBACK');
assert.deepEqual((await db.query('SELECT balance FROM player_state')).rows,[{balance:4321}]);
// Remove only the synthetic fixture from this disposable test database.
await db.exec('DELETE FROM player_state');
await db.exec(migration('022_remove_economy.sql'));

const uid='11111111-1111-4111-8111-111111111111';
const roster=Array.from({length:5},(_,i)=>({basePlayerId:`player${i}`,actualFp:20+i}));
const state={roster,draws:0,resolved:false};
async function start(request,id,season='2425') {return (await db.query(`SELECT start_free_play_hand($1,$2,$3,'basketball',$4,NULL,NULL,$5) AS h`,[uid,id,request,season,state])).rows[0].h;}
async function commit(id,rev,data,settle,tier='STARTER',user=uid) {return (await db.query(`SELECT commit_free_play_hand($1,$2,$3,$4,$5,$6) AS h`,[user,id,rev,data,settle,tier])).rows[0].h;}
const req='33333333-3333-4333-8333-333333333333';
const first=await start(req,'hand-a'); assert.equal(first.revision,0);
assert.equal((await start(req,'hand-b')).hand_id,'hand-a');
await assert.rejects(start(req,'hand-c','2526'),/context mismatch/);
await assert.rejects(commit('hand-a',0,state,true,'STARTER','22222222-2222-4222-8222-222222222222'),/unknown hand/);
const drawn=await commit('hand-a',0,{...state,draws:1},false);assert.equal(drawn.revision,1);
await assert.rejects(commit('hand-a',0,state,true),/stale revision/);
const settled=await commit('hand-a',1,{...state,resolved:true},true);assert.equal(settled.state.hand.total_fp,110);
assert.deepEqual(Object.keys(settled.state.hand).sort(),['hand_id','season','sport','tier','total_fp']);
assert.equal((await commit('hand-a',1,state,true)).revision,2);
assert.equal((await db.query('SELECT count(*)::int AS n FROM hand_log')).rows[0].n,1);

assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='hand_log' AND column_name IN ('payout','bet_amount','streak_multiplier','streak_at_play')")).rows[0].n,0);
assert.equal((await db.query("SELECT to_regclass('public.player_state') AS wallet")).rows[0].wallet,null);
assert.equal((await db.query("SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('grant_coins','resolve_hand','start_authoritative_hand','commit_authoritative_hand')")).rows[0].n,0);
assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.start_free_play_hand(uuid,text,uuid,text,text,text,uuid,jsonb)','EXECUTE') AS allowed")).rows[0].allowed,false);
console.log('PASS: dedicated-database and financial-record guards; no wallet or economy functions/columns; score-only start/draw/settle, retry, ownership and revision checks.');
await db.close();
