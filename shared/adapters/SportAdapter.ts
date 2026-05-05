/**
 * shared/adapters/SportAdapter.ts — Layer 1
 * Wraps any sport config. Each sport instantiates its own adapter.
 */

import type { TierColor, SportConfigShape, PlayerCard, EconomyConfig } from "../types";
import { DEFAULT_ECONOMY_CONFIG } from "../engines/economyEngine";

export class SportAdapter {
  public config: SportConfigShape;
  constructor(sportConfig: SportConfigShape) { this.config = sportConfig; }

  get sportKey(): string { return this.config.sportKey; }
  get displayName(): string { return this.config.displayName ?? this.config.sportKey; }
  get salaryCap(): number { return Number(this.config.salaryCap); }
  get salaryCapMin(): number { return Math.floor(Number(this.config.salaryCap) * 0.956); }
  get rosterSize(): number { return this.config.maxPlayers ?? this.config.positions.length; }
  get positions(): string[] { return this.config.positions; }

  get rosterSlots(): readonly string[] {
    const explicit = this.config.rosterSlots;
    if (explicit && explicit.length) return explicit;
    const slots: string[] = [];
    let i = 0;
    while (slots.length < this.rosterSize) { slots.push(this.config.positions[i % this.config.positions.length]); i++; }
    return slots;
  }

  get economyConfig(): EconomyConfig {
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

  normalizePosition(raw: unknown): string {
    const s = String(raw ?? "").trim().toUpperCase();
    for (const pos of this.config.positions) { if (s === pos.toUpperCase() || s.startsWith(pos.toUpperCase())) return pos; }
    return this.config.positions[0] ?? "FLEX";
  }

  isValidPosition(pos: string): boolean { return this.config.positions.includes(pos); }

  /** Map a raw position code to its on-card display string.
   *  Default = identity (uppercased). Sports override for sport-specific mappings
   *  (basketball collapses combo positions, baseball maps BAT→B etc). */
  displayPosition(raw: unknown): string {
    return String(raw ?? "").trim().toUpperCase();
  }

  normalizeTier(raw: unknown): TierColor {
    const s = String(raw ?? "WHITE").trim().toUpperCase();
    const valid: TierColor[] = ["RED", "ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"];
    return valid.includes(s as TierColor) ? (s as TierColor) : "WHITE";
  }

  computeFantasyPoints(stats: Record<string, any>): number { return this.computeFantasyPointsDetailed(stats).total; }

  computeFantasyPointsDetailed(stats: Record<string, any>): { total: number; breakdown: Record<string, number> } {
    // Use position-specific weights if configured (e.g. GK vs FWD have different stat values)
    const position = String(stats._position ?? "").toUpperCase();
    const posWeights = (this.config as any).positionProjectionWeights;
    const weights = (posWeights && posWeights[position]) ? posWeights[position] : this.config.projectionWeights;
    const breakdown: Record<string, number> = {};
    let fp = 0;
    for (const [key, w] of Object.entries(weights)) {
      const weight = Number(w);
      if (!Number.isFinite(weight) || weight === 0) continue;
      const value = this.getStatValue(stats, key);
      const contrib = value * weight;
      if (Number.isFinite(contrib) && contrib !== 0) { breakdown[key] = contrib; fp += contrib; }
    }
    return { total: Number.isFinite(fp) ? fp : 0, breakdown };
  }

  /**
   * Slate v2: Career fantasy points for a player.
   *
   * Default implementation: sum of computed FP across all logs returned by
   * `logsAccessor`, with last-2-seasons weighted ×2 (recent bias).
   *
   * Sports may override to apply additional weighting (e.g. baseball
   * weighting playoff games higher).
   *
   * @param playerId       — base player id
   * @param logsAccessor   — function returning the player's season logs
   *                         shape: Array<{ season: number; stats: Record<string, any> }>
   */
  getCareerFP(
    playerId: string,
    logsAccessor: (playerId: string) => Array<{ season: number; stats: Record<string, any> }>,
  ): number {
    const logs = logsAccessor(playerId);
    if (!logs || logs.length === 0) return 0;
    const currentYear = new Date().getUTCFullYear();
    let total = 0;
    for (const log of logs) {
      const fp = this.computeFantasyPoints(log.stats);
      const seasonAge = currentYear - log.season;
      const weight = seasonAge <= 1 ? 2.0 : 1.0;
      total += fp * weight;
    }
    return total;
  }

  computeBadges(stats: Record<string, any>): Array<{ id: string; icon: string; label: string; fp: number }> {
    const defs = (this.config as any).badges ?? [];
    const position = (stats._position ?? "").toUpperCase();

    // Step 1: find all earned badges (support both trigger and test)
    const earned: Array<{ id: string; icon: string; label: string; fp: number; suppresses: string[] }> = [];
    for (const badge of defs) {
      try {
        if (badge.position && badge.position !== "ALL" && badge.position !== position) continue;
        const fn = badge.trigger ?? badge.test;
        if (typeof fn === "function" && fn(stats)) {
          earned.push({ id: badge.id, icon: badge.icon, label: badge.label, fp: badge.fp ?? 0, suppresses: badge.suppresses ?? [] });
        }
      } catch {}
    }

    // Step 2: collect suppressed IDs
    const suppressed = new Set<string>();
    for (const b of earned) {
      for (const s of b.suppresses) suppressed.add(s);
    }

    // Step 3: filter suppressed, clean output
    return earned
      .filter(b => !suppressed.has(b.id))
      .map(({ id, icon, label, fp }) => ({ id, icon, label, fp }));
  }

  getHeadshotUrl(playerId: string): string | null { const fn = (this.config as any).headshotUrl; return typeof fn === "function" ? fn(playerId) : null; }
  getPositionLimits(position: string): { min: number; max: number } { return this.config.positionLimits?.[position] ?? { min: 0, max: 999 }; }
  isValidRoster(roster: PlayerCard[]): boolean { if (roster.length !== this.rosterSize) return false; const total = roster.reduce((s, c) => s + (c.salary || 0), 0); return total >= this.salaryCapMin && total <= this.salaryCap; }
  get statCategories(): readonly string[] { return this.config.statCategories ?? []; }
  isValidStatCategory(stat: string): boolean { return this.statCategories.includes(stat); }

  private getStatValue(stats: Record<string, any>, key: string): number {
    if (stats[key] !== undefined) return this.coerceNumber(stats[key]);
    for (const v of [key.toLowerCase(), key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), key.replace(/_/g, "")]) {
      if (stats[v] !== undefined) return this.coerceNumber(stats[v]);
    }
    return 0;
  }

  private coerceNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") { const n = Number(value); if (Number.isFinite(n)) return n; }
    return 0;
  }

  clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
}

export default SportAdapter;