import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const rawPlayers = JSON.parse(readFileSync('../public/data/mlb/players.json', 'utf8'));
const rawLogs    = JSON.parse(readFileSync('../public/data/mlb/game-logs.json', 'utf8'));

console.log(`Raw players: ${rawPlayers.length}, Raw logs: ${rawLogs.length}`);

// ── Salary tier mapping (mirror basketball pattern) ──────────────────────────
// Baseball salary is derived from avgFP since raw data has no salary field.
// Tune these thresholds once baseball FP distribution is known.
function tierFromSalary(salary) {
  if (salary >= 55) return 'ORANGE';
  if (salary >= 40) return 'PURPLE';
  if (salary >= 28) return 'BLUE';
  if (salary >= 16) return 'GREEN';
  return 'WHITE';
}

function salaryFromAvgFP(avgFP) {
  // Scale avgFP to a salary in the 10–70 range to fit salaryCap: 180 for 6 slots
  // This is a starting approximation — tune after seeing FP distribution
  const raw = Math.round(avgFP * 1.8);
  return Math.max(10, Math.min(70, raw));
}

// ── Season derivation ────────────────────────────────────────────────────────
// Baseball logs use date "2025-05-30" → season 2425
// Mirror basketball's "2425" string convention
function seasonFromDate(dateStr) {
  if (!dateStr) return 2425;
  const year = parseInt(String(dateStr).slice(0, 4), 10);
  if (year === 2025) return 2425;
  if (year === 2024) return 2324;
  return 2425; // default
}

// ── FP calculation (mirrors baseballConfig projectionWeights) ────────────────
function computeFP(stats) {
  if (!stats) return 0;
  const s = stats;
  // Hitter stats
  const hitFP =
    (Number(s.h        ?? 0) * 10) +
    (Number(s.doubles  ?? 0) * 5)  +
    (Number(s.triples  ?? 0) * 10) +
    (Number(s.hr       ?? 0) * 20) +
    (Number(s.r        ?? 0) * 8)  +
    (Number(s.rbi      ?? 0) * 8)  +
    (Number(s.bb       ?? 0) * 6)  +
    (Number(s.sb       ?? 0) * 12);
  // Pitcher stats
  const pitchFP =
    (Number(s.ip  ?? 0) * 3)  +
    (Number(s.k   ?? 0) * 4)  +
    (Number(s.er  ?? 0) * -3) +
    (Number(s.w   ?? 0) * 6)  +
    (Number(s.qs  ?? 0) * 8);
  return hitFP + pitchFP;
}

// ── Build log index by playerId ──────────────────────────────────────────────
const logsByPlayer = {};
for (const log of rawLogs) {
  const pid = String(log.playerId ?? '');
  if (!pid) continue;
  if (!logsByPlayer[pid]) logsByPlayer[pid] = [];
  logsByPlayer[pid].push(log);
}

// ── Transform players ────────────────────────────────────────────────────────
function computeAvgFP(logs) {
  if (!logs || logs.length === 0) return 0;
  const total = logs.reduce((sum, log) => sum + computeFP(log.stats ?? {}), 0);
  return Math.round((total / logs.length) * 10) / 10;
}

const players = rawPlayers
  .map(p => {
    const pid    = String(p.playerId ?? '');
    const logs   = logsByPlayer[pid] ?? [];
    const avgFP  = computeAvgFP(logs);
    const salary = salaryFromAvgFP(avgFP);
    const tier   = tierFromSalary(salary);
    return {
      id:           pid,
      basePlayerId: pid,
      season:       '2425',
      name:         String(p.name ?? ''),
      team:         String(p.mlbTeam ?? ''),
      position:     String(p.position ?? 'BAT').trim().toUpperCase(),
      salary,
      tier,
      avgFP,
      photoCode:    pid,
    };
  })
  // Only keep players who have at least 1 log with meaningful stats
  .filter(p => {
    const logs = logsByPlayer[p.id] ?? [];
    return logs.some(l => computeFP(l.stats ?? {}) > 0);
  });

// ── Transform logs ───────────────────────────────────────────────────────────
const logs = rawLogs
  .filter(log => computeFP(log.stats ?? {}) > 0) // filter zero-stat logs
  .map(log => ({
    basePlayerId: String(log.playerId ?? ''),
    playerId:     String(log.playerId ?? ''),
    season:       seasonFromDate(log.date),
    date:         String(log.date ?? ''),
    opponent:     String(log.opponent ?? ''),
    stats: {
      h:        Number(log.stats?.h        ?? 0),
      doubles:  Number(log.stats?.doubles  ?? 0),
      triples:  Number(log.stats?.triples  ?? 0),
      hr:       Number(log.stats?.hr       ?? 0),
      r:        Number(log.stats?.r        ?? 0),
      rbi:      Number(log.stats?.rbi      ?? 0),
      bb:       Number(log.stats?.bb       ?? 0),
      sb:       Number(log.stats?.sb       ?? 0),
      pa:       Number(log.stats?.pa       ?? 0),
      // Pitcher stats (will be 0 for hitters — that's fine)
      ip:       Number(log.stats?.ip       ?? 0),
      k:        Number(log.stats?.k        ?? 0),
      er:       Number(log.stats?.er       ?? 0),
      w:        Number(log.stats?.w        ?? 0),
      qs:       Number(log.stats?.qs       ?? 0),
    },
  }));

// ── Write output ─────────────────────────────────────────────────────────────
mkdirSync('../public/data', { recursive: true });
writeFileSync('../public/data/players.json',   JSON.stringify(players, null, 2));
writeFileSync('../public/data/game-logs.json', JSON.stringify(logs,    null, 2));

// ── Summary ──────────────────────────────────────────────────────────────────
const tiers = { ORANGE: 0, PURPLE: 0, BLUE: 0, GREEN: 0, WHITE: 0 };
players.forEach(p => { if (tiers[p.tier] !== undefined) tiers[p.tier]++; });
const salaries = players.map(p => p.salary).sort((a, b) => a - b);
const top5 = [...players].sort((a, b) => b.avgFP - a.avgFP).slice(0, 5);

console.log(`\nPlayers written: ${players.length}`);
console.log('Tiers:', tiers);
console.log(`Salary range: $${salaries[0]} – $${salaries[salaries.length - 1]}`);
console.log(`Logs written: ${logs.length}`);
console.log('Top 5 by avgFP:', top5.map(p => `${p.name} $${p.salary} ${p.tier} avgFP:${p.avgFP}`));
console.log('\nSample player:', JSON.stringify(players[0], null, 2));
console.log('Sample log:',    JSON.stringify(logs[0],    null, 2));
console.log('\n✅ Done.');
