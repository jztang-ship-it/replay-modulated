// src/shared/engagement/DailyTasksPanel.tsx
// Sport-agnostic daily tasks UI.
// Drop this anywhere in the game shell — HomeScreen, sidebar, drawer, etc.

import React from 'react';
import type { TaskState } from './useEngagement';

interface DailyTasksPanelProps {
  taskStates:     TaskState[];
  loginStreak:    number;
  coins:          number;
  onClose?:       () => void;
}

export function DailyTasksPanel({
  taskStates,
  loginStreak,
  coins,
  onClose,
}: DailyTasksPanelProps) {
  const allDone = taskStates.every(t => t.completed);

  return (
    <div style={styles.panel}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Daily Tasks</div>
          <div style={styles.subtitle}>Resets at midnight</div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.streakBadge}>
            🔥 {loginStreak} day{loginStreak !== 1 ? 's' : ''}
          </div>
          {onClose && (
            <button style={styles.closeBtn} onClick={onClose}>✕</button>
          )}
        </div>
      </div>

      {/* Task rows */}
      <div style={styles.taskList}>
        {taskStates.map(task => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>

      {/* All done banner */}
      {allDone && (
        <div style={styles.allDoneBanner}>
          ✅ All done for today — come back tomorrow!
        </div>
      )}

      {/* Coin balance */}
      <div style={styles.coinRow}>
        <span style={styles.coinLabel}>Coin balance</span>
        <span style={styles.coinValue}>🪙 {coins.toLocaleString()}</span>
      </div>

    </div>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────
function TaskRow({ task }: { task: TaskState }) {
  const pct = Math.min(100, Math.round((task.progress / task.target) * 100));

  return (
    <div style={{
      ...styles.taskRow,
      opacity: task.completed ? 0.6 : 1,
    }}>
      <div style={styles.taskIcon}>{task.icon}</div>

      <div style={styles.taskBody}>
        <div style={styles.taskTop}>
          <span style={styles.taskLabel}>{task.label}</span>
          <span style={styles.taskReward}>+{task.rewardCoins} 🪙</span>
        </div>

        {/* Progress bar */}
        <div style={styles.barTrack}>
          <div style={{
            ...styles.barFill,
            width: `${pct}%`,
            background: task.completed ? '#4ade80' : '#f59e0b',
          }} />
        </div>

        <div style={styles.taskBottom}>
          <span style={styles.taskProgress}>
            {task.completed
              ? 'Complete'
              : `${task.progress} / ${task.target}`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  panel: {
    background:   '#1a1a2e',
    border:       '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding:      '20px 20px 16px',
    display:      'flex',
    flexDirection: 'column',
    gap:          16,
    width:        '100%',
    maxWidth:     360,
    boxSizing:    'border-box',
  },
  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
  },
  title: {
    color:      '#ffffff',
    fontSize:   17,
    fontWeight: 600,
  },
  subtitle: {
    color:    'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },
  headerRight: {
    display:    'flex',
    alignItems: 'center',
    gap:        10,
  },
  streakBadge: {
    background:   'rgba(245,158,11,0.15)',
    border:       '1px solid rgba(245,158,11,0.3)',
    borderRadius: 20,
    padding:      '4px 10px',
    color:        '#f59e0b',
    fontSize:     13,
    fontWeight:   600,
  },
  closeBtn: {
    background: 'transparent',
    border:     'none',
    color:      'rgba(255,255,255,0.4)',
    fontSize:   16,
    cursor:     'pointer',
    padding:    4,
  },
  taskList: {
    display:       'flex',
    flexDirection: 'column',
    gap:           14,
  },
  taskRow: {
    display:    'flex',
    alignItems: 'flex-start',
    gap:        12,
    transition: 'opacity 0.3s ease',
  },
  taskIcon: {
    fontSize:      22,
    lineHeight:    1,
    paddingTop:    2,
    flexShrink:    0,
  },
  taskBody: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
    gap:           5,
  },
  taskTop: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'baseline',
  },
  taskLabel: {
    color:      '#ffffff',
    fontSize:   14,
    fontWeight: 500,
  },
  taskReward: {
    color:    'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  barTrack: {
    height:       5,
    background:   'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow:     'hidden',
  },
  barFill: {
    height:       '100%',
    borderRadius: 4,
    transition:   'width 0.4s ease',
  },
  taskBottom: {
    display: 'flex',
  },
  taskProgress: {
    color:    'rgba(255,255,255,0.4)',
    fontSize: 11,
  },
  allDoneBanner: {
    background:   'rgba(74,222,128,0.1)',
    border:       '1px solid rgba(74,222,128,0.25)',
    borderRadius: 10,
    padding:      '10px 14px',
    color:        '#4ade80',
    fontSize:     13,
    textAlign:    'center',
  },
  coinRow: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    borderTop:      '1px solid rgba(255,255,255,0.07)',
    paddingTop:     12,
  },
  coinLabel: {
    color:    'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
  coinValue: {
    color:      '#f59e0b',
    fontSize:   15,
    fontWeight: 600,
  },
};