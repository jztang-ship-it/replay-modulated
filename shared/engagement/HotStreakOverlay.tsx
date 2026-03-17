// src/shared/engagement/HotStreakOverlay.tsx
// Fires when sessionConsecutive >= 3 wins.
// Sport-agnostic — drop inside any game's layout.

import React, { useEffect, useState } from 'react';

interface HotStreakOverlayProps {
  active:      boolean;
  winCount:    number;  // current consecutive wins
}

export function HotStreakOverlay({ active, winCount }: HotStreakOverlayProps) {
  const [visible, setVisible]   = useState(false);
  const [animate, setAnimate]   = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (active) {
      setDismissed(false);
      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimate(true));
      });
      // Auto-dismiss after 3s
      const auto = setTimeout(() => {
        setAnimate(false);
        setTimeout(() => setVisible(false), 400);
      }, 3000);
      return () => clearTimeout(auto);
    } else {
      setAnimate(false);
      const t = setTimeout(() => setVisible(false), 400);
      return () => clearTimeout(t);
    }
  }, [active]);

  function dismiss() {
    setDismissed(true);
    setAnimate(false);
    setTimeout(() => setVisible(false), 400);
  }

  if (!visible) return null;

  return (
    <div
      onClick={dismiss}
      style={{
        ...styles.overlay,
        opacity:   animate && !dismissed ? 1 : 0,
        transform: animate && !dismissed ? 'translateY(0) scale(1)' : 'translateY(-12px) scale(0.95)',
        cursor: 'pointer',
        pointerEvents: 'auto',
      }}>

      {/* Flame row */}
      <div style={styles.flameRow}>
        {Array.from({ length: Math.min(winCount, 7) }).map((_, i) => (
          <span
            key={i}
            style={{
              ...styles.flame,
              animationDelay: `${i * 0.08}s`,
            }}
          >
            🔥
          </span>
        ))}
      </div>

      {/* Label */}
      <div style={styles.label}>HOT STREAK</div>
      <div style={styles.sub}>{winCount} wins in a row</div>

    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position:        'absolute',
    top:             16,
    left:            '50%',
    transform:       'translateX(-50%)',
    background:      'linear-gradient(135deg, rgba(234,88,12,0.92), rgba(202,138,4,0.92))',
    border:          '1px solid rgba(255,200,50,0.4)',
    borderRadius:    20,
    padding:         '10px 24px 12px',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             2,
    pointerEvents:   'auto',
    zIndex:          50,
    backdropFilter:  'blur(6px)',
    transition:      'opacity 0.35s ease, transform 0.35s ease',
    minWidth:        160,
  },
  flameRow: {
    display:    'flex',
    gap:        2,
    marginBottom: 2,
  },
  flame: {
    fontSize:              20,
    display:               'inline-block',
    animationName:         'flameWiggle',
    animationDuration:     '0.6s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    animationDirection:    'alternate',
  },
  label: {
    color:          '#fff',
    fontSize:       17,
    fontWeight:     700,
    letterSpacing:  '0.08em',
    textShadow:     '0 1px 4px rgba(0,0,0,0.4)',
  },
  sub: {
    color:    'rgba(255,255,255,0.75)',
    fontSize: 12,
  },
};