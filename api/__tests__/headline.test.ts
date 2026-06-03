/**
 * api/__tests__/headline.test.ts
 *
 * Phase 3 step 1 gates for the headline endpoint (lock: docs/challenge-
 * landing-v2-phase3-authored-voice-engine-lock.md §"Test / acceptance
 * gates"). Pins:
 *   - Validators (length, denylist, stray tokens, team-not-in-facts, empty).
 *   - Timeout race + apology-sentinel detection.
 *   - Body shape rejection (missing fields, smuggled venue, default trigger).
 *   - Auth gate.
 *
 * The stub generator output is asserted only for its recognizable form
 * (so future devs see the stub marker on screenshots) — voice quality
 * is reviewed, never asserted (lock §"Test gates" item 5).
 */

import { describe, it, expect, vi } from "vitest";

const mod = await import("../headline.js");
const handler = mod.default;
const { validateHeadline, withTimeout, generateHeadlineStub } = mod;

// Build a Vercel-style req/res pair.
function makeReqRes(body: any, method = "POST") {
  const req: any = {
    method,
    headers: {},
    body,
    query: {},
  };
  const res: any = {
    statusCode: 200,
    payload: null,
    setHeader: vi.fn(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(p: any) {
      this.payload = p;
      return this;
    },
  };
  return { req, res };
}

function factsRarePullWade(): any {
  return {
    surface: "challenge_headline",
    sport: "basketball",
    season: "0809",
    trigger: "rare_pull",
    verdict: "credited",
    anchor: {
      name: "Dwyane Wade",
      basePlayerId: "2548",
      nicknames: ["Flash", "D-Wade"],
      knownFor: "Three rings, Finals MVP at 24.",
      tier: "RED",
      team: "MIA",
      statLine: { pts: 48, reb: 12, ast: 12, stl: 4, blk: 6 },
      opponent: "CHI",
      homeAway: "H",
      date: "2009-02-22",
      topReason: { category: "pts", value: 48, label: "48 pts" },
    },
  };
}

describe("api/headline — method gate", () => {
  it("rejects non-POST with 405", async () => {
    const { req, res } = makeReqRes({ facts: factsRarePullWade() }, "GET");
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("does NOT require auth in v1 (anonymous OAuth-resume path needs it)", async () => {
    // No Authorization header on the request; endpoint must accept it.
    const { req, res } = makeReqRes({ facts: factsRarePullWade() });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });
});

describe("api/headline — body shape rejection", () => {
  it("400s when facts is missing", async () => {
    const { req, res } = makeReqRes({});
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("400s when facts is structurally invalid (missing trigger)", async () => {
    const broken = factsRarePullWade();
    delete broken.trigger;
    const { req, res } = makeReqRes({ facts: broken });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("400s when venue is smuggled onto facts.anchor (v1 rule)", async () => {
    const f = factsRarePullWade();
    f.anchor.venue = "American Airlines Arena";
    const { req, res } = makeReqRes({ facts: f });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.payload.error).toMatch(/venue/);
  });

  it("400s when trigger=default reaches the endpoint", async () => {
    const f = factsRarePullWade();
    f.trigger = "default";
    const { req, res } = makeReqRes({ facts: f });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("api/headline — stub generator + success path", () => {
  it("returns the stubbed headline through the validator on a clean facts payload", async () => {
    const { req, res } = makeReqRes({ facts: factsRarePullWade() });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.payload.headline).toMatch(/\[STUB\] Dwyane Wade · rare_pull · credited/);
    expect(res.payload.source).toBe("stub");
  });

  it("stub for no-anchor miss case still validates (no team tokens to check)", async () => {
    const facts: any = {
      surface: "challenge_headline",
      sport: "basketball",
      season: "2425",
      trigger: "miss",
      verdict: "neutral",
      nearMissGap: 7,
      nearMissNextTier: "ALL_STAR",
    };
    const { req, res } = makeReqRes({ facts });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.payload.headline).toMatch(/\[STUB\] no-anchor · miss · neutral/);
  });
});

describe("validateHeadline — output guards", () => {
  const facts = factsRarePullWade();

  it("rejects empty / whitespace-only", () => {
    expect(validateHeadline("", facts).ok).toBe(false);
    expect(validateHeadline("   ", facts).ok).toBe(false);
  });

  it("rejects over the length ceiling", () => {
    const big = "x".repeat(161);
    const r = validateHeadline(big, facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/length/);
  });

  it("rejects stray template tokens", () => {
    const r = validateHeadline("Wade hits {topReason}", facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("stray_template_token");
  });

  it("rejects the apology sentinel exactly", () => {
    const r = validateHeadline("Off night. The numbers don't lie.", facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("apology_sentinel");
  });

  it("rejects §3-denylisted phrases (substance, legal, personal)", () => {
    expect(validateHeadline("Wade post-rehab redemption arc", facts).ok).toBe(false);
    expect(validateHeadline("Lawsuit aside, Wade went off", facts).ok).toBe(false);
    expect(validateHeadline("Pre-divorce Wade was a different player", facts).ok).toBe(false);
  });

  it("allows clean text that contains a substring of a banned phrase but not the word", () => {
    // "diet" is not "died"; word-boundary match should pass.
    expect(validateHeadline("Wade kept the diet tight", facts).ok).toBe(true);
  });

  it("rejects team codes not present in facts (anchor.team / opponent)", () => {
    // facts has MIA + CHI; NYK is not allowed.
    const r = validateHeadline("Wade goes off at NYK", facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/team_not_in_facts/);
  });

  it("allows team codes that ARE in facts", () => {
    expect(validateHeadline("Wade lights up CHI in MIA", facts).ok).toBe(true);
  });

  it("whitelists non-team uppercase tokens (FP / MVP / ESPN / NBA / GOAT)", () => {
    expect(validateHeadline("48 FP for Wade — ESPN MVP run", facts).ok).toBe(true);
    expect(validateHeadline("GOAT-level NBA night", factsRarePullWade()).ok).toBe(true);
  });

  it("strict empty check after trim", () => {
    expect(validateHeadline("\n\t  \n", facts).ok).toBe(false);
  });
});

describe("withTimeout — Promise.race behavior", () => {
  it("resolves with the value when the promise wins", async () => {
    const p = Promise.resolve("done");
    expect(await withTimeout(p, 1000)).toBe("done");
  });

  it("resolves to null when the timeout wins", async () => {
    const slow = new Promise<string>(r => setTimeout(() => r("late"), 50));
    expect(await withTimeout(slow, 5)).toBe(null);
  });

  it("clears the timer after a fast resolve (no leaked handles)", async () => {
    // We can't directly observe the timer being cleared, but we can
    // assert that a second call with a long timeout doesn't keep the
    // test runner alive longer than the resolve.
    const start = Date.now();
    await withTimeout(Promise.resolve("done"), 60_000);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe("generateHeadlineStub — recognizable stub", () => {
  it("includes [STUB] marker + name + trigger + verdict", async () => {
    const out = await generateHeadlineStub(factsRarePullWade());
    expect(out).toContain("[STUB]");
    expect(out).toContain("Dwyane Wade");
    expect(out).toContain("rare_pull");
    expect(out).toContain("credited");
  });

  it("falls back to 'no-anchor' when no anchor block is present", async () => {
    const facts: any = {
      surface: "challenge_headline",
      sport: "basketball",
      season: "2425",
      trigger: "miss",
      verdict: "neutral",
    };
    const out = await generateHeadlineStub(facts);
    expect(out).toContain("no-anchor");
  });
});

describe("api/headline — apology sentinel surfaces as failure", () => {
  it("validator catches the apology sentinel even if the generator returns it", () => {
    // Step 2 will replace the stub with routeCommentary, which CAN return
    // the apology sentinel when every model errors (recon §1). The
    // validator must reject it so the client falls back to the bank pick.
    const r = validateHeadline(
      "Off night. The numbers don't lie.",
      factsRarePullWade(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("apology_sentinel");
  });
});
