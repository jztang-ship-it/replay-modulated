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
});
