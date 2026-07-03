// basketball/src/crowd/__tests__/basketballCrowd.test.ts — the basketball extractor,
// run against REAL 2024-25 data. Validates the crowd behaves like a crowd (over-backs
// famous + big-market names) and — structurally — never touches value.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { basketballCrowdOwnership, buildBasketballCrowdSignals, type CrowdPlayer, type CrowdLog } from "../basketballCrowd";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../../../public/data/seasons/2425");
const SRC = readFileSync(resolve(__dirname, "../basketballCrowd.ts"), "utf8");

const prows = JSON.parse(readFileSync(resolve(DATA, "players.json"), "utf8")) as any[];
const glogs = JSON.parse(readFileSync(resolve(DATA, "gamelogs.json"), "utf8")) as any[];

const players: CrowdPlayer[] = prows.map((p) => ({
  basePlayerId: String(p.basePlayerId), name: p.name, team: p.team, position: p.position,
}));
const logsByBaseId = new Map<string, CrowdLog[]>();
for (const e of glogs) {
  const id = String(e.basePlayerId);
  (logsByBaseId.get(id) ?? logsByBaseId.set(id, []).get(id)!).push({ stats: e.stats });
}
const own = basketballCrowdOwnership(players, logsByBaseId);
const vals = [...own.values()].sort((a, b) => a - b);
const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];

const STARS = { LeBron: "2544", Curry: "201939", Durant: "201142", Jokic: "203999", Giannis: "203507", Edwards: "1630162" };

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("basketball crowd — well-formed probabilities that discriminate", () => {
  it("every ownership is in [0,1] and the model spreads hard (floor obscure, marquee high)", () => {
    expect(own.size).toBe(players.length);
    expect(vals.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(Math.min(...vals)).toBeLessThan(0.30);   // obscure floor players (soft floor ≈ 0.25)
    expect(Math.max(...vals)).toBeGreaterThan(0.65); // marquee names (ceiling ≈ 0.69)
    expect(q(0.90)).toBeGreaterThan(0.48);           // top decile clearly elevated
  });
});

describe("basketball crowd — over-backs famous names (the room's bias)", () => {
  it("the marquee cohort as a whole sits well above the pool 75th percentile", () => {
    const starMean = mean(Object.values(STARS).map((id) => own.get(id)!));
    expect(starMean).toBeGreaterThan(q(0.75));
  });
  it("big-market marquee names (LeBron/LAL, Curry/GSW) land in the top decile", () => {
    expect(own.get(STARS.LeBron)!).toBeGreaterThan(q(0.90));
    expect(own.get(STARS.Curry)!).toBeGreaterThan(q(0.90));
  });
});

describe("basketball crowd — MARKET bias is real and value-orthogonal", () => {
  it("a big-market star (Curry/GSW) is backed harder than an equally-famous small-market star (Edwards/MIN)", () => {
    expect(own.get(STARS.Curry)!).toBeGreaterThan(own.get(STARS.Edwards)!);
  });
  it("the orthogonality tell: fame alone doesn't buy top ownership — a famous small-market star (Edwards/MIN) is faded OUT of the top decile", () => {
    expect(own.get(STARS.Edwards)!).toBeLessThan(q(0.90));
  });
});

describe("basketball crowd — signals are behavioral only", () => {
  it("signals expose fame/recency/market/position — no value field", () => {
    const sig = buildBasketballCrowdSignals(players.slice(0, 3), logsByBaseId);
    const one = [...sig.values()][0];
    expect(Object.keys(one).sort()).toEqual(["fame", "market", "position", "recency"]);
    for (const v of Object.values(one)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
  it("the extractor source touches NO value/pricing input (incl. playerCulture.salaryTier)", () => {
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""); // strip comments (the ban is discussed there)
    for (const banned of [/\bsalary\b/i, /projectedFp/i, /avgFP/i, /salaryTier/i, /\.tier\b/, /pointsPerDollar/i, /\beconomy\b/i, /\bpricing\b/i, /\bvolatility\b/i, /projByBase/i]) {
      expect(code, `banned token ${banned}`).not.toMatch(banned);
    }
    // and it does NOT import the value/economy/roster engines
    expect(SRC).not.toMatch(/from ["'].*(economyEngine|rosterEngine|payoutLogic|basketballConfig|gameAdapter)/);
  });
});
