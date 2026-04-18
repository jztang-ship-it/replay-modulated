// src/shared/engagement/useEngagement.ts
// Central engagement hook — sport-agnostic.
// Tracks login streak, daily/weekly/lifetime task progress, XP, coins, and win streak.
// Persists to localStorage. Auto-resets daily counters at midnight, weekly on Monday.

import { useState, useEffect, useCallback } from 'react';
import { DAILY_TASKS, WEEKLY_TASKS, PERPETUAL_TASKS, TASKS } from './tasks.config';
import type { TaskId, TaskCadence } from './tasks.config';
import type { WinTierKey } from '@shared/utils/payoutLogic';
import { track } from '@shared/analytics/analytics';

// ── Tier ranking (for "highest tier" comparisons) ────────────────────────────
const TIER_RANK: Record<WinTierKey, number> = {
  BUST: 0, ROOKIE: 1, STARTER: 2, ALL_STAR: 3, MVP: 4, LEGEND: 5,
};

function isHigherTier(a: WinTierKey, b: WinTierKey | null): boolean {
  if (b === null) return true;
  return TIER_RANK[a] > TIER_RANK[b];
}

// ── Storage keys ─────────────────────────────────────────────────────────────
const KEYS = {
  streak:        'rp_login_streak',
  lastLogin:     'rp_last_login_date',
  taskProgress:  'rp_task_progress',
  tasksDone:     'rp_tasks_done',
  coins:         'rp_coins',
  xp:            'rp_xp',
  streakCount:   'rp_streak_count',
  streakMax:     'rp_streak_max',
  lastWeek:      'rp_last_week',
  weekProgress:  'rp_week_progress',
  lifeProgress:  'rp_life_progress',
} as const;

// ── Types ────────────────────────────────────────────────────────────────────
export interface TaskProgress {
  // daily (reset at midnight)
  handsPlayed:            number;
  handsWon:               number;
  loggedIn:               boolean;
  bonusPlayersUsedToday:  number;
  topTierToday:           WinTierKey | null;
  multipliersUsedToday:   number[];
  leaderboardViewedToday: boolean;

  // weekly (reset Monday midnight) — stored separately but part of the model
  handsPlayedWeek:        number;
  handsWonWeek:           number;
  multipliersUsedWeek:    number[];
  bonusPlayersUsedWeek:   number;
  topTierWeek:            WinTierKey | null;

  // lifetime (never resets) — stored separately but part of the model
  handsPlayedLifetime:    number;
  handsWonLifetime:       number;
  topTierLifetime:        WinTierKey | null;
}

export interface TaskState {
  id:          TaskId;
  cadence:     TaskCadence;
  label:       string;
  icon:        string;
  progress:    number;
  target:      number;
  completed:   boolean;
  collected:   boolean;
  reward:      number;
  rewardCoins: number;
  rewardXP:    number;
}

export interface EngagementState {
  loginStreak:         number;
  taskStates:          TaskState[];
  weeklyTaskStates:    TaskState[];
  perpetualTaskStates: TaskState[];
  coins:               number;
  xp:                  number;
  hotStreak:           boolean;
  sessionWins:         number;
  dailyTasksDone:      number;
  streakCount:         number;
  taskProgressWeek: {
    handsPlayedWeek:      number;
    handsWonWeek:         number;
    multipliersUsedWeek:  number[];
    bonusPlayersUsedWeek: number;
    topTierWeek:          WinTierKey | null;
  };
  taskProgressLifetime: {
    handsPlayedLifetime:  number;
    handsWonLifetime:     number;
    topTierLifetime:      WinTierKey | null;
  };
}

export interface EngagementActions {
  recordHandPlayed:        () => void;
  recordHandWon:           () => void;
  recordHandLost:          () => void;
  awardCoins:              (amount: number) => void;
  awardXP:                 (amount: number) => void;
  collectTask:             (taskId: string) => void;
  recordStreakWin:          () => void;
  recordStreakBust:         () => void;
  recordBonusPlayerUsed:   (count: number) => void;
  recordTierReached:       (tier: WinTierKey) => void;
  recordMultiplierUsed:    (mult: number) => void;
  recordLeaderboardViewed: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);

