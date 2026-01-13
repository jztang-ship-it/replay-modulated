import { PlayerTier } from '../types/engine';

/**
 * Calculate player tier based on salary as percentage of cap
 * Tier thresholds:
 * - Orange: ~50% of cap
 * - Purple: ~40% of cap
 * - Blue: ~30% of cap
 * - Green: ~20% of cap
 * - White: ~10% of cap
 */
export function getPlayerTier(salary: number, salaryCap: number): PlayerTier {
  const percentage = (salary / salaryCap) * 100;
  
  if (percentage >= 45) return 'orange';
  if (percentage >= 35) return 'purple';
  if (percentage >= 25) return 'blue';
  if (percentage >= 15) return 'green';
  return 'white';
}

export function getTierColorClass(tier: PlayerTier): string {
  const colors = {
    orange: 'bg-tier-orange',
    purple: 'bg-tier-purple',
    blue: 'bg-tier-blue',
    green: 'bg-tier-green',
    white: 'bg-tier-white',
  };
  return colors[tier];
}

export function getTierColorHex(tier: PlayerTier): string {
  const colors = {
    orange: '#FF6B35',
    purple: '#9B59B6',
    blue: '#3498DB',
    green: '#2ECC71',
    white: '#ECF0F1',
  };
  return colors[tier];
}

export function getTierGlowClass(tier: PlayerTier): string {
  return `card-glow-tier-${tier}`;
}

export function getTierBorderClass(tier: PlayerTier): string {
  const borders = {
    orange: 'border-tier-orange',
    purple: 'border-tier-purple',
    blue: 'border-tier-blue',
    green: 'border-tier-green',
    white: 'border-tier-white',
  };
  return borders[tier];
}
