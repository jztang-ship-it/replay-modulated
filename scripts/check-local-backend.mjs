/** Opt-in, read-only diagnosis of the configured backend. No SQL migrations or writes. */
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './lib/local-env.mjs';
loadLocalEnv(fileURLToPath(new URL('../', import.meta.url)));
let failures = 0;
function report(name, ok, detail = '') {
 console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ': '+detail : ''}`);
 if (!ok) failures++;
}
const required = ['SUPABASE_SERVICE_ROLE_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
for (const name of required) report(name, !!process.env[name], process.env[name] ? 'configured (value hidden)' : 'missing from root .env.local');
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
 const { supabaseAdmin } = await import('../api/hand/_lib/supabaseServer.ts');
 for (const [table, columns] of [
  ['hand_sessions', 'hand_id,revision'], ['authoritative_bonus_pools', 'scope'],
  ['hand_log', 'authority_version'], ['shared_challenges', 'authority_version'], ['reward_claims', 'campaign'],
 ]) {
  try {
   const { error } = await supabaseAdmin.from(table).select(columns).limit(0).abortSignal(AbortSignal.timeout(12000));
   report(table, !error, error ? `schema/access check failed (${error.code || 'network'}); review migrations 016-019` : 'schema available; no business rows read');
  } catch { report(table, false, 'connection failed'); }
 }
}
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
 try {
  const response = await fetch(process.env.KV_REST_API_URL, {
   method: 'POST', headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
   body: JSON.stringify(['EVAL', 'return 1', '0']), signal: AbortSignal.timeout(12000),
  });
  const data = await response.json();
  report('Redis read-only EVAL', response.ok && data.result === 1, 'no keys changed');
 } catch { report('Redis read-only EVAL', false, 'connection failed'); }
}
console.log('No database migrations or data writes were performed. Do not bypass authority checks to make this pass.');
process.exitCode = failures ? 1 : 0;
