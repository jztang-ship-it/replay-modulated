// @vitest-environment jsdom
// shared/hooks/__tests__/useCardFlipState.test.ts
//
// Map-contract for dealRound — the root fix for the held-card transient-BACK
// regression. dealRound re-deals a round PRESERVING held cards' FRONT (held →
// FRONT, others → BACK, stale ids dropped), so a reroll never evicts/blinks kept
// cards. The on-device no-blink is glass; the phase-map contract is unit-testable.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCardFlipState } from "../useCardFlipState";

// Settle a hand to "all FRONT" (deal → reveal → complete), the state a round
// reroll starts from.
function settleFront(api: ReturnType<typeof useCardFlipState>, ids: string[]) {
  api.initCards(ids);
  ids.forEach((id) => api.revealCard(id));
  ids.forEach((id) => api.completeReveal(id));
}

describe("useCardFlipState.dealRound — re-deal preserving held FRONT", () => {
  it("held → FRONT (not evicted), unheld → BACK, stale ids dropped", () => {
    const { result } = renderHook(() => useCardFlipState());
    act(() => settleFront(result.current, ["a", "b", "c"]));

    // hold "a"; "b"/"c" replaced by new "d"/"e"
    act(() => { result.current.dealRound(["a", "d", "e"], ["a"]); });

    expect(result.current.isFront("a")).toBe(true);   // held kept FRONT
    expect(result.current.isBack("a")).toBe(false);   // NOT evicted to default BACK
    expect(result.current.isBack("d")).toBe(true);    // new replacement → BACK (ready to reveal)
    expect(result.current.isBack("e")).toBe(true);
    expect(result.current.getPhase("b")).toBe("BACK"); // stale "b" dropped → default
    expect(result.current.getPhase("c")).toBe("BACK");
  });

  it("contrast: initCards(subset) evicts held to default BACK — the regression dealRound fixes", () => {
    const { result } = renderHook(() => useCardFlipState());
    act(() => settleFront(result.current, ["a", "b"]));

    // the OLD buggy loop pattern: initCards on ONLY the unheld → held "a" evicted
    act(() => { result.current.initCards(["b"]); });
    expect(result.current.isBack("a")).toBe(true); // held "a" reads BACK (the transient-BACK)

    // dealRound is the correct primitive — held stays FRONT
    act(() => { result.current.dealRound(["a", "b"], ["a"]); });
    expect(result.current.isFront("a")).toBe(true);
    expect(result.current.isBack("b")).toBe(true);
  });

  it("all-held → all FRONT; none-held → all BACK", () => {
    const { result } = renderHook(() => useCardFlipState());
    act(() => { result.current.dealRound(["a", "b"], ["a", "b"]); });
    expect(result.current.isFront("a")).toBe(true);
    expect(result.current.isFront("b")).toBe(true);

    act(() => { result.current.dealRound(["a", "b"], []); });
    expect(result.current.isBack("a")).toBe(true);
    expect(result.current.isBack("b")).toBe(true);
  });
});