/** ISO week key like "2026-W16" (Monday start). */
function currentWeekKey(): string {
  const d = new Date();
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
  const dayOfWeek = d.getDay() || 7; // Mon=1 .. Sun=7
  const weekNum = Math.ceil((dayOfYear - dayOfWeek + 10) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Default progress values ──────────────────────────────────────────────────
const FRESH_DAILY: Pick<TaskProgress,
  'handsPlayed' | 'handsWon' | 'loggedIn' |
  'bonusPlayersUsedToday' | 'topTierToday' | 'multipliersUsedToday' | 'leaderboardViewedToday'
> = {
  handsPlayed: 0,
  handsWon: 0,
  loggedIn: true,
  bonusPlayersUsedToday: 0,
  topTierToday: null,
  multipliersUsedToday: [],
  leaderboardViewedToday: false,
};

const FRESH_WEEKLY: Pick<TaskProgress,
  'handsPlayedWeek' | 'handsWonWeek' | 'multipliersUsedWeek' | 'bonusPlayersUsedWeek' | 'topTierWeek'
> = {
  handsPlayedWeek: 0,
  handsWonWeek: 0,
  multipliersUsedWeek: [],
  bonusPlayersUsedWeek: 0,
  topTierWeek: null,
};

const FRESH_LIFETIME: Pick<TaskProgress,
  'handsPlayedLifetime' | 'handsWonLifetime' | 'topTierLifetime'
> = {
  handsPlayedLifetime: 0,
  handsWonLifetime: 0,
  topTierLifetime: null,
};

function buildFullProgress(
  daily: typeof FRESH_DAILY,
  weekly: typeof FRESH_WEEKLY,
  lifetime: typeof FRESH_LIFETIME,
): TaskProgress {
  return { ...daily, ...weekly, ...lifetime };
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useEngagement(): EngagementState & EngagementActions {
  const todayKey = todayStr();

  const [loginStreak, setLoginStreak] = useState<number>(() =>
    loadJSON(KEYS.streak, 0)
  );

  // streakCount — persisted, never resets at midnight. Only resets on bust.
  const [streakCount, setStreakCount] = useState<number>(() =>
    loadJSON(KEYS.streakCount, 0)
  );

  // Load daily, weekly, lifetime progress from separate storage keys
  const [dailyProgress, setDailyProgress] = useState<typeof FRESH_DAILY>(() =>
    loadJSON(KEYS.taskProgress, { ...FRESH_DAILY, loggedIn: false })
  );

  const [weeklyProgress, setWeeklyProgress] = useState<typeof FRESH_WEEKLY>(() =>
    loadJSON(KEYS.weekProgress, { ...FRESH_WEEKLY })
  );

  const [lifetimeProgress, setLifetimeProgress] = useState<typeof FRESH_LIFETIME>(() =>
    loadJSON(KEYS.lifeProgress, { ...FRESH_LIFETIME })
  );

  // Composite TaskProgress for task evaluation
  const taskProgress: TaskProgress = buildFullProgress(dailyProgress, weeklyProgress, lifetimeProgress);

  const [tasksDone, setTasksDone] = useState<Set<TaskId>>(() => {
    const arr = loadJSON<TaskId[]>(KEYS.tasksDone, []);
    return new Set(arr);
  });

  const [coins, setCoins] = useState<number>(() => loadJSON(KEYS.coins, 0));
  const [xp, setXP]       = useState<number>(() => loadJSON(KEYS.xp, 0));

  // Collected rewards — keyed by today so they reset daily
  const [tasksCollected, setTasksCollected] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('rp_tasks_collected_' + todayStr());
      return raw ? new Set(JSON.parse(raw)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  // Session-only
  const [sessionWins, setSessionWins] = useState(0);

  // ── Daily reset ───────────────────────────────────────────────────────────
  useEffect(() => {
    const lastLogin = localStorage.getItem(KEYS.lastLogin) ?? '';
    const today     = todayStr();

    if (lastLogin !== today) {
      const fresh = { ...FRESH_DAILY };
      setDailyProgress(fresh);
      save(KEYS.taskProgress, fresh);
      setTasksDone(new Set());
      save(KEYS.tasksDone, []);
      setTasksCollected(new Set());

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      const isConsecutive = lastLogin === yesterdayStr;
      const newStreak = isConsecutive ? loginStreak + 1 : 1;
      setLoginStreak(newStreak);
      save(KEYS.streak, newStreak);
      localStorage.setItem(KEYS.lastLogin, today);
    } else {
      if (!dailyProgress.loggedIn) {
        const updated = { ...dailyProgress, loggedIn: true };
        setDailyProgress(updated);
        save(KEYS.taskProgress, updated);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Weekly reset ──────────────────────────────────────────────────────────
  useEffect(() => {
    const storedWeek = localStorage.getItem(KEYS.lastWeek) ?? '';
    const thisWeek = currentWeekKey();
    if (storedWeek !== thisWeek) {
      const fresh = { ...FRESH_WEEKLY };
      setWeeklyProgress(fresh);
      save(KEYS.weekProgress, fresh);
      localStorage.setItem(KEYS.lastWeek, thisWeek);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Task evaluation — all three cadences ───────────────────────────────────

  // Helper: is tier at or above a threshold?
  const tierAtOrAbove = (tier: WinTierKey | null, threshold: WinTierKey): boolean => {
    if (tier === null) return false;
    return TIER_RANK[tier] >= TIER_RANK[threshold];
  };

  // Evaluate a single task against current progress
  const isTaskMet = (id: TaskId): boolean => {
    switch (id) {
      // ── Daily ──
      case 'daily_login':        return dailyProgress.loggedIn;
      case 'daily_play_3':       return dailyProgress.handsPlayed >= 3;
      case 'daily_play_7':       return dailyProgress.handsPlayed >= 7;
      case 'daily_play_15':      return dailyProgress.handsPlayed >= 15;
      case 'daily_win_1':        return dailyProgress.handsWon >= 1;
      case 'daily_win_3':        return dailyProgress.handsWon >= 3;
      case 'daily_hit_starter':  return tierAtOrAbove(dailyProgress.topTierToday, 'STARTER');
      case 'daily_bonus_1':      return dailyProgress.bonusPlayersUsedToday >= 1;
      case 'daily_bonus_2':      return dailyProgress.bonusPlayersUsedToday >= 2;
      case 'daily_streak_any':   return streakCount >= 1;
      case 'daily_streak_3':     return streakCount >= 3;
      case 'daily_leaderboard':  return dailyProgress.leaderboardViewedToday;
      case 'daily_big_bet':      return dailyProgress.multipliersUsedToday.includes(5) || dailyProgress.multipliersUsedToday.includes(10);

      // ── Weekly ──
      case 'weekly_play_30':     return weeklyProgress.handsPlayedWeek >= 30;
      case 'weekly_win_10':      return weeklyProgress.handsWonWeek >= 10;
      case 'weekly_streak_5':    return streakCount >= 5;
      case 'weekly_allstar':     return tierAtOrAbove(weeklyProgress.topTierWeek, 'ALL_STAR');
      case 'weekly_multipliers': return new Set(weeklyProgress.multipliersUsedWeek).size >= 3;
      case 'weekly_bonus_sweep': return weeklyProgress.bonusPlayersUsedWeek >= 3;

      // ── Perpetual ──
      case 'perpetual_first_win':      return lifetimeProgress.handsWonLifetime >= 1;
      case 'perpetual_first_starter':  return tierAtOrAbove(lifetimeProgress.topTierLifetime, 'STARTER');
      case 'perpetual_first_allstar':  return tierAtOrAbove(lifetimeProgress.topTierLifetime, 'ALL_STAR');
      case 'perpetual_first_mvp':      return tierAtOrAbove(lifetimeProgress.topTierLifetime, 'MVP');
      case 'perpetual_play_50':        return lifetimeProgress.handsPlayedLifetime >= 50;
      case 'perpetual_play_200':       return lifetimeProgress.handsPlayedLifetime >= 200;
      case 'perpetual_streak_5':       return loadJSON<number>(KEYS.streakMax, 0) >= 5;
      case 'perpetual_streak_10':      return loadJSON<number>(KEYS.streakMax, 0) >= 10;
      case 'perpetual_leaderboard':    return localStorage.getItem('rp_leaderboard_ever') === '1';

      default: return false;
    }
  };

  useEffect(() => {
    let coinsEarned = 0;
    let xpEarned    = 0;
    const newlyDone = new Set(tasksDone);
    let changed     = false;

    // Daily + weekly: auto-award coins when condition met
    for (const task of [...DAILY_TASKS, ...WEEKLY_TASKS]) {
      if (newlyDone.has(task.id)) continue;
      if (isTaskMet(task.id)) {
        newlyDone.add(task.id);
        coinsEarned += task.rewardCoins;
        xpEarned    += task.rewardCoins;
        changed      = true;
        track("engagement", "task_completed", { task_id: task.id, cadence: task.cadence, reward_coins: task.rewardCoins });
      }
    }

    // Perpetual: mark completed but do NOT auto-award — require collect tap
    for (const task of PERPETUAL_TASKS) {
      if (newlyDone.has(task.id)) continue;
      if (isTaskMet(task.id)) {
        newlyDone.add(task.id);
        changed = true;
        // No coinsEarned — perpetual rewards are collected manually
        track("engagement", "task_completed", { task_id: task.id, cadence: task.cadence, reward_coins: task.rewardCoins });
      }
    }

    if (changed) {
      setTasksDone(newlyDone);
      save(KEYS.tasksDone, Array.from(newlyDone));
      if (coinsEarned > 0) {
        setCoins(prev => { const n = prev + coinsEarned; save(KEYS.coins, n); return n; });
        setXP(prev    => { const n = prev + xpEarned;    save(KEYS.xp, n);    return n; });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyProgress, weeklyProgress, lifetimeProgress, streakCount, tasksDone]);

  // ── Existing actions (signatures unchanged) ───────────────────────────────
  const recordHandPlayed = useCallback(() => {
    setDailyProgress(prev => {
      const updated = { ...prev, handsPlayed: prev.handsPlayed + 1 };
      save(KEYS.taskProgress, updated);
      return updated;
    });
    setWeeklyProgress(prev => {
      const updated = { ...prev, handsPlayedWeek: prev.handsPlayedWeek + 1 };
      save(KEYS.weekProgress, updated);
      return updated;
    });
    setLifetimeProgress(prev => {
      const updated = { ...prev, handsPlayedLifetime: prev.handsPlayedLifetime + 1 };
      save(KEYS.lifeProgress, updated);
      return updated;
    });
  }, []);

  const recordHandWon = useCallback(() => {
    setSessionWins(w => w + 1);
    setDailyProgress(prev => {
      const updated = { ...prev, handsWon: prev.handsWon + 1 };
      save(KEYS.taskProgress, updated);
      return updated;
    });
    setWeeklyProgress(prev => {
      const updated = { ...prev, handsWonWeek: prev.handsWonWeek + 1 };
      save(KEYS.weekProgress, updated);
      return updated;
    });
    setLifetimeProgress(prev => {
      const updated = { ...prev, handsWonLifetime: prev.handsWonLifetime + 1 };
      save(KEYS.lifeProgress, updated);
      return updated;
    });
  }, []);

  const recordHandLost = useCallback(() => {
    // no-op for engagement — streak bust handled by recordStreakBust
  }, []);

  const awardCoins = useCallback((amount: number) => {
    setCoins(prev => { const n = prev + amount; save(KEYS.coins, n); return n; });
  }, []);

  const awardXP = useCallback((amount: number) => {
    setXP(prev => { const n = prev + amount; save(KEYS.xp, n); return n; });
  }, []);

  const collectTask = useCallback((taskId: string) => {
    if (tasksCollected.has(taskId)) return;
    const task = TASKS.find(t => t.id === taskId);
    if (!task) return;
    const next = new Set(tasksCollected).add(taskId);
    setTasksCollected(next);
    try {
      localStorage.setItem('rp_tasks_collected_' + todayKey, JSON.stringify([...next]));
    } catch {}
    if (task.rewardCoins) {
      setCoins(prev => { const n = prev + task.rewardCoins; save(KEYS.coins, n); return n; });
    }
  }, [tasksCollected, todayKey]);

  // ── New actions ───────────────────────────────────────────────────────────

  const recordStreakWin = useCallback(() => {
    setStreakCount(prev => {
      const n = prev + 1;
      save(KEYS.streakCount, n);
      // Update lifetime max streak
      const currentMax = loadJSON<number>(KEYS.streakMax, 0);
      if (n > currentMax) save(KEYS.streakMax, n);
      return n;
    });
  }, []);

  const recordStreakBust = useCallback(() => {
    setStreakCount(0);
    save(KEYS.streakCount, 0);
  }, []);

  const recordBonusPlayerUsed = useCallback((count: number) => {
    setDailyProgress(prev => {
      const updated = { ...prev, bonusPlayersUsedToday: prev.bonusPlayersUsedToday + count };
      save(KEYS.taskProgress, updated);
      return updated;
    });
    setWeeklyProgress(prev => {
      const updated = { ...prev, bonusPlayersUsedWeek: prev.bonusPlayersUsedWeek + count };
      save(KEYS.weekProgress, updated);
      return updated;
    });
  }, []);

  const recordTierReached = useCallback((tier: WinTierKey) => {
    setDailyProgress(prev => {
      if (!isHigherTier(tier, prev.topTierToday)) return prev;
      const updated = { ...prev, topTierToday: tier };
      save(KEYS.taskProgress, updated);
      return updated;
    });
    setWeeklyProgress(prev => {
      if (!isHigherTier(tier, prev.topTierWeek)) return prev;
      const updated = { ...prev, topTierWeek: tier };
      save(KEYS.weekProgress, updated);
      return updated;
    });
    setLifetimeProgress(prev => {
      if (!isHigherTier(tier, prev.topTierLifetime)) return prev;
      const updated = { ...prev, topTierLifetime: tier };
      save(KEYS.lifeProgress, updated);
      return updated;
    });
  }, []);

  const recordMultiplierUsed = useCallback((mult: number) => {
    setDailyProgress(prev => {
      if (prev.multipliersUsedToday.includes(mult)) return prev;
      const updated = { ...prev, multipliersUsedToday: [...prev.multipliersUsedToday, mult] };
      save(KEYS.taskProgress, updated);
      return updated;
    });
    setWeeklyProgress(prev => {
      if (prev.multipliersUsedWeek.includes(mult)) return prev;
      const updated = { ...prev, multipliersUsedWeek: [...prev.multipliersUsedWeek, mult] };
      save(KEYS.weekProgress, updated);
      return updated;
    });
  }, []);

  const recordLeaderboardViewed = useCallback(() => {
    setDailyProgress(prev => {
      if (prev.leaderboardViewedToday) return prev;
      const updated = { ...prev, leaderboardViewedToday: true };
      save(KEYS.taskProgress, updated);
      return updated;
    });
    localStorage.setItem('rp_leaderboard_ever', '1');
  }, []);

  // ── Derived — progress value for each task ──────────────────────────────
  const getTaskProgress = (id: TaskId): number => {
    switch (id) {
      // daily
      case 'daily_login':        return dailyProgress.loggedIn ? 1 : 0;
      case 'daily_play_3':
      case 'daily_play_7':
      case 'daily_play_15':      return dailyProgress.handsPlayed;
      case 'daily_win_1':
      case 'daily_win_3':        return dailyProgress.handsWon;
      case 'daily_hit_starter':  return tierAtOrAbove(dailyProgress.topTierToday, 'STARTER') ? 1 : 0;
      case 'daily_bonus_1':
      case 'daily_bonus_2':      return dailyProgress.bonusPlayersUsedToday;
      case 'daily_streak_any':   return Math.min(streakCount, 1);
      case 'daily_streak_3':     return Math.min(streakCount, 3);
      case 'daily_leaderboard':  return dailyProgress.leaderboardViewedToday ? 1 : 0;
      case 'daily_big_bet':      return (dailyProgress.multipliersUsedToday.includes(5) || dailyProgress.multipliersUsedToday.includes(10)) ? 1 : 0;
      // weekly
      case 'weekly_play_30':     return weeklyProgress.handsPlayedWeek;
      case 'weekly_win_10':      return weeklyProgress.handsWonWeek;
      case 'weekly_streak_5':    return Math.min(streakCount, 5);
      case 'weekly_allstar':     return tierAtOrAbove(weeklyProgress.topTierWeek, 'ALL_STAR') ? 1 : 0;
      case 'weekly_multipliers': return new Set(weeklyProgress.multipliersUsedWeek).size;
      case 'weekly_bonus_sweep': return weeklyProgress.bonusPlayersUsedWeek;
      // perpetual
      case 'perpetual_first_win':      return lifetimeProgress.handsWonLifetime >= 1 ? 1 : 0;
      case 'perpetual_first_starter':  return tierAtOrAbove(lifetimeProgress.topTierLifetime, 'STARTER') ? 1 : 0;
      case 'perpetual_first_allstar':  return tierAtOrAbove(lifetimeProgress.topTierLifetime, 'ALL_STAR') ? 1 : 0;
      case 'perpetual_first_mvp':      return tierAtOrAbove(lifetimeProgress.topTierLifetime, 'MVP') ? 1 : 0;
      case 'perpetual_play_50':
      case 'perpetual_play_200':       return lifetimeProgress.handsPlayedLifetime;
      case 'perpetual_streak_5':       return Math.min(loadJSON<number>(KEYS.streakMax, 0), 5);
      case 'perpetual_streak_10':      return Math.min(loadJSON<number>(KEYS.streakMax, 0), 10);
      case 'perpetual_leaderboard':    return localStorage.getItem('rp_leaderboard_ever') === '1' ? 1 : 0;
      default: return 0;
    }
  };

  const mapTasks = (list: typeof TASKS): TaskState[] =>
    list.map(task => ({
      id:          task.id,
      cadence:     task.cadence,
      label:       task.label,
      icon:        task.icon,
      progress:    getTaskProgress(task.id),
      target:      task.target,
      completed:   tasksDone.has(task.id),
      collected:   tasksCollected.has(task.id),
      reward:      task.rewardCoins,
      rewardCoins: task.rewardCoins,
      rewardXP:    0,
    }));

  const taskStates:          TaskState[] = mapTasks(DAILY_TASKS);
  const weeklyTaskStates:    TaskState[] = mapTasks(WEEKLY_TASKS);
  const perpetualTaskStates: TaskState[] = mapTasks(PERPETUAL_TASKS);

  return {
    loginStreak,
    taskStates,
    weeklyTaskStates,
    perpetualTaskStates,
    coins,
    xp,
    hotStreak:      streakCount >= 3,
    sessionWins,
    dailyTasksDone: tasksDone.size,
    streakCount,
    taskProgressWeek: {
      handsPlayedWeek:      weeklyProgress.handsPlayedWeek,
      handsWonWeek:         weeklyProgress.handsWonWeek,
      multipliersUsedWeek:  weeklyProgress.multipliersUsedWeek,
      bonusPlayersUsedWeek: weeklyProgress.bonusPlayersUsedWeek,
      topTierWeek:          weeklyProgress.topTierWeek,
    },
    taskProgressLifetime: {
      handsPlayedLifetime:  lifetimeProgress.handsPlayedLifetime,
      handsWonLifetime:     lifetimeProgress.handsWonLifetime,
      topTierLifetime:      lifetimeProgress.topTierLifetime,
    },
    recordHandPlayed,
    recordHandWon,
    recordHandLost,
    awardCoins,
    awardXP,
    collectTask,
    recordStreakWin,
    recordStreakBust,
    recordBonusPlayerUsed,
    recordTierReached,
    recordMultiplierUsed,
    recordLeaderboardViewed,
  };
}
