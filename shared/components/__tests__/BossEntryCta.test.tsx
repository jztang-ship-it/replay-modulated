// @vitest-environment jsdom
/**
 * shared/components/__tests__/BossEntryCta.test.tsx
 *
 * Phase 2-mount Step 4 — the boss entry CTA conditional + open-path reuse.
 *   - unattempted → large CTA, href to /{sport}/challenge/{id}, count as PLAYERS
 *   - count absent/zero → count line omitted (Upgrade degrades)
 *   - attempted (local memory seeded) → progress-memory, View Boss link, same href
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BossEntryCta } from "../BossEntryCta";
import { recordBossResult } from "@shared/utils/bossResultMemory";

const BOSS_ID = "boss-uuid-xyz";

beforeEach(() => { localStorage.clear(); });

describe("BossEntryCta", () => {
  it("unattempted: large CTA, players count, open-path href", () => {
    render(<BossEntryCta sport="basketball" bossChallengeId={BOSS_ID} bossPlayerCount={14318} />);
    const cta = screen.getByTestId("boss-entry-cta");
    expect(cta.getAttribute("href")).toBe(`/basketball/challenge/${BOSS_ID}`);
    expect(screen.getByTestId("boss-entry-count").textContent).toMatch(/14,318 players tried/);
    // Not the attempted state.
    expect(screen.queryByTestId("boss-entry-attempted")).toBeNull();
  });

  it("count omitted when null or zero (Upgrade degrades, link stays)", () => {
    const { rerender } = render(<BossEntryCta sport="basketball" bossChallengeId={BOSS_ID} bossPlayerCount={null} />);
    expect(screen.getByTestId("boss-entry-cta")).toBeTruthy();
    expect(screen.queryByTestId("boss-entry-count")).toBeNull();
    rerender(<BossEntryCta sport="basketball" bossChallengeId={BOSS_ID} bossPlayerCount={0} />);
    expect(screen.queryByTestId("boss-entry-count")).toBeNull();
  });

  it("attempted: progress-memory with the player's score + View Boss link (same href)", () => {
    recordBossResult(BOSS_ID, { score: 228.4, won: true });
    render(<BossEntryCta sport="basketball" bossChallengeId={BOSS_ID} bossPlayerCount={14318} />);
    const memo = screen.getByTestId("boss-entry-attempted");
    expect(memo.textContent).toMatch(/TODAY'S BOSS ✓ — You scored 228\.4/);
    expect(screen.getByTestId("boss-view-link").getAttribute("href")).toBe(`/basketball/challenge/${BOSS_ID}`);
    // No second large invitation.
    expect(screen.queryByTestId("boss-entry-cta")).toBeNull();
  });
});
