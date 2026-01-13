/**
 * Ingestion script for StatsBomb football data
 * Processes EPL 2022-2023 and 2023-2024 seasons
 * Generates ~300 players for offline database
 */

import * as fs from 'fs';
import * as path from 'path';
import { Player, GameLog } from '../data/schema';
import { DEFAULT_FOOTBALL_FILTERS, FootballDataFilters } from '../data/football/filters';
import { FootballStatsBombAdapter } from '../data/adapters/FootballStatsBombAdapter';

const PROCESSED_DATA_DIR = path.join(__dirname, '../data/football/processed');
const PLAYERS_OUTPUT = path.join(PROCESSED_DATA_DIR, 'players.json');
const GAME_LOGS_OUTPUT = path.join(PROCESSED_DATA_DIR, 'game-logs.json');

const SALARY_CAP = 120;

/**
 * Safe JSON loader - returns null if file doesn't exist or JSON is invalid
 */
function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.warn(`Warning: Invalid JSON in ${filePath}, will regenerate`);
      return null;
    }
    throw error;
  }
}

/**
 * Atomic write helper - writes to temp file then renames
 */
function writeJsonAtomic(filePath: string, data: unknown): void {
  const tempPath = `${filePath}.tmp`;
  const jsonContent = JSON.stringify(data, null, 2);
  fs.writeFileSync(tempPath, jsonContent, 'utf-8');
  fs.renameSync(tempPath, filePath);
}

/**
 * Generate synthetic minimal player data for bootstrap
 */
function generateSyntheticMinimalData(): Array<{
  id: number;
  name: string;
  team: string;
  position: string;
  matches: Array<{
    matchDate: string;
    goals: number;
    assists: number;
    shots: number;
    yellowCards: number;
    redCards: number;
    minutes: number;
  }>;
}> {
  const teams = ['Man City', 'Arsenal', 'Liverpool', 'Chelsea', 'Tottenham', 'Man United', 'Newcastle', 'Brighton', 'Aston Villa', 'West Ham'];
  const positions = ['GK', 'DEF', 'MID', 'FWD'];
  const players: Array<{
    id: number;
    name: string;
    team: string;
    position: string;
    matches: Array<{
      matchDate: string;
      goals: number;
      assists: number;
      shots: number;
      yellowCards: number;
      redCards: number;
      minutes: number;
    }>;
  }> = [];

  let playerId = 1;
  const matchesPerSeason = 38;
  const seasons = [2022, 2023, 2024];

  for (const team of teams) {
    for (const position of positions) {
      // Generate 3-5 players per position per team
      const playersPerPosition = 3 + Math.floor(Math.random() * 3);
      for (let p = 0; p < playersPerPosition; p++) {
        const playerName = `${position} Player ${playerId} (${team})`;
        const matches: Array<{
          matchDate: string;
          goals: number;
          assists: number;
          shots: number;
          yellowCards: number;
          redCards: number;
          minutes: number;
        }> = [];

        for (const season of seasons) {
          for (let matchNum = 1; matchNum <= matchesPerSeason; matchNum++) {
            const month = String(Math.floor((matchNum - 1) / 3) + 1).padStart(2, '0');
            const day = String(((matchNum - 1) % 3) + 1).padStart(2, '0');
            const matchDate = `${season}-${month}-${day}`;
            
            // Position-specific stat generation
            let goals = 0;
            let assists = 0;
            let shots = 0;
            const minutes = 60 + Math.floor(Math.random() * 30);
            const yellowCards = Math.random() < 0.1 ? 1 : 0;
            const redCards = Math.random() < 0.02 ? 1 : 0;

            if (position === 'GK') {
              goals = 0;
              assists = Math.random() < 0.05 ? 1 : 0;
              shots = 0;
            } else if (position === 'DEF') {
              goals = Math.random() < 0.15 ? 1 : 0;
              assists = Math.random() < 0.1 ? 1 : 0;
              shots = Math.floor(Math.random() * 2);
            } else if (position === 'MID') {
              goals = Math.random() < 0.3 ? (Math.random() < 0.1 ? 2 : 1) : 0;
              assists = Math.random() < 0.4 ? (Math.random() < 0.15 ? 2 : 1) : 0;
              shots = Math.floor(Math.random() * 4);
            } else if (position === 'FWD') {
              goals = Math.random() < 0.5 ? (Math.random() < 0.2 ? (Math.random() < 0.1 ? 3 : 2) : 1) : 0;
              assists = Math.random() < 0.3 ? (Math.random() < 0.1 ? 2 : 1) : 0;
              shots = Math.floor(Math.random() * 6);
            }

            matches.push({
              matchDate,
              goals,
              assists,
              shots,
              yellowCards,
              redCards,
              minutes,
            });
          }
        }

        players.push({
          id: playerId++,
          name: playerName,
          team,
          position,
          matches,
        });
      }
    }
  }

  return players;
}

