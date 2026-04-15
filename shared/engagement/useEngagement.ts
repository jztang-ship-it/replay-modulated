// src/shared/engagement/useEngagement.ts
// Central engagement hook — sport-agnostic.
// Tracks login streak, daily task progress, XP, and coins.
// Persists to localStorage. Auto-resets daily counters at midnight.

import { useState, useEffect, useCallback } from 'react';
import { DAILY_TASKS } from './tasks.config';
import type { TaskId } from './tasks.config';

// ── Storage keys ──────────────────────────────────────────────────────────────
const KEYS = {
  streak:       'rp_login_streak',
  lastLogin:    'rp_last_login_date',
  taskProgress: 'rp_task_progress',
  tasksDone:    'rp_tasks_done',
  coins:        'rp_coins',
  xp:           'rp_xp',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TaskProgress {
  handsPlayed: number;
  handsWon:    number;
  loggedIn:    boolean;
}

export interface TaskState {
  id:          TaskId;
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
  loginStreak:    number;
  taskStates:     TaskState[];
  coins:          number;
  xp:             number;
  hotStreak:      boolean;
  sessionWins:    number;
  dailyTasksDone: number;
}

export interface EngagementActions {
  recordHandPlayed: () => void;
  recordHandWon:    () => void;
  recordHandLost:   () => void;
  awardCoins:       (amount: number) => void;
  awardXP:          (amount: number) => void;
  collectTask:      (taskId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);

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

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useEngagement(): EngagementState & EngagementActions {
  const todayKey = todayStr();

  const [loginStreak, setLoginStreak] = useState<number>(() =>
    loadJSON(KEYS.streak, 0)
  );

  const [taskProgress, setTaskProgress] = useState<TaskProgress>(() =>
    loadJSON(KEYS.taskProgress, { handsPlayed: 0, handsWon: 0, loggedIn: false })
  );

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
  const [sessionWins, setSessionWins]        = useState(0);
  const [sessionConsecutive, setConsecutive] = useState(0);

  // ── Daily reset ───────────────────────────────────────────────────────────
  useEffect(() => {
    const lastLogin = localStorage.getItem(KEYS.lastLogin) ?? '';
    const today     = todayStr();

    if (lastLogin !== today) {
      const freshProgress: TaskProgress = { handsPlayed: 0, handsWon: 0, loggedIn: true };
      setTaskProgress(freshProgress);
      save(KEYS.taskProgress, freshProgress);
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
      if (!taskProgress.loggedIn) {
        const updated = { ...taskProgress, loggedIn: true };
        setTaskProgress(updated);
        save(KEYS.taskProgress, updated);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Task evaluation ───────────────────────────────────────────────────────
  useEffect(() => {
    let coinsEarned = 0;
    let xpEarned    = 0;
    const newlyDone = new Set(tasksDone);
    let changed     = false;

    for (const task of DAILY_TASKS) {
      if (newlyDone.has(task.id)) continue;
      let met = false;
      if (task.id === 'daily_login')        met = taskProgress.loggedIn;
      if (task.id === 'daily_play_5_hands') met = taskProgress.handsPlayed >= task.target;
      if (task.id === 'daily_win_2_hands')  met = taskProgress.handsWon    >= task.target;
      if (met) {
        newlyDone.add(task.id);
        coinsEarned += task.rewardCoins;
        xpEarned    += task.rewardCoins;
        changed      = true;
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
  }, [taskProgress, tasksDone]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const recordHandPlayed = useCallback(() => {
    setTaskProgress(prev => {
      const updated = { ...prev, handsPlayed: prev.handsPlayed + 1 };
      save(KEYS.taskProgress, updated);
      return updated;
    });
  }, []);

  const recordHandWon = useCallback(() => {
    setSessionWins(w => w + 1);
    setConsecutive(c => c + 1);
    setTaskProgress(prev => {
      const updated = { ...prev, handsWon: prev.handsWon + 1 };
      save(KEYS.taskProgress, updated);
      return updated;
    });
  }, []);

  const recordHandLost = useCallback(() => {
    setConsecutive(0);
  }, []);

  const awardCoins = useCallback((amount: number) => {
    setCoins(prev => { const n = prev + amount; save(KEYS.coins, n); return n; });
  }, []);

  const awardXP = useCallback((amount: number) => {
    setXP(prev => { const n = prev + amount; save(KEYS.xp, n); return n; });
  }, []);

  const collectTask = useCallback((taskId: string) => {
    if (tasksCollected.has(taskId)) return;
    const task = DAILY_TASKS.find(t => t.id === taskId);
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

  // ── Derived ───────────────────────────────────────────────────────────────
  const taskStates: TaskState[] = DAILY_TASKS.map(task => {
    let progress = 0;
    if (task.id === 'daily_login')        progress = taskProgress.loggedIn ? 1 : 0;
    if (task.id === 'daily_play_5_hands') progress = taskProgress.handsPlayed;
    if (task.id === 'daily_win_2_hands')  progress = taskProgress.handsWon;

    return {
      id:          task.id,
      label:       task.label,
      icon:        task.icon,
      progress,
      target:      task.target,
      completed:   tasksDone.has(task.id),
      collected:   tasksCollected.has(task.id),
      reward:      task.rewardCoins,
      rewardCoins: task.rewardCoins,
      rewardXP:    (task as any).rewardXP ?? 0,
    };
  });

  return {
    loginStreak,
    taskStates,
    coins,
    xp,
    hotStreak:      sessionConsecutive >= 3,
    sessionWins,
    dailyTasksDone: tasksDone.size,
    recordHandPlayed,
    recordHandWon,
    recordHandLost,
    awardCoins,
    awardXP,
    collectTask,
  };
}
