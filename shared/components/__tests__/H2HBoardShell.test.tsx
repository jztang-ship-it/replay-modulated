// @vitest-environment jsdom
/**
 * shared/components/__tests__/H2HBoardShell.test.tsx
 *
 * Smoke test for the shared framed-board shell that hosts both
 * H2HRecipientPlay (states 1–3) and H2HRevealScreen (state 4).
 * Locked by doc e6fe662 EDIT B1–B5: same board across all states.
 *
 * JSDOM doesn't compute layout — these are STRUCTURAL assertions
 * (zone markers present, labels render, slots mount). Layout
 * assertions live in scripts/verify-h2h-play-layout.mjs (real browser).
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { H2HBoardShell, ZonePanel, ZoneHeader } from "../H2HBoardShell";

describe("H2HBoardShell — chrome smoke", () => {
  it("renders both labels", () => {
    const { getByText } = render(
      <H2HBoardShell
        topLabel="Mike"
        bottomLabel="John Tang"
        topStrip={<div data-testid="t" />}
        bottomStrip={<div data-testid="b" />}
        hero={<div data-testid="h" />}
      />
    );
    expect(getByText("Mike")).toBeTruthy();
    expect(getByText("John Tang")).toBeTruthy();
  });

  it("emits stable zone markers (top, bottom, hero)", () => {
    const { container } = render(
      <H2HBoardShell
        topLabel="Mike"
        bottomLabel="You"
        topStrip={<div />}
        bottomStrip={<div />}
        hero={<div />}
      />
    );
    expect(container.querySelector(`[data-h2h-board-zone="top"]`)).not.toBeNull();
    expect(container.querySelector(`[data-h2h-board-zone="bottom"]`)).not.toBeNull();
    expect(container.querySelector(`[data-h2h-board-zone="hero"]`)).not.toBeNull();
  });

  it("renders the three content slots", () => {
    const { getByTestId } = render(
      <H2HBoardShell
        topLabel="Mike"
        bottomLabel="You"
        topStrip={<div data-testid="top-slot">TOP</div>}
        bottomStrip={<div data-testid="bottom-slot">BOTTOM</div>}
        hero={<div data-testid="hero-slot">HERO</div>}
      />
    );
    expect(getByTestId("top-slot").textContent).toBe("TOP");
    expect(getByTestId("bottom-slot").textContent).toBe("BOTTOM");
    expect(getByTestId("hero-slot").textContent).toBe("HERO");
  });

  it("renders the belowBoard slot inside the reserved-bottom region", () => {
    const { getByTestId, container } = render(
      <H2HBoardShell
        topLabel="Mike"
        bottomLabel="You"
        topStrip={<div />}
        bottomStrip={<div />}
        hero={<div />}
        belowBoard={<div data-testid="cta">CTA</div>}
      />
    );
    expect(getByTestId("cta")).toBeTruthy();
    const reserved = container.querySelector(`[data-h2h-reserved-bottom]`);
    expect(reserved?.contains(getByTestId("cta"))).toBe(true);
  });

  it("spreads rootDataAttrs onto the outer root div", () => {
    const { container } = render(
      <H2HBoardShell
        topLabel="Mike"
        bottomLabel="You"
        topStrip={<div />}
        bottomStrip={<div />}
        hero={<div />}
        rootDataAttrs={{
          "data-h2h-recipient-play": "true",
          "data-playing-state": "pre_deal",
        }}
      />
    );
    const root = container.querySelector(`[data-h2h-recipient-play]`);
    expect(root).not.toBeNull();
    expect(root?.getAttribute("data-playing-state")).toBe("pre_deal");
    // Same element carries the shell's own marker.
    expect(root?.getAttribute("data-h2h-board-shell")).toBe("true");
  });

  it("compositeOverlay mounts INSIDE the shell outer root (descendant for Fix C2)", () => {
    const { container } = render(
      <H2HBoardShell
        topLabel="Mike"
        bottomLabel="You"
        topStrip={<div />}
        bottomStrip={<div />}
        hero={<div />}
        rootDataAttrs={{ "data-h2h-recipient-play": "true" }}
        compositeOverlay={<div data-h2h-recipient-reveal="true" />}
      />
    );
    const playing = container.querySelector(`[data-h2h-recipient-play]`);
    const reveal = container.querySelector(`[data-h2h-recipient-reveal]`);
    expect(playing).not.toBeNull();
    expect(reveal).not.toBeNull();
    expect(playing?.contains(reveal)).toBe(true);
  });

  it("innerOpacity sets opacity + pointerEvents on the inner column", () => {
    const { container } = render(
      <H2HBoardShell
        topLabel="Mike"
        bottomLabel="You"
        topStrip={<div />}
        bottomStrip={<div />}
        hero={<div />}
        innerOpacity={0}
        innerTransitionMs={250}
        innerDataAttr="data-h2h-play-inner"
      />
    );
    const inner = container.querySelector(`[data-h2h-play-inner]`) as HTMLElement;
    expect(inner).not.toBeNull();
    expect(inner.style.opacity).toBe("0");
    expect(inner.style.pointerEvents).toBe("none");
  });
});

describe("ZonePanel + ZoneHeader — reused outside the shell", () => {
  it("ZonePanel renders the data-h2h-board-zone marker", () => {
    const { container } = render(
      <ZonePanel zone="top">
        <div>x</div>
      </ZonePanel>
    );
    expect(container.querySelector(`[data-h2h-board-zone="top"]`)).not.toBeNull();
  });

  it("ZoneHeader renders the label text", () => {
    const { getByText } = render(<ZoneHeader label="Mike" />);
    expect(getByText("Mike")).toBeTruthy();
  });
});
