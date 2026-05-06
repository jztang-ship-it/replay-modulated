import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { isSlateV2Enabled } from "../featureFlags";

// Note on test mechanism:
// The plan suggested mutating `import.meta.env` directly, but in vitest's
// node mode each module gets its own pre-resolved `import.meta.env` and
// cross-module mutation does NOT propagate. `vi.stubEnv` reliably mutates
// `process.env`, which `isSlateV2Enabled` consults as a fallback. Same
// semantic coverage; correct mechanism for this runtime.
describe("isSlateV2Enabled (dynamic per-sport)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when env var is unset", () => {
    expect(isSlateV2Enabled("basketball")).toBe(false);
  });

  it("returns true when VITE_FEATURE_SLATE_V2_<SPORT> === 'true'", () => {
    vi.stubEnv("VITE_FEATURE_SLATE_V2_BASKETBALL", "true");
    expect(isSlateV2Enabled("basketball")).toBe(true);
  });

  it("returns false when env var is not exactly 'true'", () => {
    vi.stubEnv("VITE_FEATURE_SLATE_V2_BASKETBALL", "1");
    expect(isSlateV2Enabled("basketball")).toBe(false);
    vi.stubEnv("VITE_FEATURE_SLATE_V2_BASKETBALL", "yes");
    expect(isSlateV2Enabled("basketball")).toBe(false);
  });

  it("uppercases sport key when constructing env var name", () => {
    vi.stubEnv("VITE_FEATURE_SLATE_V2_FOOTBALL", "true");
    expect(isSlateV2Enabled("football")).toBe(true);
  });

  it("checks each sport independently", () => {
    vi.stubEnv("VITE_FEATURE_SLATE_V2_BASKETBALL", "true");
    vi.stubEnv("VITE_FEATURE_SLATE_V2_BASEBALL", "false");
    expect(isSlateV2Enabled("basketball")).toBe(true);
    expect(isSlateV2Enabled("baseball")).toBe(false);
  });
});
