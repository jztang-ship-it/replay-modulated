import BaseballSportConfig, {
  type BaseballBadgeDef,
  type BaseballSlot,
  type BaseballStatCategory,
  type BaseballWinThreshold,
} from "./baseballConfig";
import { registerRecordSources } from "@shared/data/recordDetector";
import { MLB_SINGLE_GAME_RECORDS, MLB_STAT_ALIASES } from "@shared/data/mlbRecords";
import topGames from "../../public/data/topGames.json";
import careerHighs from "../../public/data/careerHighs.json";

registerRecordSources("baseball", {
  topGames: topGames as any,
  careerHighs: careerHighs as any,
  singleGameRecords: MLB_SINGLE_GAME_RECORDS,
  statAliases: MLB_STAT_ALIASES,
  careerCategories: [
    { key: "hr",  label: v => `personal best — ${v} HR` },
    { key: "h",   label: v => `personal best — ${v} hits` },
    { key: "rbi", label: v => `personal best — ${v} RBI` },
    { key: "k",   label: v => `personal best — ${v} K` },
    { key: "sb",  label: v => `personal best — ${v} SB` },
    { key: "ip",  label: v => `personal best — ${v} IP` },
  ],
});

export type BaseballSportConfigType = typeof BaseballSportConfig;
export type PlayerRole = "P" | "BAT";

/**
 * Layer 2 (MLB-specific) adapter helpers.
 *
 * TODO (shared engine integration): align this API with whatever the shared
 * resolve/economy/scoring engine expects (e.g. whether it passes `_position`,
 * how it interprets `statLine` keys, and how it aggregates FP breakdowns).
 *
 * TODO (gameAdapter integration): update position taxonomy once baseball
 * `gameAdapter` provides canonical raw positions (SP/RP/LHP/etc) and a
 * consistent "normalized stat line" schema.
 *
 * TODO (salary/projection tuning): tune thresholds, FP math rounding, and any
 * caps/minimums once baseball simulation data exists.
 */
export class SportAdapter {
  public config: BaseballSportConfigType;

  constructor(sportConfig: BaseballSportConfigType) {
    this.config = sportConfig;
  }

  get sportKey(): string {
    return this.config.sportKey;
  }

  get salaryCap(): number {
    return Number(this.config.salaryCap);
  }

  get salaryCapMin(): number {
    return Math.floor(Number(this.config.salaryCap) * 0.956);
  }

  get rosterSize(): number {
    return this.config.rosterSize;
  }

  get rosterSlots(): readonly BaseballSlot[] {
    return this.config.rosterSlots;
  }

  normalizeTier(raw: unknown): "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE" {
    const s = String(raw ?? "WHITE").trim().toUpperCase();
    const valid = ["ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"] as const;
    return valid.includes(s as any) ? (s as typeof valid[number]) : "WHITE";
  }

  get statCategories(): BaseballStatCategory[] {
    return [...this.config.statCategories];
  }

  isValidStatCategory(stat: string): boolean {
    return this.statCategories.includes(stat as BaseballStatCategory);
  }

  /**
   * Normalized player role used for roster constraints.
   * - Pitchers -> `P`
   * - All other players -> `BAT`
   */
  /**
   * Normalize a raw roster slot into one of: `P`, `BAT`.
   */
  normalizeRosterSlot(raw: unknown): BaseballSlot {
    const s = String(raw ?? "").trim().toUpperCase();
    if (s === "P") return "P";
    return "BAT";
  }

  /**
   * Whether the raw position should be treated as a pitcher.
   *
   * NOTE: Current matcher is intentionally conservative. It only recognizes a
   * few common pitcher strings; if your baseball data uses a different
   * convention, integrate the mapping via `gameAdapter` (TODO).
   */
  /** Map a raw position code (from data) to its on-card display glyph.
   *  Pitcher gets the ⚾ baseball emoji; batter gets the sentinel string "BAT"
   *  which BaseballCard.tsx replaces with a custom SVG bat (no Unicode emoji
   *  exists for a baseball bat without a ball — 🏏 is the cricket variant). */
  displayPosition(raw: unknown): string {
    const s = String(raw ?? "").trim().toUpperCase();
    if (!s) return "";
    if (this.isPitcherPosition(s)) return "⚾";
    // Everything else on a baseball roster is a batter (BAT, DH, 1B/2B/3B/SS/OF/etc.)
    return "BAT";
  }

