/**
 * api/bonus-pool.ts — Vercel serverless function (repo root).
 *
 * GET  ?action=get     → { pool: number }
 * POST { action: "contribute", amount: number } → { pool: number }
 * POST { action: "claim" }      → { won: number, pool: number }
 *
 * KV key: "jackpot:pool" (must match basketball/api KV handler; legacy key name).
 * If KV fails, responses use SEED 12451.29 — handlers never throw to the client.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "@vercel/kv";

const KV_KEY = "jackpot:pool";
const SEED = 12451.29;

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function readPool(): Promise<number> {
  try {
    const raw = await kv.get<string | number>(KV_KEY);
    if (raw === null || raw === undefined) return SEED;
    const n = typeof raw === "number" ? raw : parseFloat(String(raw));
    return Number.isFinite(n) ? n : SEED;
  } catch {
    return SEED;
  }
}

async function writePool(value: number): Promise<void> {
  try {
    await kv.set(KV_KEY, value);
  } catch {
    // caller treats as soft failure; readPool still returns SEED on next read
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const action = req.query?.action;
      if (action !== undefined && action !== "get") {
        return json(res, 200, { pool: SEED });
      }
      const pool = await readPool();
      return json(res, 200, { pool });
    }

    if (req.method === "POST") {
      let body: { action?: string; amount?: number };
      try {
        body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
      } catch {
        body = {};
      }

      const action = body.action;
      const amount = Number(body.amount);

      if (action === "contribute" && Number.isFinite(amount) && amount > 0) {
        const current = await readPool();
        const next = parseFloat((current + amount).toFixed(2));
        await writePool(next);
        const pool = await readPool();
        return json(res, 200, { pool: Number.isFinite(pool) ? pool : SEED });
      }

      if (action === "claim") {
        const won = await readPool();
        await writePool(SEED);
        return json(res, 200, { won: Number.isFinite(won) ? won : SEED, pool: SEED });
      }

      return json(res, 200, { pool: SEED });
    }

    return json(res, 200, { pool: SEED });
  } catch {
    return json(res, 200, { pool: SEED });
  }
}
