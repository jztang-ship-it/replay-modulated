/**
 * api/bonus-pool.ts — Vercel serverless function (repo root).
 *
 * Per-sport bonus pools — each sport accumulates and distributes from its
 * own bucket. Sport whitelist below; unknown sports fall through to SEED
 * (no KV touch) so a typo can't corrupt a real pool.
 *
 * GET  ?sport=<basketball|baseball>            → { pool: number }
 * POST { sport, action: "contribute", amount } → { pool: number }
 *
 * Distribution is via leaderboard top-10 (handled by a separate cron /
 * admin path), not per-hand claim. The old "claim" action that drained
 * the pool to SEED was removed when streak-induced bonus payouts went
 * away.
 *
 * KV key: "bonus_pool:<sport>". Bonus-pool terminology only — never
 * "jackpot" in copy/code/schema. If KV fails, responses use SEED 1000 —
 * handlers never throw to the client.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "@vercel/kv";

const SEED = 1000;
const SUPPORTED_SPORTS = new Set(["basketball", "baseball", "worldcup"]);

function kvKey(sport: string): string {
  return `bonus_pool:${sport}`;
}

function normalizeSport(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return SUPPORTED_SPORTS.has(s) ? s : null;
}

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function readPool(sport: string): Promise<number> {
  try {
    const raw = await kv.get<string | number>(kvKey(sport));
    if (raw === null || raw === undefined) return SEED;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    return Number.isFinite(n) ? n : SEED;
  } catch {
    return SEED;
  }
}

async function writePool(sport: string, value: number): Promise<void> {
  try {
    await kv.set(kvKey(sport), value);
  } catch {
    // caller treats as soft failure; readPool still returns SEED on next read
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const sport = normalizeSport(req.query?.sport);
      if (!sport) return json(res, 200, { pool: SEED });
      const pool = await readPool(sport);
      return json(res, 200, { pool });
    }

    if (req.method === "POST") {
      let body: { sport?: string; action?: string; amount?: number };
      try {
        body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
      } catch {
        body = {};
      }

      const sport = normalizeSport(body.sport);
      if (!sport) return json(res, 200, { pool: SEED });

      const action = body.action;
      const amount = Number(body.amount);

      if (action === "contribute" && Number.isFinite(amount) && amount > 0) {
        const current = await readPool(sport);
        const next = parseFloat((current + amount).toFixed(2));
        await writePool(sport, next);
        const pool = await readPool(sport);
        return json(res, 200, { pool: Number.isFinite(pool) ? pool : SEED });
      }

      return json(res, 200, { pool: SEED });
    }

    return json(res, 200, { pool: SEED });
  } catch {
    return json(res, 200, { pool: SEED });
  }
}
