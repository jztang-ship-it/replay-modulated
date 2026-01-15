import * as fs from 'fs';
import * as path from 'path';
import { Player } from '../models';

type Tier = 'ORANGE' | 'PURPLE' | 'BLUE' | 'GREEN' | 'WHITE';

function pct(n: number, d: number) {
  if (d === 0) return '0.00%';
  return ((n / d) * 100).toFixed(2) + '%';
}

function main() {
  const processedDir = path.join(__dirname, '..', 'data', 'football', 'processed');
  const playersPath = path.join(processedDir, 'players.json');

  if (!fs.existsSync(playersPath)) {
    console.error(`Missing processed players file: ${playersPath}`);
    process.exit(1);
  }

  const players: Player[] = JSON.parse(fs.readFileSync(playersPath, 'utf8'));

  const positions = ['GK', 'DEF', 'MID', 'FWD'];
  const tiers: Tier[] = ['ORANGE', 'PURPLE', 'BLUE', 'GREEN', 'WHITE'];

  console.log(`\n=== Tier Counts (Processed Players) ===`);
  console.log(`Players: ${players.length}\n`);

  const byPos: Record<string, Player[]> = {};
  for (const pos of positions) byPos[pos] = [];
  for (const p of players) {
    if (byPos[p.position]) byPos[p.position].push(p);
  }

  for (const pos of positions) {
    const pool = byPos[pos];
    const total = pool.length;
    const orange = pool.filter(p => p.tier === 'ORANGE').length;
    const purple = pool.filter(p => p.tier === 'PURPLE').length;

    console.log(`${pos}: ${total} players`);
    console.log(`  ORANGE: ${orange} (${pct(orange, total)})`);
    console.log(`  PURPLE: ${purple} (${pct(purple, total)})`);

    // Optional full tier breakdown
    const breakdown: Record<string, number> = {};
    for (const t of tiers) breakdown[t] = pool.filter(p => p.tier === t).length;
    console.log(
      `  Breakdown: ` +
        tiers.map(t => `${t}=${breakdown[t]}`).join('  ')
    );
    console.log('');
  }

  const allOrange = players.filter(p => p.tier === 'ORANGE').length;
  const allPurple = players.filter(p => p.tier === 'PURPLE').length;
  console.log(`TOTAL: ORANGE=${allOrange} (${pct(allOrange, players.length)}), PURPLE=${allPurple} (${pct(allPurple, players.length)})\n`);
}

main();
