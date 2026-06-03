// basketball/src/dev/HeadlineMockRoute.tsx
//
// DEV-only smoke route for /basketball/dev/headline-mock.
// Phase 3 step 1 (lock: docs/challenge-landing-v2-phase3-authored-voice-
// engine-lock.md). Lets the user POST a hand-edited CommentaryFacts
// fixture to /api/headline and eyeball the stubbed response beside
// today's chadShareTrashTalk bank pick.
//
// Step 1: confirms the call path (facts in → string out, or null with
// reason) works end-to-end, and the validators / timeout / sentinel-
// detection plumbing returns the right diagnostic. Step 2 swaps the
// stub for the real VOICE_CONTRACT and the same surface becomes the
// iteration loop for voice review.
//
// URL: /basketball/dev/headline-mock?case=rare_pull|choke_credited|
//                                        choke_neutral|big_score|miss

import { useEffect, useState } from "react";
import { fetchAuthoredHeadline } from "@shared/utils/fetchAuthoredHeadline";
import { HEADLINE_MOCK_FIXTURES, getMockCaseFromUrl, type HeadlineMockCase } from "./headlineMockFixture";

interface PostResult {
  state: "idle" | "posting" | "done";
  headline: string | null;
  /** Raw response body (or thrown-error message) for diagnostic display. */
  raw: string;
  ms: number;
}

const ALL_CASES: HeadlineMockCase[] = [
  "rare_pull",
  "choke_credited",
  "choke_neutral",
  "big_score",
  "miss",
];

export default function HeadlineMockRoute() {
  const caseKey = getMockCaseFromUrl();
  const fixture = HEADLINE_MOCK_FIXTURES[caseKey];
  const [result, setResult] = useState<PostResult>({
    state: "idle", headline: null, raw: "", ms: 0,
  });

  async function fireRequest() {
    setResult({ state: "posting", headline: null, raw: "", ms: 0 });
    const start = performance.now();

    // Raw fetch alongside the wrapper so we can show the unparsed body.
    let raw = "";
    try {
      const resp = await fetch("/api/headline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts: fixture.facts }),
      });
      raw = `[${resp.status}] ${await resp.text()}`;
    } catch (err) {
      raw = `[FETCH_ERROR] ${err instanceof Error ? err.message : String(err)}`;
    }
    // Wrapper call — exercises the path the prompt uses in prod.
    const wrapped = await fetchAuthoredHeadline(fixture.facts);

    setResult({
      state: "done",
      headline: wrapped,
      raw,
      ms: Math.round(performance.now() - start),
    });
  }

  // Auto-fire on case change so the loop is "swap chip → see result."
  useEffect(() => { void fireRequest(); /* eslint-disable-next-line */ }, [caseKey]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "linear-gradient(180deg, #070A12 0%, #0D1628 60%, #070A12 100%)",
        color: "#EAF0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        overflowY: "auto",
        padding: "24px 20px 40px",
      }}
    >
      <button
        onClick={() => { window.location.pathname = "/basketball"; }}
        style={{
          alignSelf: "flex-start",
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          padding: "5px 12px",
          color: "rgba(255,255,255,0.5)",
          fontSize: 13,
          cursor: "pointer",
          marginBottom: 24,
        }}
      >
        ← Back
      </button>

      <div style={{ marginBottom: 18, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
        Phase 3 step 1 · headline smoke · case=<code>{caseKey}</code> · pick:{" "}
        {ALL_CASES.map((c) => {
          const next = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
          next.set("case", c);
          return (
            <a
              key={c}
              href={`?${next.toString()}`}
              style={{
                color: c === caseKey ? "#FFB14A" : "rgba(255,177,74,0.6)",
                marginRight: 10,
                textDecoration: c === caseKey ? "underline" : "none",
              }}
            >
              {c}
            </a>
          );
        })}
      </div>

      <h1 style={{ fontSize: 18, fontWeight: 800, marginTop: 0 }}>{fixture.label}</h1>

      <section
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 11, color: "rgba(234,240,255,0.55)", marginBottom: 6, letterSpacing: 0.6 }}>
          TODAY · chadShareTrashTalk bank pick (fallback)
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#EAF0FF" }}>
          {fixture.bankPick}
        </div>
      </section>

      <section
        style={{
          background: "rgba(255,177,74,0.06)",
          border: "1px solid rgba(255,177,74,0.3)",
          borderRadius: 10,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 11, color: "#FFB14A", marginBottom: 6, letterSpacing: 0.6 }}>
          PHASE 3 STEP 1 · /api/headline (stubbed generator, real validators)
          {result.state === "done" ? ` · ${result.ms}ms` : ""}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#FFB14A", minHeight: 22 }}>
          {result.state === "posting"
            ? "crafting…"
            : result.headline ?? <span style={{ color: "rgba(234,240,255,0.55)", fontStyle: "italic" }}>
                {result.state === "done" ? "(null — client would fall back to bank pick above)" : ""}
              </span>}
        </div>
        <button
          onClick={() => void fireRequest()}
          disabled={result.state === "posting"}
          style={{
            marginTop: 10,
            padding: "6px 12px",
            borderRadius: 6,
            background: "rgba(255,177,74,0.18)",
            border: "1px solid rgba(255,177,74,0.4)",
            color: "#FFB14A",
            fontSize: 12,
            fontWeight: 700,
            cursor: result.state === "posting" ? "default" : "pointer",
          }}
        >
          {result.state === "posting" ? "posting…" : "re-fire POST"}
        </button>
      </section>

      <details
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10,
          padding: 12,
          fontSize: 11,
          color: "rgba(234,240,255,0.6)",
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 700, color: "#EAF0FF" }}>
          raw response body (server diagnostic)
        </summary>
        <pre style={{
          marginTop: 8,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          fontFamily: "ui-monospace, monospace",
        }}>
          {result.raw || "(not yet fired)"}
        </pre>
      </details>

      <details
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10,
          padding: 12,
          fontSize: 11,
          color: "rgba(234,240,255,0.6)",
          marginTop: 10,
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 700, color: "#EAF0FF" }}>
          fixture · CommentaryFacts being POSTed
        </summary>
        <pre style={{
          marginTop: 8,
          whiteSpace: "pre-wrap",
          fontFamily: "ui-monospace, monospace",
        }}>
          {JSON.stringify(fixture.facts, null, 2)}
        </pre>
      </details>
    </div>
  );
}
