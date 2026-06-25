// shared/views/__tests__/_useSharedGameState.authVerifiedRef.test.ts
//
// B-lite (auth-race close) — pins the shape of the lock-time persist so the
// parked auth-race can't silently re-arm.
//
// The bug it guards: logHandToDb runs INSIDE boundedPersist, which gates the
// charge (record-before-money). It used to `await supabase.auth.getSession()`
// in that gated path — a slow auth refresh flipped the charge gate (persist
// times out → entry_fee_skipped → no charge). B-lite removes that await by
// reading `verified` synchronously from an off-hand-path ref kept fresh by an
// onAuthStateChange subscription. The INVARIANT we preserve: the hand_log INSERT
// stays inside the gated path (we did NOT relax record-before-money → capture-
// before-money; that was B-parked, rejected).
//
// Static-source (the hook has no render harness here — same precedent as
// _useReveal.allHeldReveal.test.ts and betOncePerHand, which read the source as
// text). This pins the two non-negotiables: (1) no getSession await in the gated
// path, (2) the insert still occurs in that path with `verified`.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, "../_useSharedGameState.ts"), "utf8");

// Scope the gated-path assertions to the logHandToDb useCallback body so a
// like-named pattern elsewhere can't satisfy or break them.
const logHandToDbBody = (() => {
  const m = /const logHandToDb = useCallback\(async \(([\s\S]*?)\n  \}, \[adapter, evaluateAchievementsAndSave, handCount\]\);/.exec(SRC);
  expect(m, "logHandToDb useCallback body must be locatable").not.toBeNull();
  return m![1];
})();

describe("B-lite — auth read off the charge-gating path", () => {
  it("logHandToDb reads `verified` synchronously from verifiedRef (no auth await)", () => {
    expect(logHandToDbBody).toMatch(/const verified = verifiedRef\.current;/);
  });

  it("logHandToDb does NOT await supabase.auth.getSession() in the gated path", () => {
    // The getSession await was the auth-race source; it must not live inside the
    // bounded persist. (Seeding getSession is allowed OUTSIDE this body, in the
    // subscription effect — asserted below.)
    expect(logHandToDbBody).not.toMatch(/supabase\.auth\.getSession\(\)/);
  });

  it("the hand_log INSERT still occurs in the gated path with `verified` (record-before-money held)", () => {
    expect(logHandToDbBody).toMatch(/supabase\.from\("hand_log"\)\.insert\(/);
    // verified is still persisted on the row (the value just comes from the ref now).
    expect(logHandToDbBody).toMatch(/\bverified,/);
  });
});

describe("B-lite — verifiedRef kept fresh off the hand path", () => {
  it("declares verifiedRef and subscribes to onAuthStateChange to keep it current", () => {
    expect(SRC).toMatch(/const verifiedRef = useRef\(false\);/);
    expect(SRC).toMatch(/supabase\.auth\.onAuthStateChange\(/);
    // ref updated from the auth session in the subscription handler
    expect(SRC).toMatch(/verifiedRef\.current = !!session\?\.access_token;/);
  });

  it("cleans up the subscription (no leak)", () => {
    expect(SRC).toMatch(/subscription\.unsubscribe\(\)/);
  });
});
