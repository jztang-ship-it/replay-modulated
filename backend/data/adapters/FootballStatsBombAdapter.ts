/**
 * FootballStatsBombAdapter - Transforms StatsBomb Open Data into normalized format
 * Pure data transformation logic - no engine dependencies
 */

import { Player, GameLog, SalaryTier } from '../schema';

/**
 * StatsBomb event types (simplified for MVP)
 */
interface StatsBombEvent {
  type?: { name?: string };
  player?: { id?: number; name?: string };
  minute?: number;
  second?: number;
}

interface StatsBombMatch {
  match_id: number;
  match_date: string;
  home_team: { home_team_id: number; home_team_name: string };
  away_team: { away_team_id: number; away_team_name: string };
  home_score?: number;
  away_score?: number;
}

interface StatsBombLineup {
  team_id: number;
  team_name: string;
  lineups: Array<{
    player_id: number;
    player_name: string;
    player_nickname?: string;
    jersey_number?: number;
  }>;
}

/**
 * Configuration for salary calculation
 */
interface SalaryConfig {
  salaryCap: number;
  baseSalary: number;
  goalsWeight: number;
  assistsWeight: number;
  minutesWeight: number;
}

const DEFAULT_SALARY_CONFIG: SalaryConfig = {
  salaryCap: 100,
  baseSalary: 10,
  goalsWeight: 8,
  assistsWeight: 5,
  minutesWeight: 0.1,
};

/**
 * Calculate player salary based on performance
 */
function calculateSalary(
  totalGoals: number,
  totalAssists: number,
  totalMinutes: number,
  config: SalaryConfig = DEFAULT_SALARY_CONFIG
): number {
  const salary =
    config.baseSalary +
    totalGoals * config.goalsWeight +
    totalAssists * config.assistsWeight +
    totalMinutes * config.minutesWeight;
  return Math.max(1, Math.min(salary, config.salaryCap));
}

/**
 * Determine salary tier based on salary percentage of cap
 */
function calculateTier(salary: number, salaryCap: number): SalaryTier {
  const percentage = (salary / salaryCap) * 100;
  if (percentage >= 45) return 'ORANGE';
  if (percentage >= 35) return 'PURPLE';
  if (percentage >= 25) return 'BLUE';
  if (percentage >= 15) return 'GREEN';
  return 'WHITE';
}

/**
 * Extract season year from match date (YYYY-MM-DD format)
 */
function extractSeason(matchDate: string): number {
  const year = parseInt(matchDate.substring(0, 4), 10);
  return year;
}


/**
 * Adapter to transform StatsBomb data into normalized Player and GameLog format
 */
export class FootballStatsBombAdapter {
  private salaryConfig: SalaryConfig;

  constructor(salaryConfig?: Partial<SalaryConfig>) {
    this.salaryConfig = { ...DEFAULT_SALARY_CONFIG, ...salaryConfig };
  }