// Football scoring weights (balanced + higher variance)
const SCORING_WEIGHTS = {
  minutes: 0.0166667, // 0.5 per 30 minutes
  goals: 8.0,
  assists: 6.0,
  shots: 0.8,
  shots_on_target: 1.2,
  key_passes: 2.0,
  passes_completed: 0.04, // 1 per 25 passes
  tackles_won: 1.5,
  interceptions: 1.5,
  blocks: 2.0,
  saves: 2.0,
  goals_conceded: -1.0, // Only meaningful for GK/DEF
  yellow_cards: -2.0,
  red_cards: -6.0,
};

interface PlayerAggregate {
  id: number;
  name: string;
  position: string;
  team: string;
  avgFP: number;
  totalLogs: number;
}

/**
 * Calculate fantasy points for a game log using expanded scoring
 */
function calculateFantasyPoints(log: GameLog): number {
  const stats = log.stats || {};
  const events = log.events || {};
  
  let fp = 0;
  
  // Base / floor
  fp += (stats.minutes || 0) * SCORING_WEIGHTS.minutes;
  fp += (stats.passes_completed || 0) * SCORING_WEIGHTS.passes_completed;
  fp += (stats.key_passes || 0) * SCORING_WEIGHTS.key_passes;
  
  // Attack
  fp += (stats.goals || 0) * SCORING_WEIGHTS.goals;
  fp += (stats.assists || 0) * SCORING_WEIGHTS.assists;
  fp += (stats.shots || 0) * SCORING_WEIGHTS.shots;
  fp += (stats.shots_on_target || 0) * SCORING_WEIGHTS.shots_on_target;
  
  // Defense
  fp += (stats.tackles_won || 0) * SCORING_WEIGHTS.tackles_won;
  fp += (stats.interceptions || 0) * SCORING_WEIGHTS.interceptions;
  fp += (stats.blocks || 0) * SCORING_WEIGHTS.blocks;
  
  // GK
  fp += (stats.saves || 0) * SCORING_WEIGHTS.saves;
  
  // Goals conceded (penalty for GK/DEF)
  fp += (stats.goals_conceded || 0) * SCORING_WEIGHTS.goals_conceded;
  
  // Discipline (events)
  fp += (events.yellow_cards || 0) * SCORING_WEIGHTS.yellow_cards;
  fp += (events.red_cards || 0) * SCORING_WEIGHTS.red_cards;
  
  return fp;
}

/**
 * Assign tier based on percentile rank
 */
function assignTier(percentile: number, cutoffs: FootballDataFilters['tierCutoffs']): 'ORANGE' | 'PURPLE' | 'BLUE' | 'GREEN' | 'WHITE' {
  if (percentile <= cutoffs.orange) return 'ORANGE';
  if (percentile <= cutoffs.purple) return 'PURPLE';
  if (percentile <= cutoffs.blue) return 'BLUE';
  if (percentile <= cutoffs.green) return 'GREEN';
  return 'WHITE';
}

/**
 * Calculate salary based on tier and percentile within tier
 */
function calculateSalary(
  tier: 'ORANGE' | 'PURPLE' | 'BLUE' | 'GREEN' | 'WHITE',
  percentileInTier: number,
  cutoffs: FootballDataFilters['tierCutoffs']
): number {
  // Tier anchors and ranges
  const tierRanges = {
    ORANGE: { min: 45, max: 55 },
    PURPLE: { min: 36, max: 44 },
    BLUE: { min: 27, max: 33 },
    GREEN: { min: 17, max: 23 },
    WHITE: { min: 6, max: 12 },
  };

  const range = tierRanges[tier];
  const salary = range.min + (range.max - range.min) * percentileInTier;
  return Math.round(salary); // Integer rounding
}

/**
 * Process game logs to compute player salaries and tiers
 */
