import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@shared/lib/supabase";
import { evaluateAchievements } from "@shared/achievements";
import type { AchievementContext, AchievementResult } from "@shared/achievements";
import { getPlayerUid } from "@shared/utils/playerIdentity";
import { useAuth } from "@shared/auth/useAuth";

export function useAchievements() {
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const [newlyUnlocked, setNewlyUnlocked] = useState<AchievementResult[]>([]);
  const { uid: authUid } = useAuth();
  // Guards the dedup load against re-firing for the same resolved uid while
  // still allowing it to run once auth resolves (the prior []-deps mount
  // load bailed while uid was still anon "u_…" and never re-ran, so the
  // dedup set stayed empty → already-earned achievements re-submitted → 409).
  const loadedForUidRef = useRef<string | null>(null);

  // Load existing achievement IDs for authenticated users. Reactive on
  // authUid so it fires once the anon→authed transition resolves, not just
  // on mount. Unions (never replaces) so any IDs already added by an
  // in-flight evaluateAndSave survive.
  useEffect(() => {
    const uid = authUid;
    if (!uid || uid.startsWith("u_")) return;
    if (loadedForUidRef.current === uid) return;
    loadedForUidRef.current = uid;
    supabase
      .from("user_achievements")
      .select("achievement_id")
      .then(({ data }) => {
        if (data) {
          const ids = data.map((r: any) => r.achievement_id as string);
          setUnlockedIds(prev => Array.from(new Set([...prev, ...ids])));
        }
      });
  }, [authUid]);

  const evaluateAndSave = useCallback(async (
    ctx: Omit<AchievementContext, "existingAchievementIds">,
  ) => {
    const uid = getPlayerUid();
    if (!uid || uid.startsWith("u_")) return;

    const fullCtx: AchievementContext = { ...ctx, existingAchievementIds: unlockedIds };
    const newOnes = evaluateAchievements(fullCtx);
    if (newOnes.length === 0) return;

    const mvp = ctx.cards.length > 0
      ? ctx.cards.reduce((best, c) => (c.fp > best.fp ? c : best), ctx.cards[0])
      : null;

    const rows = newOnes.map(r => ({
      user_id: uid,
      achievement_id: r.achievementId,
      sport: r.sport,
      source_hand_id: r.sourceHandId || null,
      source_data: {
        totalFp: ctx.totalFp,
        fpTier: ctx.fpTier,
        season: ctx.season,
        mvpCard: mvp ? {
          photoCode: mvp.photoCode,
          name: mvp.name,
          team: mvp.team,
          position: mvp.position,
          tier: mvp.tier,
          season: mvp.season,
          fp: mvp.fp,
        } : null,
      },
    }));

    // Fire-and-forget — achievement writes never block the UI. Upsert with
    // ignoreDuplicates so a re-submit of an already-earned achievement is a
    // no-op rather than a 409 against the (user_id, achievement_id) unique
    // constraint (the dedup set can lag the write when auth resolves late).
    void supabase
      .from("user_achievements")
      .upsert(rows, { onConflict: "user_id,achievement_id", ignoreDuplicates: true })
      .then(({ error }) => {
        if (!error) {
          setUnlockedIds(prev => Array.from(new Set([...prev, ...newOnes.map(r => r.achievementId)])));
          setNewlyUnlocked(prev => [...prev, ...newOnes]);
        }
      });
  }, [unlockedIds]);

  const clearNewlyUnlocked = useCallback(() => {
    setNewlyUnlocked([]);
  }, []);

  return { unlockedIds, newlyUnlocked, evaluateAndSave, clearNewlyUnlocked };
}
