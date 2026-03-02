/**
 * shared/adapters/SportAdapter.ts — Layer 1
 *
 * The bridge between sport-specific config (Layer 2) and the engines (Layer 1).
 * Every sport creates an instance of this class with its own config.
 *
 * This is NOT a singleton. Each sport instantiates its own adapter.
 * The active adapter is managed by the app entry point (main.tsx or App.tsx).
 */

import type { TierColor, SportConfigShape, PlayerCard, EconomyConfig } from "../types";
import { DEFAULT_ECONOMY_CONFIG } from "../engines/economyEngine";

export class SportAdapter {
  public config: SportConfigShape;

  constructor(sportConfig: SportConfigShape) {
    this.config = sportConfig;
  }

  // ── Identity ─────────────────────────────────────────────────────────────

  get sportKey(): string { return this.config.sportKey; }
  get displayName(): string { return this.config.displayName; }

  // ── Roster ───────────────────────────────────────────────────────────────

  get salaryCap(): number { return Number(this.config.salaryCap); }
  get salaryCapMin(): number { return Math.floor(Number(this.config.salaryCap) * 0.956); }
  get rosterSize(): number { return this.config.maxPlayers; }
  get positions(): string[] { return this.config.positions; }

  get rosterSlots(): string[] {
    const explicit = this.config.rosterSlots;
    if (explicit && explicit.length) return explicit;
    const slots: string[] = [];
    let i = 0;
    while (slots.length < this.rosterSize) {
      slots.push(this.config.positions[i % this.config.positions.length]);
      i++;
    }
    return slots;
  }

  get economyConfig(): EconomyConfig {
    // Build EconomyConfig from sport config, falling back to defaults
    const cfg = this.config as any;
    return {
      capMax: this.salaryCap,
      salaryMin: cfg.salaryMin ?? DEFAULT_ECONOMY_CONFIG.salaryMin,
      salaryMax: cfg.salaryMax ?? DEFAULT_ECONOMY_CONFIG.salaryMax,
      tierThresholds: cfg.tierThresholds ?? DEFAULT_ECONOMY_CONFIG.tierThresholds,
      salaryRatioCeiling: cfg.salaryRatioCeiling ?? DEFAULT_ECONOMY_CONFIG.salaryRatioCeiling,
      salaryRatioFloor: cfg.salaryRatioFloor ?? DEFAULT_ECONOMY_CONFIG.salaryRatioFloor,
    };
  }

  // ── Position helpers ──────────────────────────────────────────────────────

  normalizePosition(raw: unknown): string {
    const s = String(raw ?? "").trim().toUpperCase();
    for (const pos of this.config.positions) {
      const p = pos.toUpperCase();
      if (s === p || s.startsWith(p)) return pos;
    }
    return this.config.positions[0] ?? "FLEX";
  }

  isValidPosition(pos: string): boolean {
    return this.config.positions.includes(pos);
  }

  // ── Tiers ─────────────────────────────────────────────────────────────────

  normalizeTier(raw: unknown): TierColor {
    const s = String(raw ?? "WHITE").trim().toUpperCase();
    const valid: TierColor[] = ["ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"];
    return valid.includes(s as TierColor) ? (s as TierColor) : "WHITE";
  }

  getPositionLimits(position: string): { min: number; max: number } {
    return this.config.positionLimits?.[position] ?? { min: 0, max: 999 };
  }

  // ── Fantasy points ────────────────────────────────────────────────────────

  computeFantasyPoints(stats: Record<string, any>): number {
    return this.computeFantasyPointsDetailed(stats).total;
  }

  computeFantasyPointsDetailed(stats: Record<string, any>): {
    total: number;
    breakdown: Record<string, number>;
  } {
    const weights = this.config.projectionWeights;
    const breakdown: Record<string, number> = {};
    let fp = 0;

    for (const [key, w] of Object.entries(weights)) {
      const weight = Number(w);
      if (!Number.isFinite(weight) || weight === 0) continue;
      const value = this.getStatValue(stats, key);
      const contrib = value * weight;
      if (Number.isFinite(contrib) && contrib !== 0) {
        breakdown[key] = contrib;
        fp += contrib;
      }
    }

    return {
      total: Math.max(0, Number.isFinite(fp) ? fp : 0),
      breakdown,
    };
  }

  // ── Badges ────────────────────────────────────────────────────────────────

  computeBadges(stats: Record<string, any>): Array<{
    id: string;
    icon: string;
    label: string;
    fp: number;
  }> {
    const defs = (this.config as any).badges ?? [];
    const earned: Array<{ id: string; icon: string; label: string; fp: number }> = [];

    for (const badge of defs) {
      try {
        if (badge.test(stats)) {
          earned.push({ id: badge.id, icon: badge.icon, label: badge.label, fp: badge.fp });
        }
      } catch {}
    }

    // Deduplicate by category
    const seen = new Set<string>();
    return earned.filter(b => {
      const cat = (b.id === "TD" || b.id === "DD") ? "DOUBLE" : b.id;
      if (seen.has(cat)) return false;
      seen.add(cat);
      return true;
    });
  }

  // ── Headshots ─────────────────────────────────────────────────────────────

  getHeadshotUrl(playerId: string): string | null {
    const fn = (this.config as any).headshotUrl;
    return typeof fn === "function" ? fn(playerId) : null;
  }

  // ── Roster validation ─────────────────────────────────────────────────────

  isValidRoster(roster: PlayerCard[]): boolean {
    if (roster.length !== this.rosterSize) return false;
    const total = roster.reduce((s, c) => s + (c.salary || 0), 0);
    return total >= this.salaryCapMin && total <= this.salaryCap;
  }

  // ── Stat categories ───────────────────────────────────────────────────────

  get statCategories(): string[] {
    return this.config.statCategories ?? [];
  }

  isValidStatCategory(stat: string): boolean {
    return this.statCategories.includes(stat);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private getStatValue(stats: Record<string, any>, key: string): number {
    if (stats[key] !== undefined) return this.coerceNumber(stats[key]);
    // Try alternate casings
    for (const v of [
      key.toLowerCase(),
      key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      key.replace(/_/g, ""),
    ]) {
      if (stats[v] !== undefined) return this.coerceNumber(stats[v]);
    }
    return 0;
  }

  private coerceNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

export default SportAdapter;
