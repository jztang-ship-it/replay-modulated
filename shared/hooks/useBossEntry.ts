// shared/hooks/useBossEntry.ts
//
// Phase 2-mount Step 3 — surface today's boss into React state for the
// post-results CTA (GameView). The leaderboard GETs the game already fires are
// fire-and-forget into localStorage AND uid-gated (checkLeaderboardRank returns
// early without a uid), so coupling the boss CTA to them would drop anonymous
// recipients — violating the sender/recipient symmetry the invariant requires.
// This dedicated, uid-independent read avoids that.
//
// Basketball-only. Reads bossChallengeId + bossPlayerCount off GET
// /api/leaderboard (Host route A′ — KV-cached server-side, so this is cheap).
// Fire-and-forget: any failure leaves the fields null and the CTA simply
// doesn't render. The count is an Upgrade (degrades to absent); the link is
// what the invariant depends on.

import { useEffect, useState } from "react";

export interface BossEntryInfo {
  /** Today's boss challenge_id (uuid), or null until loaded / non-basketball. */
  bossChallengeId: string | null;
  /** Distinct players who attempted today's boss, or null (count is Upgrade). */
  bossPlayerCount: number | null;
}

const EMPTY: BossEntryInfo = { bossChallengeId: null, bossPlayerCount: null };

export function useBossEntry(sport: string): BossEntryInfo {
  const [info, setInfo] = useState<BossEntryInfo>(EMPTY);

  useEffect(() => {
    if (sport !== "basketball") {
      setInfo(EMPTY);
      return;
    }
    let cancelled = false;
    // limit=1: we only need the appended boss fields, not the board entries.
    fetch(`/api/leaderboard?sport=basketball&metric=hand_best&scope=daily&limit=1`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d) return;
        setInfo({
          bossChallengeId: typeof d.bossChallengeId === "string" ? d.bossChallengeId : null,
          bossPlayerCount: typeof d.bossPlayerCount === "number" ? d.bossPlayerCount : null,
        });
      })
      .catch(() => {
        /* non-fatal — boss CTA simply absent this session */
      });
    return () => {
      cancelled = true;
    };
  }, [sport]);

  return info;
}
