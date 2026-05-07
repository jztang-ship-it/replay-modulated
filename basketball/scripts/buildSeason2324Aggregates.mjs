/**
 * buildSeason2324Aggregates.mjs
 *
 * Builds 2023-24 player aggregate entries from the local game-logs.json,
 * mirroring the shape the existing players.json uses for _2425 entries.
 *
 * Why: game-logs.json already ships with 26K logs from 2023-24 (alongside
 * 34K from 2024-25), but players.json was generated with a single-season
 * transform that only emitted _2425 rows. Result: the slate engine has no
 * way to surface a 2023-24 player even though the raw data is right there.
 *
 * This script is read-only with respect to existing files. It writes:
 *   public/data/players_2324.preview.json — proposed 2023-24 entries
 *   public/data/players_2324.preview.summary.txt — stats summary for review
 *
 * Once we like the output we'll wire it into the live pool in a follow-up.
 *
 * Usage:
 *   node basketball/scripts/buildSeason2324Aggregates.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "public", "data");

// FP formula — must match shared/engines/resolveEngine.ts and the existing
// Exportbasketballdata.mjs pipeline so 2324 aggregates are tier-comparable
// to 2425.
function computeFp(stats) {
  return (
    (stats.pts ?? 0) * 1.0 +
    (stats.reb ?? 0) * 1.2 +
    (stats.ast ?? 0) * 1.5 +
    (stats.stl ?? 0) * 2.0 +
    (stats.blk ?? 0) * 2.0 +
    (stats.turnovers ?? 0) * -1.0
  );
}

// Salary curve — must match Exportbasketballdata.mjs so cross-season tier
// comparisons are honest. avgFP × 1.45 → clamped [5, 90].
function salaryFromAvgFp(avgFp) {
  const raw = avgFp * 1.45;
  return Math.round(Math.min(90, Math.max(5, raw)));
}

// Tier breakpoints — match shared/engines/economyEngine.ts current thresholds.
// Note these differ from Exportbasketballdata.mjs (which still uses the older
// {62/45/30/20} cutoffs); we follow the runtime engine since that's what the
// slate currently uses to tier players.
function tierFromSalary(salary) {
  if (salary >= 73) return "RED";
  if (salary >= 58) return "ORANGE";
  if (salary >= 44) return "PURPLE";
  if (salary >= 30) return "BLUE";
  if (salary >= 23) return "GREEN";
  return "WHITE";
}

// ── Main ────────────────────────────────────────────────────────────────────
const logsPath = join(DATA_DIR, "game-logs.json");
const playersPath = join(DATA_DIR, "players.json");
const outPath = join(DATA_DIR, "players_2324.preview.json");
const summaryPath = join(DATA_DIR, "players_2324.preview.summary.txt");

console.log("📥 Loading game-logs.json...");
const allLogs = JSON.parse(readFileSync(logsPath, "utf8"));
console.log(`   ${allLogs.length.toLocaleString()} total logs`);

console.log("📥 Loading players.json (2425 metadata source)...");
const existingPlayers = JSON.parse(readFileSync(playersPath, "utf8"));
console.log(`   ${existingPlayers.length} existing player entries (all _2425)`);

// Build a metadata lookup keyed by basePlayerId. Names, teams, positions, and
// photoCodes are stable across seasons for the same player — we use the 2425
// metadata as the canonical reference when building 2324 entries.
const metaById = new Map();
for (const p of existingPlayers) {
  const bid = String(p.basePlayerId ?? "").trim();
  if (!bid) continue;
  metaById.set(bid, p);
}

console.log("\n🔍 Filtering 2324 logs and grouping by player...");
const logsByPlayer = new Map();
for (const log of allLogs) {
  if (String(log.season) !== "2324") continue;
  const bid = String(log.basePlayerId ?? "").trim();
  if (!bid) continue;
  // Skip DNPs — match the existing pipeline's filter.
  const min = Number(log.stats?.min ?? 0);
  if (min === 0) continue;
  const s = log.stats ?? {};
  if (
    Number(s.pts ?? 0) +
      Number(s.reb ?? 0) +
      Number(s.ast ?? 0) +
      Number(s.stl ?? 0) +
      Number(s.blk ?? 0) ===
    0
  ) {
    continue;
  }
  const arr = logsByPlayer.get(bid) ?? [];
  arr.push(log);
  logsByPlayer.set(bid, arr);
}
console.log(`   ${logsByPlayer.size} unique players with active 2324 logs`);

// Build aggregates
console.log("\n🛠  Computing aggregates...");
const out = [];
const skipped = { noMeta: 0, tooFewGames: 0 };
for (const [bid, logs] of logsByPlayer) {
  const meta = metaById.get(bid);
  if (!meta) {
    skipped.noMeta++;
    continue;
  }
  // Match Exportbasketballdata.mjs threshold — at least 3 games to count.
  if (logs.length < 3) {
    skipped.tooFewGames++;
    continue;
  }
  const totalFp = logs.reduce((s, l) => s + computeFp(l.stats ?? {}), 0);
  const avgFp = Math.round((totalFp / logs.length) * 10) / 10;
  const salary = salaryFromAvgFp(avgFp);
  const tier = tierFromSalary(salary);
  out.push({
    id: `${bid}_2324`,
    basePlayerId: bid,
    season: "2324",
    name: meta.name,
    team: meta.team,
    position: meta.position,
    positionFull: meta.positionFull ?? meta.position,
    salary,
    tier,
    avgFP: avgFp,
    projectedFp: avgFp,
    photoCode: meta.photoCode ?? bid,
    active: meta.active ?? true,
  });
}

// Sort by salary desc to match the existing players.json convention.
out.sort((a, b) => b.salary - a.salary);

// ── Stats summary ───────────────────────────────────────────────────────────
const tierCounts = { RED: 0, ORANGE: 0, PURPLE: 0, BLUE: 0, GREEN: 0, WHITE: 0 };
for (const p of out) tierCounts[p.tier] = (tierCounts[p.tier] ?? 0) + 1;

const salaries = out.map(p => p.salary).sort((a, b) => a - b);
const top10 = out.slice(0, 10);

const summary = [
  `2023-24 player aggregates (preview)`,
  `Generated: ${new Date().toISOString()}`,
  ``,
  `Total entries: ${out.length}`,
  `Skipped: ${skipped.noMeta} (no 2425 metadata), ${skipped.tooFewGames} (< 3 games)`,
  ``,
  `Tier distribution:`,
  ...Object.entries(tierCounts).map(([t, c]) => `  ${t.padEnd(6)} ${c}`),
  ``,
  `Salary range: $${salaries[0]} – $${salaries[salaries.length - 1]}`,
  `Median salary: $${salaries[Math.floor(salaries.length / 2)]}`,
  ``,
  `Top 10 by salary:`,
  ...top10.map(
    p => `  $${String(p.salary).padStart(2)} ${p.tier.padEnd(6)} ${p.name.padEnd(30)} avgFP=${p.avgFP}`
  ),
  ``,
  `Compare to existing 2425 pool:`,
  `  2425 entries: ${existingPlayers.length}`,
  `  Combined pool size if merged: ${existingPlayers.length + out.length}`,
].join("\n");

writeFileSync(outPath, JSON.stringify(out, null, 2));
writeFileSync(summaryPath, summary);

console.log("\n✅ Done.");
console.log(`   → ${outPath}`);
console.log(`   → ${summaryPath}\n`);
console.log(summary);
