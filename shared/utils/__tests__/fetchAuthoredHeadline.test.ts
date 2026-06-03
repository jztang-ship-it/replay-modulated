// shared/utils/__tests__/fetchAuthoredHeadline.test.ts
//
// Phase 3 step 1 fallback gates (lock §"Fallback"). The wrapper around
// /api/headline must NEVER throw and must return null on every failure
// path so the caller can fall back to today's bank pick. Create is
// never blocked.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAuthoredHeadline } from "../fetchAuthoredHeadline";
import type { CommentaryFacts } from "@shared/commentary/commentaryFacts";

const FACTS: CommentaryFacts = {
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
    statLine: { pts: 48 },
    opponent: "CHI",
    homeAway: "H",
    date: "2009-02-22",
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchAuthoredHeadline — happy path", () => {
  it("returns the trimmed string from { headline } on 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ headline: "  Wade goes nuclear  ", source: "stub" }),
    } as any)));
    const r = await fetchAuthoredHeadline(FACTS);
    expect(r).toBe("Wade goes nuclear");
  });

  it("POSTs the facts object verbatim as the body", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ headline: "x" }),
    } as any));
    vi.stubGlobal("fetch", fetchSpy);
    await fetchAuthoredHeadline(FACTS);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/headline");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ facts: FACTS });
  });
});

describe("fetchAuthoredHeadline — fallback paths (always null, never throws)", () => {
  it("returns null on non-200 response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as any)));
    expect(await fetchAuthoredHeadline(FACTS)).toBe(null);
  });

  it("returns null when the server returns headline:null (its own fallback signal)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ headline: null, reason: "apology_sentinel" }),
    } as any)));
    expect(await fetchAuthoredHeadline(FACTS)).toBe(null);
  });

  it("returns null when fetch rejects (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    expect(await fetchAuthoredHeadline(FACTS)).toBe(null);
  });

  it("returns null when json() throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => { throw new SyntaxError("bad json"); },
    } as any)));
    expect(await fetchAuthoredHeadline(FACTS)).toBe(null);
  });

  it("returns null when body is a non-object", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => null,
    } as any)));
    expect(await fetchAuthoredHeadline(FACTS)).toBe(null);
  });

  it("returns null when headline is not a string", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ headline: 42 }),
    } as any)));
    expect(await fetchAuthoredHeadline(FACTS)).toBe(null);
  });

  it("returns null when headline is an empty / whitespace string", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ headline: "   " }),
    } as any)));
    expect(await fetchAuthoredHeadline(FACTS)).toBe(null);
  });

  it("never throws synchronously even when fetch is missing entirely", async () => {
    vi.stubGlobal("fetch", undefined as any);
    expect(await fetchAuthoredHeadline(FACTS)).toBe(null);
  });
});
