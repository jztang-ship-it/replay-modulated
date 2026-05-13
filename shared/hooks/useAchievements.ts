import { useState, useEffect, useCallback } from "react";
import { supabase } from "@shared/lib/supabase";
import { evaluateAchievements } from "@shared/achievements";
import type { AchievementContext, AchievementResult } from "@shared/achievements";
import { getPlayerUid } from "@shared/utils/playerIdentity";

export function useAchievements() {
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const [newlyUnlocked, setNewlyUnlocked] = useState<AchievementResult[]>([]);

  // Load existing achievement IDs once on mount for authenticated users.
  useEffect(() => {
    const uid = getPlayerUid();
    if (!uid || uid.startsWith("u_")) return;
    supabase
      .from("user_achievements")
      .select("achievement_id")
      .then(({ data }) => {
        if (data) setUnlockedIds(data.map((r: any) => r.achievement_id as string));
      });
  }, []);

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

    // Fire-and-forget — achievement writes never block the UI
    void supabase.from("user_achievements").insert(rows).then(({ error }) => {
      if (!error) {
        setUnlockedIds(prev => [...prev, ...newOnes.map(r => r.achievementId)]);
        setNewlyUnlocked(prev => [...prev, ...newOnes]);
      }
    });
  }, [unlockedIds]);

  const clearNewlyUnlocked = useCallback(() => {
    setNewlyUnlocked([]);
  }, []);

  return { unlockedIds, newlyUnlocked, evaluateAndSave, clearNewlyUnlocked };
}
