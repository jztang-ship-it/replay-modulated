import type { AchievementDef, AchievementContext, AchievementResult } from "./types";

const _defs = new Map<string, AchievementDef>();

export function registerAchievements(defs: AchievementDef[]): void {
  for (const d of defs) _defs.set(d.id, d);
}

export function evaluateAchievements(ctx: AchievementContext): AchievementResult[] {
  const results: AchievementResult[] = [];
  const now = new Date().toISOString();
  for (const [id, def] of _defs) {
    if (ctx.existingAchievementIds.includes(id)) continue;
    if (def.sport !== "all" && def.sport !== ctx.sport) continue;
    try {
      if (def.predicate(ctx)) {
        results.push({
          achievementId: id,
          unlockedAt: now,
          sourceHandId: ctx.handId,
          sport: ctx.sport,
        });
      }
    } catch { /* predicate errors are non-fatal */ }
  }
  return results;
}

export function getAchievementDef(id: string): AchievementDef | undefined {
  return _defs.get(id);
}

export function getAllDefs(): AchievementDef[] {
  return Array.from(_defs.values());
}