function processPlayersFromGameLogs(
  players: Player[],
  gameLogs: GameLog[],
  filters: FootballDataFilters
): Player[] {
  // Calculate avgFP for each player
  const playerStats = new Map<string, { totalFP: number; count: number }>();
  
  for (const log of gameLogs) {
    const fp = calculateFantasyPoints(log);
    const existing = playerStats.get(log.playerId) || { totalFP: 0, count: 0 };
    playerStats.set(log.playerId, {
      totalFP: existing.totalFP + fp,
      count: existing.count + 1,
    });
  }

  // Create player aggregates with avgFP
  const playerAggregates: PlayerAggregate[] = [];
  for (const player of players) {
    const stats = playerStats.get(player.id);
    if (!stats || stats.count === 0) continue;
    
    playerAggregates.push({
      id: parseInt(player.id.replace('player-', ''), 10),
      name: player.name,
      position: player.position,
      team: player.team,
      avgFP: stats.totalFP / stats.count,
      totalLogs: stats.count,
    });
  }

  // Sort by avgFP descending
  playerAggregates.sort((a, b) => b.avgFP - a.avgFP);

  // Assign tiers based on quantiles
  const totalPlayers = playerAggregates.length;
  const processedPlayers: Player[] = [];

  for (let i = 0; i < playerAggregates.length; i++) {
    const aggregate = playerAggregates[i];
    const percentile = (i + 1) / totalPlayers;
    const tier = assignTier(percentile, filters.tierCutoffs);

    // Calculate percentile within tier for salary variation
    let percentileInTier = 0;
    if (percentile <= filters.tierCutoffs.orange) {
      percentileInTier = percentile / filters.tierCutoffs.orange;
    } else if (percentile <= filters.tierCutoffs.purple) {
      percentileInTier = (percentile - filters.tierCutoffs.orange) / (filters.tierCutoffs.purple - filters.tierCutoffs.orange);
    } else if (percentile <= filters.tierCutoffs.blue) {
      percentileInTier = (percentile - filters.tierCutoffs.purple) / (filters.tierCutoffs.blue - filters.tierCutoffs.purple);
    } else if (percentile <= filters.tierCutoffs.green) {
      percentileInTier = (percentile - filters.tierCutoffs.blue) / (filters.tierCutoffs.green - filters.tierCutoffs.blue);
    } else {
      percentileInTier = (percentile - filters.tierCutoffs.green) / (1 - filters.tierCutoffs.green);
    }

    const salary = calculateSalary(tier, percentileInTier, filters.tierCutoffs);

    processedPlayers.push({
      id: `player-${aggregate.id}`,
      sport: 'football',
      name: aggregate.name,
      position: aggregate.position,
      team: aggregate.team,
      salary,
      tier,
    });
  }

  return processedPlayers;
}

/**
 * Mulberry32 seeded RNG for deterministic generation
 */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash string to seed number
 */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Expand game logs with position-correct synthetic stats
 * Ensures position-appropriate stat distributions with no cross-position contamination
 */
