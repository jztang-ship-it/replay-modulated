import type { Position, TierColor, PlayerCard } from "./types";
import { BasketballSportConfig } from "./basketballConfig";
import { registerRecordSources } from "@shared/data/recordDetector";
import { NBA_SINGLE_GAME_RECORDS, STAT_ALIASES } from "@shared/data/nbaRecords";
import topGames from "../../public/data/topGames_2425.json";
import careerHighs from "../../public/data/careerHighs_2season.json";

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
}

export const sportAdapter = new SportAdapter(BasketballSportConfig);
export default SportAdapter;
export { BasketballSportConfig };
