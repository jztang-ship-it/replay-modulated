// basketball/src/dev/BossLandingMockRoute.tsx
//
// DEV-only mock route for /basketball/dev/boss-outward-mock.
// Drives the REAL BossOutwardEnding (not a stub) so the localhost loop can
// glass Layer C, delta-a: the beat-to-send win-gate + the near-miss / far loss
// run-it-back branches, without a backend boss row.
//
// URL: /basketball/dev/boss-outward-mock?outcome=<win|close|far>
//   win   → score 205 vs target 200 → forward affordance (Challenge Someone / Copy Link)
//   close → score 197 vs target 200 → near-miss: sub "3 away." + "Run it back" (no forward)
//   far   → score 150 vs target 200 → far loss: sub "The boss held." + "Try again" (no forward)
//
// Each outcome uses a DISTINCT bossChallengeId so BossOutwardEnding's localStorage
// memory (recordBossResult keeps best-score + sticky-win) never bleeds one
// outcome into another across glasses. onPlayAgain just logs — the dev route
// does not re-enter the real boss loop (that lives in App's onTryAgain).

import { BossOutwardEnding } from "@shared/components/BossOutwardEnding";
import { peekReferrerToken, REFERRER_TOKEN_KEY } from "@shared/utils/referrerToken";

type Outcome = "win" | "close" | "far";

function getOutcome(): Outcome {
  if (typeof window === "undefined") return "win";
  const raw = new URLSearchParams(window.location.search).get("outcome");
  return raw === "close" || raw === "far" ? raw : "win";
}

const TARGET = 200;
const FIXTURES: Record<Outcome, { id: string; score: number; won: boolean }> = {
  win:   { id: "mock-boss-win",   score: 205, won: true },
  close: { id: "mock-boss-close", score: 197, won: false },
  far:   { id: "mock-boss-far",   score: 150, won: false },
};

export default function BossLandingMockRoute() {
  // Layer-C glass harness — retained trace. This route mounts only under the
  // DEV-guarded dev-slug case, so it never reaches prod (dead-code-eliminated).
  // eslint-disable-next-line no-console
  console.log("[boss-mock] route render");
  const outcome = getOutcome();
  const f = FIXTURES[outcome];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#070A12",
        color: "#EAF0FF",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        gap: 20,
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
        dev · boss-outward-mock · outcome={outcome} (target {TARGET})
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
        <a href="?outcome=win" style={{ color: "#FFB14A" }}>win</a>
        <a href="?outcome=close" style={{ color: "#FFB14A" }}>close loss</a>
        <a href="?outcome=far" style={{ color: "#FFB14A" }}>far loss</a>
      </div>
      {/* Layer-C delta-b send-side glass: the stored referral token (peeked, NOT
          minted by rendering this). "(not minted yet)" until the first Challenge
          Someone / Copy Link on a WIN forwards. Click an outcome link to re-read
          after a forward; the value must stay the SAME across forwards (reuse). */}
      <div style={{ fontSize: 12, color: "rgba(234,240,255,0.6)", textAlign: "center" }}>
        localStorage[{REFERRER_TOKEN_KEY}] = {peekReferrerToken() ?? "(not minted yet)"}
      </div>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <BossOutwardEnding
          sport="basketball"
          bossChallengeId={f.id}
          freshResult={{ score: f.score, won: f.won }}
          targetScore={TARGET}
          bossName="The Title Defense"
          onPlayAgain={() => {
            // eslint-disable-next-line no-console
            console.log("[boss-outward-mock] onPlayAgain → would replay today's boss (App onTryAgain)");
          }}
        />
      </div>
    </div>
  );
}
