// basketball/src/tools/__tests__/boss-fp-parity.test.ts
//
// Phase 2-mount step-1 GATE: the per-season band is computed with
// bossData.canonicalFp; the recipient's hand is scored by the play path
// (resolveEngine → sportAdapter.computeFantasyPoints + computeBadges). A band on
// the wrong FP is worse than none, so PROVE they're the same FP — on REAL boss-
// season logs, not synthetic — before banding.
//
// For real logs (no stored fp/total_points), resolveEngine's per-card score
// reduces to: adapter.computeFantasyPoints({...stats,_position}) * fpScale(=1)
// + Σ adapter.computeBadges({...stats,_position}).fp  (dailyBonus excluded from
// the reference). canonicalFp(stats,pos) must equal that exactly.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalFp } from "../bossData";
import { sportAdapter } from "../../adapters/SportAdapter";

const SEASONS_DIR = resolve(__dirname, "../../../public/data/seasons");
// A spread of boss seasons (oldest, mid, modern) to catch era-specific drift.
const SAMPLE_SEASONS = ["9697", "9798", "0304", "1516", "2425"];

function playPathFp(stats: Record<string, any>, position: string): number {
  const swp = { ...stats, _position: position };
  const base = sportAdapter.computeFantasyPoints(swp); // == computeBasketballFp; fpScale=1
  const badgeBonus = sportAdapter.computeBadges(swp).reduce((s, b) => s + (b.fp ?? 0), 0);
  return base + badgeBonus; // dailyBonus excluded from the band/target reference
}

describe("boss FP parity — canonicalFp == play-path FP (step-1 gate)", () => {
  for (const season of SAMPLE_SEASONS) {
    it(`season ${season}: canonicalFp equals play-path actualFp on real logs`, () => {
      const players: any[] = JSON.parse(readFileSync(resolve(SEASONS_DIR, season, "players.json"), "utf8"));
      const logs: any[] = JSON.parse(readFileSync(resolve(SEASONS_DIR, season, "gamelogs.json"), "utf8"));
      const posById = new Map<string, string>();
      for (const p of players) posById.set(String(p.basePlayerId), String(p.position ?? ""));

      // Sample across the season's logs (every Nth) to cover many stat shapes.
      const step = Math.max(1, Math.floor(logs.length / 400));
      let checked = 0;
      let confirmedStoredFpAbsent = true;
      for (let i = 0; i < logs.length; i += step) {
        const l = logs[i];
        const stats = l?.stats ?? {};
        const pos = posById.get(String(l?.basePlayerId)) ?? "";
        if (!pos) continue;
        if ("fp" in stats || "total_points" in stats || "fantasyPoints" in stats) confirmedStoredFpAbsent = false;
        const bossFp = canonicalFp(stats, pos);
        const playFp = playPathFp(stats, pos);
        // Exact equality — same two function calls, same config, same _position.
        expect(playFp).toBe(bossFp);
        checked++;
      }
      expect(checked).toBeGreaterThan(50);
      // The parity rests on logs carrying no precomputed fp (else extractFpFromStats
      // would read it and diverge from canonicalFp's always-compute). Assert it.
      expect(confirmedStoredFpAbsent).toBe(true);
    });
  }
});
