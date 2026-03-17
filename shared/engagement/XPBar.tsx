// src/shared/engagement/XPBar.tsx
// Sport-agnostic XP progress bar with visible/locked tier display.
// Tiers: Rookie → Starter → All-Star (visible) | MVP → Legend (locked)

import React from 'react';

// ── Tier config ───────────────────────────────────────────────────────────────
export interface Tier {
  label:    string;
  minXP:    number;
  locked:   boolean;
  color:    string;
}

export const TIERS: Tier[] = [
  { label: 'Rookie',   minXP: 0,    locked: false, color: '#94a3b8' },
  { label: 'Starter',  minXP: 500,  locked: false, color: '#60a5fa' },
  { label: 'All-Star', minXP: 1500, locked: false, color: '#f59e0b' },
  { label: 'MVP',      minXP: 3000, locked: true,  color: '#a78bfa' },
  { label: 'Legend',   minXP: 6000, locked: true,  color: '#f87171' },
];

export function getCurrentTier(xp: number): Tier {
  return [...TIERS].reverse().find(t => xp >= t.minXP) ?? TIERS[0];
}

export function getNextTier(xp: number): Tier | null {
  return TIERS.find(t => t.minXP > xp) ?? null;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface XPBarProps {
  xp: number;
}

export function XPBar({ xp }: XPBarProps) {
  const current = getCurrentTier(xp);
  const next    = getNextTier(xp);

  // Progress within current tier
  const pct = next
    ? Math.min(100, Math.round(((xp - current.minXP) / (next.minXP - current.minXP)) * 100))
    : 100;

  return (
    <div style={styles.container}>

      {/* Tier pills row */}
      <div style={styles.tiersRow}>
        {TIERS.map(tier => {
          const isActive  = tier.label === current.label;
          const isPast    = xp >= tier.minXP && !tier.locked;
          const isLocked  = tier.locked;

          return (
            <div
              key={tier.label}
              style={{
                ...styles.tierPill,
                background: isActive
                  ? tier.color + '28'
                  : isPast
                  ? 'rgba(255,255,255,0.06)'
                  : 'transparent',
                border: isActive
                  ? `1px solid ${tier.color}55`
                  : '1px solid rgba(255,255,255,0.08)',
                opacity: isLocked ? 0.4 : 1,
              }}
            >
              {isLocked && <span style={styles.lockIcon}>🔒</span>}
              <span style={{
                ...styles.tierLabel,
                color: isActive ? tier.color : 'rgba(255,255,255,0.4)',
                fontWeight: isActive ? 600 : 400,
              }}>
                {tier.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* XP bar */}
      <div style={styles.barTrack}>
        <div style={{
          ...styles.barFill,
          width:      `${pct}%`,
          background: current.color,
        }} />
      </div>

      {/* XP label */}
      <div style={styles.xpRow}>
        <span style={styles.xpLabel}>
          {xp.toLocaleString()} XP
        </span>
        {next && !next.locked && (
          <span style={styles.xpNext}>
            {next.minXP.toLocaleString()} XP to {next.label}
          </span>
        )}
        {next && next.locked && (
          <span style={styles.xpNext}>
            {next.label} unlocks at {next.minXP.toLocaleString()} XP
          </span>
        )}
        {!next && (
          <span style={{ ...styles.xpNext, color: '#f87171' }}>
            Max tier reached
          </span>
        )}
      </div>

    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    display:       'flex',
    flexDirection: 'column',
    gap:           10,
    width:         '100%',
    maxWidth:      360,
  },
  tiersRow: {
    display:        'flex',
    justifyContent: 'space-between',
    gap:            4,
  },
  tierPill: {
    flex:           1,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            3,
    padding:        '5px 4px',
    borderRadius:   20,
    transition:     'all 0.3s ease',
  },
  lockIcon: {
    fontSize: 9,
  },
  tierLabel: {
    fontSize:   11,
    transition: 'all 0.3s ease',
  },
  barTrack: {
    height:       6,
    background:   'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow:     'hidden',
  },
  barFill: {
    height:       '100%',
    borderRadius: 4,
    transition:   'width 0.5s ease',
  },
  xpRow: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  xpLabel: {
    color:      'rgba(255,255,255,0.7)',
    fontSize:   12,
    fontWeight: 600,
  },
  xpNext: {
    color:    'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
};