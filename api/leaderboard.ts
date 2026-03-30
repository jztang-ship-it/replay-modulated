/**
 * api/leaderboard.ts — Vercel serverless function.
 *
 * POST { action: "submit", metric: "streak"|"wins"|"fp", value: number, uid: string, nickname: string }
 * GET  ?metric=streak|wins|fp&scope=daily|alltime&limit=20
 *
 * KV keys: lb:{metric}:daily:{YYYY-MM-DD} and lb:{metric}:alltime
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { kv } from "@vercel/kv";

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function todayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

const VALID_METRICS = ["streak", "wins", "fp"];
const TTL_48H = 172800;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  try {
    if (req.method === "POST") return await handleSubmit(req, res);
    if (req.method === "GET") return await handleGet(req, res);
    return json(res, 405, { error: "Method not allowed" });
  } catch (err: any) {
    console.error("Leaderboard error:", err);
    return json(res, 500, { error: "Internal error" });
  }
}

async function handleSubmit(req: VercelRequest, res: VercelResponse) {
  const { action, metric, value, uid, nickname } = req.body ?? {};

  if (action !== "submit") return json(res, 400, { error: "Invalid action" });
  if (!VALID_METRICS.includes(metric)) return json(res, 400, { error: "Invalid metric" });
  if (typeof value !== "number" || value <= 0) return json(res, 400, { error: "Invalid value" });
  if (!uid || typeof uid !== "string") return json(res, 400, { error: "Missing uid" });

  const member = `${uid}:${nickname ?? "Player"}`;
  const today = todayUTC();
  const dailyKey = `lb:${metric}:daily:${today}`;
  const alltimeKey = `lb:${metric}:alltime`;

  if (metric === "wins") {
    // Wins are additive — increment
    // Vercel KV (Upstash) supports zincrby
    try {
      await kv.zincrby(dailyKey, value, member);
      await kv.zincrby(alltimeKey, value, member);
    } catch {
      // Fallback: read + write if zincrby not available
      const currentDaily = (await kv.zscore(dailyKey, member)) ?? 0;
      await kv.zadd(dailyKey, { score: Number(currentDaily) + value, member });
      const currentAll = (await kv.zscore(alltimeKey, member)) ?? 0;
      await kv.zadd(alltimeKey, { score: Number(currentAll) + value, member });
    }
  } else {
    // streak or fp — only update if personal best
    const currentAll = (await kv.zscore(alltimeKey, member)) ?? 0;
    if (value > Number(currentAll)) {
      await kv.zadd(alltimeKey, { score: value, member });
    }
    const currentDaily = (await kv.zscore(dailyKey, member)) ?? 0;
    if (value > Number(currentDaily)) {
      await kv.zadd(dailyKey, { score: value, member });
    }
  }

  // Set TTL on daily keys
  try { await kv.expire(dailyKey, TTL_48H); } catch {}

  return json(res, 200, { ok: true });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const metric = String(req.query.metric ?? "streak");
  const scope = String(req.query.scope ?? "daily");
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));

  if (!VALID_METRICS.includes(metric)) return json(res, 400, { error: "Invalid metric" });

  const today = todayUTC();
  const key = scope === "daily" ? `lb:${metric}:daily:${today}` : `lb:${metric}:alltime`;

  const raw: any[] = await kv.zrange(key, 0, limit - 1, { rev: true, withScores: true });

  // zrange with withScores returns [member, score, member, score, ...] or [{member, score}, ...]
  // Handle both formats
  const entries: { uid: string; nickname: string; score: number }[] = [];

  if (raw.length > 0 && typeof raw[0] === "object" && "member" in raw[0]) {
    // Object format: [{ member, score }, ...]
    for (const item of raw) {
      const colonIdx = String(item.member).indexOf(":");
      entries.push({
        uid: String(item.member).slice(0, colonIdx),
        nickname: String(item.member).slice(colonIdx + 1),
        score: Number(item.score),
      });
    }
  } else {
    // Flat format: [member, score, member, score, ...]
    for (let i = 0; i < raw.length; i += 2) {
      const member = String(raw[i]);
      const score = Number(raw[i + 1] ?? 0);
      const colonIdx = member.indexOf(":");
      entries.push({
        uid: member.slice(0, colonIdx),
        nickname: member.slice(colonIdx + 1),
        score,
      });
    }
  }

  return json(res, 200, { entries, metric, scope });
}
