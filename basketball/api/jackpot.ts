/**
 * basketball/api/jackpot.ts  (or basketball/src/api/jackpot.ts)
 * Vercel Serverless Function — handles jackpot pool read/write via KV.
 *
 * Deploy as: basketball/api/jackpot.ts
 * Vercel auto-routes GET/POST /api/jackpot to this handler.
 *
 * Requires env vars:
 *   KV_REST_API_URL
 *   KV_REST_API_TOKEN
 * (set in Vercel dashboard → Project → Settings → Environment Variables)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const KV_URL   = process.env.KV_REST_API_URL!;
const KV_TOKEN = process.env.KV_REST_API_TOKEN!;
const KV_KEY   = "jackpot:pool";
const SEED     = 500;

async function kvGet(key: string): Promise<number> {
  const res = await fetch(`${KV_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await res.json() as { result: string | null };
  return data.result ? parseFloat(data.result) : SEED;
}

async function kvSet(key: string, value: number): Promise<void> {
  await fetch(`${KV_URL}/set/${key}/${value}`, {
    method: "GET", // Vercel KV REST uses GET for set
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
      await kvSet(KV_KEY, SEED); // reset to seed
      return res.status(200).json({ won, pool: SEED });
    }

    return res.status(400).json({ error: "Invalid action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
