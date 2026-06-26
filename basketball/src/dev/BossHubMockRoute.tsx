// basketball/src/dev/BossHubMockRoute.tsx
//
// DEV-only glass route for the boss-hub first-view reveal (Consolidation Phase 1).
// FULLY SELF-CONTAINED: injects a deterministic fixture straight into BossScreen
// via __devBoss / __devEntries, so it needs NO /api and NO backend — glassable
// under plain `vite` (npm run dev:basketball), not just vercel dev. Auto-applies
// ?reveal=force so the cards-blast + FP→target count-up re-fire on every load.
//
// URL: /basketball/dev/boss-hub-mock
//
// DEV-only: App.tsx guards the route + this import behind import.meta.env.DEV, so
// production builds tree-shake it. The five cards sum EXACTLY to the target (the
// invariant: target_score === Σ five) so the count-up lands honestly.

import { useState } from "react";
import { BossScreen, type BossInfo, type Entry } from "@shared/components/BossScreen";
import { h2hArcRenderer } from "../views/GameView";
import { sportAdapter } from "../adapters/SportAdapter";

const MOCK_BOSS_ID = "mock-hub-boss";

// Σ fp = 35.2 + 30.0 + 30.0 + 25.0 + 25.0 = 145.2 == target (the seam invariant).
const FIXTURE_BOSS: BossInfo = {
  display: "Jokic's Crown",
  story: "the triple-double machine — mock fixture",
  target: 145.2,
  team: "DEN",
  seasonRange: "22-23",
  cards: [
    { name: "Steve Nash", position: "PG", salary: 55, photoCode: null, basePlayerId: "959", tier: "PURPLE", fp: 35.2 },
    { name: "Shawn Marion", position: "SF", salary: 54, photoCode: null, basePlayerId: "1890", tier: "PURPLE", fp: 30.0 },
    { name: "Amar'e Stoudemire", position: "PF", salary: 51, photoCode: null, basePlayerId: "2405", tier: "PURPLE", fp: 30.0 },
    { name: "Raja Bell", position: "SG", salary: 33, photoCode: null, basePlayerId: "1952", tier: "BLUE", fp: 25.0 },
    { name: "Leandro Barbosa", position: "PG", salary: 41, photoCode: null, basePlayerId: "2571", tier: "BLUE", fp: 25.0 },
  ],
};

const FIXTURE_ENTRIES: Entry[] = [
  { uid: "u_mock", nickname: "YOU", score: 184.2, session_id: null },
  { uid: "u_rival", nickname: "Rival", score: 153.2, session_id: null },
];

// Apply ?reveal=force ONCE, synchronously, before BossScreen mounts.
function ensureForce(): boolean {
  if (typeof window === "undefined") return true;
  const sp = new URLSearchParams(window.location.search);
  if (sp.get("reveal") !== "force") {
    sp.set("reveal", "force");
    window.history.replaceState({}, "", `${window.location.pathname}?${sp.toString()}`);
  }
  return true;
}

export default function BossHubMockRoute() {
  useState(ensureForce); // run once, synchronously, before BossScreen mounts
  return (
    <BossScreen
      sport="basketball"
      currentUid="u_mock"
      bossChallengeId={MOCK_BOSS_ID}
      bossPlayerCount={1234}
      headshotUrl={(id) => sportAdapter.getHeadshotUrl?.(id) ?? null}
      renderBossCard={h2hArcRenderer}
      __devBoss={FIXTURE_BOSS}
      __devEntries={FIXTURE_ENTRIES}
      onClose={() => { /* mock no-op */ }}
    />
  );
}
