/**
 * CollectScreen.tsx
 * Full-screen Collect tab — replaces the Tasks drawer button.
 * Shows daily tasks with uncollected rewards, XP bar, login streak, coins.
 * Expandable later for: season packs, achievement history, loyalty tier.
 */

import { useState } from "react";
import type { TaskState } from "@shared/engagement/useEngagement";

const FF = "'Rajdhani', 'Arial Narrow', sans-serif";

interface CollectScreenProps {
  taskStates: TaskState[];
  loginStreak: number;
  coins: number;
  xp: number;
  onClose: () => void;
  onCollect: (taskId: string) => void;
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

function TaskRow({
  task,
  onCollect,
}: {
  task: TaskState;
  onCollect: (id: string) => void;
}) {
  const pct = Math.min(1, task.progress / task.target);
  const complete = pct >= 1;
  const collected = task.collected;

  return (
    <div style={{
      background: collected
        ? "rgba(255,255,255,0.02)"
        : complete
        ? "rgba(127,255,0,0.04)"
        : "rgba(255,255,255,0.04)",
      border: `1px solid ${collected ? "rgba(255,255,255,0.05)" : complete ? "rgba(127,255,0,0.2)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 12,
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      opacity: collected ? 0.45 : 1,
      transition: "opacity 0.3s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            fontFamily: FF,
            color: collected ? "rgba(255,255,255,0.4)" : "#EAF0FF",
            letterSpacing: "0.02em",
          }}>
            {task.label}
          </span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: FF }}>
            {task.progress} / {task.target}
            {task.rewardCoins ? `  •  +${task.rewardCoins} coins` : ""}
            {task.rewardXP ? `  •  +${task.rewardXP} XP` : ""}
          </span>
        </div>

        {complete && !collected && (
          <button
            onClick={() => onCollect(task.id)}
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

        {collected && (
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
  loginStreak,
  coins,
  xp,
  onClose,
  onCollect,
}: CollectScreenProps) {
  const uncollected = taskStates.filter(t => t.progress >= t.target && !t.collected).length;

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

        {/* Daily tasks */}
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          fontFamily: FF,
          letterSpacing: "0.12em",
          color: "rgba(255,255,255,0.35)",
          paddingLeft: 2,
        }}>
          DAILY TASKS
        </div>

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

        {taskStates.map(task => (
          <TaskRow key={task.id} task={task} onCollect={onCollect} />
        ))}

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
