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

  // Achievement predicates and writes are server-only. Keep this
  // compatibility callback so existing consumers do not need a flag day,
  // but never derive permanent unlocks from client-controlled card state.
  const evaluateAndSave = useCallback(async (
    _ctx: Omit<AchievementContext, "existingAchievementIds">,
  ) => {
    return;
  }, []);

  const clearNewlyUnlocked = useCallback(() => {
    setNewlyUnlocked([]);
  }, []);

  return { unlockedIds, newlyUnlocked, evaluateAndSave, clearNewlyUnlocked };
}
