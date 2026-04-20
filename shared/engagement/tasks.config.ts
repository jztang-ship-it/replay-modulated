export type TaskCadence = 'daily' | 'weekly' | 'perpetual';

export type TaskId =
  // daily
  | 'daily_login'
  | 'daily_play_3'
  | 'daily_play_7'
  | 'daily_play_15'
  | 'daily_win_1'
  | 'daily_win_3'
  | 'daily_hit_starter'
  | 'daily_bonus_1'
  | 'daily_bonus_2'
  | 'daily_streak_any'
  | 'daily_streak_3'
  | 'daily_leaderboard'
  | 'daily_big_bet'
  // weekly
  | 'weekly_play_30'
  | 'weekly_win_10'
  | 'weekly_streak_5'
  | 'weekly_allstar'
  | 'weekly_multipliers'
  | 'weekly_bonus_sweep'
  // perpetual
  | 'perpetual_first_win'
  | 'perpetual_first_starter'
  | 'perpetual_first_allstar'
  | 'perpetual_first_mvp'
  | 'perpetual_play_50'
  | 'perpetual_play_200'
  | 'perpetual_streak_5'
  | 'perpetual_streak_10'
  | 'perpetual_leaderboard'
  | 'perpetual_first_referral';

export interface TaskConfig {
  id: TaskId;
  cadence: TaskCadence;
  label: string;
  description: string;
  target: number;
  icon: string;
  rewardCoins: number;
}

// ── Daily tasks (reset midnight) ── max 715 coins ──────────────────────────
// Anchored to ~42% house edge, base wage 10, median multiplier 3x.
// Expected loss per hand at median = ~12.6 coins.
// Daily max covers ~5.7x a median session loss of 126 coins (10 hands).

const DAILY: TaskConfig[] = [
  { id: 'daily_login',        cadence: 'daily', label: 'Log in today',                    description: 'Open the app and play',             target: 1,  icon: '📲', rewardCoins: 25  },
  { id: 'daily_play_3',       cadence: 'daily', label: 'Play 3 hands',                    description: 'Run any 3 hands today',              target: 3,  icon: '🃏', rewardCoins: 30  },
  { id: 'daily_play_7',       cadence: 'daily', label: 'Play 7 hands',                    description: 'Run any 7 hands today',              target: 7,  icon: '🃏', rewardCoins: 60  },
  { id: 'daily_play_15',      cadence: 'daily', label: 'Play 15 hands',                   description: 'Run 15 hands today',                 target: 15, icon: '🃏', rewardCoins: 100 },
  { id: 'daily_win_1',        cadence: 'daily', label: 'Win 1 hand',                      description: 'Finish a winning round',             target: 1,  icon: '🏆', rewardCoins: 30  },
  { id: 'daily_win_3',        cadence: 'daily', label: 'Win 3 hands',                     description: 'Win 3 rounds today',                 target: 3,  icon: '🏆', rewardCoins: 75  },
  { id: 'daily_hit_starter',  cadence: 'daily', label: 'Reach Starter or above',          description: 'Land Starter tier or higher',        target: 1,  icon: '📈', rewardCoins: 100 },
  { id: 'daily_bonus_1',      cadence: 'daily', label: 'Play a hand with a bonus player', description: 'Use at least 1 daily bonus player',  target: 1,  icon: '⭐', rewardCoins: 40  },
  { id: 'daily_bonus_2',      cadence: 'daily', label: 'Use 2 or more bonus players',     description: 'Stack bonus players in one hand',    target: 2,  icon: '⭐', rewardCoins: 80  },
  { id: 'daily_streak_any',   cadence: 'daily', label: 'Extend your win streak',          description: 'Have any active win streak',         target: 1,  icon: '🔥', rewardCoins: 50  },
  { id: 'daily_streak_3',     cadence: 'daily', label: 'Hit a 3-win streak today',        description: 'Win 3 in a row',                     target: 3,  icon: '🔥', rewardCoins: 150 },
  { id: 'daily_leaderboard',  cadence: 'daily', label: 'Check the leaderboard',           description: 'Tap the trophy icon',                target: 1,  icon: '🏅', rewardCoins: 25  },
  { id: 'daily_big_bet',      cadence: 'daily', label: 'Play a hand at 5x or 10x',       description: 'Go big on a single hand',            target: 1,  icon: '💰', rewardCoins: 50  },
];

