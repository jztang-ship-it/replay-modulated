/**
 * CollectScreen.tsx
 * Full-screen Collect tab — replaces the Tasks drawer button.
 * Shows daily tasks with uncollected rewards, XP bar, login streak, coins.
 * Expandable later for: season packs, achievement history, loyalty tier.
 */

import { useState, useEffect } from "react";
import type { TaskState } from "@shared/engagement/useEngagement";
import { PWAInstallPrompt } from "@shared/components/PwaInstallPrompt";
import { getMsUntilNextBonusRotation, formatBonusCountdown } from "@shared/utils/dailyBonus";
import { track } from "@shared/analytics/analytics";

const FF = "'Rajdhani', 'Arial Narrow', sans-serif";

// ── Ladder filtering ──────────────────────────────────────────────────────
// Tasks with matching prefix form a ladder — only the first uncollected step
// is shown at a time. When the active step is collected, the next step takes
// its place. Singleton tasks (no ladder prefix) always appear.
const LADDER_PREFIXES = [
  "daily_play_",
  "daily_win_",
  "daily_bonus_",
  "daily_streak_",
  "perpetual_first_",
  "perpetual_play_",
  "perpetual_streak_",
] as const;

function ladderKey(taskId: string): string | null {
  for (const prefix of LADDER_PREFIXES) {
    if (taskId.startsWith(prefix)) return prefix;
  }
  return null;
}

function activeLadderOnly(tasks: TaskState[]): TaskState[] {
  // Group tasks by ladder, preserving config order
  const ladders = new Map<string, TaskState[]>();
  for (const task of tasks) {
    const key = ladderKey(task.id);
    if (key === null) continue;
    if (!ladders.has(key)) ladders.set(key, []);
    ladders.get(key)!.push(task);
  }
  // Return only tasks that are either singletons OR the first uncollected in their ladder
  return tasks.filter(task => {
    const key = ladderKey(task.id);
    if (key === null) return true;
    const firstUncollected = ladders.get(key)!.find(t => !t.collected);
    return !!firstUncollected && firstUncollected.id === task.id;
  });
}

interface CollectScreenProps {
  taskStates:           TaskState[];
  weeklyTaskStates:     TaskState[];
  perpetualTaskStates:  TaskState[];
  loginStreak:          number;
  streakCount:          number;
  coins:                number;
  xp:                   number;
  onClose:              () => void;
  onCollect:            (taskId: string) => void;
  bonusPlayers?:        Array<{ name: string; bonus: number }>;
  onViewLeaderboard?:   () => void;
  recordLeaderboardViewed?: () => void;
  /** When false (economy display-suppressed, e.g. basketball), mute the
   *  coin-screen telemetry (task_collected, collect_screen_opened) fully — these
   *  are intrinsically economy events with no high-score signal. Defaults true so
   *  economy-ON sports are unchanged. */
  economyEnabled?:      boolean;
}

// XP tier config — matches XPBar
const XP_TIERS = [
  { label: "Rookie",   min: 0,    max: 500,  color: "#22C55E" },
  { label: "Starter",  min: 500,  max: 1500, color: "#F59E0B" },
  { label: "All-Star", min: 1500, max: 4000, color: "#C084FC" },
  { label: "MVP",      min: 4000, max: 10000, color: "#FB923C" },
  { label: "Legend",   min: 10000, max: 10000, color: "#EF4444" },
];

function getCurrentTier(xp: number) {
  for (let i = XP_TIERS.length - 1; i >= 0; i--) {
    if (xp >= XP_TIERS[i].min) return XP_TIERS[i];
  }
  return XP_TIERS[0];
}

