// frontend/src/adapters/SportAdapter.ts
/**
 * SportAdapter - Abstraction layer between UI and sport-specific logic
 * This makes the frontend sport-agnostic by loading all rules from config
 */

import type { Position, TierColor, PlayerCard } from './types';

// Import sport config - ONLY place we reference specific sport
import { FootballSportConfig } from '../../../backend/sports/football';

export class SportAdapter {
  private config: typeof FootballSportConfig;

  constructor(sportConfig: typeof FootballSportConfig) {
    this.config = sportConfig;
  }

  // ========== SALARY CAP ==========
  get salaryCap(): number {
    return this.config.salaryCap;
  }

  get salaryCapMin(): number {
    return Math.floor(this.config.salaryCap * 0.95);
  }

  // ========== ROSTER ==========
  get rosterSize(): number {
    return this.config.maxPlayers;
  }

  get positions(): string[] {
    return this.config.positions;
  }
  /**
   * Ordered, fixed UI slots for the roster grid.
   * This prevents cards from "jumping" by keeping positions stationary.
   *
   * For football example (6 cards):
   * ["GK","DEF","DEF","MID","MID","FWD"]
   *
   * If config doesn't define an order, we derive a stable order from limits + positions.
   */
  get rosterSlots(): string[] {
    const explicit = (this.config as any).rosterSlots as string[] | undefined;
    if (explicit && explicit.length) return explicit;

    const size = this.rosterSize;
    const limits = this.config.positionLimits || {};
    const slots: string[] = [];

    // 1) Fill required mins first in a stable positions order
    for (const pos of this.config.positions) {
      const min = limits[pos]?.min ?? 0;
      for (let i = 0; i < min; i++) slots.push(pos);
    }

    // 2) Fill remaining slots by cycling through positions (stable)
    let i = 0;
    while (slots.length < size) {
      slots.push(this.config.positions[i % this.config.positions.length]);
      i++;
    }

    // 3) Trim (safety)
    return slots.slice(0, size);
  }

  // ========== POSITION LOGIC ==========
  normalizePosition(raw: unknown): Position {
    const s = String(raw ?? '').trim().toUpperCase();
    
    for (const pos of this.config.positions) {
      const posUpper = pos.toUpperCase();
      if (s === posUpper) return pos as Position;
      if (s.startsWith(posUpper)) return pos as Position;
      if (posUpper.length >= 2 && s.includes(posUpper.substring(0, 2))) {
        return pos as Position;
      }
    }
    
    return (this.config.positions[0] || 'MID') as Position;
  }

  isValidPosition(pos: string): boolean {
    return this.config.positions.includes(pos);
  }

  // ========== TIER LOGIC ==========
  normalizeTier(raw: unknown): TierColor {
    const s = String(raw ?? 'WHITE').trim().toUpperCase();
    const validTiers: TierColor[] = ['ORANGE', 'PURPLE', 'BLUE', 'GREEN', 'WHITE'];
    
    if (validTiers.includes(s as TierColor)) {
      return s as TierColor;
    }
    
    return 'WHITE';
  }

  // ========== SCORING ==========
  computeFantasyPoints(stats: Record<string, any>): number {
    const weights = this.config.projectionWeights;
    let fp = 0;

    for (const [statKey, weight] of Object.entries(weights)) {
      const value = this.getStatValue(stats, statKey);
      fp += value * weight;
    }

    return Math.max(0, fp);
  }

  private getStatValue(stats: Record<string, any>, key: string): number {
    if (stats[key] !== undefined) {
      return this.coerceNumber(stats[key]);
    }

    const lowerKey = key.toLowerCase();
    const camelCase = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const noUnderscore = key.replace(/_/g, '');

    for (const variant of [lowerKey, camelCase, noUnderscore]) {
      if (stats[variant] !== undefined) {
        return this.coerceNumber(stats[variant]);
      }
    }

    return 0;
  }

  // ========== POSITION REQUIREMENTS ==========
  getPositionLimits(position: string): { min: number; max: number } {
    const limits = this.config.positionLimits?.[position];
    return limits ?? { min: 0, max: 999 };
  }

  isValidRoster(roster: PlayerCard[]): boolean {
    if (roster.length !== this.rosterSize) return false;

    for (const [pos, limits] of Object.entries(this.config.positionLimits || {})) {
      const count = roster.filter(c => c.position === pos).length;
      if (count < limits.min || count > limits.max) return false;
    }

    const totalSalary = roster.reduce((sum, c) => sum + (c.salary || 0), 0);
    if (totalSalary < this.salaryCapMin || totalSalary > this.salaryCap) {
      return false;
    }

    return true;
  }

  // ========== STAT CATEGORIES ==========
  get statCategories(): string[] {
    return this.config.statCategories || [];
  }

  isValidStatCategory(stat: string): boolean {
    return this.statCategories.includes(stat);
  }

  // ========== HELPERS ==========
  private coerceNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

export const sportAdapter = new SportAdapter(FootballSportConfig);
export default SportAdapter;
