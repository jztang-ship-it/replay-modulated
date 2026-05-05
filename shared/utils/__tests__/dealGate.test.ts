import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { getDealPool } from "../dealGate";
import { _resetSlateCache } from "../slateSelector";

// Note on test mechanism:
// The plan suggested mutating `(import.meta as any).env` directly, but in
// vitest's node mode each module gets its own pre-resolved `import.meta.env`
// and cross-module mutation does NOT propagate to `isSlateV2Enabled`.
// `vi.stubEnv` reliably mutates `process.env`, which `isSlateV2Enabled`
// consults as a fallback (per the dual-source adaptation in Task 11).
// Same 4 semantic cases; correct mechanism for this runtime.

const FULL_POOL = [
  { basePlayerId: "a" },
  { basePlayerId: "b" },
  { basePlayerId: "c" },
  { basePlayerId: "d" },
  { basePlayerId: "e" },
] as any;

function makeAdapter(sportKey: string) {
  return {
    sportKey,
    rosterSize: 1,
    config: { slateSize: 3, anchorCount: 0, weightExponent: 1.0 },
    getAnchors: () => [],
    getCareerFPById: () => 1,
    getEligiblePool: () => ["a", "b", "c"],
    getThemedEligibility: () => null,
    getExclusionList: () => [],
  } as any;
}

describe("getDealPool", () => {
  beforeEach(() => {
    _resetSlateCache();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns full pool unchanged when flag is OFF", () => {
    const out = getDealPool(makeAdapter("x"), FULL_POOL);
    expect(out).toEqual(FULL_POOL);
  });

  it("returns full pool when bypassSlate=true regardless of flag", () => {
    vi.stubEnv("VITE_FEATURE_SLATE_V2_X", "true");
    const out = getDealPool(makeAdapter("x"), FULL_POOL, { bypassSlate: true });
    expect(out).toEqual(FULL_POOL);
  });

  it("filters to slate intersection when flag is ON and no bypass", () => {
    vi.stubEnv("VITE_FEATURE_SLATE_V2_X", "true");
    const out = getDealPool(makeAdapter("x"), FULL_POOL);
    const ids = out.map((p: any) => p.basePlayerId).sort();
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("only includes players in the slate AND in fullPool (intersection semantics)", () => {
    vi.stubEnv("VITE_FEATURE_SLATE_V2_X", "true");
    const partialPool = [{ basePlayerId: "a" }, { basePlayerId: "z" }] as any;
    const out = getDealPool(makeAdapter("x"), partialPool);
    expect(out.map((p: any) => p.basePlayerId)).toEqual(["a"]);
  });
});
