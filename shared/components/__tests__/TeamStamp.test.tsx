import { describe, it, expect } from "vitest";
import { TeamStamp } from "../TeamStamp";

// These tests use the call-as-function style (no React renderer) — the
// component is a pure functional element with no hooks, so its return
// value can be asserted structurally. Outer span is the thud wrapper;
// inner span is the chip.

function asElement(v: ReturnType<typeof TeamStamp>) {
  return v as any;
}

describe("TeamStamp — choke", () => {
  // Phase 1 trigger split (2026-06-03, docs/challenge-landing-v2-phase1-
  // trigger-split-lock.md): the "BAD BEAT" stamp is DELETED. The
  // bad_beat → choke rename moves these to "CHOKE" label + .ts-stamp-
  // choke class. Old "BAD BEAT" stamp must NOT render anywhere — see
  // the assert-the-neighbors test at the bottom of this file.
  it("renders 'CHOKE' label", () => {
    const el = asElement(TeamStamp({ kind: "choke" }));
    expect(el).not.toBeNull();
    expect(el.props.children.props.children).toBe("CHOKE");
  });

  it("applies the choke chip class on the inner chip", () => {
    const el = asElement(TeamStamp({ kind: "choke" }));
    expect(el.props.children.props.className).toContain("ts-stamp-choke");
  });

  it("applies the thud animation class on the wrapper (slanted entrance)", () => {
    const el = asElement(TeamStamp({ kind: "choke" }));
    // The slant + thud are delivered via the tsTeamStampThud keyframes;
    // the wrapper class .ts-stamp-wrap-thud is what binds the animation.
    expect(el.props.className).toContain("ts-stamp-wrap-thud");
  });

  it("ignores missTier (choke label is fixed)", () => {
    const el = asElement(TeamStamp({ kind: "choke", missTier: "ALL_STAR" }));
    expect(el.props.children.props.children).toBe("CHOKE");
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

  // Phase 1 trigger split (2026-06-03): legacy "bad_beat" kind must NOT
  // render. Even a stored legacy row that bypasses normalizeTriggerType
  // shouldn't accidentally paint a stamp.
  it("renders null for the legacy 'bad_beat' kind (Phase 1 — stamp is deleted)", () => {
    expect(TeamStamp({ kind: "bad_beat" as any })).toBe(null);
  });

  it("renders null for arbitrary string kinds", () => {
    expect(TeamStamp({ kind: "anything" as any })).toBe(null);
  });
});

// ── Phase 1 assert-the-neighbors ────────────────────────────────────────
// Lock-mandated: stamp-label LOCKSTEP between TeamStamp and TierGauge,
// AND no surface paints the deleted "BAD BEAT" inline chip. Reading the
// TierGauge source (where INLINE_STAMP_BASE_LABEL lives) directly so the
// invariant holds even if the renderer was refactored: agreement of the
// LABEL STRINGS is the assertion, not the rendered output of any one
// component.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TIER_GAUGE_PATH = resolve(__dirname, "../TierGauge.tsx");

describe("Phase 1 assert-the-neighbors — choke label lockstep, no stray BAD BEAT", () => {
  it("TeamStamp and TierGauge both render 'CHOKE' for the choke stamp (label lockstep)", () => {
    // TeamStamp side: kind='choke' → "CHOKE"
    const teamStampLabel = asElement(TeamStamp({ kind: "choke" }))
      .props.children.props.children;
    expect(teamStampLabel).toBe("CHOKE");

    // TierGauge side: INLINE_STAMP_BASE_LABEL.choke. Read from source
    // since the map is not exported; the regex pulls the exact literal.
    const src = readFileSync(TIER_GAUGE_PATH, "utf8");
    const inlineMap = /INLINE_STAMP_BASE_LABEL[\s\S]*?\}\s*;/.exec(src);
    expect(inlineMap, "INLINE_STAMP_BASE_LABEL must exist in TierGauge.tsx").not.toBeNull();
    const chokeEntry = /choke\s*:\s*"([^"]+)"/.exec(inlineMap![0]);
    expect(chokeEntry, "TierGauge INLINE_STAMP_BASE_LABEL must define 'choke'").not.toBeNull();
    expect(chokeEntry![1]).toBe("CHOKE");

    // Lockstep: the two render the SAME label. If a future change
    // rewords either, this assertion catches the divergence.
    expect(chokeEntry![1]).toBe(teamStampLabel);
  });

  it("neither surface paints 'BAD BEAT' anywhere (deleted facing artifact)", () => {
    // TeamStamp: all valid kinds rendered + the legacy kind for safety.
    // None may produce 'BAD BEAT'.
    const teamStampOutputs = [
      asElement(TeamStamp({ kind: "choke" }))?.props.children.props.children,
      asElement(TeamStamp({ kind: "miss", missTier: "MVP" }))?.props.children.props.children,
      asElement(TeamStamp({ kind: "miss", missTier: "LEGEND" }))?.props.children.props.children,
      asElement(TeamStamp({ kind: "miss" }))?.props.children.props.children,
    ];
    for (const out of teamStampOutputs) {
      expect(String(out)).not.toContain("BAD BEAT");
    }

    // TierGauge: INLINE_STAMP_BASE_LABEL must contain no "BAD BEAT"
    // entry and no .tg-inline-stamp-bad-beat class anywhere in source.
    // The lock's "no surface still paints the deleted BAD BEAT inline
    // chip" — checked structurally.
    const src = readFileSync(TIER_GAUGE_PATH, "utf8");
    expect(src).not.toMatch(/"BAD BEAT"/);
    expect(src).not.toMatch(/tg-inline-stamp-bad-beat\b/);
    expect(src).not.toMatch(/INLINE_STAMP_BASE_LABEL[\s\S]*?bad_beat\s*:/);
  });
});