function XPSection({ xp }: { xp: number }) {
  const tier = getCurrentTier(xp);
  const nextTier = XP_TIERS[XP_TIERS.indexOf(tier) + 1];
  const pct = nextTier
    ? Math.min(1, (xp - tier.min) / (nextTier.min - tier.min))
    : 1;

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: tier.color, fontFamily: FF, letterSpacing: "0.1em", fontWeight: 700 }}>
          {tier.label.toUpperCase()}
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: FF }}>
          {xp.toLocaleString()} XP{nextTier ? ` / ${nextTier.min.toLocaleString()}` : ""}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 999, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          borderRadius: 999,
          width: `${pct * 100}%`,
          background: `linear-gradient(90deg, ${tier.color}88, ${tier.color})`,
          transition: "width 0.8s ease",
        }} />
      </div>
      {nextTier && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: FF, textAlign: "right" }}>
          {(nextTier.min - xp).toLocaleString()} XP to {nextTier.label}
        </div>
      )}
    </div>
  );
}

function sectionCoins(tasks: TaskState[]): number {
  return tasks
    .filter(t => t.progress >= t.target && !t.collected)
    .reduce((sum, t) => sum + (t.rewardCoins ?? 0), 0);
}

function SectionHeader({
  label,
  coinsAvailable,
  subtitle,
}: {
  label: string;
  coinsAvailable: number;
  subtitle?: string;
}) {
  return (
    <div style={{ paddingLeft: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          fontFamily: FF,
          letterSpacing: "0.12em",
          color: "rgba(255,255,255,0.35)",
        }}>
          {label}
        </span>
        {coinsAvailable > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: FF, color: "#FFD700" }}>
            +{coinsAvailable} available
          </span>
        )}
      </div>
      {subtitle && (
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: FF }}>
          {subtitle}
        </span>
      )}
    </div>
  );
}

function TaskRow({
  task,
  onCollect,
  streakCount,
  bonusPlayers,
  onViewLeaderboard,
  recordLeaderboardViewed,
  isPerpetual,
}: {
  task: TaskState;
  onCollect: (id: string) => void;
  streakCount: number;
  bonusPlayers?: Array<{ name: string; bonus: number }>;
  onViewLeaderboard?: () => void;
  recordLeaderboardViewed?: () => void;
  isPerpetual?: boolean;
}) {
  const pct = Math.min(1, task.progress / task.target);
  const complete = pct >= 1;
  const collected = task.collected;

  const isBonus = task.id.includes("bonus");
  const isStreak = task.id.includes("streak");
  const isLeaderboard = task.id === "daily_leaderboard" || task.id === "perpetual_leaderboard";
  const isMilestoneCollected = isPerpetual && collected;

  const rowStyle: React.CSSProperties = {
    background: isMilestoneCollected
      ? "rgba(255,215,0,0.06)"
      : collected
      ? "rgba(255,255,255,0.02)"
      : complete
      ? "rgba(127,255,0,0.04)"
      : "rgba(255,255,255,0.04)",
    border: `1px solid ${
      isMilestoneCollected
        ? "rgba(255,215,0,0.2)"
        : collected
        ? "rgba(255,255,255,0.05)"
        : complete
        ? "rgba(127,255,0,0.2)"
        : "rgba(255,255,255,0.08)"
    }`,
    borderRadius: 12,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    opacity: (collected && !isMilestoneCollected) ? 0.45 : 1,
    transition: "opacity 0.3s ease",
    cursor: isLeaderboard && onViewLeaderboard ? "pointer" : undefined,
  };

  function handleRowClick() {
    if (!isLeaderboard || !onViewLeaderboard) return;
    track("leaderboard", "leaderboard_task_tapped", { task_id: task.id, collected: task.collected });
    onViewLeaderboard();
    recordLeaderboardViewed?.();
    if (!collected) onCollect(task.id);
  }

  return (
    <div style={rowStyle} onClick={isLeaderboard ? handleRowClick : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            fontFamily: FF,
            color: isMilestoneCollected
              ? "#FFD700"
              : collected
              ? "rgba(255,255,255,0.4)"
              : "#EAF0FF",
            letterSpacing: "0.02em",
          }}>
            {task.label}
          </span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: FF }}>
            {task.progress} / {task.target}
            {task.rewardCoins ? `  •  +${task.rewardCoins} coins` : ""}
            {task.rewardXP ? `  •  +${task.rewardXP} XP` : ""}
          </span>

          {/* Bonus player names inline */}
          {isBonus && bonusPlayers && bonusPlayers.length > 0 && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: FF, marginTop: 1 }}>
              Today: {bonusPlayers.map(p => `${p.name} +${p.bonus}`).join(", ")}
            </span>
          )}

          {/* Streak count inline */}
          {isStreak && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: FF, marginTop: 1 }}>
              Current streak: {streakCount} win{streakCount !== 1 ? "s" : ""}
            </span>
          )}

          {/* Milestone unlocked subtitle */}
          {isMilestoneCollected && (
            <span style={{ fontSize: 10, color: "rgba(255,215,0,0.5)", fontFamily: FF, marginTop: 1 }}>
              {task.label} — unlocked
            </span>
          )}
        </div>

        {complete && !collected && (
          <button
            onClick={e => { e.stopPropagation(); onCollect(task.id); }}
            style={{
              background: "linear-gradient(135deg, #4aff00, #7FFF00)",
              border: "none",
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 11,
              fontWeight: 700,
              fontFamily: FF,
              color: "#090B10",
              cursor: "pointer",
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
            }}
          >
            COLLECT
          </button>
        )}

        {isMilestoneCollected && (
          <span style={{ fontSize: 18, opacity: 1 }}>🏆</span>
        )}

        {collected && !isMilestoneCollected && (
          <span style={{ fontSize: 18, opacity: 0.4 }}>✓</span>
        )}
      </div>

      {/* Progress bar */}
      {!collected && (
        <div style={{ height: 3, borderRadius: 999, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            borderRadius: 999,
            width: `${pct * 100}%`,
            background: complete ? "#7FFF00" : "rgba(255,255,255,0.25)",
            transition: "width 0.6s ease",
          }} />
        </div>
      )}
    </div>
  );
}