  isPitcherPosition(rawPosition: unknown): boolean {
    const s = String(rawPosition ?? "").trim().toUpperCase();
    if (!s) return false;
    if (s === "P") return true;
    if (s === "PITCHER") return true;
    if (s === "SP") return true;
    if (s === "RP") return true;
    if (s === "LHP" || s === "RHP") return true;
    if (s.startsWith("SP/") || s.startsWith("RP/")) return true;
    if (s.startsWith("PIT")) return true;
    return false;
  }

  /**
   * Normalize raw player position into roster role (`P` or `BAT`).
   */
  normalizeRawPlayerPositionToPOrBAT(rawPosition: unknown): PlayerRole {
    return this.isPitcherPosition(rawPosition) ? "P" : "BAT";
  }

  /**
   * Basketball-like API parity: `normalizePosition` returns the canonical slot role.
   *
   * TODO (shared engine integration): if the shared engine expects a different
   * canonical output type, update this accordingly.
   */
  normalizePosition(raw: unknown): PlayerRole {
    return this.normalizeRawPlayerPositionToPOrBAT(raw);
  }

  /**
   * Check whether a player role can fit a given roster slot.
   * - `P` requires role `P`
   * - `BAT` requires role `BAT`
   */
  canPlayerFitRosterSlot(playerRawPosition: unknown, rosterSlotRaw: unknown): boolean {
    const rosterSlot = this.normalizeRosterSlot(rosterSlotRaw);
    const role = this.normalizeRawPlayerPositionToPOrBAT(playerRawPosition);
    return rosterSlot === role;
  }

  isValidRosterSlot(rawSlot: unknown): boolean {
    const s = String(rawSlot ?? "").trim().toUpperCase();
    return s === "P" || s === "BAT";
  }

  /**
   * Roster validation result for UI/simulator debugging.
   */
  validateRoster(roster: Array<RosterCardLike>): RosterValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (roster.length !== this.rosterSize) {
      errors.push(`Invalid roster size: expected ${this.rosterSize}, got ${roster.length}.`);
      return {
        valid: false,
        errors,
        warnings,
        totalSalary: 0,
        pitcherCount: 0,
        assigned: [],
      };
    }

    // TODO: Align min-cap behavior with other sports if/when needed.
    const totalSalary = roster.reduce((s, c) => s + Number(c.salary ?? 0), 0);
    if (totalSalary > this.salaryCap) {
      errors.push(`Salary cap exceeded: ${totalSalary} > ${this.salaryCap}.`);
    }

    const assigned: RosterSlotAssignment[] = roster.map((card, idx) => {
      const slotIndex = typeof card.slotIndex === "number" ? card.slotIndex : idx;
      const requiredSlot = this.rosterSlots[slotIndex];
      const role = this.normalizeRawPlayerPositionToPOrBAT(card.position);
      const canFit = requiredSlot ? this.canPlayerFitRosterSlot(card.position, requiredSlot) : false;
      return {
        slotIndex,
        requiredSlot: requiredSlot ?? "BAT",
        role,
        canFit,
        salary: Number(card.salary ?? 0),
        cardId: card.cardId ?? `slot-${idx}`,
      };
    });

    // Slot-by-slot fit check.
    for (const a of assigned) {
      if (!a.canFit) {
        errors.push(
          `Slot ${a.slotIndex} requires ${a.requiredSlot}, but player role is ${a.role}. (${a.cardId})`,
        );
      }
    }

