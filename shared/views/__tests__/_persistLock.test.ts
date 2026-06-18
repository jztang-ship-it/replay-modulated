// shared/views/__tests__/_persistLock.test.ts
//
// boundedPersist (build-phase B1 fix b): the lineup-lock persist is bounded so a
// slow/hung hand_log insert can't block REVEALING. ok=true ONLY when the write
// confirms within the bound — the controller gates the charge on it.

import { describe, expect, it } from "vitest";
import { boundedPersist, PERSIST_TIMEOUT_MS } from "../_persistLock";

describe("boundedPersist — confirmed-write gating, never blocks", () => {
  // Anon fast-path: logHandToDb no-ops for u_ uids → resolves immediately → ok:true.
  it("anon no-op write (resolves immediately) → ok:true (anon hands still charge)", async () => {
    const r = await boundedPersist(async () => { /* no-op, like anon logHandToDb */ }, "h-anon", 1000);
    expect(r).toEqual({ ok: true, handId: "h-anon" });
  });

  it("slow-but-successful write (resolves before the bound) → ok:true", async () => {
    const r = await boundedPersist(
      () => new Promise((res) => setTimeout(res, 10)),
      "h-slow",
      1000, // generous bound
    );
    expect(r.ok).toBe(true);
    expect(r.handId).toBe("h-slow");
  });

  it("hung write (never resolves) → ok:false, reason:'timeout' (REVEALING not blocked)", async () => {
    const r = await boundedPersist(
      () => new Promise(() => { /* never resolves — simulates a hung insert */ }),
      "h-hang",
      20, // short bound so the test is fast
    );
    expect(r).toEqual({ ok: false, handId: "h-hang", reason: "timeout" });
  });

  it("throwing write (rejects) → ok:false, reason:'throw'", async () => {
    const r = await boundedPersist(
      () => Promise.reject(new Error("db down")),
      "h-throw",
      1000,
    );
    expect(r).toEqual({ ok: false, handId: "h-throw", reason: "throw" });
  });

  it("PERSIST_TIMEOUT_MS errs long (revenue-vs-safety dial; a false timeout costs a charge)", () => {
    expect(PERSIST_TIMEOUT_MS).toBeGreaterThanOrEqual(2000);
  });
});