// ── Weekly tasks (reset Monday midnight) ── max 1,900 coins ────────────────

const WEEKLY: TaskConfig[] = [
  { id: 'weekly_play_30',       cadence: 'weekly', label: 'Play 30 hands this week',       description: 'Run 30 hands Mon–Sun',           target: 30, icon: '📅', rewardCoins: 200 },
  { id: 'weekly_win_10',        cadence: 'weekly', label: 'Win 10 hands this week',        description: 'Win 10 rounds Mon–Sun',          target: 10, icon: '🏆', rewardCoins: 300 },
  { id: 'weekly_streak_5',      cadence: 'weekly', label: 'Hit a 5-win streak this week',  description: 'Win 5 in a row this week',       target: 5,  icon: '🔥', rewardCoins: 500 },
  { id: 'weekly_allstar',       cadence: 'weekly', label: 'Reach All-Star or above once',  description: 'Land All-Star tier or higher',   target: 1,  icon: '⭐', rewardCoins: 400 },
  { id: 'weekly_multipliers',   cadence: 'weekly', label: 'Use 3 different multipliers',   description: 'Try 3 distinct bet multipliers', target: 3,  icon: '🎰', rewardCoins: 200 },
  { id: 'weekly_bonus_sweep',   cadence: 'weekly', label: 'Use all 3 daily bonus players', description: 'Play hands with all 3 bonuses',  target: 3,  icon: '🌟', rewardCoins: 300 },
];

// ── Perpetual tasks (one-time milestones) ──────────────────────────────────
// Require manual collect tap — trophy moments, not silent awards.

const PERPETUAL: TaskConfig[] = [
  { id: 'perpetual_first_win',      cadence: 'perpetual', label: 'Win your first hand',                  description: 'First taste of victory',        target: 1,   icon: '🎉', rewardCoins: 200  },
  { id: 'perpetual_first_starter',  cadence: 'perpetual', label: 'Reach Starter for the first time',     description: 'First time hitting Starter',    target: 1,   icon: '🌱', rewardCoins: 400  },
  { id: 'perpetual_first_allstar',  cadence: 'perpetual', label: 'Reach All-Star for the first time',    description: 'First time hitting All-Star',   target: 1,   icon: '💫', rewardCoins: 1000 },
  { id: 'perpetual_first_mvp',      cadence: 'perpetual', label: 'Reach MVP for the first time',         description: 'First time hitting MVP',        target: 1,   icon: '👑', rewardCoins: 3000 },
  { id: 'perpetual_play_50',        cadence: 'perpetual', label: 'Play 50 hands',                        description: 'Lifetime milestone',            target: 50,  icon: '🎯', rewardCoins: 500  },
  { id: 'perpetual_play_200',       cadence: 'perpetual', label: 'Play 200 hands',                       description: 'Dedicated player',              target: 200, icon: '🎯', rewardCoins: 2000 },
  { id: 'perpetual_streak_5',       cadence: 'perpetual', label: 'Win 5 in a row',                       description: 'Highest streak ever: 5+',       target: 5,   icon: '🔥', rewardCoins: 800  },
  { id: 'perpetual_streak_10',      cadence: 'perpetual', label: 'Win 10 in a row',                      description: 'Highest streak ever: 10+',      target: 10,  icon: '🔥', rewardCoins: 5000 },
  { id: 'perpetual_leaderboard',    cadence: 'perpetual', label: 'Check the leaderboard for the first time', description: 'Discover the competition', target: 1,   icon: '🏅', rewardCoins: 100  },
  { id: 'perpetual_first_referral', cadence: 'perpetual', label: 'Refer your first friend',               description: 'Invite a friend who becomes a legit player', target: 1, icon: '🎁', rewardCoins: 300 },
];

export const TASKS: TaskConfig[] = [...DAILY, ...WEEKLY, ...PERPETUAL];

export const DAILY_TASKS     = TASKS.filter(t => t.cadence === 'daily');
export const WEEKLY_TASKS    = TASKS.filter(t => t.cadence === 'weekly');
export const PERPETUAL_TASKS = TASKS.filter(t => t.cadence === 'perpetual');
