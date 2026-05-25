import { describe, it, expect } from "vitest";
import { TeamStamp } from "../TeamStamp";

// These tests use the call-as-function style (no React renderer) — the
// component is a pure functional element with no hooks, so its return
// value can be asserted structurally. Outer span is the thud wrapper;
// inner span is the chip.

function asElement(v: ReturnType<typeof TeamStamp>) {
  return v as any;
}

describe("TeamStamp — bad_beat", () => {
  it("renders 'BAD BEAT' label", () => {
    const el = asElement(TeamStamp({ kind: "bad_beat" }));
    expect(el).not.toBeNull();
    expect(el.props.children.props.children).toBe("BAD BEAT");
  });

  it("applies the bad-beat chip class on the inner chip", () => {
    const el = asElement(TeamStamp({ kind: "bad_beat" }));
    expect(el.props.children.props.className).toContain("ts-stamp-bad-beat");
  });

  it("applies the thud animation class on the wrapper (slanted entrance)", () => {
    const el = asElement(TeamStamp({ kind: "bad_beat" }));
    // The slant + thud are delivered via the tsTeamStampThud keyframes;
    // the wrapper class .ts-stamp-wrap-thud is what binds the animation.
    expect(el.props.className).toContain("ts-stamp-wrap-thud");
  });

  it("ignores missTier (bad_beat label is fixed)", () => {
    const el = asElement(TeamStamp({ kind: "bad_beat", missTier: "ALL_STAR" }));
    expect(el.props.children.props.children).toBe("BAD BEAT");
  });
});

describe("TeamStamp — miss (tier-prefixed)", () => {
  it("renders 'ALL STAR MISS' for missTier='ALL STAR'", () => {
    const el = asElement(TeamStamp({ kind: "miss", missTier: "ALL STAR" }));
    expect(el.props.children.props.children).toBe("ALL STAR MISS");
  });

  it("renders 'ALL STAR MISS' for missTier='ALL_STAR' (underscore form)", () => {
    const el = asElement(TeamStamp({ kind: "miss", missTier: "ALL_STAR" }));
    expect(el.props.children.props.children).toBe("ALL STAR MISS");
  });

  it("renders 'MVP MISS' for missTier='MVP'", () => {
    const el = asElement(TeamStamp({ kind: "miss", missTier: "MVP" }));
    expect(el.props.children.props.children).toBe("MVP MISS");
  });

  it("renders 'LEGEND MISS' for missTier='LEGEND'", () => {
    const el = asElement(TeamStamp({ kind: "miss", missTier: "LEGEND" }));
    expect(el.props.children.props.children).toBe("LEGEND MISS");
  });

  it("renders bare 'MISS' when missTier is absent (graceful fallback)", () => {
    const el = asElement(TeamStamp({ kind: "miss" }));
    expect(el.props.children.props.children).toBe("MISS");
  });

  it("renders bare 'MISS' when missTier is undefined (graceful fallback)", () => {
    const el = asElement(TeamStamp({ kind: "miss", missTier: undefined }));
    expect(el.props.children.props.children).toBe("MISS");
  });

  it("renders bare 'MISS' when missTier is an empty string (graceful fallback)", () => {
    const el = asElement(TeamStamp({ kind: "miss", missTier: "" }));
    expect(el.props.children.props.children).toBe("MISS");
  });

  it("applies the miss chip class on the inner chip", () => {
    const el = asElement(TeamStamp({ kind: "miss", missTier: "MVP" }));
    expect(el.props.children.props.className).toContain("ts-stamp-miss");
  });

  it("applies the thud animation class on the wrapper (slanted entrance)", () => {
    const el = asElement(TeamStamp({ kind: "miss", missTier: "MVP" }));
    expect(el.props.className).toContain("ts-stamp-wrap-thud");
  });
});

describe("TeamStamp — graceful degradation", () => {
  it("renders null for null kind", () => {
    expect(TeamStamp({ kind: null as any })).toBe(null);
  });

  it("renders null for undefined kind", () => {
    expect(TeamStamp({ kind: undefined as any })).toBe(null);
  });

  it("renders null for unknown trigger kinds (big_score, rare_pull, default)", () => {
    expect(TeamStamp({ kind: "big_score" as any })).toBe(null);
    expect(TeamStamp({ kind: "rare_pull" as any })).toBe(null);
    expect(TeamStamp({ kind: "default" as any })).toBe(null);
  });

  it("renders null for the old vocabulary 'near_miss' (post-rename hygiene)", () => {
    // Defensive: ensure callers still emitting the legacy string don't
    // produce a stamp. The rename is one-way; old data shouldn't render.
    expect(TeamStamp({ kind: "near_miss" as any })).toBe(null);
  });

  it("renders null for arbitrary string kinds", () => {
    expect(TeamStamp({ kind: "anything" as any })).toBe(null);
  });
});
