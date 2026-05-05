// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlateChip } from "../SlateChip";
import { slateSignature } from "../../hooks/useDailySlate";

describe("SlateChip", () => {
  it("renders the label and player count", () => {
    render(
      <SlateChip label="Slate #145" playerCount={60} sportKey="basketball">
        <div data-testid="panel-content">panel</div>
      </SlateChip>,
    );
    const chip = screen.getByTestId("slate-chip");
    expect(chip.textContent).toMatch(/Slate #145/);
    expect(chip.textContent).toMatch(/60 players/);
  });

  it("does not render the overlay until the chip is tapped", () => {
    render(
      <SlateChip label="Slate #1" playerCount={0}>
        <div data-testid="panel-content">panel</div>
      </SlateChip>,
    );
    expect(screen.queryByTestId("slate-chip-overlay")).toBeNull();
    expect(screen.queryByTestId("panel-content")).toBeNull();
  });

  it("opens the overlay with panel children on click", () => {
    render(
      <SlateChip label="Slate #1" playerCount={42}>
        <div data-testid="panel-content">panel</div>
      </SlateChip>,
    );
    fireEvent.click(screen.getByTestId("slate-chip"));
    expect(screen.getByTestId("slate-chip-overlay")).toBeTruthy();
    expect(screen.getByTestId("panel-content")).toBeTruthy();
  });

  it("closes the overlay via the close button", () => {
    render(
      <SlateChip label="Slate #1" playerCount={42}>
        <div data-testid="panel-content">panel</div>
      </SlateChip>,
    );
    fireEvent.click(screen.getByTestId("slate-chip"));
    expect(screen.getByTestId("slate-chip-overlay")).toBeTruthy();
    fireEvent.click(screen.getByTestId("slate-chip-close"));
    expect(screen.queryByTestId("slate-chip-overlay")).toBeNull();
  });
});

describe("slateSignature helper", () => {
  it("epoch date 2026-01-01 UTC produces Slate #1", () => {
    const sig = slateSignature(new Date(Date.UTC(2026, 0, 1, 12, 0, 0)));
    expect(sig.number).toBe(1);
    expect(sig.label).toBe("Slate #1");
  });

  it("is deterministic across the same UTC date", () => {
    const a = slateSignature(new Date(Date.UTC(2026, 4, 3, 0, 30, 0)));
    const b = slateSignature(new Date(Date.UTC(2026, 4, 3, 23, 30, 0)));
    expect(a.number).toBe(b.number);
  });

  it("increments by 1 each UTC day", () => {
    const day1 = slateSignature(new Date(Date.UTC(2026, 0, 1)));
    const day2 = slateSignature(new Date(Date.UTC(2026, 0, 2)));
    const day100 = slateSignature(new Date(Date.UTC(2026, 0, 1)));
    expect(day2.number - day1.number).toBe(1);
    expect(day100.number).toBe(day1.number);
  });

  it("clamps pre-epoch dates to Slate #1", () => {
    const sig = slateSignature(new Date(Date.UTC(2025, 5, 1)));
    expect(sig.number).toBe(1);
  });
});