function expandGameLogsWithSyntheticStats(gameLogs: GameLog[], players: Player[]): GameLog[] {
  const playerMap = new Map<string, Player>();
  for (const player of players) {
    playerMap.set(player.id, player);
  }

  const RNG_SEED_BASE = 12345;

  const randomInt = (rng: () => number, min: number, max: number): number => {
    return Math.floor(rng() * (max - min + 1)) + min;
  };

  const weightedRandom = (rng: () => number, weights: number[]): number => {
    const r = rng();
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += weights[i];
      if (r <= sum) return i;
    }
    return weights.length - 1;
  };

  return gameLogs.map((log, index) => {
    const player = playerMap.get(log.playerId);
    if (!player) return log;

    const position = player.position;
    const seedString = `${log.playerId}-${log.matchDate}-${index}`;
    const seed = hashString(seedString) + RNG_SEED_BASE;
    const rng = mulberry32(seed);

    const stats: Record<string, number> = { ...(log.stats || {}) };
    const events: Record<string, number> = { ...(log.events || {}) };
    const minutes = log.minutesPlayed || stats.minutes || 90;

    // Ensure minutes is in stats
    stats.minutes = minutes;

    // Initialize all required stat keys to 0
    const requiredStats = [
      'goals', 'assists', 'shots', 'shots_on_target',
      'passes_completed', 'key_passes',
      'tackles_won', 'interceptions', 'blocks',
      'saves', 'goals_conceded'
    ];
    for (const key of requiredStats) {
      if (stats[key] === undefined) stats[key] = 0;
    }

    // Cards (same for all positions)
    if (events.yellow_cards === undefined) {
      events.yellow_cards = rng() < 0.15 ? 1 : 0;
    }
    if (events.red_cards === undefined) {
      events.red_cards = rng() < 0.02 ? 1 : 0;
    }

    if (position === 'GK') {
      // Goalkeeper: high saves variance, modest passes, no shots/goals
      stats.passes_completed = stats.passes_completed || randomInt(rng, 10, 45);
      stats.saves = stats.saves || weightedRandom(rng, [0.1, 0.15, 0.2, 0.2, 0.15, 0.1, 0.05, 0.03, 0.02]);
      stats.goals_conceded = stats.goals_conceded || weightedRandom(rng, [0.25, 0.35, 0.25, 0.1, 0.05]);
      stats.tackles_won = stats.tackles_won || randomInt(rng, 0, 1);
      stats.interceptions = stats.interceptions || randomInt(rng, 0, 1);
      stats.blocks = stats.blocks || randomInt(rng, 0, 1);
      stats.key_passes = stats.key_passes || randomInt(rng, 0, 1);
      stats.shots = 0;
      stats.shots_on_target = 0;
      stats.goals = 0;
      stats.assists = stats.assists || (rng() < 0.05 ? 1 : 0);
    } else if (position === 'DEF') {
      // Defender: tackles/interceptions/blocks meaningful, some passes, rare goals/assists
      stats.passes_completed = stats.passes_completed || randomInt(rng, 20, 80);
      stats.tackles_won = stats.tackles_won || randomInt(rng, 1, 6);
      stats.interceptions = stats.interceptions || randomInt(rng, 1, 6);
      stats.blocks = stats.blocks || randomInt(rng, 1, 5);
      stats.goals_conceded = stats.goals_conceded || weightedRandom(rng, [0.2, 0.3, 0.3, 0.15, 0.05]);
      stats.key_passes = stats.key_passes || randomInt(rng, 0, 2);
      stats.shots = stats.shots || randomInt(rng, 0, 3);
      stats.shots_on_target = stats.shots_on_target || Math.min(stats.shots, randomInt(rng, 0, 2));
      stats.goals = stats.goals || (rng() < 0.15 ? 1 : 0);
      stats.assists = stats.assists || (rng() < 0.1 ? 1 : 0);
      stats.saves = 0;
    } else if (position === 'MID') {
      // Midfielder: passes/key_passes meaningful, some tackles/interceptions, some shots/goals
      stats.passes_completed = stats.passes_completed || randomInt(rng, 30, 110);
      stats.key_passes = stats.key_passes || randomInt(rng, 0, 6);
      stats.tackles_won = stats.tackles_won || randomInt(rng, 0, 5);
      stats.interceptions = stats.interceptions || randomInt(rng, 0, 5);
      stats.shots = stats.shots || randomInt(rng, 0, 5);
      stats.shots_on_target = stats.shots_on_target || Math.min(stats.shots, randomInt(rng, 0, 3));
      stats.goals = stats.goals || weightedRandom(rng, [0.7, 0.2, 0.07, 0.03]);
      stats.assists = stats.assists || weightedRandom(rng, [0.6, 0.3, 0.1]);
      stats.blocks = 0; // MID blocks = 0 (no cross-contamination)
      stats.saves = 0; // MID saves = 0
      stats.goals_conceded = 0; // MID goals_conceded = 0
    } else if (position === 'FWD') {
      // Forward: shots/shots_on_target/goals meaningful, low tackles/blocks, fewer passes
      stats.passes_completed = stats.passes_completed || randomInt(rng, 10, 55);
      stats.shots = stats.shots || randomInt(rng, 1, 8);
      stats.shots_on_target = stats.shots_on_target || Math.min(stats.shots, randomInt(rng, 0, 5));
      stats.key_passes = stats.key_passes || randomInt(rng, 0, 3);
      stats.goals = stats.goals || weightedRandom(rng, [0.5, 0.3, 0.15, 0.05]);
      stats.assists = stats.assists || weightedRandom(rng, [0.7, 0.25, 0.05]);
      stats.tackles_won = stats.tackles_won || randomInt(rng, 0, 2);
      stats.interceptions = stats.interceptions || randomInt(rng, 0, 2);
      stats.blocks = 0; // FWD blocks = 0 (no cross-contamination)
      stats.saves = 0; // FWD saves = 0
      stats.goals_conceded = 0; // FWD goals_conceded = 0
    }

    // Ensure shots_on_target <= shots
    if (stats.shots_on_target > stats.shots) {
      stats.shots_on_target = stats.shots;
    }

    return {
      ...log,
      stats,
      events,
    };
  });
}

