import { useState, useEffect } from "react";
import { supabase } from "@shared/lib/supabase";
import { getAllDefs } from "@shared/achievements";
import type { AchievementDef } from "@shared/achievements";
import type { MvpCardSnapshot } from "@shared/components/AchievementCard";
import type { ProfileAchievementRow } from "../../api/profile";

export interface WallRow {
  def: AchievementDef;
  unlockedAt?: string;
  sourceHandId?: string | null;
  mvpCard?: MvpCardSnapshot | null;
  fpTier?: string;
  totalFp?: number;
  season?: string;
}

export interface UseAchievementWallResult {
  rows: WallRow[];
  loading: boolean;
  error: string | null;
  nickname: string | null;
  rarityMap: Record<string, number>;
}

function buildRows(sport: string, unlocked: ProfileAchievementRow[]): WallRow[] {
  const unlockedById = new Map<string, ProfileAchievementRow>();
  for (const u of unlocked) unlockedById.set(u.achievement_id, u);

  const defs = getAllDefs().filter(d => d.sport === sport || d.sport === "all");

  return defs.map(def => {
    const u = unlockedById.get(def.id);
    if (!u) return { def };
    const sd = (u.source_data ?? {}) as Record<string, unknown>;
    return {
      def,
      unlockedAt: u.unlocked_at,
      sourceHandId: u.source_hand_id,
      mvpCard: (sd.mvpCard as MvpCardSnapshot | null) ?? null,
      fpTier: typeof sd.fpTier === "string" ? sd.fpTier : undefined,
      totalFp: typeof sd.totalFp === "number" ? sd.totalFp : undefined,
      season: typeof sd.season === "string" ? sd.season : undefined,
    };
  });
}

/** Own wall — reads directly from Supabase with user auth session. */
export function useOwnAchievementWall(sport: string): UseAchievementWallResult {
  const [rows, setRows] = useState<WallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("user_achievements")
      .select("achievement_id, sport, unlocked_at, source_hand_id, source_data")
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) { setError(err.message); setLoading(false); return; }
        setRows(buildRows(sport, (data ?? []) as ProfileAchievementRow[]));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sport]);

  return { rows, loading, error, nickname: null, rarityMap: {} };
}

/** Other user's wall — fetches from the public API endpoint. */
export function useOtherAchievementWall(sport: string, targetUserId: string): UseAchievementWallResult {
  const [rows, setRows] = useState<WallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [rarityMap, setRarityMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/profile?user_id=${encodeURIComponent(targetUserId)}&sport=${sport}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setNickname(data.nickname ?? null);
        setRarityMap(data.rarityMap ?? {});
        setRows(buildRows(sport, data.achievements ?? []));
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sport, targetUserId]);

  return { rows, loading, error, nickname, rarityMap };
}
