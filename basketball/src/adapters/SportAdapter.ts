import type { Position, TierColor, PlayerCard } from "./types";
import { BasketballSportConfig } from "./basketballConfig";
import { registerRecordSources } from "@shared/data/recordDetector";
import { NBA_SINGLE_GAME_RECORDS, STAT_ALIASES } from "@shared/data/nbaRecords";
import { getPlayers, getLogsByKey } from "../engines/dataEngine";
import { getActiveSeason } from "@shared/engines/dataEngine";
import { tierFromSalary, DEFAULT_ECONOMY_CONFIG, type EconomyConfig } from "../engines/economyEngine";
import { tierRank } from "@shared/theme";
import topGames from "../../public/data/topGames.json";
import careerHighs from "../../public/data/careerHighs.json";
// Side-effect import: registers the basketball sound pack with the shared
// soundPackLoader at module-load time. Without this, basketball plays silently.
import "../utils/soundPack";

registerRecordSources("basketball", {
  topGames: topGames as any,
  careerHighs: careerHighs as any,
  singleGameRecords: NBA_SINGLE_GAME_RECORDS,
  statAliases: STAT_ALIASES,
  careerCategories: [
    { key: "pts",    label: v => `personal best — ${v} pts` },
    { key: "reb",    label: v => `personal best — ${v} reb` },
    { key: "ast",    label: v => `personal best — ${v} ast` },
    { key: "threes", label: v => `personal best — ${v} threes` },
  ],
});

export type SportConfig = typeof BasketballSportConfig;

export class SportAdapter {
  public config: SportConfig;
  constructor(sportConfig: SportConfig) { this.config = sportConfig; }

  get salaryCap(): number { return Number(this.config.salaryCap); }
  get salaryCapMin(): number { return Math.floor(Number(this.config.salaryCap) * 0.956); }
  get rosterSize(): number { return this.config.maxPlayers; }
  get positions(): string[] { return this.config.positions; }

  // Required by tierFromSalary() and slateSelector. basketballConfig doesn't
  // ship its own thresholds, so fall back to the shared defaults
  // (RED $73+ / ORANGE $58+ / PURPLE $44+ / BLUE $30+ / GREEN $23+ / WHITE $0+).
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

  get rosterSlots(): string[] {
    const explicit = (this.config as any).rosterSlots as string[] | undefined;
    if (explicit && explicit.length) return explicit;
    const slots: string[] = [];
    let i = 0;
    while (slots.length < this.rosterSize) {
      slots.push(this.config.positions[i % this.config.positions.length]);
      i++;
    }
    return slots;
  }

  normalizePosition(raw: unknown): Position {
    const s = String(raw ?? "").trim().toUpperCase();
    for (const pos of this.config.positions) {
      const p = pos.toUpperCase();
      if (s === p || s.startsWith(p)) return pos as Position;
    }
    return (this.config.positions[0] || "FLEX") as Position;
  }

  isValidPosition(pos: string): boolean { return this.config.positions.includes(pos); }

  /** Map a raw position code (from data) to its on-card display string.
   *  Sport-specific — basketball collapses combo positions to their primary. */
  displayPosition(raw: unknown): string {
    const s = String(raw ?? "").trim().toUpperCase();
    if (!s) return "";
    const map: Record<string, string> = {
      "PG": "PG", "SG": "SG", "G": "PG",
      "SF": "SF", "PF": "PF", "F": "SF",
      "G/F": "SG", "F/G": "SG", "F/C": "PF",
      "C": "C",
    };
    return map[s] ?? s;
  }

  normalizeTier(raw: unknown): TierColor {
    const s = String(raw ?? "WHITE").trim().toUpperCase();
    const valid: TierColor[] = ["RED", "ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"];
    return valid.includes(s as TierColor) ? (s as TierColor) : "WHITE";
  }

  computeFantasyPoints(stats: Record<string, any>): number {
    return this.computeFantasyPointsDetailed(stats).total;
  }

  computeFantasyPointsDetailed(stats: Record<string, any>): { total: number; breakdown: Record<string, number> } {
    const weights = this.config.projectionWeights;
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

  private getStatValue(stats: Record<string, any>, key: string): number {
    if (stats[key] !== undefined) return this.coerceNumber(stats[key]);
    for (const v of [key.toLowerCase(), key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), key.replace(/_/g, "")]) {
      if (stats[v] !== undefined) return this.coerceNumber(stats[v]);
    }
    return 0;
  }

