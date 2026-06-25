// shared/components/__tests__/useH2HReveal.arcResolvedSenderTotal.test.ts
//
// Pins the onArcResolved senderTotal binding so RD3-C's "JOHN/sender is a
// constant fixed bar at sender.totalFp" design can't silently regress here again.
//
// Orphan history: RD3-C (d53c951) deleted the accumulating `newSenderTotal` and
// switched the sender to the constant sender.totalFp, but updated only two of the
// three references — it MISSED the onArcResolved callback, leaving `newSenderTotal`
// unbound there (the same class as the logHandToDb bug). It was inert in prod
// (real surfaces don't pass onArcResolved, so the optional call short-circuits the
// arg) but would throw the moment the auth track wires onArcResolved for prompt
// timing. This test locks the fix to sender.totalFp and forbids the dead var.
//
// Static-source (the hook has no render harness here — same precedent as
// _useReveal.allHeldReveal.test.ts and _useSharedGameState.authVerifiedRef).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, "../useH2HReveal.ts"), "utf8");

// Scope to the onArcResolved call site so a like-named senderTotal elsewhere
// (e.g. the per-matchup onMatchupResolved callback) can't satisfy this.
const onArcResolvedCall = (() => {
  const m = /onArcResolvedRef\.current\?\.\(\{([\s\S]*?)\}\);/.exec(SRC);
  expect(m, "onArcResolvedRef.current?.({...}) call must be locatable").not.toBeNull();
  return m![1];
})();

describe("useH2HReveal — onArcResolved senderTotal binding (RD3-C constant)", () => {
  it("passes the constant sender.totalFp (not an accumulating var)", () => {
    expect(onArcResolvedCall).toMatch(/senderTotal:\s*sender\.totalFp/);
  });

  it("recipientTotal stays the accumulated newRecipientTotal", () => {
    expect(onArcResolvedCall).toMatch(/recipientTotal:\s*newRecipientTotal/);
  });

  it("the deleted `newSenderTotal` var does not reappear anywhere in the hook", () => {
    // RD3-C removed it; it must not return (it was the unbound-orphan source).
    expect(SRC).not.toMatch(/newSenderTotal/);
  });
});
