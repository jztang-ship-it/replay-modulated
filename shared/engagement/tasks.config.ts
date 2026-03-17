export type TaskCadence = 'daily' | 'weekly' | 'perpetual';

export type TaskId =
  | 'daily_login'
  | 'daily_play_5_hands'
  | 'daily_win_2_hands'
  | 'weekly_play_20_hands'
  | 'weekly_win_streak_3'
  | 'perpetual_first_win'
  | 'perpetual_play_50_hands';

export interface TaskConfig {
  id: TaskId;
  cadence: TaskCadence;
  label: string;
  description: string;
  target: number;
  icon: string;
  rewardCoins: number;
}

export const TASKS: TaskConfig[] = [
  { id: 'daily_login', cadence: 'daily', label: 'Log in today', description: 'Open the app and play', target: 1, icon: '?', rewardCoins: 50 },
  { id: 'daily_play_5_hands', cadence: 'daily', label: 'Play 5 hands', description: 'Run any 5 hands today', target: 5, icon: '?', rewardCoins: 100 },
  { id: 'daily_win_2_hands', cadence: 'daily', label: 'Win 2 hands', description: 'Finish 2 winning rounds', target: 2, icon: '?', rewardCoins: 150 },
  { id: 'weekly_play_20_hands', cadence: 'weekly', label: 'Play 20 hands', description: 'Run 20 hands this week', target: 20, icon: '?', rewardCoins: 300 },
  { id: 'weekly_win_streak_3', cadence: 'weekly', label: '3-win streak', description: 'Win 3 hands in a row', target: 3, icon: '?', rewardCoins: 500 },
  { id: 'perpetual_first_win', cadence: 'perpetual', label: 'First win', description: 'Win your very first hand', target: 1, icon: '?', rewardCoins: 200 },
  { id: 'perpetual_play_50_hands', cadence: 'perpetual', label: 'Play 50 hands', description: 'Lifetime milestone', target: 50, icon: '?', rewardCoins: 1000 },
];

export const DAILY_TASKS     = TASKS.filter(t => t.cadence === 'daily');
export const WEEKLY_TASKS    = TASKS.filter(t => t.cadence === 'weekly');
export const PERPETUAL_TASKS = TASKS.filter(t => t.cadence === 'perpetual');
