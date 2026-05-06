/**
 * api/bonus-pool.ts — Vercel serverless function (repo root).
 *
 * Per-sport bonus pools — each sport accumulates and distributes from its
 * own bucket. Sports with competitions (football) require a competition
 * param; unknown sports/competitions fall through to 400 errors.
 *
 * GET  ?sport=<basketball|baseball>                           → { pool: number }
 * GET  ?sport=football&competition=<world_cup>                → { pool: number }
 * POST { sport, action: "contribute", amount, competition? }  → { pool: number }
 *
 * Distribution is via leaderboard top-10 (handled by a separate cron /
 * admin path), not per-hand claim. The old "claim" action that drained
 * the pool to SEED was removed when streak-induced bonus payouts went
 * away.
 *
 * KV key: "bonus_pool:<sport>" or "bonus_pool:<sport>:<competition>".
 * Bonus-pool terminology only — never "jackpot" in copy/code/schema.
 * If KV fails, responses use SEED 1000 — handlers never throw to the client.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "@vercel/kv";

const SEED = 1000;
const SUPPORTED_SPORTS = new Set(["basketball", "baseball", "football"]);
const SUPPORTED_COMPETITIONS: Record<string, Set<string>> = {
  football: new Set(["world_cup"]),
};
const COMPETITION_REQUIRED = new Set(["football"]);

function kvKey(sport: string, competition?: string): string {
  return competition ? `bonus_pool:${sport}:${competition}` : `bonus_pool:${sport}`;
}

function validateRequest(sport: string, competition?: string): string | null {
  if (!SUPPORTED_SPORTS.has(sport)) {
    return `Unsupported sport: ${sport}`;
  }
  if (COMPETITION_REQUIRED.has(sport) && !competition) {
    return `competition required for sport: ${sport}`;
  }
  if (competition && (!SUPPORTED_COMPETITIONS[sport] || !SUPPORTED_COMPETITIONS[sport].has(competition))) {
    return `Unsupported competition: ${competition}`;
  }
  return null;
}

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function readPool(sport: string, competition?: string): Promise<number> {
  try {
    const raw = await kv.get<string | number>(kvKey(sport, competition));
    if (raw === null || raw === undefined) return SEED;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    return Number.isFinite(n) ? n : SEED;
  } catch {
    return SEED;
  }
}

async function writePool(sport: string, value: number, competition?: string): Promise<void> {
  try {
    await kv.set(kvKey(sport, competition), value);
  } catch {
    // caller treats as soft failure; readPool still returns SEED on next read
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const sport = String(req.query?.sport ?? "").trim().toLowerCase();
      const competition = req.query?.competition
        ? String(req.query.competition).trim().toLowerCase()
        : undefined;

      const err = validateRequest(sport, competition);
      if (err) return json(res, 400, { error: err });

      const pool = await readPool(sport, competition);
      return json(res, 200, { pool });
    }

    if (req.method === "POST") {
      let body: { sport?: string; action?: string; amount?: number; competition?: string };
      try {
        body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
      } catch {
        body = {};
      }

      const sport = String(body.sport ?? "").trim().toLowerCase();
      const competition = body.competition
        ? String(body.competition).trim().toLowerCase()
        : undefined;

      const err = validateRequest(sport, competition);
      if (err) return json(res, 400, { error: err });

      const action = body.action;
      const amount = Number(body.amount);

      if (action === "contribute" && Number.isFinite(amount) && amount > 0) {
        const current = await readPool(sport, competition);
        const next = parseFloat((current + amount).toFixed(2));
        await writePool(sport, next, competition);
        const pool = await readPool(sport, competition);
        return json(res, 200, { pool: Number.isFinite(pool) ? pool : SEED });
      }

      return json(res, 200, { pool: SEED });
    }

    return json(res, 200, { pool: SEED });
  } catch {
    return json(res, 200, { pool: SEED });
  }
}
