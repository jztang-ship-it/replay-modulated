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

  get excludeFromFlex(): string[] { return this.config.excludeFromFlex ?? []; }

  /** Whether the sport enforces positional roster slots. Default true for
   *  backward compat — sports that don't set the flag continue with the
   *  position-aware deal logic. Basketball overrides to false. */
  get positionAware(): boolean { return this.config.positionAware !== false; }

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
    // Apply optional per-position scaling. Used by football (GK = 4.0) to
    // bring keeper FP totals into comparable range with outfield positions.
    // Scales both the total AND the per-stat breakdown so the card-back
    // stat→FP attribution displays the same scaled numbers users see in
    // the running total. Badges are NOT included here — they're applied
    // separately via computeBadges in the resolve pipeline.
    const posMul = (this.config as any).positionMultipliers as Record<string, number> | undefined;
    const m = posMul?.[position];
    if (m !== undefined && m !== 1 && Number.isFinite(m)) {
      for (const k of Object.keys(breakdown)) breakdown[k] *= m;
      fp *= m;
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

  /**
   * Slate v2: top-N eligible players by career FP.
   * Caller injects:
   *   - playersAccessor → list of { basePlayerId } for the sport
   *   - careerFpAccessor(id) → number (typically (id) => this.getCareerFP(id, ...))
   */
  getEligiblePool(
    playersAccessor: () => Array<{ basePlayerId: string }>,
    careerFpAccessor: (basePlayerId: string) => number,
    n: number = 200,
  ): string[] {
    const players = playersAccessor();
    const scored = players.map(p => ({ id: p.basePlayerId, fp: careerFpAccessor(p.basePlayerId) }));
    scored.sort((a, b) => b.fp - a.fp);
    return scored.slice(0, n).map(s => s.id);
  }

  /**
   * Slate v2: anchor players (always in today's slate). Default = top `count` by career FP.
   */
  getAnchors(
    playersAccessor: () => Array<{ basePlayerId: string }>,
    careerFpAccessor: (basePlayerId: string) => number,
    count: number = 10,
  ): string[] {
    return this.getEligiblePool(playersAccessor, careerFpAccessor, count);
  }

  /**
   * Slate v2 phase-2: theme schedule. Returns the theme key active for `date`,
   * or null for standard rotation. Default: null (no themes — v1 behavior).
   * Sports override in phase 2 to declare their schedule.
   */
  getThemeForDate(_date: Date): string | null {
    return null;
  }

  /**
   * Slate v2 phase-2: themed-day eligibility pool. Returns array of player IDs
   * for the given theme key, or null to fall back to standard eligibility.
   * Default: null. Sports override in phase 2.
   */
  getThemedEligibility(_themeKey: string): string[] | null {
    return null;
  }

  /**
   * Slate v2 phase-2: theme display metadata. Returns null when theme not
   * supported by this sport. Default: null. Sports override in phase 2.
   */
  getThemeMetadata(_themeKey: string): { displayName: string; description: string; iconKey?: string } | null {
    return null;
  }

  /**
   * Slate v2: manual exclusion list. Default reads from config.exclusionList
   * if present, else returns [].
   */
  getExclusionList(): string[] {
    return this.config.exclusionList ?? [];
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

  // ── Challenge / share methods ────────────────────────────────────────────

  serializeRoster(cards: import("../types/index").GeneratedCard[]): Record<string, unknown> {
    // Phase 0 challenge-snapshot-enrichment (lock: docs/challenge-landing-v2-
    // phase0-snapshot-enrichment-lock.md). wasHeld + actualFp per card and
    // top-level holdsRecorded:true persist the sender's decisions+outcomes
    // so the V2 landing can render hold badges + read held-card outcomes
    // for disagreement copy. Caller is responsible for passing an enriched
    // array (use enrichInitialRosterForChallenge) — this method stays a
    // pure single-roster mapper. v stays at 1; the validator's required-
    // field set is unchanged.
    return {
      v: 1,
      sport: this.sportKey,
      holdsRecorded: true,
      cards: cards.map(c => ({
        id: c.id,
        basePlayerId: c.basePlayerId,
        personKey: c.personKey,
        cardId: c.cardId,
        name: c.name,
        team: c.team,
        season: c.season,
        position: c.position,
        photoCode: (c as any).photoCode ?? null,
        salary: c.salary,
        tier: c.tier,
        slotIndex: (c as any).slotIndex ?? 0,
        projectedFp: c.projectedFp,
        wasHeld: (c as any).wasHeld === true,
        actualFp: Number((c as any).actualFp ?? 0),
      })),
    };
  }

  deserializeRoster(snapshot: Record<string, unknown>): import("../types/index").GeneratedCard[] {
    const cards = (snapshot.cards as any[]) ?? [];
    return cards.map((c: any, i: number) => ({
      id: c.id ?? c.basePlayerId,
      basePlayerId: c.basePlayerId,
      personKey: c.personKey ?? c.basePlayerId,
      cardId: c.cardId ?? c.basePlayerId,
      name: c.name,
      team: c.team,
      season: c.season,
      position: c.position,
      photoCode: c.photoCode ?? undefined,
      salary: Number(c.salary),
      tier: c.tier,
      slotIndex: c.slotIndex ?? i,
      projectedFp: Number(c.projectedFp ?? 0),
      // Phase 0: read sender's outcome when present (new snapshots);
      // fall back to 0 for legacy snapshots that pre-date the enrichment.
      // wasHeld + actualFp describe the SENDER's hand and are display-only
      // on the landing — recipient-deal sites zero wasHeld defensively.
      actualFp: Number(c.actualFp ?? 0),
      fpDelta: 0,
      statLine: {},
      gameInfo: { date: "", opponent: "" },
      achievements: [],
      wasHeld: c.wasHeld === true,
    }));
  }

  validateRosterSnapshot(snapshot: Record<string, unknown>): boolean {
    if (!snapshot || typeof snapshot !== "object") return false;
    if ((snapshot as any).v !== 1) return false;
    const cards = (snapshot as any).cards;
    if (!Array.isArray(cards) || cards.length < 1) return false;
    return cards.every((c: any) => c.basePlayerId && c.name && c.tier && c.salary !== undefined);
  }

  getComparisonValue(result: import("./challengeTypes").HandResult): number {
    return result.totalFp;
  }

  formatComparisonValue(value: number): string {
    return `${value.toFixed(1)} FP`;
  }

  getShareCardConfig(): import("./challengeTypes").ShareCardConfig {
    return {
      sport: this.sportKey,
      rosterSize: this.rosterSize,
      cardLayout: "3+2",
      statLabel: () => "",
      tierAccentColor: () => "#7c8aa3",
      tierLabel: (t) => t,
      tierBgColor: () => "rgba(0,0,0,0.2)",
    };
  }
}

export default SportAdapter;