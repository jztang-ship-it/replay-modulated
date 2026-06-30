// shared/hooks/useBossDetail.ts
//
// Defect 1 (boss-flow consistency) — lift the boss-detail fetch into the hub so
// BossScreen mounts POPULATED: no "Today's Boss" fallback flash, and no
// redundant in-component fetch (BossScreen consumes this seed; its own
// /api/challenge/{id} call stays a fallback only for when no seed arrives).
//
// Fires ONLY when bossChallengeId is non-null — no speculative fetch on
// no-boss days. Fire-and-forget: any failure leaves boss null and BossScreen
// self-fetches as before (graceful, never a dead end). Reuses BossScreen's
// deriveBossInfo so the seeded BossInfo is byte-identical to the in-component
// derivation.

import { useEffect, useState } from "react";
import { deriveBossInfo, type BossInfo } from "@shared/components/BossScreen";

export interface BossDetail {
  /** Derived boss view-model, or null until loaded / no boss / fetch failed. */
  boss: BossInfo | null;
  /** Raw /api/challenge/{id} row — BossScreen retains it for the in-app
   *  onTakeBoss accept (builds the same ctx the cold landing does). */
  rawData: unknown;
}

const EMPTY: BossDetail = { boss: null, rawData: null };

export function useBossDetail(bossChallengeId: string | null): BossDetail {
  const [detail, setDetail] = useState<BossDetail>(EMPTY);

  useEffect(() => {
    if (!bossChallengeId) {
      setDetail(EMPTY);
      return;
    }
    let cancelled = false;
    fetch(`/api/challenge/${bossChallengeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        if (cancelled || !d) return;
        setDetail({ boss: deriveBossInfo(d), rawData: d });
      });
    return () => {
      cancelled = true;
    };
  }, [bossChallengeId]);

  return detail;
}
