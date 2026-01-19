export type SalaryTier = 'ORANGE' | 'PURPLE' | 'BLUE' | 'GREEN' | 'WHITE';

export interface Player {
  id: string;
  sport: string;
  name: string;
  position: string;
  team: string;
  salary: number;
  tier: SalaryTier;
  headshotUrl?: string;
}

export interface GameLog {
  id: string;
  sport: string;
  playerId: string;
  season: number;
  matchDate: string;
  minutesPlayed: number;
  stats: Record<string, number>;
  events: Record<string, number>;
}
