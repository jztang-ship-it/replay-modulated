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
import { chadShareTrashTalk } from "@shared/commentary/chadChallenge";
import { computeBasketballCareerFp } from "./careerFp";
import { computeBasketballFp, computeBasketballFpDetailed } from "./fantasyPoints";
import { computeBasketballBadges } from "./badges";
// Side-effect import: registers the basketball sound pack with the shared
// soundPackLoader at module-load time. Without this, basketball plays silently.
import "../utils/soundPack";
// Side-effect import: registers basketball achievements with the shared registry.
import "../achievements/predicates";

registerRecordSources("basketball", {
  topGames: topGames as any,
  careerHighs: careerHighs as any,
  singleGameRecords: NBA_SINGLE_GAME_RECORDS,
  statAliases: STAT_ALIASES,
  careerCategories: [
    // Bug A fix (CODE HALF). detectCareerTier (shared/data/
    // recordDetector.ts:152-176) iterates only the keys in this list,
    // so a career-high in a stat that's absent here is structurally
    // invisible to T1 detection — it falls through to T2 and badges as
    // "SEASON HIGH" even when it's a true personal career best. Before
    // this fix the list ended at `threes`; that's how Brandon Roy's
    // Jan 24 2009 10-steals game (his real career high in stl, AND the
    // league's #1 stl game of 0809) badged "SEASON HIGH" on prod.
    //
    // Adding stl / blk / turnovers below opens the T1 path for those
    // categories. ⚠ HOWEVER ⚠ this is the code half ONLY: the
    // basketball/public/data/careerHighs.json data file currently
    // carries only { pts, reb, ast } per player (no stl / blk /
    // turnovers values). Until that JSON is regenerated with the new
    // keys, detectCareerTier's `highs[key]` lookup will return
    // undefined for stl / blk / turnovers, T1 will skip them, and the
    // tier will still fall through to T2. The badge for those stats
    // will not flip from "SEASON HIGH" to "CAREER HIGH" until the
    // careerHighs.json regen lands as a separate data task.
    //
    // turnovers is data-permissible per the pre-existing intent at
    // STAT_LABEL_MAP (shared/commentary/chadChallenge.ts): "rare_pull
    // on turnovers is data-permissible but reads ironically; left
    // intentional pending feature-polish review."
    { key: "pts",       label: v => `personal best — ${v} pts` },
    { key: "reb",       label: v => `personal best — ${v} reb` },
    { key: "ast",       label: v => `personal best — ${v} ast` },
    { key: "threes",    label: v => `personal best — ${v} threes` },
    { key: "stl",       label: v => `personal best — ${v} stl` },
    { key: "blk",       label: v => `personal best — ${v} blk` },
    { key: "turnovers", label: v => `personal best — ${v} turnovers` },
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

  /** Whether the sport enforces positional roster slots. Basketball returns
   *  false — all five floor positions accumulate the same stat categories,
   *  so the deal is N undifferentiated cards under cap. See
   *  CLAUDE.md "Positional requirements rule". */
  get positionAware(): boolean { return (this.config as any).positionAware !== false; }

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
    return computeBasketballFp(stats, this.config.projectionWeights);
  }

  computeFantasyPointsDetailed(stats: Record<string, any>): { total: number; breakdown: Record<string, number> } {
    return computeBasketballFpDetailed(stats, this.config.projectionWeights);
  }

  computeBadges(stats: Record<string, any>): Array<{ id: string; icon: string; label: string; fp: number }> {
    return computeBasketballBadges(stats, (this.config as any).badges ?? []) as Array<{ id: string; icon: string; label: string; fp: number }>;
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
  clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

  private static readonly TIER_ACCENT: Record<string, string> = {
    RED: "#EF4444", ORANGE: "#FB923C", PURPLE: "#C084FC",
    BLUE: "#3B82F6", GREEN: "#22C55E", WHITE: "#9CA3AF",
  };

  private static readonly TIER_BG: Record<string, string> = {
    RED: "rgba(239,68,68,0.18)", ORANGE: "rgba(251,146,60,0.18)",
    PURPLE: "rgba(192,132,252,0.18)", BLUE: "rgba(59,130,246,0.14)",
    GREEN: "rgba(34,197,94,0.14)", WHITE: "rgba(156,163,175,0.08)",
  };

  serializeRoster(cards: import("@shared/types/index").GeneratedCard[]): Record<string, unknown> {
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
      sport: "basketball",
      holdsRecorded: true,
      cards: cards.map((c: any) => ({
        id: c.id,
        basePlayerId: c.basePlayerId,
        personKey: c.personKey,
        cardId: c.cardId,
        name: c.name,
        team: c.team,
        season: c.season,
        position: c.position,
        photoCode: c.photoCode ?? null,
        salary: c.salary,
        tier: c.tier,
        slotIndex: c.slotIndex ?? 0,
        projectedFp: c.projectedFp,
        wasHeld: c.wasHeld === true,
        actualFp: Number(c.actualFp ?? 0),
      })),
    };
  }

  deserializeRoster(snapshot: Record<string, unknown>): import("@shared/types/index").GeneratedCard[] {
    const cards = (snapshot.cards as any[]) ?? [];
    return cards.map((c: any, i: number) => ({
      id: c.id ?? c.basePlayerId,
      basePlayerId: c.basePlayerId,
      personKey: c.personKey ?? c.basePlayerId,
      cardId: c.cardId ?? `${c.basePlayerId}-ch${i}`,
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
    if ((snapshot as any).v !== 1 || (snapshot as any).sport !== "basketball") return false;
    const cards = (snapshot as any).cards;
    if (!Array.isArray(cards) || cards.length !== this.rosterSize) return false;
    return cards.every((c: any) => c.basePlayerId && c.name && c.tier && c.salary !== undefined);
  }

  /** Build the caption stored as `share_headline` on a created challenge.
   *  Delegates to chadShareTrashTalk, which returns a recipient-facing
   *  dare from one of four trigger-keyed sub-banks (choke / flex /
   *  statement / default). The string flows through to:
   *    - the navigator.share text body (mobile)
   *    - the clipboard payload (desktop)
   *    - ChallengeLandingScreen header
   *    - the OG share-card image
   *
   *  All four surfaces share the same line per challenge. roster/season
   *  args remain on the signature for API stability across sports —
   *  basketball doesn't read them anymore, but the call site passes them
   *  and other sports (when they implement getShareHeadline) might.
   *
   *  trigger arg drives the sub-bank — recipient copy points at the
   *  same emotional frame the sender JUST saw on their prompt
   *  (rare_pull/big_score → flex, choke → choke, near_miss or
   *  STARTER → statement, else → default). winTier is a secondary signal
   *  used for comfortable-STARTER wins that come through as
   *  trigger="default".
   *
   *  Caller responsibility: memoize this call. Each invocation rolls a
   *  fresh pick from the chosen bank (with shared anti-repeat ring
   *  buffer). GameView wraps the call in useMemo([challengeTrigger,
   *  winTier]) so the headline is stable across the multi-render RESULTS
   *  phase and the user gets one line per challenge, not a flicker. */
  getShareHeadline(args: {
    roster: import("@shared/types/index").GeneratedCard[];
    season: string;
    winTier: string;
    trigger?: string;
  }): string {
    void args.roster; void args.season;
    return chadShareTrashTalk({ trigger: args.trigger, winTier: args.winTier });
  }

  getComparisonValue(result: import("@shared/adapters/challengeTypes").HandResult): number {
    return result.totalFp;
  }

  formatComparisonValue(value: number): string {
    return `${value.toFixed(1)} FP`;
  }

  getShareCardConfig(): import("@shared/adapters/challengeTypes").ShareCardConfig {
    const ACCENT = SportAdapter.TIER_ACCENT;
    const BG = SportAdapter.TIER_BG;
    return {
      sport: "basketball",
      rosterSize: this.rosterSize,
      cardLayout: "3+2",
      statLabel: (card: any) => `$${card.salary}`,
      tierAccentColor: (tier) => ACCENT[tier] ?? "#9CA3AF",
      tierLabel: (tier) => tier,
      tierBgColor: (tier) => BG[tier] ?? "rgba(0,0,0,0.15)",
    };
  }

  // ---------------------------------------------------------------------
  // Slate v2 — basketball-bound slate methods (flag-gated at the call site).
  // Match the CacheableAdapter shape consumed by shared/utils/slateSelector.ts
  // and shared/utils/dealGate.ts. With the flag OFF (default), none of these
  // are reached on the deal path.
  // ---------------------------------------------------------------------

  /** Sport identity used by isSlateV2Enabled() and slate cache keys. */
  get sportKey(): string { return (this.config as any).sportKey ?? "basketball"; }

  /** Career FP for a single player, summed across logs with last-2-seasons ×2
   *  weight. Thin wrapper around computeBasketballCareerFp — the pure helper
   *  the calibration sim also calls. Reading dataEngine state stays here so
   *  callers can use the (playerId)-only signature; the formula lives in the
   *  helper so sim-production parity is structural, not by convention. */
  getCareerFPById(playerId: string): number {
    return computeBasketballCareerFp(
      playerId,
      getLogsByKey(),
      stats => this.computeFantasyPoints(stats),
    );
  }

  /** Games-played floor for slate eligibility. Removes cup-of-coffee players
   *  (< 30 games this season) from every tier's pool — keeps the WHITE/GREEN
   *  fillers as recognizable role players rather than 5-game cameos. */
  private static readonly MIN_GAMES_THIS_SEASON = 30;

  /** Eligible-player IDs for slate selection. Games-played floor applied
   *  per-(player, season): a player must have ≥ MIN_GAMES_THIS_SEASON games
   *  in the active season to qualify. Replaces the old top-200-by-career-FP
   *  filter which excluded WHITE players entirely.
   *
   *  Returns dedupe'd basePlayerIds — slateSelector groups by tier from here. */
  getEligiblePool(_n?: number): string[] {
    const players = getPlayers();
    const logsByKey = getLogsByKey();
    const activeSeason = getActiveSeason();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of players) {
      const bid = String((p as any).basePlayerId ?? "").trim();
      if (!bid || seen.has(bid)) continue;
      seen.add(bid);
      // Games played in the active season — pull from the dataEngine's
      // per-season log index. Key shape "{bid}|{season}" gives season-scoped
      // logs without bringing in career-wide history.
      const seasonKey = activeSeason ? `${bid}|${activeSeason}` : null;
      const logs = (seasonKey ? logsByKey.get(seasonKey) : null) ?? logsByKey.get(bid) ?? [];
      if (logs.length >= SportAdapter.MIN_GAMES_THIS_SEASON) out.push(bid);
    }
    return out;
  }

  /** Per-tier pool sizes used by slate composition. Sub-pools rank by career
   *  FP (recognizable players first) and cap at these counts to control
   *  variance. RED / ORANGE / PURPLE are uncapped — those tiers are naturally
   *  small and we want the full pool surfaceable. */
  private static readonly TIER_POOL_CAPS: Record<string, number> = {
    BLUE: 40,
    GREEN: 25,
    WHITE: 20,
  };

  /** Slate composition spec — daily count ranges per tier and the
   *  protection / absorb policy. Read by shared slateSelector. */
  readonly slateComposition = {
    tierRanges: {
      // RED/ORANGE/PURPLE ranges are vestigial now — these tiers are taken in
      // FULL via guaranteedTiers (below), so their quota range is never rolled.
      RED:    [2, 3]   as [number, number],
      ORANGE: [8, 12]  as [number, number],
      PURPLE: [12, 20] as [number, number],
      // Filler maxes raised to the TIER_POOL_CAPS (BLUE 40 / GREEN 25 / WHITE 20)
      // so the float-ceiling slateSize can pull the full capped filler bench
      // every day. TIER_POOL_CAPS itself is unchanged (scrub-exclusion intact).
      BLUE:   [8, 40]  as [number, number],
      GREEN:  [6, 25]  as [number, number],
      WHITE:  [8, 20]  as [number, number],
    },
    /** Never trim or expand PURPLE during the normalization step. */
    protectedTier: "PURPLE",
    /** Priority order for absorbing slack. BLUE flexes first, then GREEN. */
    absorbTiers: ["BLUE", "GREEN"],
    /** Stars + gem tier taken IN FULL every slate (never rotated/trimmed);
     *  BLUE/GREEN/WHITE fill the remainder to slateSize with daily variance. */
    guaranteedTiers: ["RED", "ORANGE", "PURPLE"],
  };

  /** Per-tier player pool, sorted by career FP descending (most recognizable
   *  first). Caller is expected to shuffle + slice for daily variance.
   *
   *  RED/ORANGE/PURPLE: all eligible players in that tier (no cap).
   *  BLUE/GREEN/WHITE: top-N by career FP per TIER_POOL_CAPS. The cap is what
   *  makes filler tiers favor known role players (long careers / journeymen
   *  who played for many teams) over single-season scrubs. */
  getTierPool(tier: string): string[] {
    const eligible = this.getEligiblePool();
    const matches = eligible
      .filter(id => this.getTierById(id) === tier)
      .map(id => ({ id, fp: this.getCareerFPById(id) }))
      .sort((a, b) => b.fp - a.fp);
    const cap = SportAdapter.TIER_POOL_CAPS[tier];
    const sliced = cap !== undefined ? matches.slice(0, cap) : matches;
    return sliced.map(m => m.id);
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
   *  GREEN/WHITE) are uncapped and unfloored.
   *
   *  ORANGE floor raised 8 → 12 so the slate-composition target range
   *  (8-12 ORANGE per slate) is satisfiable on every season. Sparse eras
   *  (e.g. 2012-13 with raw ORANGE=2) get their next 10 highest-salary
   *  PURPLE players promoted to fill the floor. */
  private static readonly TIER_FLOORS: Record<string, number> = { RED: 4, ORANGE: 12 };

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
