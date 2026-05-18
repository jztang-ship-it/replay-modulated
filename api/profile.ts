/**
 * api/profile.ts — public profile endpoint.
 *
 * GET /api/profile?user_id=<uuid>&sport=basketball
 *
 * Returns achievement list for any user (cross-user read via service role)
 * plus rarity counts (how many total users unlocked each achievement).
 * No auth required — achievements are intentionally public.
 *
 * Response shape:
 *   { nickname, achievements: AchievementRow[], rarityMap: Record<string,number> }
 *
 * AchievementRow: { achievement_id, sport, unlocked_at, source_hand_id, source_data }
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

export interface ProfileAchievementRow {
  achievement_id: string;
  sport: string;
  unlocked_at: string;
  source_hand_id: string | null;
  source_data: Record<string, unknown> | null;
}

export interface ProfileResponse {
  nickname: string | null;
  achievements: ProfileAchievementRow[];
  rarityMap: Record<string, number>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const userId = req.query.user_id as string | undefined;
  if (!userId || !/^[0-9a-f-]{36}$/.test(userId)) {
    return res.status(400).json({ error: "Invalid user_id" });
  }

  if (!supabase) return res.status(503).json({ error: "Database unavailable" });

  // Fetch in parallel: user profile + their achievements + rarity counts
  const [profileResult, achievementsResult, rarityResult] = await Promise.all([
    supabase
      .from("player_profiles")
      .select("nickname")
      .eq("id", userId)
      .single(),
    supabase
      .from("user_achievements")
      .select("achievement_id, sport, unlocked_at, source_hand_id, source_data")
      .eq("user_id", userId)
      .order("unlocked_at", { ascending: false }),
    supabase
      .from("user_achievements")
      .select("achievement_id")
      // intentionally no user_id filter — counts across all users
  ]);

  const nickname = (profileResult.data as any)?.nickname ?? null;
  const achievements: ProfileAchievementRow[] = (achievementsResult.data ?? []) as ProfileAchievementRow[];

  // Build rarity map: achievement_id → count of distinct users
  const rarityMap: Record<string, number> = {};
  for (const row of (rarityResult.data ?? [])) {
    const id = (row as any).achievement_id as string;
    rarityMap[id] = (rarityMap[id] ?? 0) + 1;
  }

  const response: ProfileResponse = { nickname, achievements, rarityMap };
  return res.status(200).json(response);
}
