// @vitest-environment jsdom
/**
 * shared/analytics/__tests__/identify.test.ts
 *
 * Bug #3 lock ($identify alias). The signup path is correctly wired
 * (same-tab signUp → identify(newUid); OAuth → persistPendingAlias →
 * SIGNED_IN handler → identify(uuid, anonId)). It was only "unconfirmed"
 * because earlier verification exercised sign-IN, not sign-UP.
 *
 * This pins the analytics primitive both paths depend on: identify(newId,
 * anonId) emits a PostHog `$identify` event to /batch/ whose distinct_id is
 * the authed id and whose $anon_distinct_id is the prior anon id — the merge
 * key PostHog uses to stitch the two people into one. And identify(id, id)
 * (nothing to stitch) is a no-op.
 *
 * POSTHOG_KEY is read at module top-level (`import.meta.env.VITE_POSTHOG_KEY`),
 * so it MUST be stubbed before a fresh dynamic import — otherwise
 * sendIdentifyToPostHog short-circuits on the missing key.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
);

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockClear();
  vi.stubEnv("VITE_POSTHOG_KEY", "phc_test_key");
  // @ts-expect-error global fetch stub
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  vi.unstubAllEnvs();
  // @ts-expect-error cleanup
  delete globalThis.fetch;
});

function identifyCalls() {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).includes("/batch/"),
  );
}

describe("analytics.identify — PostHog $identify alias", () => {
  it("posts a $identify event to /batch/ with distinct_id=newId and $anon_distinct_id=anonId", async () => {
    const { identify } = await import("../analytics");
    identify("authed-uuid-123", "u_anon_abc");

    await vi.waitFor(() => expect(identifyCalls().length).toBeGreaterThan(0));

    const [url, init] = identifyCalls()[0] as [string, RequestInit];
    expect(String(url)).toContain("/batch/");
    expect(init.method).toBe("POST");

    const payload = JSON.parse(init.body as string);
    expect(payload.api_key).toBe("phc_test_key");
    const ev = payload.batch[0];
    expect(ev.event).toBe("$identify");
    expect(ev.distinct_id).toBe("authed-uuid-123");
    expect(ev.properties.$anon_distinct_id).toBe("u_anon_abc");
  });

  it("is a no-op when the id is unchanged (nothing to stitch)", async () => {
    const { identify } = await import("../analytics");
    identify("same-id", "same-id");

    // Give any (incorrectly fired) async POST a tick to land.
    await Promise.resolve();
    expect(identifyCalls()).toHaveLength(0);
  });
});
