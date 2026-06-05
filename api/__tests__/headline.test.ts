/**
 * api/__tests__/headline.test.ts
 *
 * Phase 3 step 2 gates for the headline endpoint (lock: docs/challenge-
 * landing-v2-phase3-authored-voice-engine-lock.md §"Test / acceptance
 * gates"). Pins:
 *   - Validators (length, denylist, stray tokens, team-not-in-facts, empty).
 *   - Timeout race + apology-sentinel detection.
 *   - Body shape rejection (missing fields, smuggled venue, default trigger).
 *   - Live generation via routeCommentary (mocked) → "router" source.
 *   - waitUntil wiring (the backgroundWork Promise from the router is
 *     handed to @vercel/functions waitUntil so grading lands in KV).
 *
 * Voice quality is reviewed (eval loop + on-glass), NOT unit-asserted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module-level mocks (set up BEFORE importing the handler) ───────────────
//
// vi.hoisted ensures these registrations run before the dynamic import
// below. The handler module captures these mocked exports at import time.

const { mockRouteCommentary, mockWaitUntil } = vi.hoisted(() => ({
  mockRouteCommentary: vi.fn(),
  mockWaitUntil: vi.fn(),
}));

vi.mock("../_lib/router/llmRouter.js", () => ({
  routeCommentary: mockRouteCommentary,
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: mockWaitUntil,
}));

const mod = await import("../headline.js");
const handler = mod.default;
const { validateHeadline, withTimeout, generateHeadline } = mod;

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
    winTier: "ALL_STAR",
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

beforeEach(() => {
  mockRouteCommentary.mockReset();
  mockWaitUntil.mockReset();
  // Default the env so buildRouterConfig doesn't throw. Individual
  // tests can override / delete to exercise the throw branch.
  process.env.COMMENTARY_API_KEY = "test-anthropic-key";
});

describe("api/headline — method gate", () => {
  it("rejects non-POST with 405", async () => {
    const { req, res } = makeReqRes({ facts: factsRarePullWade() }, "GET");
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it("does NOT require auth in v1 (anonymous OAuth-resume path needs it)", async () => {
    mockRouteCommentary.mockResolvedValueOnce({
      commentary: "Wade hangs 48 on CHI, again.",
      tone: "observational",
      modelUsed: "claude-haiku-4-5",
      source: "router",
    });
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

describe("api/headline — live generation success path", () => {
  it("returns the model's headline through the validator on clean output", async () => {
    mockRouteCommentary.mockResolvedValueOnce({
      commentary: "Wade hangs 48 on CHI on his birthday.",
      tone: "observational",
      modelUsed: "claude-haiku-4-5",
      source: "router",
    });
    const { req, res } = makeReqRes({ facts: factsRarePullWade() });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.payload.headline).toBe("Wade hangs 48 on CHI on his birthday.");
    expect(res.payload.source).toBe("router");
  });

  it("threads winTier from facts onto the router tier argument", async () => {
    mockRouteCommentary.mockResolvedValueOnce({
      commentary: "Clean line.",
      tone: "observational",
      modelUsed: "claude-haiku-4-5",
      source: "router",
    });
    const { req, res } = makeReqRes({ facts: { ...factsRarePullWade(), winTier: "MVP" } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    // 3rd arg of routeCommentary is the tier.
    expect(mockRouteCommentary).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "MVP",
      expect.any(Object),
    );
  });

  it("defaults to STARTER tier when facts omit winTier", async () => {
    mockRouteCommentary.mockResolvedValueOnce({
      commentary: "Clean line.",
      tone: "observational",
      modelUsed: "claude-haiku-4-5",
      source: "router",
    });
    const noTier = factsRarePullWade();
    delete noTier.winTier;
    const { req, res } = makeReqRes({ facts: noTier });
    await handler(req, res);
    expect(mockRouteCommentary).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "STARTER",
      expect.any(Object),
    );
  });

  it("passes the backgroundWork promise to waitUntil so grading survives response-send", async () => {
    const bgWork = Promise.resolve();
    mockRouteCommentary.mockResolvedValueOnce({
      commentary: "Clean line.",
      tone: "observational",
      modelUsed: "claude-haiku-4-5",
      source: "router",
      backgroundWork: bgWork,
    });
    const { req, res } = makeReqRes({ facts: factsRarePullWade() });
    await handler(req, res);
    expect(mockWaitUntil).toHaveBeenCalledWith(bgWork);
  });
});

describe("api/headline — apology sentinel & validation failures", () => {
  it("treats the apology sentinel as failure → headline:null + apology_sentinel reason", async () => {
    mockRouteCommentary.mockResolvedValueOnce({
      commentary: "Off night. The numbers don't lie.",
      tone: "observational",
      modelUsed: "claude-haiku-4-5",
      source: "router",
    });
    const { req, res } = makeReqRes({ facts: factsRarePullWade() });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.payload.headline).toBeNull();
    expect(res.payload.reason).toBe("apology_sentinel");
  });

  it("returns null with validation reason on team-not-in-facts violation", async () => {
    mockRouteCommentary.mockResolvedValueOnce({
      commentary: "Wade goes off at NYK.",
      tone: "observational",
      modelUsed: "claude-haiku-4-5",
      source: "router",
    });
    const { req, res } = makeReqRes({ facts: factsRarePullWade() });
    await handler(req, res);
    expect(res.payload.headline).toBeNull();
    expect(res.payload.reason).toMatch(/validation:team_not_in_facts/);
  });

  it("returns generator_error when env is missing (no Anthropic key)", async () => {
    delete process.env.COMMENTARY_API_KEY;
    const { req, res } = makeReqRes({ facts: factsRarePullWade() });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.payload.headline).toBeNull();
    expect(res.payload.reason).toBe("generator_error");
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
    expect(validateHeadline("Wade kept the diet tight", facts).ok).toBe(true);
  });

  it("rejects team codes not present in facts (anchor.team / opponent)", () => {
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
    const start = Date.now();
    await withTimeout(Promise.resolve("done"), 60_000);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe("generateHeadline — composes VOICE_CONTRACT + routes", () => {
  it("passes a non-empty system + user prompt into routeCommentary", async () => {
    mockRouteCommentary.mockResolvedValueOnce({
      commentary: "x",
      tone: "observational",
      modelUsed: "claude-haiku-4-5",
      source: "router",
    });
    await generateHeadline(factsRarePullWade());
    expect(mockRouteCommentary).toHaveBeenCalledOnce();
    const [system, user] = mockRouteCommentary.mock.calls[0];
    // Phase 4 Pass 2 §B retired the "CHAD'S VOICE" / Norman Chad
    // named-commentator framing in favor of "COMMENTARY VOICE —
    // REPLAYMOD STANDARD". Assert against the distinctive stable
    // portion so cosmetic ═══ padding changes don't re-break this.
    expect(system).toContain("COMMENTARY VOICE — REPLAYMOD STANDARD");
    expect(system).toContain("═══ SURFACE: CHALLENGE HEADLINE");
    expect(system).toContain("game is from season 0809");
    expect(user).toContain("SEASON: 0809");
    expect(user).toContain("VERDICT: credited");
    expect(user).toContain("name: Dwyane Wade");
  });

  it("returns the router's commentary verbatim as `raw`", async () => {
    mockRouteCommentary.mockResolvedValueOnce({
      commentary: "Wade does the thing.",
      tone: "observational",
      modelUsed: "claude-haiku-4-5",
      source: "router",
    });
    const r = await generateHeadline(factsRarePullWade());
    expect(r.raw).toBe("Wade does the thing.");
    expect(r.modelUsed).toBe("claude-haiku-4-5");
  });
});
