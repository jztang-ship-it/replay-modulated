// shared/crowd/__tests__/crowdModel.test.ts — the crowd ENGINE (sport-agnostic).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { crowdOwnership, crowdOwnershipMap, DEFAULT_CROWD_WEIGHTS, type CrowdSignals } from "../crowdModel";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, "../crowdModel.ts"), "utf8");

const S = (o: Partial<CrowdSignals>): CrowdSignals => ({ fame: 0, recency: 0, market: 0, position: 0, ...o });

describe("crowd engine — outputs a probability in [0,1]", () => {
  it("clamps to [0,1] for any signal input", () => {
    for (const v of [0, 0.5, 1, -3, 5]) {
      const p = crowdOwnership(S({ fame: v, recency: v, market: v, position: v }));
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
  it("all-zero signals read as a low-backed player; all-one as high-backed", () => {
    expect(crowdOwnership(S({}))).toBeLessThan(0.25);
    expect(crowdOwnership(S({ fame: 1, recency: 1, market: 1, position: 1 }))).toBeGreaterThan(0.85);
  });
});

describe("crowd engine — monotone increasing in every behavioral signal", () => {
  const base = S({ fame: 0.3, recency: 0.3, market: 0.3, position: 0.3 });
  for (const k of ["fame", "recency", "market", "position"] as const) {
    it(`more ${k} ⇒ more backing`, () => {
      const lo = crowdOwnership({ ...base, [k]: 0.1 });
      const hi = crowdOwnership({ ...base, [k]: 0.9 });
      expect(hi).toBeGreaterThan(lo);
    });
  }
  it("market is the strongest lever (most value-orthogonal), recency the weakest", () => {
    expect(DEFAULT_CROWD_WEIGHTS.market).toBeGreaterThan(DEFAULT_CROWD_WEIGHTS.fame);
    expect(DEFAULT_CROWD_WEIGHTS.recency).toBeLessThan(DEFAULT_CROWD_WEIGHTS.fame);
  });
});

describe("crowd engine — map + INDEPENDENCE from value", () => {
  it("crowdOwnershipMap returns one probability per id", () => {
    const m = crowdOwnershipMap(new Map([["a", S({ fame: 0.9, market: 0.9 })], ["b", S({})]]));
    expect(m.get("a")! > m.get("b")!).toBe(true);
    expect(m.size).toBe(2);
  });
  it("the engine source references NO value/pricing input (hard rule)", () => {
    // Comments explain the ban; the executable surface must not touch value.
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""); // strip comments
    for (const banned of [/\bsalary\b/i, /projectedFp/i, /avgFP/i, /salaryTier/i, /pointsPerDollar/i, /\beconomy\b/i, /\bvolatility\b/i]) {
      expect(code).not.toMatch(banned);
    }
  });
});
