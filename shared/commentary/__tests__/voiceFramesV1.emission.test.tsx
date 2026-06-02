// @vitest-environment jsdom
//
// Voice frames v1 — emission gate against the REAL selectors + renderer.
//
// Standing rule (Path A scar tissue): propagation-only tests are insufficient
// for the recipient intro. These tests drive selectRecipientIntro +
// selectRecipientDealNudge with constructed ChallengeCtx-shape inputs,
// iterate enough times to exercise the local pickWithAntiRepeat rotation
// across every bank line in each route, and assert:
//   (a) the resulting string is non-empty;
//   (b) after substituteRecipientLine no orphan "{...}" tokens remain
//       (catches token typos like {challengername} that grep would miss);
//   (c) StampToken tier sentinels resolve to a concrete tier or are stripped
//       to undefined (so the renderer can fall back to context props);
//   (d) PartsLine renders the picked Line without throwing.
//
// Coverage matrix:
//   choke / big_score / rare_pull × {culture / anchor-only / no-anchor}
//   miss × {with-gap / generic}
//   default
//   legacy (no triggerType)
//   Stage 1 (selectRecipientIntro) AND Stage 2 (selectRecipientDealNudge)

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  selectRecipientIntro,
  selectRecipientDealNudge,
  type RecipientIntroAnchor,
  type Line,
  type StampToken,
} from "../chadChallenge";
import { PartsLine } from "../../components/TierGauge";

// ── Fixture builders ────────────────────────────────────────────────────

function fakeCulture(over: any = {}): any {
  return {
    nicknames: over.nicknames ?? [],
    overperform: over.overperform ?? ["The kind of night where the math nerds go quiet."],
    underperform: over.underperform ?? ["The shot selection that works in January betrays him in May."],
    controversy: over.controversy ?? ["Never made it past the second round as the main guy."],
    signatureGames: over.signatureGames,
    milestones: over.milestones ?? ["Six All-Star appearances. The mid-range got him there."],
    streakLines: over.streakLines ?? ["When he's hot, every eighteen-footer looks automatic."],
  };
}

function anchorWithCulture(over: Partial<RecipientIntroAnchor> = {}): RecipientIntroAnchor {
  return {
    name: "DeRozan",
    basePlayerId: "201942",
    team: "SAC",
    tier: "RED",
    actualFp: 79.8,
    projectedFp: 50,
    wasHeld: true,
    salary: 70,
    gameInfo: { date: "2023-03-17", opponent: "MIN" },
    culture: fakeCulture(),
    topGameTier: "season",
    ...over,
  };
}

function anchorWithoutCulture(over: Partial<RecipientIntroAnchor> = {}): RecipientIntroAnchor {
  return { ...anchorWithCulture({ culture: null, ...over }), culture: null };
}

// ── Assertion helpers ──────────────────────────────────────────────────

function strings(line: Line): string {
  return line.filter((p): p is string => typeof p === "string").join("");
}
function stamps(line: Line): StampToken[] {
  return line.filter((p): p is StampToken => typeof p !== "string");
}

/** Assert no orphan "{...}" token survived substitution. Tolerates contractions
 *  like `'s` since the substitution preserves them. The check fires on ANY
 *  `{word}` pattern. */
function expectNoOrphanTokens(line: Line, context: string) {
  const text = strings(line);
  // Pattern: literal '{' followed by letters/digits, then '}'. Catches
  // {name} / {challengerName} / {targetScore} / {cultureLine} / {nearMissGap}
  // / {nearMissNextTier} / typos like {challengername}.
  const matches = text.match(/\{[a-zA-Z0-9_]+\}/g);
  if (matches) {
    throw new Error(`Orphan token(s) in ${context}: ${matches.join(", ")} — text="${text}"`);
  }
  expect(matches).toBeNull();
}

/** Assert StampToken tier sentinels are resolved or stripped. The substitution
 *  layer (substituteRecipientLine) either substitutes the sentinel with a real
 *  tier string OR strips it to undefined (so the renderer can fall back to
 *  context). Either is acceptable; an un-substituted "{rarePullTier}" /
 *  "{nearMissNextTier}" literal sentinel is a failure. */
function expectStampSentinelsResolved(line: Line, context: string) {
  for (const stamp of stamps(line)) {
    if (typeof stamp.tier === "string" && stamp.tier.startsWith("{")) {
      throw new Error(`Unresolved stamp tier sentinel in ${context}: ${stamp.tier}`);
    }
  }
}