  /**
   * Transform StatsBomb data into normalized players and game logs
   * This is a simplified MVP implementation
   */
  transform(
    matches: StatsBombMatch[],
    lineups: StatsBombLineup[],
    events: StatsBombEvent[][],
    _season: number
  ): { players: Player[]; gameLogs: GameLog[] } {
    const playersMap = new Map<string, Player>();
    const gameLogs: GameLog[] = [];
    const playerStats = new Map<string, { goals: number; assists: number; minutes: number }>();

    // Process lineups to create initial player records
    for (const lineup of lineups) {
      for (const playerInfo of lineup.lineups) {
        const playerId = `player-${playerInfo.player_id}`;
        if (!playersMap.has(playerId)) {
          playersMap.set(playerId, {
            id: playerId,
            sport: 'football',
            name: playerInfo.player_name,
            position: 'FW', // Default position - would need position data from StatsBomb
            team: lineup.team_name,
            salary: 0, // Will be calculated later
            tier: 'WHITE',
          });
          playerStats.set(playerId, { goals: 0, assists: 0, minutes: 0 });
        }
      }
    }

    // Process events to calculate stats per match
    const matchEvents = new Map<number, Map<string, { goals: number; assists: number; shots: number; yellowCards: number; redCards: number; minutes: number }>>();

    for (let matchIndex = 0; matchIndex < matches.length && matchIndex < events.length; matchIndex++) {
      const match = matches[matchIndex];
      const matchEventsList = events[matchIndex];
      const matchId = match.match_id;

      if (!matchEvents.has(matchId)) {
        matchEvents.set(matchId, new Map());
      }
      const playerMatchStats = matchEvents.get(matchId)!;

      for (const event of matchEventsList) {
        if (!event.player?.id) continue;

        const playerId = `player-${event.player.id}`;
        if (!playerMatchStats.has(playerId)) {
          playerMatchStats.set(playerId, { goals: 0, assists: 0, shots: 0, yellowCards: 0, redCards: 0, minutes: 90 });
        }

        const stats = playerMatchStats.get(playerId)!;
        const eventType = event.type?.name || '';

        if (eventType === 'Shot') {
          stats.shots++;
        } else if (eventType === 'Goal') {
          stats.goals++;
          stats.shots++;
        } else if (eventType === 'Pass') {
          // Assists would be tracked separately in full StatsBomb data
          // For MVP, we'll skip assist detection
        }
      }
    }

    // Create game logs from match events and accumulate totals
    for (const [matchId, playerMatchStats] of matchEvents) {
      const match = matches.find((m) => m.match_id === matchId);
      if (!match) continue;

      for (const [playerId, stats] of playerMatchStats) {
        const gameLogId = `log-${matchId}-${playerId}`;
        gameLogs.push({
          id: gameLogId,
          sport: 'football',
          playerId,
          season: extractSeason(match.match_date),
          matchDate: match.match_date,
          minutesPlayed: stats.minutes,
          stats: {
            goals: stats.goals,
            assists: stats.assists,
            shots: stats.shots,
            minutes: stats.minutes,
          },
          events: {
            yellow_cards: stats.yellowCards,
            red_cards: stats.redCards,
          },
        });

        // Accumulate totals for salary calculation
        const totals = playerStats.get(playerId) || { goals: 0, assists: 0, minutes: 0 };
        totals.goals += stats.goals;
        totals.assists += stats.assists;
        totals.minutes += stats.minutes;
        playerStats.set(playerId, totals);
      }
    }

    // Calculate salaries and tiers for all players
    const players: Player[] = [];
    for (const [playerId, player] of playersMap) {
      const totals = playerStats.get(playerId) || { goals: 0, assists: 0, minutes: 0 };
      const salary = calculateSalary(
        totals.goals,
        totals.assists,
        totals.minutes,
        this.salaryConfig
      );
      const tier = calculateTier(salary, this.salaryConfig.salaryCap);

      players.push({
        ...player,
        salary: Math.round(salary * 10) / 10,
        tier,
      });
    }

    return { players, gameLogs };
  }

  /**
   * Simple transformation for MVP - accepts minimal input
   * For production, would parse full StatsBomb JSON structure
   */
  transformFromMinimal(
    playerData: Array<{
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
    }>,
    salaryConfig?: Partial<SalaryConfig>
  ): { players: Player[]; gameLogs: GameLog[] } {
    if (salaryConfig) {
      this.salaryConfig = { ...this.salaryConfig, ...salaryConfig };
    }

    const players: Player[] = [];
    const gameLogs: GameLog[] = [];
    const playerTotals = new Map<number, { goals: number; assists: number; minutes: number }>();

    // First pass: accumulate totals for salary calculation
    for (const player of playerData) {
      let totalGoals = 0;
      let totalAssists = 0;
      let totalMinutes = 0;

      for (const match of player.matches) {
        totalGoals += match.goals;
        totalAssists += match.assists;
        totalMinutes += match.minutes;
      }

      playerTotals.set(player.id, { goals: totalGoals, assists: totalAssists, minutes: totalMinutes });
    }

    // Second pass: create players with calculated salaries
    for (const player of playerData) {
      const totals = playerTotals.get(player.id)!;
      const salary = calculateSalary(totals.goals, totals.assists, totals.minutes, this.salaryConfig);
      const tier = calculateTier(salary, this.salaryConfig.salaryCap);

      players.push({
        id: `player-${player.id}`,
        sport: 'football',
        name: player.name,
        position: player.position,
        team: player.team,
        salary: Math.round(salary * 10) / 10,
        tier,
      });
    }

    // Third pass: create game logs
    for (const player of playerData) {
      for (const match of player.matches) {
        const season = extractSeason(match.matchDate);
        gameLogs.push({
          id: `log-${player.id}-${match.matchDate}`,
          sport: 'football',
          playerId: `player-${player.id}`,
          season,
          matchDate: match.matchDate,
          minutesPlayed: match.minutes,
          stats: {
            goals: match.goals,
            assists: match.assists,
            shots: match.shots,
            minutes: match.minutes,
          },
          events: {
            yellow_cards: match.yellowCards,
            red_cards: match.redCards,
          },
        });
      }
    }

    return { players, gameLogs };
  }
}
