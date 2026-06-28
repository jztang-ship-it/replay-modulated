// shared/hooks/useSharerAttempt.ts
//
// boss-result-share-payload (Option B): client-side read of the SHARER's
// player_attempt, addressed by the opaque attempt uuid carried on the forwarded
// boss link (…/challenge/{bossId}?ref={token}&attempt={attemptId}).
//
// NO new API function (the api/ surface is at the 12/12 Vercel Hobby cap — hard
// fence). challenge_attempts has public-read RLS ("attempts: public read" USING
// (true), migration 006), so the recipient SPA reads the named attempt directly
// via the anon supabase client — the same pattern useChallengeShare uses for
// hand_log. This is the attempt's OWN scoped fetch; it never overloads
// /sender-hand (which is the boss-projection, not a user-scoped attempt).
//
// READ ONLY: picks already persist structured inside
// challenge_attempts.score_breakdown (serializeResolvedRoster shape). cap_spend
// is DERIVED here as Σ score_breakdown[].salary — no column, no capture write.
// The boss target_fp is NOT read here and is NEVER reconciled with the sharer's
// score (fence §8): the caller shows two distinct numbers.

import { useEffect, useState } from "react";
import { supabase } from "@shared/lib/supabase";

export interface SharerAttempt {
  /** Raw user_name as stored; caller gates display via isRealName. */
  userName: string | null;
  /** The sharer's achieved FP (overlay brag — never the bar-to-beat). */
  score: number;
  /** $ of cap used = Σ score_breakdown[].salary (derived on read, no column). */
  capSpend: number;
  /** The sharer's five picks (serializeResolvedRoster entries). */
  picks: Array<Record<string, any>>;
}

/** Read one player_attempt by its opaque uuid. Returns null until loaded, on
 *  error, or when attemptRef is absent (no overlay — byte-identical bare link). */
export function useSharerAttempt(attemptRef: string | null | undefined): SharerAttempt | null {
  const [data, setData] = useState<SharerAttempt | null>(null);

  useEffect(() => {
    if (!attemptRef) { setData(null); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const { data: row, error } = await supabase
          .from("challenge_attempts")
          .select("user_name, score, score_breakdown")
          .eq("attempt_id", attemptRef)
          .maybeSingle();
        if (cancelled || error || !row) return;
        const picks = Array.isArray(row.score_breakdown) ? (row.score_breakdown as any[]) : [];
        const capSpend = picks.reduce((sum: number, c: any) => sum + (Number(c?.salary) || 0), 0);
        setData({
          userName: typeof row.user_name === "string" ? row.user_name : null,
          score: Number(row.score) || 0,
          capSpend,
          picks,
        });
      } catch {
        /* network/SSR/no-localStorage → no overlay, link stays playable */
      }
    })();
    return () => { cancelled = true; };
  }, [attemptRef]);

  return data;
}
