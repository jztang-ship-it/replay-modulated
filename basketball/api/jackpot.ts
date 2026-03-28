/**
 * Bonus pool KV handler — Vercel serverless function, read/write via Vercel KV REST API.
 *
 * Routes:
 *   GET  ?action=get              → { pool: number }
 *   POST { action: "contribute", amount: number } → { pool: number }
 *   POST { action: "claim" }      → { won: number, pool: number }
 *
 * Env vars (set in Vercel dashboard → Project → Settings → Env Variables):
 *   KV_REST_API_URL    — from your existing Vercel KV store
 *   KV_REST_API_TOKEN  — from your existing Vercel KV store
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const KV_URL   = process.env.KV_REST_API_URL!;
const KV_TOKEN = process.env.KV_REST_API_TOKEN!;
const KV_KEY   = "jackpot:pool";
const SEED     = 12_451.29;

async function kvGet(key: string): Promise<number> {
  const r = await fetch(`${KV_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const { result } = await r.json() as { result: string | null };
  return result ? parseFloat(result) : SEED;
}

async function kvSet(key: string, value: number): Promise<void> {
  await fetch(`${KV_URL}/set/${key}/${value}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const pool = await kvGet(KV_KEY);
    return res.status(200).json({ pool });
  }

  if (req.method === "POST") {
    const { action, amount } = req.body as { action: string; amount?: number };

    if (action === "contribute" && amount && amount > 0) {
      const current = await kvGet(KV_KEY);
      const next = parseFloat((current + amount).toFixed(2));
      await kvSet(KV_KEY, next);
      return res.status(200).json({ pool: next });
    }

    if (action === "claim") {
      const won = await kvGet(KV_KEY);
      await kvSet(KV_KEY, SEED);
      return res.status(200).json({ won, pool: SEED });
    }

    return res.status(400).json({ error: "Invalid action" });
  }

  res.status(405).json({ error: "Method not allowed" });
}
