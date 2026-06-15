// RD7.12 — the client wrapper ALWAYS resolves, NEVER throws, returns null on
// any failure → the result screen falls back to the deterministic line and
// never blocks. Belt-and-suspenders: it re-validates the server line client-side.
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchAuthoredFlavor } from "../fetchAuthoredFlavor";
import type { FlavorFacts } from "@shared/explanation/flavorValidator";

const FACTS: FlavorFacts = {
  outcome: "win",
  player: { last: "Iverson", nickname: "AI" },
  box: { pts: 41, reb: 7, ast: 5 },
};

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (impl: () => Promise<unknown>) =>
  vi.stubGlobal("fetch", vi.fn(impl as () => Promise<Response>));

describe("fetchAuthoredFlavor — never throws, null on every failure", () => {
  it("returns the validated line on a clean grounded response", async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ flavor: "Iverson went for 41-7-5, vintage AI" }) }));
    expect(await fetchAuthoredFlavor(FACTS)).toBe("Iverson went for 41-7-5, vintage AI");
  });
  it("network throw → null", async () => {
    stubFetch(async () => { throw new Error("network down"); });
    expect(await fetchAuthoredFlavor(FACTS)).toBeNull();
  });
  it("non-200 → null", async () => {
    stubFetch(async () => ({ ok: false, json: async () => ({}) }));
    expect(await fetchAuthoredFlavor(FACTS)).toBeNull();
  });
  it("malformed body → null", async () => {
    stubFetch(async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }));
    expect(await fetchAuthoredFlavor(FACTS)).toBeNull();
  });
  it("flavor:null (server fell back) → null", async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ flavor: null }) }));
    expect(await fetchAuthoredFlavor(FACTS)).toBeNull();
  });
  it("CLIENT RE-VALIDATION: a server line that sneaks an agency framing → null", async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ flavor: "you called it — 41-7-5" }) }));
    expect(await fetchAuthoredFlavor(FACTS)).toBeNull();
  });
  it("CLIENT RE-VALIDATION: an ungrounded number → null", async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ flavor: "Iverson went for 41-7-99" }) }));
    expect(await fetchAuthoredFlavor(FACTS)).toBeNull();
  });
});
