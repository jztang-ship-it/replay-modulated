// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TodaysSlatePanel } from "../TodaysSlatePanel";

const Thumb = ({ playerId, isAnchor }: { playerId: string; isAnchor: boolean }) => (
  <span data-testid={`thumb-${playerId}`}>{playerId}{isAnchor ? "*" : ""}</span>
);

const baseAdapter = {
  themeMetadata: null,
  anchors: [{ id: "lebron", name: "LeBron", tier: "RED" as const }],
  bonusPlayers: [{ id: "curry", name: "Curry", bonus: 20 as const }],
  rotatingCount: 38,
  msUntilRotation: 60_000,
  CardThumb: Thumb,
  fullSlatePlayers: [
    { id: "lebron", name: "LeBron", tier: "RED" as const, isAnchor: true },
    { id: "curry", name: "Curry", tier: "RED" as const, isAnchor: false },
  ],
};

describe("TodaysSlatePanel", () => {
  it("renders without theme banner when themeMetadata is null", () => {
    render(<TodaysSlatePanel adapter={baseAdapter} />);
    expect(screen.queryByTestId("slate-theme-banner")).toBeNull();
    expect(screen.getByTestId("todays-slate-panel")).toBeTruthy();
  });

  it("renders theme banner when themeMetadata is provided", () => {
    render(<TodaysSlatePanel adapter={{
      ...baseAdapter,
      themeMetadata: { displayName: "Rookie Slate", description: "Rookies only" },
    }} />);
    expect(screen.getByTestId("slate-theme-banner")).toBeTruthy();
    expect(screen.getByText("Rookie Slate")).toBeTruthy();
  });

  it("renders countdown text", () => {
    render(<TodaysSlatePanel adapter={baseAdapter} />);
    expect(screen.getByTestId("slate-countdown").textContent).toMatch(/refreshes/i);
  });

  it("expand toggle reveals full slate", () => {
    render(<TodaysSlatePanel adapter={baseAdapter} />);
    expect(screen.queryByTestId("slate-full-list")).toBeNull();
    fireEvent.click(screen.getByTestId("slate-expand-toggle"));
    expect(screen.getByTestId("slate-full-list")).toBeTruthy();
  });

  it("uses sport-provided CardThumb for both anchors and bonus", () => {
    render(<TodaysSlatePanel adapter={baseAdapter} />);
    expect(screen.getByTestId("thumb-lebron")).toBeTruthy();
    expect(screen.getByTestId("thumb-curry")).toBeTruthy();
  });

  it("renders the slate signature line when provided", () => {
    render(<TodaysSlatePanel adapter={{
      ...baseAdapter,
      signature: { number: 145, label: "Slate #145" },
    }} />);
    const sig = screen.getByTestId("slate-signature");
    expect(sig.textContent).toBe("Slate #145");
  });

  it("omits the signature line when none is provided", () => {
    render(<TodaysSlatePanel adapter={baseAdapter} />);
    expect(screen.queryByTestId("slate-signature")).toBeNull();
  });

  it("renders all bonus players in a single 'Today's Bonus' grid with FP badges", () => {
    render(<TodaysSlatePanel adapter={{
      ...baseAdapter,
      bonusPlayers: [
        { id: "curry", name: "Curry", bonus: 20 as const },
        { id: "tatum", name: "Tatum", bonus: 10 as const },
        { id: "doncic", name: "Doncic", bonus: 5 as const },
      ],
    }} />);
    const bonusSection = screen.getByTestId("slate-bonus");
    expect(bonusSection.textContent).toMatch(/Today's Bonus/);
    // All three players visible — not just the top bonus.
    expect(screen.getByTestId("thumb-curry")).toBeTruthy();
    expect(screen.getByTestId("thumb-tatum")).toBeTruthy();
    expect(screen.getByTestId("thumb-doncic")).toBeTruthy();
    // FP badges are rendered for each bonus tier.
    expect(bonusSection.textContent).toMatch(/\+20 FP/);
    expect(bonusSection.textContent).toMatch(/\+10 FP/);
    expect(bonusSection.textContent).toMatch(/\+5 FP/);
    // Cells are addressable by id for click handling.
    expect(screen.getByTestId("slate-bonus-curry")).toBeTruthy();
    expect(screen.getByTestId("slate-bonus-tatum")).toBeTruthy();
    expect(screen.getByTestId("slate-bonus-doncic")).toBeTruthy();
    // Headliner callout is gone — the bonus row is the single surface.
    expect(screen.queryByTestId("slate-headliner")).toBeNull();
  });

  it("hides the bonus section when bonus pool is empty", () => {
    render(<TodaysSlatePanel adapter={{
      ...baseAdapter,
      bonusPlayers: [],
    }} />);
    expect(screen.queryByTestId("slate-bonus")).toBeNull();
    expect(screen.queryByTestId("slate-headliner")).toBeNull();
    // Anchor row still renders.
    expect(screen.getByTestId("thumb-lebron")).toBeTruthy();
  });
});
