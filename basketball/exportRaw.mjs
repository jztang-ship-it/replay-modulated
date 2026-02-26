import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
const supabase = createClient('https://hnhrpwwznzokkfagfumb.supabase.co','sb_publishable_WSIZ6R2jgrSe-hXUCMtP8w_lETzweKx');
async function fetchAll(table) {
  let rows = [], from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from+999);
    if (error || !data?.length) break;
    rows = rows.concat(data);
    console.log(`  ${table}: ${rows.length}`);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}
mkdirSync('./public/data', { recursive: true });
const players = await fetchAll('players');
const logs    = await fetchAll('game_logs');
writeFileSync('./public/data/players.raw.json',   JSON.stringify(players, null, 2));
writeFileSync('./public/data/game-logs.raw.json', JSON.stringify(logs,    null, 2));
console.log('✅ Raw files sad.');
