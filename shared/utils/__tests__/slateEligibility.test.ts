import { describe, expect, it } from "vitest";
import { resolveEligibility } from "../slateEligibility";

function makeAdapter(opts: {
  eligible: string[];
  themed?: Record<string, string[] | null>;
  excluded?: string[];
}) {
  return {
    getEligiblePool: () => opts.eligible,
    getThemedEligibility: (k: string) => opts.themed?.[k] ?? null,
    getExclusionList: () => opts.excluded ?? [],
  } as any;
}

describe("resolveEligibility", () => {
  it("returns standard eligibility when themeKey is undefined", () => {
    const a = makeAdapter({ eligible: ["a", "b", "c"] });
    expect(resolveEligibility(a, new Date(), undefined)).toEqual(["a", "b", "c"]);
  });

  it("returns themed eligibility when adapter supports the theme", () => {
    const a = makeAdapter({
      eligible: ["a", "b", "c"],
      themed: { "rookie-only": ["x", "y"] },
    });
    expect(resolveEligibility(a, new Date(), "rookie-only")).toEqual(["x", "y"]);
  });

  it("falls back to standard eligibility when theme is unknown to adapter", () => {
    const a = makeAdapter({ eligible: ["a", "b"], themed: { "rookie-only": null } });
    expect(resolveEligibility(a, new Date(), "rookie-only")).toEqual(["a", "b"]);
  });

  it("subtracts exclusion list from standard eligibility", () => {
    const a = makeAdapter({ eligible: ["a", "b", "c"], excluded: ["b"] });
    expect(resolveEligibility(a, new Date(), undefined)).toEqual(["a", "c"]);
  });

  it("subtracts exclusion list from themed eligibility too", () => {
    const a = makeAdapter({
      eligible: ["a"],
      themed: { rookie: ["x", "y", "z"] },
      excluded: ["y"],
    });
    expect(resolveEligibility(a, new Date(), "rookie")).toEqual(["x", "z"]);
  });
});