export function CollectScreen({
  taskStates,
  weeklyTaskStates,
  perpetualTaskStates,
  loginStreak,
  streakCount,
  coins,
  xp,
  onClose,
  onCollect,
  bonusPlayers,
  onViewLeaderboard,
  recordLeaderboardViewed,
  economyEnabled = true,
}: CollectScreenProps) {
  const uncollected = [
    ...taskStates,
    ...weeklyTaskStates,
    ...perpetualTaskStates,
  ].filter(t => t.progress >= t.target && !t.collected).length;

  const [countdown, setCountdown] = useState(() =>
    formatBonusCountdown(getMsUntilNextBonusRotation())
  );

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(formatBonusCountdown(getMsUntilNextBonusRotation()));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Coin-screen telemetry — muted fully when the economy is display-suppressed.
    if (!economyEnabled) return;
    const coinsAvailable = [...taskStates, ...weeklyTaskStates, ...perpetualTaskStates]
      .filter(t => t.progress >= t.target && !t.collected)
      .reduce((sum, t) => sum + (t.rewardCoins ?? 0), 0);
    track("engagement", "collect_screen_opened", {
      uncollected_daily:      taskStates.filter(t => t.progress >= t.target && !t.collected).length,
      uncollected_weekly:     weeklyTaskStates.filter(t => t.progress >= t.target && !t.collected).length,
      uncollected_milestones: perpetualTaskStates.filter(t => t.progress >= t.target && !t.collected).length,
      coins_available:        coinsAvailable,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCollect(taskId: string) {
    const task = [...taskStates, ...weeklyTaskStates, ...perpetualTaskStates].find(t => t.id === taskId);
    // Coin-screen telemetry — muted fully when the economy is display-suppressed.
    if (task && economyEnabled) {
      track("engagement", "task_collected", { task_id: task.id, cadence: task.cadence, reward_coins: task.rewardCoins });
    }
    onCollect(taskId);
  }

  const sharedRowProps = { streakCount, bonusPlayers, onViewLeaderboard, recordLeaderboardViewed };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 60,
      display: "flex",
      flexDirection: "column",
      background: "linear-gradient(180deg, #070A12 0%, #0A1020 60%, #070A12 100%)",
    }}>
      {/* Header */}
      <div style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "env(safe-area-inset-top, 12px) 16px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 18,
            fontWeight: 800,
            fontFamily: FF,
            color: "#EAF0FF",
            letterSpacing: "0.06em",
          }}>
            COLLECT
          </span>
          {uncollected > 0 && (
            <div style={{
              background: "#EF4444",
              borderRadius: 999,
              minWidth: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 5px",
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#fff" }}>{uncollected}</span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Coin display */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 14 }}>🪙</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#FFD700", fontFamily: FF }}>
              {coins.toLocaleString()}
            </span>
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: "5px 10px",
              color: "rgba(255,255,255,0.5)",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: FF,
            }}
          >
            Done
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}>

        {/* XP / Status */}
        <XPSection xp={xp} />

        {/* Login streak */}
        <div style={{
          background: "rgba(255,140,0,0.06)",
          border: "1px solid rgba(255,140,0,0.15)",
          borderRadius: 14,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <span style={{ fontSize: 22 }}>🔥</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#FF8C00", fontFamily: FF }}>
              {loginStreak} day login streak
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: FF }}>
              Keep it going for bonus rewards
            </div>
          </div>
        </div>

        {/* ── DAILY TASKS ── */}
        <SectionHeader
          label="DAILY TASKS"
          coinsAvailable={sectionCoins(taskStates)}
          subtitle={`Resets in ${countdown}`}
        />

        {taskStates.length === 0 && (
          <div style={{
            textAlign: "center",
            color: "rgba(255,255,255,0.25)",
            fontSize: 13,
            fontFamily: FF,
            padding: "24px 0",
          }}>
            No tasks available
          </div>
        )}

        {activeLadderOnly(taskStates).map(task => (
          <TaskRow key={task.id} task={task} onCollect={handleCollect} {...sharedRowProps} />
        ))}

        {/* ── WEEKLY TASKS ── */}
        <SectionHeader
          label="WEEKLY TASKS"
          coinsAvailable={sectionCoins(weeklyTaskStates)}
          subtitle="Resets Monday midnight"
        />

        {weeklyTaskStates.length === 0 && (
          <div style={{
            textAlign: "center",
            color: "rgba(255,255,255,0.25)",
            fontSize: 13,
            fontFamily: FF,
            padding: "12px 0",
          }}>
            No weekly tasks available
          </div>
        )}

        {activeLadderOnly(weeklyTaskStates).map(task => (
          <TaskRow key={task.id} task={task} onCollect={handleCollect} {...sharedRowProps} />
        ))}

        {/* ── MILESTONES ── */}
        <SectionHeader
          label="MILESTONES"
          coinsAvailable={sectionCoins(perpetualTaskStates)}
          subtitle="One-time rewards"
        />

        {perpetualTaskStates.length === 0 && (
          <div style={{
            textAlign: "center",
            color: "rgba(255,255,255,0.25)",
            fontSize: 13,
            fontFamily: FF,
            padding: "12px 0",
          }}>
            No milestones available
          </div>
        )}

        {activeLadderOnly(perpetualTaskStates).map(task => (
          <TaskRow key={task.id} task={task} onCollect={handleCollect} {...sharedRowProps} isPerpetual />
        ))}

        {/* PWA Install Prompt */}
        <PWAInstallPrompt rewardCoins={50} onInstalled={() => {}} />

        {/* Future sections placeholder */}
        <div style={{
          textAlign: "center",
          color: "rgba(255,255,255,0.12)",
          fontSize: 11,
          fontFamily: FF,
          padding: "16px 0 8px",
          letterSpacing: "0.08em",
        }}>
          Season packs and achievements coming soon
        </div>

      </div>
    </div>
  );
}