    const pitcherCount = assigned.reduce((s, a) => s + (a.role === "P" ? 1 : 0), 0);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      totalSalary,
      pitcherCount,
      assigned,
    };
  }

  /**
   * Get stat categories that should be used for FP calculation.
   */
  getStatCategoriesForRole(role: PlayerRole): BaseballStatCategory[] {
    return role === "P"
      ? ([...this.config.pitchStatCategories] as BaseballStatCategory[])
      : ([...this.config.hitStatCategories] as BaseballStatCategory[]);
  }

  /**
   * Compute fantasy points from a normalized baseball stat line.
   *
   * IMPORTANT: this adapter treats the incoming `stats` keys as already
   * normalized to the categories in `baseballConfig.projectionWeights`.
   */
  computeFantasyPoints(stats: Record<string, any>, role?: PlayerRole): number {
    return this.computeFantasyPointsDetailed(stats, role).total;
  }

  computeFantasyPointsDetailed(
    stats: Record<string, any>,
    role?: PlayerRole,
  ): { total: number; breakdown: Partial<Record<BaseballStatCategory, number>> } {
    const resolvedRole =
      role ?? this.inferRoleFromStatLine(stats) ?? ("BAT" as PlayerRole);

    const categories = this.getStatCategoriesForRole(resolvedRole);
    const breakdown: Partial<Record<BaseballStatCategory, number>> = {};
    let fp = 0;

    for (const cat of categories) {
      const weight = Number(this.config.projectionWeights[cat] ?? 0);
      if (!Number.isFinite(weight) || weight === 0) continue;

      const value = this.getStatValue(stats, cat);
      const contrib = value * weight;
      if (!Number.isFinite(contrib) || contrib === 0) continue;

      breakdown[cat] = contrib;
      fp += contrib;
    }

    // Return the real finite FP total (including negative totals).
    return { total: Number.isFinite(fp) ? fp : 0, breakdown };
  }

  /**
   * Basketball parity helper: compute earned badge list.
   * TODO (shared engine integration): shared resolve engine may call this
   * under a different name; keep both for now.
   */
  computeBadges(stats: Record<string, any>, role?: PlayerRole): Array<BadgeEarned> {
    return this.evaluateBadges(stats, role);
  }

  /**
   * Infer role from a stat line "hint" field.
   *
   * TODO (shared engine integration): formalize how the shared engine passes
   * position/slot role for baseball.
   */
  private inferRoleFromStatLine(stats: Record<string, any>): PlayerRole | null {
    const hint =
      stats._position ??
      stats.position ??
      stats.rosterSlot ??
      stats.slot ??
      stats.slotType;
    if (hint === undefined || hint === null) return null;
    return this.normalizeRawPlayerPositionToPOrBAT(hint);
  }

  private getStatValue(stats: Record<string, any>, key: BaseballStatCategory): number {
    const direct = stats[key];
    if (direct !== undefined) return this.coerceNumber(direct);

    const candidates = [String(key).toUpperCase()];
    for (const c of candidates) {
      if (stats[c] !== undefined) return this.coerceNumber(stats[c]);
    }

    return 0;
  }

  coerceNumber(value: unknown): number {
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

  // ──────────────────────────────────────────────────────────────────────────
  // Badge helpers (placeholders)
  // ──────────────────────────────────────────────────────────────────────────

  getBadgeDefsForRole(role: PlayerRole): BaseballBadgeDef[] {
    const defs = (this.config.badges ?? {}) as {
      hitters: BaseballBadgeDef[];
      pitchers: BaseballBadgeDef[];
    };
    return role === "P" ? defs.pitchers : defs.hitters;
  }

  /**
   * Placeholder badge evaluation:
   * - reads badge definitions from config
   * - runs the config's `badge.test(stats)` (which is currently a TODO placeholder)
   * - does not implement any additional badge suppression/combination rules
   */
  evaluateBadges(stats: Record<string, any>, role?: PlayerRole): Array<BadgeEarned> {
    const resolvedRole = role ?? this.inferRoleFromStatLine(stats) ?? ("BAT" as PlayerRole);
    const defs = this.getBadgeDefsForRole(resolvedRole);

    const earned: Array<BadgeEarned> = [];
    for (const badge of defs) {
      try {
        if (badge.test(stats)) {
          earned.push({ id: badge.id, icon: badge.icon, label: badge.label, fp: badge.fp });
        }
      } catch {
        // Config badge logic is expected to be placeholder. Ignore errors for now.
        // TODO (gameAdapter integration): decide whether/when badge errors should fail scoring.
      }
    }

    return earned;
  }

  getWinThresholds(): BaseballWinThreshold[] {
    return this.config.winCondition?.thresholds ?? [];
  }
}

export type BadgeEarned = { id: string; icon: string; label: string; fp: number };

type RosterCardLike = {
  cardId?: string;
  basePlayerId?: string;
  position?: unknown;
  salary?: number | string | null;
  slotIndex?: number;
  statLine?: Record<string, any>;
};

type RosterSlotAssignment = {
  slotIndex: number;
  requiredSlot: BaseballSlot;
  role: "P" | "BAT";
  canFit: boolean;
  salary: number;
  cardId?: string;
};

type RosterValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalSalary: number;
  pitcherCount: number;
  assigned: RosterSlotAssignment[];
};

export const sportAdapter = new SportAdapter(BaseballSportConfig);
export default SportAdapter;

