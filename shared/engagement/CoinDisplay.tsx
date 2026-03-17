// src/shared/engagement/CoinDisplay.tsx
// Sport-agnostic coin balance display.
// Use anywhere — header, sidebar, post-game screen, etc.

import React, { useEffect, useRef, useState } from 'react';

interface CoinDisplayProps {
  coins:    number;
  size?:    'sm' | 'md' | 'lg';
}

export function CoinDisplay({ coins, size = 'md' }: CoinDisplayProps) {
  const prevCoins     = useRef(coins);
  const [bump, setBump] = useState(false);

  // Animate when coins increase
  useEffect(() => {
    if (coins > prevCoins.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 600);
      prevCoins.current = coins;
      return () => clearTimeout(t);
    }
    prevCoins.current = coins;
  }, [coins]);

  const fontSize = size === 'sm' ? 12 : size === 'lg' ? 18 : 14;
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 22 : 16;
  const padding  = size === 'sm' ? '3px 8px' : size === 'lg' ? '8px 16px' : '5px 12px';

  return (
    <div style={{
      ...styles.badge,
      padding,
      transform: bump ? 'scale(1.15)' : 'scale(1)',
    }}>
      <span style={{ fontSize: iconSize, lineHeight: 1 }}>🪙</span>
      <span style={{ ...styles.amount, fontSize }}>
        {coins.toLocaleString()}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  badge: {
    display:        'inline-flex',
    alignItems:     'center',
    gap:            6,
    background:     'rgba(245,158,11,0.12)',
    border:         '1px solid rgba(245,158,11,0.25)',
    borderRadius:   20,
    transition:     'transform 0.2s ease',
  },
  amount: {
    color:      '#f59e0b',
    fontWeight: 600,
    fontFamily: 'inherit',
  },
};
