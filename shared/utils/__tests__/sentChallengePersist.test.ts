// @vitest-environment jsdom
// shared/utils/__tests__/sentChallengePersist.test.ts
// BUG 2 cold-boot restore. localStorage (survives a hard mobile tab-discard) bounded by
// TTL + burn-on-read + clear-on-dismiss so it never leaks into an unrelated later session.
import { describe, it, expect, beforeEach } from "vitest";
import {
  persistSentChallenge, readSentChallenge, hasSentChallenge, clearSentChallenge,
} from "../sentChallengePersist";

const KEY = "replaymod_sent_challenge_v1";
const SNAP = { shareUrl: "https://x/basketball/challenge/abc123", shareHeadline: "Beat this.", sport: "basketball" };

describe("sentChallengePersist — localStorage survival, TTL, burn-on-read, peek", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

  it("persist → read round-trips the snapshot (within TTL)", () => {
    persistSentChallenge(SNAP);
    expect(readSentChallenge()).toEqual(SNAP);
  });

  it("read BURNS — a second read returns null (consume-once restore)", () => {
    persistSentChallenge(SNAP);
    expect(readSentChallenge()).toEqual(SNAP);
    expect(readSentChallenge()).toBeNull();
  });

  it("hasSentChallenge PEEKS — does not burn (so reel-skip + restore both see it)", () => {
    persistSentChallenge(SNAP);
    expect(hasSentChallenge()).toBe(true);
    expect(hasSentChallenge()).toBe(true); // still there after a peek
    expect(readSentChallenge()).toEqual(SNAP); // the actual restore burns it
    expect(hasSentChallenge()).toBe(false);
  });

  it("read/peek return null/false when nothing was persisted", () => {
    expect(readSentChallenge()).toBeNull();
    expect(hasSentChallenge()).toBe(false);
  });

  it("clear removes it (in-app dismiss → no stale re-show)", () => {
    persistSentChallenge(SNAP);
    clearSentChallenge();
    expect(readSentChallenge()).toBeNull();
  });

  it("expired entry (past TTL) is treated as absent and self-clears", () => {
    // Write a stale entry directly (ts ~11 min ago, TTL is 10 min).
    localStorage.setItem(KEY, JSON.stringify({ ...SNAP, ts: Date.now() - 11 * 60 * 1000 }));
    expect(hasSentChallenge()).toBe(false);
    expect(readSentChallenge()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull(); // self-cleared
  });

  it("malformed / missing-ts payload is treated as absent (no crash)", () => {
    localStorage.setItem(KEY, JSON.stringify({ shareUrl: "x" }));
    expect(readSentChallenge()).toBeNull();
  });
});