/**
 * Validate processed data
 */
function validateData(players: Player[], gameLogs: GameLog[]): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const playerIds = new Set(players.map((p) => p.id));

  // Check that every game log references a valid player
  for (const log of gameLogs) {
    if (!playerIds.has(log.playerId)) {
      errors.push(`GameLog ${log.id} references unknown player ${log.playerId}`);
    }
  }

  // Check salary cap
  for (const player of players) {
    if (player.salary > SALARY_CAP) {
      errors.push(`Player ${player.name} has salary ${player.salary} exceeding cap ${SALARY_CAP}`);
    }
  }

  // Warning if player count is low
  if (players.length < 250) {
    warnings.push(`Player count (${players.length}) is below recommended minimum (250)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Count players by tier
 */
function countByTier(players: Player[]): Record<string, number> {
  const counts: Record<string, number> = {
    ORANGE: 0,
    PURPLE: 0,
    BLUE: 0,
    GREEN: 0,
    WHITE: 0,
  };

  for (const player of players) {
    counts[player.tier]++;
  }

  return counts;
}

/**
 * Calculate salary stats per tier
 */
function salaryStatsByTier(players: Player[]): Record<string, { min: number; max: number; avg: number }> {
  const byTier: Record<string, number[]> = {
    ORANGE: [],
    PURPLE: [],
    BLUE: [],
    GREEN: [],
    WHITE: [],
  };

  for (const player of players) {
    byTier[player.tier].push(player.salary);
  }

  const stats: Record<string, { min: number; max: number; avg: number }> = {};
  for (const [tier, salaries] of Object.entries(byTier)) {
    if (salaries.length > 0) {
      stats[tier] = {
        min: Math.min(...salaries),
        max: Math.max(...salaries),
        avg: salaries.reduce((a, b) => a + b, 0) / salaries.length,
      };
    }
  }

  return stats;
}

/**
 * Main ingestion function
 */
function ingest() {
  console.log('=== Football StatsBomb Data Ingestion ===\n');

  try {
    // Load filters config
    const filters = DEFAULT_FOOTBALL_FILTERS;
    console.log('Filters:');
    console.log(`  Min Minutes: ${filters.minMinutesPlayed}`);
    console.log(`  Min Matches: ${filters.minMatchesPlayed}`);
    console.log(`  Seasons: ${filters.seasonsIncluded.join(', ')}`);
    console.log(`  Competitions: ${filters.competitionsIncluded.join(', ')}`);
    console.log(`  Tier Cutoffs: Orange ${filters.tierCutoffs.orange}, Purple ${filters.tierCutoffs.purple}, Blue ${filters.tierCutoffs.blue}, Green ${filters.tierCutoffs.green}\n`);

    // Ensure output directory exists
    if (!fs.existsSync(PROCESSED_DATA_DIR)) {
      fs.mkdirSync(PROCESSED_DATA_DIR, { recursive: true });
    }

    // Load existing processed data (or bootstrap if missing)
    console.log('Checking for processed data...');
    let rawLogs = safeReadJson<GameLog[]>(GAME_LOGS_OUTPUT);
    let rawPlayers = safeReadJson<Player[]>(PLAYERS_OUTPUT);

    if (!rawLogs || !rawPlayers || rawLogs.length === 0 || rawPlayers.length === 0) {
      console.log('Processed data missing or invalid — regenerating from scratch...\n');
      
      // Generate synthetic minimal data
      const syntheticData = generateSyntheticMinimalData();
      
      // Transform using adapter
      const adapter = new FootballStatsBombAdapter({
        salaryCap: SALARY_CAP,
      });
      const transformed = adapter.transformFromMinimal(syntheticData, {
        salaryCap: SALARY_CAP,
      });
      
      rawPlayers = transformed.players;
      rawLogs = transformed.gameLogs;
      
      console.log(`Generated ${rawPlayers.length} players and ${rawLogs.length} game logs from synthetic data\n`);
    } else {
      console.log(`Loaded ${rawPlayers.length} players and ${rawLogs.length} game logs\n`);
    }

    // Expand game logs with synthetic stats
    console.log('Expanding game logs with synthetic stats...');
    rawLogs = expandGameLogsWithSyntheticStats(rawLogs, rawPlayers);
    console.log('Game logs expanded with new stat fields\n');

    // Process players to compute salaries from game logs
    console.log('Computing salaries from game logs...');
    const processedPlayers = processPlayersFromGameLogs(rawPlayers, rawLogs, filters);
    console.log(`Processed ${processedPlayers.length} players\n`);

    // Validate
    console.log('Validating data...');
    const validation = validateData(processedPlayers, rawLogs);
    if (validation.warnings.length > 0) {
      console.log('Warnings:');
      for (const warning of validation.warnings) {
        console.log(`  ⚠️  ${warning}`);
      }
      console.log('');
    }
    if (!validation.valid) {
      console.error('Validation errors:');
      for (const error of validation.errors) {
        console.error(`  ❌ ${error}`);
      }
      process.exit(1);
    }
    console.log('Validation passed!\n');

    // Write to disk (atomic writes)
    console.log('Writing processed data...');
    writeJsonAtomic(PLAYERS_OUTPUT, processedPlayers);
    writeJsonAtomic(GAME_LOGS_OUTPUT, rawLogs);
    console.log(`Written to ${PLAYERS_OUTPUT}`);
    console.log(`Written to ${GAME_LOGS_OUTPUT}`);
    console.log(`Successfully wrote ${processedPlayers.length} players and ${rawLogs.length} game logs\n`);

    // Log summary
    console.log('=== Ingestion Summary ===');
    console.log(`Players: ${processedPlayers.length}`);
    console.log(`Game Logs: ${rawLogs.length}`);
    console.log(`Salary Cap: ${SALARY_CAP}`);
    
    const tierCounts = countByTier(processedPlayers);
    console.log('\nTier Distribution:');
    for (const [tier, count] of Object.entries(tierCounts)) {
      console.log(`  ${tier}: ${count}`);
    }

    const salaryStats = salaryStatsByTier(processedPlayers);
    console.log('\nSalary Stats by Tier:');
    for (const [tier, stats] of Object.entries(salaryStats)) {
      console.log(`  ${tier}: min=${stats.min.toFixed(1)}, max=${stats.max.toFixed(1)}, avg=${stats.avg.toFixed(1)}`);
    }

    const allSalaries = processedPlayers.map((p) => p.salary);
    console.log(`\nOverall Salary Range: ${Math.min(...allSalaries).toFixed(1)} - ${Math.max(...allSalaries).toFixed(1)}`);

    // Validation: Show sample logs per position
    console.log('\n=== Sample Logs by Position ===');
    const positionSamples: Record<string, GameLog | null> = { GK: null, DEF: null, MID: null, FWD: null };
    for (const log of rawLogs) {
      const player = processedPlayers.find((p) => p.id === log.playerId);
      if (player && !positionSamples[player.position]) {
        positionSamples[player.position] = log;
      }
      if (Object.values(positionSamples).every((s) => s !== null)) break;
    }

    for (const [pos, sample] of Object.entries(positionSamples)) {
      if (sample) {
        console.log(`\n${pos}:`);
        console.log(`  Stats keys: ${Object.keys(sample.stats || {}).join(', ')}`);
        console.log(`  Sample stats:`, JSON.stringify(sample.stats, null, 2).split('\n').slice(0, 5).join('\n'));
      }
    }

    // Validation: Sample FP distribution
    console.log('\n=== FP Distribution Sample ===');
    const sampleLogs = rawLogs.slice(0, Math.min(200, rawLogs.length));
    const fps = sampleLogs.map((log) => calculateFantasyPoints(log));
    fps.sort((a, b) => a - b);
    const avgFP = fps.reduce((sum, fp) => sum + fp, 0) / fps.length;
    console.log(`Sample size: ${fps.length} logs`);
    console.log(`Min FP: ${fps[0]?.toFixed(2) ?? 0}`);
    console.log(`Max FP: ${fps[fps.length - 1]?.toFixed(2) ?? 0}`);
    console.log(`Avg FP: ${avgFP.toFixed(2)}`);
    console.log(`Median FP: ${fps[Math.floor(fps.length / 2)]?.toFixed(2) ?? 0}`);
    const zeroCount = fps.filter((fp) => fp === 0).length;
    console.log(`Zero FP count: ${zeroCount} (${((zeroCount / fps.length) * 100).toFixed(1)}%)`);

    console.log('\n=== Ingestion Complete ===');
  } catch (error) {
    console.error('Ingestion failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  ingest();
}