  computeBadges(stats: Record<string, any>): Array<{ id: string; icon: string; label: string; fp: number }> {
    const defs = (this.config as any).badges ?? [];
    const earned: Array<{ id: string; icon: string; label: string; fp: number }> = [];
    for (const badge of defs) {
      try { if (badge.test(stats)) earned.push({ id: badge.id, icon: badge.icon, label: badge.label, fp: badge.fp }); }
      catch {}
    }
    const seen = new Set<string>();
    return earned.filter(b => {
      const cat = (b.id === 'TD' || b.id === 'DD') ? 'DOUBLE' : b.id;
      if (seen.has(cat)) return false;
      seen.add(cat);
      return true;
    });
  }

  getHeadshotUrl(playerId: string): string | null {
    const fn = (this.config as any).headshotUrl;
    return typeof fn === 'function' ? fn(playerId) : null;
  }

  getPositionLimits(position: string): { min: number; max: number } {
    return this.config.positionLimits?.[position] ?? { min: 0, max: 999 };
  }

  isValidRoster(roster: PlayerCard[]): boolean {
    if (roster.length !== this.rosterSize) return false;
    const total = roster.reduce((s, c) => s + (c.salary || 0), 0);
    return total >= this.salaryCapMin && total <= this.salaryCap;
  }

