// @vitest-environment jsdom
// shared/utils/__tests__/sentChallengePersist.test.ts
// BUG 2 cold-boot restore: the sent-challenge sheet must survive a tab reload via
// sessionStorage, and be consume-once so a later unrelated boot never re-shows a stale sheet.
import { describe, it, expect, beforeEach } from "vitest";
import { persistSentChallenge, readSentChallenge, clearSentChallenge } from "../sentChallengePersist";

const SNAP = { shareUrl: "https://x/basketball/challenge/abc123", shareHeadline: "Beat this.", sport: "basketball" };

describe("sentChallengePersist — cold-boot survival, consume-once", () => {
  beforeEach(() => { try { sessionStorage.clear(); } catch { /* ignore */ } });

  it("persist → read round-trips the snapshot", () => {
    persistSentChallenge(SNAP);
    expect(readSentChallenge()).toEqual(SNAP);
  });

  it("read returns null when nothing was persisted", () => {
    expect(readSentChallenge()).toBeNull();
  });

  it("clear removes it (dismiss / consume-once → no stale re-show on a later boot)", () => {
    persistSentChallenge(SNAP);
    clearSentChallenge();
    expect(readSentChallenge()).toBeNull();
  });

  it("read rejects a malformed/partial payload (no crash, treated as absent)", () => {
    try { sessionStorage.setItem("replaymod_sent_challenge_v1", JSON.stringify({ shareUrl: "x" })); } catch { /* ignore */ }
    expect(readSentChallenge()).toBeNull();
  });
});