/** Assert PartsLine renders the Line without throwing. Mounts in jsdom; rush
 *  to avoid Typewriter async timing. */
function expectRendersClean(line: Line, context: string, winTier?: string, missTier?: string) {
  try {
    const { container, unmount } = render(
      <PartsLine
        parts={line}
        rush={true}
        winTier={winTier}
        missTier={missTier}
        style={{ fontSize: 22 }}
      />,
    );
    // Non-empty mount.
    expect(container.children.length).toBeGreaterThan(0);
    unmount();
  } catch (e) {
    throw new Error(`PartsLine threw rendering ${context}: ${(e as Error).message}`);
  }
}

/** Run a single (selector, args) pair N times, exhaustively asserting all
 *  gates per pull. N=20 walks the local 8-deep pickWithAntiRepeat ring
 *  several times so every bank line is exercised. */
function emissionGate(
  label: string,
  selector: () => Line,
  N: number,
  winTier?: string,
  missTier?: string,
) {
  for (let i = 0; i < N; i++) {
    const line = selector();
    expect(strings(line).length).toBeGreaterThan(0);
    expectNoOrphanTokens(line, `${label} pull ${i}`);
    expectStampSentinelsResolved(line, `${label} pull ${i}`);
    expectRendersClean(line, `${label} pull ${i}`, winTier, missTier);
  }
}

// ── Stage 1 (selectRecipientIntro) — anchor-bearing routes ─────────────

describe("Voice frames v1 — Stage 1 anchor-bearing emission", () => {
  for (const trigger of ["choke", "big_score", "rare_pull"] as const) {
    it(`${trigger} × culture-resolves → CULTURE bank emission gates`, () => {
      emissionGate(
        `${trigger}.culture`,
        () => selectRecipientIntro({
          triggerType: trigger,
          challengerName: "Mike",
          targetScore: 142.5,
          anchor: anchorWithCulture(),
        }),
        20,
        "MVP",       // winTier for win_tier stamp fallback
        undefined,
      );
    });

    it(`${trigger} × no-culture anchor → NAME bank emission gates`, () => {
      emissionGate(
        `${trigger}.name`,
        () => selectRecipientIntro({
          triggerType: trigger,
          challengerName: "Mike",
          targetScore: 142.5,
          anchor: anchorWithoutCulture(),
        }),
        20,
        "MVP",
        undefined,
      );
    });

    it(`${trigger} × no anchor → GENERIC bank emission gates`, () => {
      emissionGate(
        `${trigger}.generic`,
        () => selectRecipientIntro({
          triggerType: trigger,
          challengerName: "Mike",
          targetScore: 142.5,
          anchor: null,
        }),
        20,
        "MVP",
        undefined,
      );
    });
  }
});

// ── Stage 1 — miss + default + legacy ───────────────────────────────────

describe("Voice frames v1 — Stage 1 miss/default/legacy emission", () => {
  it("miss with gap → MISS_WITH_GAP gates + miss stamp tier substituted", () => {
    for (let i = 0; i < 20; i++) {
      const line = selectRecipientIntro({
        triggerType: "miss",
        challengerName: "Mike",
        targetScore: 150,
        anchor: null,
        nearMissGap: 8,
        nearMissNextTier: "MVP",
      });
      expectNoOrphanTokens(line, `miss.withGap pull ${i}`);
      expectStampSentinelsResolved(line, `miss.withGap pull ${i}`);
      const miss = stamps(line).find(s => s.stamp === "miss");
      // Either substituted to "MVP" (sentinel path) OR undefined (renderer
      // falls back to missTier prop). Both shapes are acceptable.
      if (miss?.tier !== undefined) {
        expect(miss?.tier).toBe("MVP");
      }
      expectRendersClean(line, `miss.withGap pull ${i}`, undefined, "MVP");
    }
  });

  it("miss without gap → MISS_GENERIC gates + no invented gap", () => {
    for (let i = 0; i < 15; i++) {
      const line = selectRecipientIntro({
        triggerType: "miss",
        challengerName: "Mike",
        targetScore: 150,
        anchor: null,
        nearMissGap: null,
        nearMissNextTier: null,
      });
      const text = strings(line);
      expectNoOrphanTokens(line, `miss.generic pull ${i}`);
      // Critical: MISS_GENERIC must not invent a numeric gap. No "8 FP" etc.
      expect(text).not.toMatch(/\d+\s+FP/);
      expectRendersClean(line, `miss.generic pull ${i}`);
    }
  });

  it("default → DEFAULT bank gates", () => {
    emissionGate(
      "default",
      () => selectRecipientIntro({
        triggerType: "default",
        challengerName: "Mike",
        targetScore: 150,
        anchor: null,
      }),
      15,
    );
  });

  it("legacy (no triggerType) → chadChallengeIntro single-string Line", () => {
    for (let i = 0; i < 10; i++) {
      const line = selectRecipientIntro({
        triggerType: null,
        challengerName: "Mike",
        targetScore: 175,
        anchor: null,
      });
      expect(line.length).toBe(1);
      expect(typeof line[0]).toBe("string");
      expectNoOrphanTokens(line, `legacy pull ${i}`);
      expectRendersClean(line, `legacy pull ${i}`);
    }
  });
});