  get statCategories(): string[] { return this.config.statCategories || []; }
  isValidStatCategory(stat: string): boolean { return this.statCategories.includes(stat); }
  private coerceNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") { const n = Number(value); if (Number.isFinite(n)) return n; }
    return 0;
  }
  clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

  // ---------------------------------------------------------------------
  // Slate v2 — basketball-bound slate methods (flag-gated at the call site).
  // Match the CacheableAdapter shape consumed by shared/utils/slateSelector.ts
  // and shared/utils/dealGate.ts. With the flag OFF (default), none of these
  // are reached on the deal path.
  // ---------------------------------------------------------------------

  /** Sport identity used by isSlateV2Enabled() and slate cache keys. */
  get sportKey(): string { return (this.config as any).sportKey ?? "basketball"; }

  /** Career FP for a single player, summed across logs with last-2-seasons ×2 weight. */
  getCareerFPById(playerId: string): number {
    const logsByKey = getLogsByKey();
    const id = String(playerId).trim();
    if (!id) return 0;
    // dataEngine indexes logs by basePlayerId (and basePlayerId|season). Use the
    // basePlayerId-only key to get all seasons in one pass.
    const logs = logsByKey.get(id) ?? [];
    if (!logs.length) return 0;
    const currentYear = new Date().getUTCFullYear();
    let total = 0;
    for (const log of logs) {
      const stats = (log as any).stats ?? {};
      const fp = this.computeFantasyPoints(stats);
      const seasonRaw = (log as any).season;
      // Basketball seasons are stored as concat 4-digit codes (e.g. 2425 → 2025).
      // Take the trailing 2 digits as YY (2-digit year) and resolve to 20YY.
      const seasonNum = Number(seasonRaw);
      let yearOfLog = currentYear;
      if (Number.isFinite(seasonNum) && seasonNum > 0) {
        const yy = Math.round(seasonNum) % 100;
        yearOfLog = 2000 + yy;
      }
      const seasonAge = currentYear - yearOfLog;
      const weight = seasonAge <= 1 ? 2.0 : 1.0;
      total += fp * weight;
    }
    return total;
  }

  /** Top-N eligible players by career FP. Default N matches slateSelector's typical caller. */
  getEligiblePool(n: number = 200): string[] {
    const players = getPlayers();
    // De-dupe by basePlayerId (multiple season rows per player exist in players.json)
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const p of players) {
      const bid = String((p as any).basePlayerId ?? "").trim();
      if (!bid || seen.has(bid)) continue;
      seen.add(bid);
      ids.push(bid);
    }
    const scored = ids.map(id => ({ id, fp: this.getCareerFPById(id) }));
    scored.sort((a, b) => b.fp - a.fp);
    return scored.slice(0, n).map(s => s.id);
  }

  /** Anchor players (always in today's slate). Sort key is tier first
   *  (RED → ORANGE → PURPLE → BLUE → GREEN), career FP as tiebreaker
   *  within tier. So the 9 anchors read as the highest-tier highest-FP
   *  players, not just the top-FP regardless of tier. */
  getAnchors(count: number = 9): string[] {
    const players = getPlayers();
    const seen = new Set<string>();
    const entries: Array<{ id: string; tier: string; fp: number }> = [];
    for (const p of players) {
      const bid = String((p as any).basePlayerId ?? "").trim();
      if (!bid || seen.has(bid)) continue;
      seen.add(bid);
      // Compute tier from salary — players.json may carry stale tier
      // strings from older thresholds (e.g. Ja Morant @ $55 was tagged
      // BLUE in data but $44+ is PURPLE under the current breakpoints).
      const salary = Number((p as any).salary ?? 0);
      entries.push({
        id: bid,
        tier: tierFromSalary(salary, this.economyConfig),
        fp: this.getCareerFPById(bid),
      });
    }
    entries.sort((a, b) => {
      const t = tierRank(a.tier) - tierRank(b.tier);
      if (t !== 0) return t;
      return b.fp - a.fp;
    });
    return entries.slice(0, count).map(e => e.id);
  }

  /** Live tier lookup — used by slateSelector tier-capping AND by
   *  mapPlayer for card display, so cards and slate always agree.
   *
   *  HYBRID FLOOR + QUOTA: tier is derived from absolute salary thresholds
   *  (tierFromSalary), then the next-highest-salary players are promoted up
   *  to fill per-season floors (currently ORANGE ≥ 8). Sparse eras like
   *  2012-13 (only 2 players above $58) get their next 6 highest-salary
   *  players bumped from PURPLE → ORANGE. Modern stat-rich eras stay
   *  untouched. RED is never demoted; cross-season "Westbrook is RED"
   *  intuition preserved.
   *
   *  Cache is per-season — rebuilt when getActiveSeason() changes, or the
   *  FTUE→reel transition would leave stale tiers from the previous season. */
  private _tierCache: Map<string, string> | null = null;
  private _tierCacheSeason: string | null = null;
  getTierById(playerId: string): string {
    const currentSeason = getActiveSeason();
    if (this._tierCacheSeason !== currentSeason) {
      this._tierCache = null;
      this._tierCacheSeason = currentSeason;
    }
    if (!this._tierCache) this._tierCache = this.buildTierMap();
    return this._tierCache.get(String(playerId).trim()) ?? "WHITE";
  }

  /** Per-season floors. Promote the next-highest-salary player up to the
   *  named tier until the floor is met. Tiers absent here (PURPLE/BLUE/
   *  GREEN/WHITE) are uncapped and unfloored. */
  private static readonly TIER_FLOORS: Record<string, number> = { RED: 4, ORANGE: 8 };

  private buildTierMap(): Map<string, string> {
    // Pass 1: dedupe by basePlayerId, capture salary + absolute tier.
    const entries: Array<{ id: string; salary: number; tier: string }> = [];
    const seen = new Set<string>();
    for (const p of getPlayers()) {
      const bid = String((p as any).basePlayerId ?? "").trim();
      if (!bid || seen.has(bid)) continue;
      seen.add(bid);
      const salary = Number((p as any).salary ?? 0);
      entries.push({ id: bid, salary, tier: tierFromSalary(salary, this.economyConfig) });
    }
    // Pass 2: count tiers, identify shortfalls.
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.tier] = (counts[e.tier] ?? 0) + 1;
    // Pass 3: sort by salary descending — highest-salary candidates promote first.
    const sorted = [...entries].sort((a, b) => b.salary - a.salary);
    // Pass 4: walk down sorted, promote up to the strictest unmet floor.
    // Tiers ordered top-to-bottom so we promote PURPLE→ORANGE, ORANGE→RED, etc.
    const FLOORS = SportAdapter.TIER_FLOORS;
    const tierOrder = ["RED", "ORANGE"] as const;
    for (const targetTier of tierOrder) {
      const floor = FLOORS[targetTier];
      if (counts[targetTier] >= floor) continue;
      for (const e of sorted) {
        if (counts[targetTier] >= floor) break;
        // Skip if already this tier or higher.
        if (e.tier === "RED" || e.tier === targetTier) continue;
        // Promote.
        const oldTier = e.tier;
        e.tier = targetTier;
        counts[oldTier] = Math.max(0, (counts[oldTier] ?? 0) - 1);
        counts[targetTier] = (counts[targetTier] ?? 0) + 1;
      }
    }
    // Pass 5: build the map with the (possibly promoted) tier per id.
    const m = new Map<string, string>();
    for (const e of entries) m.set(e.id, e.tier);
    return m;
  }

  /** Phase-2 stubs (no themes in v1). */
  getThemeForDate(_date: Date): string | null { return null; }
  getThemedEligibility(_themeKey: string): string[] | null { return null; }
  getThemeMetadata(_themeKey: string): { displayName: string; description: string; iconKey?: string } | null { return null; }

  /** Manual exclusion list (populated during data audit). */
  getExclusionList(): string[] {
    return (this.config as any).exclusionList ?? [];
  }

  /** Slate-cache discriminator. Without this, the slate cache key is
   *  (sport, date, theme) — fine for one-pool sports, but basketball's
   *  active season changes via the daily reel, and the cache would
   *  return a slate of IDs from the previous season (which then get
   *  filtered out of the visible anchors because getAnchors() looks at
   *  the current season's pool). Including the active season key here
   *  forces a per-season cache. */
  getCacheNamespace(): string {
    return getActiveSeason() ?? "";
  }
}

export const sportAdapter = new SportAdapter(BasketballSportConfig);
export default SportAdapter;
export { BasketballSportConfig };
