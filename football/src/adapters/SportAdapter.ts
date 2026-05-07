/**
 * football/src/adapters/SportAdapter.ts
 *
 * Football sport adapter. Same shape as basketball + baseball: each sport
 * declares its own SportAdapter class, exports the class + a singleton.
 *
 * Position-specific FP scaling is config-driven via `positionMultipliers`
 * on FootballSportConfig (read by the shared SportAdapter base class).
 * Football sets GK: 4.0 to bring keeper FP totals into the same range as
 * outfield positions; see footballConfig.ts for the rationale.
 *
 * Slate v2 overrides mirror basketball/baseball: the shared base's
 * getEligiblePool / getAnchors take playersAccessor + careerFpAccessor
 * arguments, but slateSelector.ts calls them with no args. Each sport
 * adapter has to bind those accessors to its own data engine. Without
 * these overrides, calling the slate path on football crashes
 * (`adapter.getAnchors is not a function` in minified builds).
 *
 * Pattern reference: basketball/src/adapters/SportAdapter.ts.
 */
import { SportAdapter as SharedSportAdapter } from "@shared/adapters/SportAdapter";
import { FootballSportConfig } from "./footballConfig";
import { getPlayers, getLogsByKey } from "../engines/dataEngine";

export class SportAdapter extends SharedSportAdapter {
  // ---------------------------------------------------------------------
  // Slate v2 — football-bound slate methods (flag-gated at the call site).
  // Match the CacheableAdapter shape consumed by shared/utils/slateSelector.ts
  // and shared/utils/dealGate.ts. With the flag OFF (default), none of these
  // are reached on the deal path.
  // ---------------------------------------------------------------------

  /** Sport identity used by isSlateV2Enabled() and slate cache keys. */
  get sportKey(): string { return (this.config as any).sportKey ?? "football"; }

  /** Career FP for a single player, summed across logs with last-2-seasons ×2 weight. */
  getCareerFPById(playerId: string): number {
    const logsByKey = getLogsByKey();
    const id = String(playerId).trim();
    if (!id) return 0;
    const logs = logsByKey.get(id) ?? [];
    if (!logs.length) return 0;
    const currentYear = new Date().getUTCFullYear();
    let total = 0;
    for (const log of logs) {
      const stats = (log as any).stats ?? {};
      const fp = this.computeFantasyPoints(stats);
      const seasonRaw = (log as any).season;
      // Football seasons are 4-digit years ("2022"). No remap needed.
      const seasonNum = Number(seasonRaw);
      const yearOfLog = Number.isFinite(seasonNum) && seasonNum > 0 ? seasonNum : currentYear;
      const seasonAge = currentYear - yearOfLog;
      const weight = seasonAge <= 1 ? 2.0 : 1.0;
      total += fp * weight;
    }
    return total;
  }

  /** Top-N eligible players by career FP. Default N matches slateSelector's typical caller.
   *  The shared base declares 3-arg signatures (playersAccessor, careerFpAccessor, n) but
   *  slateSelector.ts and dealGate.ts call with no accessor args — same as basketball/baseball,
   *  which sidestep the issue by being standalone classes. We override with the no-arg shape
   *  that the slate path expects. */
  // @ts-expect-error — intentionally narrowing the shared base's signature to match SlateAdapter.
  getEligiblePool(n: number = 200): string[] {
    const players = getPlayers();
    // De-dupe by basePlayerId (multiple season rows per player exist in players.json)
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const p of players) {
      const bid = String((p as any).basePlayerId ?? (p as any).id ?? "").trim();
      if (!bid || seen.has(bid)) continue;
      seen.add(bid);
      ids.push(bid);
    }
    const scored = ids.map(id => ({ id, fp: this.getCareerFPById(id) }));
    scored.sort((a, b) => b.fp - a.fp);
    return scored.slice(0, n).map(s => s.id);
  }

  /** Anchor players (always in today's slate). Default = top `count` by career FP. */
  // @ts-expect-error — narrowing shared base's 3-arg signature to no-arg SlateAdapter shape.
  getAnchors(count: number = 10): string[] {
    return this.getEligiblePool(count);
  }

  /** Phase-2 stubs (no themes in v1). */
  getThemeForDate(_date: Date): string | null { return null; }
  getThemedEligibility(_themeKey: string): string[] | null { return null; }
  getThemeMetadata(_themeKey: string): { displayName: string; description: string; iconKey?: string } | null { return null; }

  /** Manual exclusion list (populated during data audit). */
  getExclusionList(): string[] {
    return (this.config as any).exclusionList ?? [];
  }
}

export const sportAdapter = new SportAdapter(FootballSportConfig);
export default sportAdapter;