// ── Stage 2 (selectRecipientDealNudge) ─────────────────────────────────

describe("Voice frames v1 — Stage 2 (deal nudge) emission across every route", () => {
  for (const trigger of ["choke", "big_score", "rare_pull"] as const) {
    it(`${trigger} × culture → CULTURE nudge gates`, () => {
      emissionGate(
        `nudge.${trigger}.culture`,
        () => selectRecipientDealNudge({
          triggerType: trigger,
          challengerName: "Mike",
          targetScore: 142.5,
          anchor: anchorWithCulture(),
        }),
        20,
        "ALL_STAR",
      );
    });

    it(`${trigger} × no-culture anchor → NAME nudge gates`, () => {
      emissionGate(
        `nudge.${trigger}.name`,
        () => selectRecipientDealNudge({
          triggerType: trigger,
          challengerName: "Mike",
          targetScore: 142.5,
          anchor: anchorWithoutCulture(),
        }),
        20,
        "ALL_STAR",
      );
    });

    it(`${trigger} × no anchor → GENERIC nudge gates`, () => {
      emissionGate(
        `nudge.${trigger}.generic`,
        () => selectRecipientDealNudge({
          triggerType: trigger,
          challengerName: "Mike",
          targetScore: 142.5,
          anchor: null,
        }),
        20,
        "ALL_STAR",
      );
    });
  }

  it("nudge miss → NUDGE_MISS gates", () => {
    emissionGate(
      "nudge.miss",
      () => selectRecipientDealNudge({
        triggerType: "miss",
        challengerName: "Mike",
        targetScore: 150,
        anchor: null,
      }),
      15,
    );
  });

  it("nudge default + legacy → NUDGE_DEFAULT gates", () => {
    emissionGate(
      "nudge.default",
      () => selectRecipientDealNudge({
        triggerType: "default",
        challengerName: "Mike",
        targetScore: 100,
        anchor: null,
      }),
      15,
    );
    // Stage 2 collapses legacy (no triggerType) into NUDGE_DEFAULT — same gate.
    emissionGate(
      "nudge.legacy",
      () => selectRecipientDealNudge({
        triggerType: null,
        challengerName: "Mike",
        targetScore: 100,
        anchor: null,
      }),
      15,
    );
  });
});

// ── Stamp tier label resolution — rare_pull sub-tiers ──────────────────

describe("Voice frames v1 — rare_pull tier sentinel substitution", () => {
  for (const tier of ["record", "career", "season"] as const) {
    it(`rare_pull anchor with topGameTier="${tier}" substitutes into stamps`, () => {
      // Stage 1 CULTURE bank: every line carries a rare_pull stamp with the
      // {rarePullTier} sentinel, so substitution is deterministic per pull.
      for (let i = 0; i < 12; i++) {
        const line = selectRecipientIntro({
          triggerType: "rare_pull",
          challengerName: "Mike",
          targetScore: 280,
          anchor: anchorWithCulture({ topGameTier: tier }),
        });
        const rare = stamps(line).find(s => s.stamp === "rare_pull");
        expect(rare).toBeDefined();
        expect(rare?.tier).toBe(tier);
        expectNoOrphanTokens(line, `rare_pull.${tier} pull ${i}`);
        expectRendersClean(line, `rare_pull.${tier} pull ${i}`);
      }
    });
  }
});
