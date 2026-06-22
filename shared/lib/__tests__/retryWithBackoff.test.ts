import { describe, it, expect, vi } from "vitest";
import { retryWithBackoff } from "../retryWithBackoff";

describe("retryWithBackoff", () => {
  it("returns the result on first success without sleeping", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const result = await retryWithBackoff(
      async () => { calls++; return "ok"; },
      { attempts: 3, backoffMs: [10, 20], sleep },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries on throw and succeeds on a later attempt, sleeping between tries", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 3) throw new Error("transient");
        return "recovered";
      },
      { attempts: 3, backoffMs: [10, 20], sleep },
    );
    expect(result).toBe("recovered");
    expect(calls).toBe(3);
    // two backoff sleeps between the three attempts, in order.
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20]);
  });

  it("rethrows the last error after exhausting all attempts", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => { calls++; throw new Error(`fail-${calls}`); },
        { attempts: 3, backoffMs: [10, 20], sleep },
      ),
    ).rejects.toThrow("fail-3");
    expect(calls).toBe(3);
    // sleeps only BETWEEN attempts, never after the final failure.
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
