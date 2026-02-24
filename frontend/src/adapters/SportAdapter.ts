// frontend/src/adapters/SportAdapter.ts
/**
 * SportAdapter - Abstraction layer between UI and sport-specific logic
 * This makes the frontend sport-agnostic by loading all rules from config
 */

import type { Position, TierColor, PlayerCard } from "./types";

// Import sport config - ONLY place we reference specific sport
// Football sport config — inlined so frontend has zero backend dependencies
const FootballSportConfig = {
  name: 'Football (Soccer)',
  positions: ['FW', 'MD', 'DE', 'GK'] as string[],
  rosterSlots: ["FW", "MD", "DE", "GK", "FLEX", "FLEX"] as string[],
  salaryCap: 180,
  minPlayers: 6,
  maxPlayers: 6,
  positionLimits: {
    GK: { min: 1, max: 1 },
    FW: { min: 1, max: 4 },
    MD: { min: 1, max: 4 },
    DE: { min: 1, max: 4 },
  } as Record<string, { min: number; max: number }>,
  statCategories: [
    'minutes','goals_scored','assists','shots','shots_on_target',
    'key_passes','passes_completed','tackles_won','interceptions',
    'blocks','saves','goals_conceded','yellow_cards','red_cards',
  ],
  projectionWeights: {
    minutes: 0.0166667, goals_scored: 8.0, assists: 6.0,
    shots: 0.8, shots_on_target: 1.2, key_passes: 2.0,
    passes_completed: 0.04, tackles_won: 1.5, interceptions: 1.5,
    blocks: 2.0, saves: 2.0, goals_conceded: -1.0,
    yellow_cards: -2.0, red_cards: -6.0,
  },
  historicalLogFilters: { seasonsBack: 10, minMinutes: 1 },
  winCondition: {
    type: 'FIXED_THRESHOLD',
    thresholds: [
      { tier: 'BRONZE', minFP: 30 }, { tier: 'SILVER', minFP: 50 },
      { tier: 'GOLD', minFP: 70 },   { tier: 'PLATINUM', minFP: 90 },
      { tier: 'DIAMOND', minFP: 110 },
    ],
  },
};

export class SportAdapter {
  public config: typeof FootballSportConfig;

  constructor(sportConfig: typeof FootballSportConfig) {
    this.config = sportConfig;
  }

  // ========== SALARY CAP ==========
  get salaryCap(): number {
    return typeof this.config.salaryCap === 'number'
      ? this.config.salaryCap
      : (this.config.salaryCap as any).max;
  }

  get salaryCapMin(): number {
    return typeof this.config.salaryCap === 'number'
    ? Math.floor((this.config.salaryCap as number) * 0.956)
    : (this.config.salaryCap as any).min;
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
    const s = String(raw ?? "").trim().toUpperCase();

    for (const pos of this.config.positions) {
      const posUpper = pos.toUpperCase();
      if (s === posUpper) return pos as Position;
      if (s.startsWith(posUpper)) return pos as Position;
      if (posUpper.length >= 2 && s.includes(posUpper.substring(0, 2))) {
        return pos as Position;
      }
    }

    return (this.config.positions[0] || "MD") as Position;
  }

  isValidPosition(pos: string): boolean {
    return this.config.positions.includes(pos);
  }

  // ========== TIER LOGIC ==========
  normalizeTier(raw: unknown): TierColor {
    const s = String(raw ?? "WHITE").trim().toUpperCase();
    const validTiers: TierColor[] = ["ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"];

    if (validTiers.includes(s as TierColor)) {
      return s as TierColor;
    }

    return "WHITE";
  }

  // ========== SCORING ==========
  // Keep existing API for safety (nothing breaks)
  computeFantasyPoints(stats: Record<string, any>): number {
    return this.computeFantasyPointsDetailed(stats).total;
  }

  // New: detailed scoring with breakdown
  computeFantasyPointsDetailed(stats: Record<string, any>): { total: number; breakdown: Record<string, number> } {
    const weights = this.config.projectionWeights;
    const breakdown: Record<string, number> = {};
    let fp = 0;

    for (const [statKey, weightRaw] of Object.entries(weights)) {
      const weight = typeof weightRaw === "number" ? weightRaw : Number(weightRaw);
      if (!Number.isFinite(weight) || weight === 0) continue;

      const value = this.getStatValue(stats, statKey);
      const contrib = value * weight;

      if (Number.isFinite(contrib) && contrib !== 0) {
        breakdown[statKey] = contrib;
        fp += contrib;
      }
    }

    fp = Number.isFinite(fp) ? fp : 0;
    return { total: Math.max(0, fp), breakdown };
  }

  private getStatValue(stats: Record<string, any>, key: string): number {
    if (stats[key] !== undefined) {
      return this.coerceNumber(stats[key]);
    }

    const lowerKey = key.toLowerCase();
    const camelCase = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const noUnderscore = key.replace(/_/g, "");

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
      const count = roster.filter((c) => c.position === pos).length;
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
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
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
