import { supabaseAdmin } from "./supabaseServer.js";
import { evaluateAchievements } from "../../../shared/achievements/registry.js";
import type { AchievementContext, CardScore } from "../../../shared/achievements/types.js";
import { BASKETBALL_ACHIEVEMENTS } from "./basketballAchievementRules.js";

void BASKETBALL_ACHIEVEMENTS;

function toCardScore(card: any): CardScore {
  return {
    fp: Number(card.actualFp), stats: card.statLine ?? {},
    position: String(card.position ?? ""), name: String(card.name ?? ""),
    team: String(card.team ?? ""), tier: String(card.tier ?? ""), season: String(card.season ?? ""),
    photoCode: card.photoCode,
  };
}

/**
 * Evaluate and persist achievements from the verified hand row only.
 * The v2 roster and its stat/identity fields are generated from the trusted server catalog.
 * This is deliberately best-effort: a notification/achievement failure must
 * never roll back an already-settled balance or hand result. Retrying the
 * same hand is safe because user_achievements has a unique user/id key.
 */
export async function awardVerifiedAchievements(
  userId: string,
  handId: string,
  sport: string,
  season: string,
): Promise<string[]> {
  if (sport !== "basketball") return [];

  const [{ data: hand, error: handError }, { data: existing, error: existingError }, { count: handCount, error: stateError }] = await Promise.all([
    supabaseAdmin.from("hand_log")
      .select("hand_id, total_fp, tier, final_roster, streak_at_play")
      .eq("hand_id", handId).eq("player_id", userId).eq("verified", true).eq("authority_version", 2).maybeSingle(),
    supabaseAdmin.from("user_achievements")
      .select("achievement_id").eq("user_id", userId),
    supabaseAdmin.from("hand_log")
      .select("hand_id", { count: "exact", head: true }).eq("player_id", userId).eq("authority_version", 2).eq("verified", true),
  ]);
  if (handError) throw handError;
  if (existingError) throw existingError;
  if (stateError) throw stateError;
  if (!hand) return [];

  const rawRoster = Array.isArray(hand.final_roster) ? hand.final_roster : [];
  const cards = rawRoster.map(toCardScore);
  const context: AchievementContext = {
    sport,
    season,
    handId,
    totalFp: Number(hand.total_fp),
    fpTier: String(hand.tier),
    isWin: !["BUST", "ROOKIE"].includes(String(hand.tier)),
    rosterIds: rawRoster.map((card: any) => String(card?.basePlayerId ?? "")).filter(Boolean),
    cards,
    streak: Number(hand.streak_at_play ?? 0),
    handsPlayed: Number(handCount ?? 0),
    existingAchievementIds: (existing ?? []).map((row: any) => String(row.achievement_id)),
  };
  const unlocked = evaluateAchievements(context);
  if (unlocked.length === 0) return [];

  const rows = unlocked.map((result) => ({
    user_id: userId,
    achievement_id: result.achievementId,
    unlocked_at: result.unlockedAt,
    source_hand_id: handId,
    sport,
    source_data: {
      totalFp: context.totalFp,
      tier: context.fpTier,
      season,
      streak: context.streak,
      handsPlayed: context.handsPlayed,
    },
  }));
  const { error: writeError } = await supabaseAdmin
    .from("user_achievements")
    .upsert(rows, { onConflict: "user_id,achievement_id", ignoreDuplicates: true });
  if (writeError) throw writeError;
  return unlocked.map((result) => result.achievementId);
}
