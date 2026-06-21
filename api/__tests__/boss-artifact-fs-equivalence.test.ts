// @vitest-environment node
/**
 * api/__tests__/boss-artifact-fs-equivalence.test.ts
 *
 * Phase 2-mount step-2: the OPAQUE-TARGET SEAM + serveable-rotation rule, tested
 * against the REAL committed artifact (bossBank.generated.json).
 *
 * (Supersedes the Phase 2-fix fs-vs-artifact ROLL-equivalence test: the target is
 * no longer rolled at request time — it's a baked opaque value read from the
 * artifact, so the old roll-parity pin is obsolete. The byte-identical roll
 * determinism it pinned still lives in boss-fp-parity + the contract's
 * projectSenderFacing tests.)
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../hand/_lib/supabaseServer.js", () => ({ supabaseAdmin: {}, supabaseAuth: {} }));

import { resolveBossForDate } from "../boss/_lib/ensureDailyInstance.ts";

const DATES = ["2026-06-22", "2026-08-01", "2026-09-15", "2026-12-25", "2027-03-10"];

describe("opaque-target seam — resolveBossForDate reads baked, serveable bosses", () => {
  it("only ever resolves SERVEABLE bosses (a baked opaque target + revealable five)", () => {
    for (const date of DATES) {
      const r = resolveBossForDate(date, 0);
      // OPAQUE target: a number read from the artifact (not derived/rolled here).
      expect(typeof r.target).toBe("number");
      expect(r.target).toBeGreaterThan(0);
      // Revealable five: 5 playable cards carrying basePlayerId/salary/tier.
      expect(r.revealedFive).toHaveLength(5);
      for (const c of r.revealedFive) {
        expect(typeof c.basePlayerId).toBe("string");
        expect(typeof c.salary).toBe("number");
        expect(typeof c.tier).toBe("string");
        expect(typeof c.fp).toBe("number");
      }
      expect(typeof r.marquee).toBe("boolean");
    }
  });

  it("the rotation is restricted to serveable bosses (never a dormant/un-banded boss)", () => {
    // Sweep a year of days; every resolved boss must be serveable (has a target).
    const start = Date.parse("2026-06-22T00:00:00Z");
    const keys = new Set<string>();
    for (let d = 0; d < 365; d += 7) {
      const date = new Date(start + d * 86400000).toISOString().slice(0, 10);
      const r = resolveBossForDate(date, 0);
      expect(typeof r.target).toBe("number"); // serveable by construction
      keys.add(r.identity.identityId);
    }
    // Rotation only surfaces vetted serveable keys (the 15), never the 21 dormant.
    expect(keys.size).toBeGreaterThan(1);
    expect(keys.size).toBeLessThanOrEqual(15);
  });
});
