import type { RawPlayer } from "./dataEngine";

export interface ProjectionResult {
  projByBaseId: Map<string, number>;
  posMeans: Record<string, number>;
  fpScale: number;
}

/**
 * Reads avgFP directly from players.json — no recalculation.
 * players.json is the source of truth for projectedFp, salary, and tier.
 */
export function buildProjections(players: RawPlayer[]): ProjectionResult {
  const projByBaseId = new Map<string, number>();
  const sum: Record<string, number> = {};
  const count: Record<string, number> = {};

  for (const p of players) {
    const bid = String(p.basePlayerId ?? p.id).trim();
    const proj = Number((p as any).avgFP ?? 0);
    projByBaseId.set(bid, proj);

    if (proj > 0) {
      const pos = String(p.position ?? "").toUpperCase() || "UNK";
      sum[pos] = (sum[pos] ?? 0) + proj;
      count[pos] = (count[pos] ?? 0) + 1;
    }
  }

  const posMeans: Record<string, number> = {};
  for (const k of Object.keys(sum)) {
    posMeans[k] = sum[k] / Math.max(1, count[k]);
  }

  // fpScale = 1 because avgFP is already in FPL points (same scale as total_points)
  return { projByBaseId, posMeans, fpScale: 5 };
}