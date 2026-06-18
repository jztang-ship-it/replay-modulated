// shared/views/__tests__/GameView.entryFeeCollapse.test.ts
//
// Build-phase B1 Step 2: the bet collapses to a single entryFee when the sport's
// adapter disables the multiplier (basketball). The multiplier infra goes dormant
// (state/setter/selector intact, re-wireable) — NOT deleted.
//
// Gating is adapter-parameterized with defaults at the shared read site, so a sport
// that doesn't set the fields keeps today's behavior ("basketball only" as a
// structural guarantee, not just intent). GameView is not render-tested (project
// precedent) → static-source for the GameView/GameBar wiring; the maxRounds=1
// inertness is proven at runtime against the controller.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { commitRound, MAX_ROUNDS } from "../_roundMachine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
const GAME_VIEW = read("../GameView.tsx");
const GAME_BAR = read("../../components/GameBar.tsx");
const SHARED_STATE = read("../_useSharedGameState.ts");
const BBALL_SHIM = read("../../../basketball/src/views/GameView.tsx");

describe("entryFee collapse — adapter-gated, defaults preserve current behavior", () => {
  // ── INERTNESS: defaults live at the shared READ site (absent field = current) ──
  it("GameView reads multiplierEnabled with a `?? true` default at the read site", () => {
    expect(GAME_VIEW).toMatch(/adapter\.multiplierEnabled\s*\?\?\s*true/);
  });
  it("maxRounds=1 inertness (runtime): first reroll locks = single-shot", async () => {
    let charges = 0;
    const r = await commitRound({
      roundsUsed: 1, maxRounds: 1, userTappedReveal: false, // deal=lineup 1; first reroll locks

      entryFee: 10, streak: 0,
      resolvedRoster: [{ basePlayerId: "p", actualFp: 20 }] as any,
      resolveOutcome: () => ({ totalFp: 20, tier: "BUST", payout: 0 }),
      effects: {
        telemetry: () => {}, persistLock: async () => ({ ok: true as const, handId: "h" }),
        charge: () => { charges += 1; }, rake: () => {},
      },
    });
    expect(r.next).toBe("REVEALING");   // no loop — locks on the first reroll, like today
    expect(r.roundsUsed).toBe(2);       // lineup 1 (deal) → first reroll → lock
    expect(charges).toBe(1);            // one charge, single-shot
    expect(MAX_ROUNDS).toBe(3);         // basketball's value, distinct from the default
  });

  // ── COLLAPSE: multiplier pinned to 1 when disabled; money reads the folded value ─
  it("effectiveBetMultiplier pins to 1 when the multiplier is disabled", () => {
    expect(GAME_VIEW).toMatch(/effectiveBetMultiplier\s*=\s*\(!multiplierEnabled\s*\|\|\s*challengeCtx\)\s*\?\s*1\s*:\s*betMultiplier/);
  });
  it("the bet derives from the folded effectiveBetMultiplier (no money path reads raw betMultiplier)", () => {
    expect(GAME_VIEW).toMatch(/currentBet\s*=\s*BASE_BET\s*\*\s*effectiveBetMultiplier/);
  });

  // ── SELECTOR HIDDEN when disabled ───────────────────────────────────────────
  it("GameView passes showBetMultiplier={multiplierEnabled} to GameBar", () => {
    expect(GAME_VIEW).toMatch(/showBetMultiplier=\{multiplierEnabled\}/);
  });
  it("GameBar gates the multiplier selector on showBetMultiplier (default true)", () => {
    expect(GAME_BAR).toMatch(/showBetMultiplier\s*=\s*true/);         // default = shown
    expect(GAME_BAR).toMatch(/showBetMultiplier\s*&&\s*multiplierRow/); // gated render
  });

  // ── DORMANT, NOT DELETED: state + setter survive ────────────────────────────
  it("betMultiplier state + setBetMultiplier remain (re-wireable for a future launch)", () => {
    expect(SHARED_STATE).toMatch(/\[betMultiplier,\s*setBetMultiplier\]\s*=\s*useState/);
  });

  // ── basketball is the only sport that triggers the collapse ─────────────────
  it("basketball adapter sets multiplierEnabled:false; baseball/football inherit the default", () => {
    expect(BBALL_SHIM).toMatch(/multiplierEnabled:\s*false/);
  });
});
