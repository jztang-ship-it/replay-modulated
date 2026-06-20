// @vitest-environment jsdom
//
// One-CTA ownership (result-screen bottom slot): suppressPrimaryAction un-renders
// the primary action button (DEAL/DRAW/REPLAY) so the challenge prompt can own the
// slot. Default false → button renders as today (baseball/football/worldcup, which
// never pass the flag, are provably unaffected). Tested via the data-action="deal"
// marker at IDLE (lightest state — no celebration/spring needed).

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GameBar } from "../GameBar";
import type { LegendData, WinTierDisplay } from "../GameBar";

const baseProps = {
  gameState: "IDLE" as const,
  balance: 1000,
  totalFp: 0,
  capMax: 250,
  capUsed: 0,
  lockedSalary: 0,
  revealedSalary: 0,
  betMultiplier: 1,
  baseBet: 10,
  onBetMultiplier: () => {},
  onAction: () => {},
  winTiers: [] as WinTierDisplay[],
  legend: { payoutRows: [], scoringRules: [], badges: [] } as LegendData,
  hideTierBar: true,
};

describe("GameBar — suppressPrimaryAction (one-CTA bottom-slot ownership)", () => {
  it("renders the primary action button by default (flag absent — today's behavior)", () => {
    const { container } = render(<GameBar {...baseProps} />);
    expect(container.querySelector('[data-action="deal"]')).not.toBeNull();
  });

  it("renders the primary action button when suppressPrimaryAction is false", () => {
    const { container } = render(<GameBar {...baseProps} suppressPrimaryAction={false} />);
    expect(container.querySelector('[data-action="deal"]')).not.toBeNull();
  });

  it("does NOT render the primary action button when suppressPrimaryAction is true", () => {
    const { container } = render(<GameBar {...baseProps} suppressPrimaryAction={true} />);
    expect(container.querySelector('[data-action="deal"]')).toBeNull();
  });
});
