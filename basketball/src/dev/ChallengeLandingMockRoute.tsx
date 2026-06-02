// basketball/src/dev/ChallengeLandingMockRoute.tsx
//
// DEV-only mock route for /basketball/dev/challenge-landing-mock.
// Mounts ChallengeTakeCardLanding with fixture data so the localhost
// visual loop can iterate on phone-width without going PROD.
//
// URL: /basketball/dev/challenge-landing-mock?case=<choke|miss|big_score|rare_pull|default|legacy_choke>
//
// Wrapped in the same dark-bg + safe padding chrome the real
// ChallengeLandingScreen shell provides, so the rendered hierarchy
// reads against the same surface treatment in dev as in prod. The
// `onAccept` button just `console.warn`s — the dev route doesn't fire
// real challenge-accept analytics or state changes.

import { ChallengeTakeCardLanding } from "@shared/components/ChallengeTakeCardLanding";
import { LANDING_MOCK_FIXTURES, getMockCaseFromUrl } from "./challengeLandingMockFixture";

export default function ChallengeLandingMockRoute() {
  const caseKey = getMockCaseFromUrl();
  const fixture = LANDING_MOCK_FIXTURES[caseKey];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "linear-gradient(180deg, #070A12 0%, #0D1628 60%, #070A12 100%)",
        color: "#EAF0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        padding: "24px 20px 40px",
      }}
    >
      {/* Mirror the shell's back-button affordance so spacing matches. */}
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

      {/* DEV-only case switcher — pick another fixture without a refresh. */}
      <div
        style={{
          marginBottom: 18,
          fontSize: 11,
          color: "rgba(255,255,255,0.4)",
        }}
      >
        DEV mock · case=<code>{caseKey}</code> · try:{" "}
        {(["choke", "miss", "big_score", "rare_pull", "default", "legacy_choke"] as const).map((c) => (
          <a
            key={c}
            href={`?case=${c}`}
            style={{
              color: c === caseKey ? "#FFB14A" : "rgba(255,177,74,0.6)",
              marginRight: 8,
              textDecoration: c === caseKey ? "underline" : "none",
            }}
          >
            {c}
          </a>
        ))}
      </div>

      <ChallengeTakeCardLanding
        data={fixture.data}
        statsLine={fixture.statsLine}
        alreadyAttempted={fixture.alreadyAttempted}
        onAccept={() => { console.warn("[challenge-landing-mock] onAccept clicked (dev no-op)"); }}
      />
    </div>
  );
}
