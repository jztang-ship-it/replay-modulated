import { readFileSync, writeFileSync } from 'fs';

const rawPlayers = JSON.parse(readFileSync('../public/data/players.raw.json', 'utf8'));
const rawLogs    = JSON.parse(readFileSync('../public/data/game-logs.raw.json', 'utf8'));

// Check ID overlap
const playerIds = new Set(rawPlayers.map(p => String(p.id)));
const logIds    = new Set(rawLogs.map(l => String(l.player_id)));
const overlap   = [...playerIds].filter(id => logIds.has(id));
console.log(`Player IDs: ${playerIds.size}, Log IDs: ${logIds.size}, Overlap: ${overlap.length}`);
console.log('Sample player IDs:', [...playerIds].slice(0,5));
console.log('Sample log IDs:   ', [...logIds].slice(0,5));

function tierFromSalary(salary) {
  if (salary >= 50) return 'ORANGE';
  if (salary >= 36) return 'PURPLE';
  if (salary >= 24) return 'BLUE';
  if (salary >= 14) return 'GREEN';
  return 'WHITE';
}

function normalizePos(pos) {
  if (!pos) return 'FLEX';
  const p = String(pos).trim().toUpperCase();
  if (p === 'G' || p === 'PG' || p === 'SG') return 'G';
  if (p === 'F' || p === 'SF' || p === 'PF') return 'F';
  if (p === 'C') return 'C';
  return 'FLEX';
}

// Compute avgFP per player from logs
const logsByPlayer = {};
for (const log of rawLogs) {
  const pid = String(log.player_id);
  if (!logsByPlayer[pid]) logsByPlayer[pid] = [];
  logsByPlayer[pid].push(log);
}

function computeAvgFP(logs) {
  if (!logs || logs.length === 0) return 0;
  const total = logs.reduce((sum, log) => sum +
    (Number(log.pts) * 1.0) +
    (Number(log.reb) * 1.2) +
    (Number(log.ast) * 1.5) +
    (Number(log.stl) * 2.0) +
    (Number(log.blk) * 2.0) +
    (Number(log.turnovers) * -1.0), 0);
  return Math.round((total / logs.length) * 10) / 10;
}

const players = rawPlayers
  .filter(p => p.active && computeAvgFP(logsByPlayer[String(p.id)]) > 0)
  .map(p => {
    const salary = Math.round(Number(p.cost) * 10);
    const tier   = tierFromSalary(salary);
    const pos    = normalizePos(p.pos);
    const avgFP  = computeAvgFP(logsByPlayer[String(p.id)]);
    return {
      id:           String(p.id),
      basePlayerId: String(p.id),
      season:       '2024',
      name:         String(p.name ?? ''),
      team:         String(p.team ?? ''),
      position:     pos,
      salary,
      tier,
      avgFP,
      photoCode:    String(p.id),
    };
  });

const tiers = { ORANGE: 0, PURPLE: 0, BLUE: 0, GREEN: 0, WHITE: 0 };
players.forEach(p => { if (tiers[p.tier] !== undefined) tiers[p.tier]++; });
console.log(`\nPlayers: ${players.length}`);
console.log('Tiers:', tiers);
const salaries = players.map(p => p.salary).sort((a,b) => a-b);
console.log(`Salary range: $${salaries[0]} - $${salaries[salaries.length-1]}`);
const top5 = [...players].sort((a,b) => b.avgFP - a.avgFP).slice(0,5);
console.log('Top 5 by avgFP:', top5.map(p => `${p.name} $${p.salary} ${p.tier} avgFP:${p.avgFP}`));

const logs = rawLogs
  .filter(log => {
    const pts = Number(log.pts ?? 0);
    const reb = Number(log.reb ?? 0);
    const ast = Number(log.ast ?? 0);
    const stl = Number(log.stl ?? 0);
    const blk = Number(log.blk ?? 0);
    const min = Number(log.min ?? 0);
    return min >= 5 && (pts + reb + ast + stl + blk) > 0;
  })
  .map(log => ({
  basePlayerId: String(log.player_id),
  date:      String(log.game_date ?? ''),
  matchDate: String(log.game_date ?? ''),
  opponent:  parseOpponent(log.matchup),
  homeAway:  parseHomeAway(log.matchup),
  season:    '2024',
  stats: {
    pts:       Number(log.pts       ?? 0),
    reb:       Number(log.reb       ?? 0),
    ast:       Number(log.ast       ?? 0),
    stl:       Number(log.stl       ?? 0),
    blk:       Number(log.blk       ?? 0),
    turnovers: Number(log.turnovers ?? 0),
    min:       Number(log.min       ?? 0),
    fg_pct:    Number(log.fg_pct    ?? 0),
    fg3m:      Number(log.fg3m      ?? 0),
    fga:       Number(log.fga       ?? 0),
  },
}));

function parseOpponent(m) {
  if (!m) return '';
  if (m.includes('@')) return m.split('@')[1]?.trim() ?? '';
  return m.split(/vs\.?\s*/i)[1]?.trim() ?? m;
}
function parseHomeAway(m) { return m?.includes('@') ? 'A' : 'H'; }

writeFileSync('../public/data/players.json',   JSON.stringify(players, null, 2));
writeFileSync('../public/data/game-logs.json', JSON.stringify(logs,    null, 2));
console.log('\nDone. Sample player:', JSON.stringify(players[0], null, 2));
