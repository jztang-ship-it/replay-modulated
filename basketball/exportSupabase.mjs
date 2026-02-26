import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';

const supabase = createClient(
  'https://hnhrpwwznzokkfagfumb.supabase.co',
  'sb_publishable_WSIZ6R2jgrSe-hXUCMtP8w_lETzweKx'
);

async function fetchAll(table) {
  let rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) { console.error(`Error fetching ${table}:`, error); break; }
    if (!data || data.length === 0) break;
    rows = rows.concat(data);
    console.log(`  ${table}: fetched ${rows.length} so far...`);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function exportAll() {
  console.log('Fetching players...');
  const players = await fetchAll('players');
  console.log(`Total players: ${players.length}`);

  console.log('Fetching game logs...');
  const logs = await fetchAll('game_logs');
  console.log(`Total game logs: ${logs.length}`);

  // Scale salaries x10, cap becomes $150
  const scaledPlayers = players.map(p => ({
    ...p,
    cost: Math.round(p.cost * 10 * 10) / 10
  }));

  mkdirSync('./public/data', { recursive: true });
  writeFileSync('./public/data/players.json', JSON.stringify(scaledPlayers, null, 2));
  writeFileSync('./public/data/game-logs.json', JSON.stringify(logs, null, 2));

  console.log('\nDone. Files written to public/data/');
  console.log('Sample player (scaled):', JSON.stringify(scaledPlayers[0], null, 2));
  console.log('Sample log:', JSON.stringify(logs[0], null, 2));

  // Summary stats
  const activePlayers = scaledPlayers.filter(p => p.active);
  const costs = activePlayers.map(p => p.cost).sort((a,b) => a-b);
  console.log(`\nActive players: ${activePlayers.length}`);
  console.log(`Cost range: $${costs[0]} – $${costs[costs.length-1]}`);
  console.log(`Positions: ${[...new Set(activePlayers.map(p => p.pos))].join(', ')}`);
  console.log(`Logs per player (avg): ${(logs.length / activePlayers.length).toFixed(1)}`);
}

exportAll();
