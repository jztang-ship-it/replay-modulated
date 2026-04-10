/**
 * api/leaderboard.ts — Vercel serverless function.
 *
 * POST { action: "submit", metric: "streak"|"wins"|"fp"|"hand_best"|"hand_avg"|"money_won", value: number, uid: string, nickname: string }
 * GET  ?metric=streak|wins|fp|hand_best|hand_avg|money_won&scope=daily|alltime&limit=20
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

const VALID_METRICS = ["streak", "wins", "fp", "hand_best", "hand_avg", "money_won"];
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
  const { action, metric, value, uid, nickname, proof } = req.body ?? {};
  const sessionId = ((req.body?.session_id ?? '') as string).toString().slice(0, 32) || null;

  if (action !== "submit") return json(res, 400, { error: "Invalid action" });
  if (!VALID_METRICS.includes(metric)) return json(res, 400, { error: "Invalid metric" });
  if (typeof value !== "number" || value <= 0) return json(res, 400, { error: "Invalid value" });
  // Sanity ceilings — physically impossible scores get rejected.
  // 6 cards × ~60 max FP + badges ≈ 300 realistic ceiling.
  const FP_CEILING = 300;
  if ((metric === "fp" || metric === "hand_best" || metric === "hand_avg") && value > FP_CEILING) {
    return json(res, 400, { error: "Invalid score" });
  }
  if (metric === "streak" && value > 100) {
    return json(res, 400, { error: "Invalid score" });
  }
  if (metric === "money_won" && value > 1000000) {
    return json(res, 400, { error: "Invalid score" });
  }
  // hand_best requires a proof payload (roster IDs + checksum).
  // Missing proof is allowed for backward compat but logged.
  if (metric === "hand_best" && proof) {
    if (!proof.checksum || typeof proof.checksum !== "string" || proof.checksum.length < 5) {
      return json(res, 400, { error: "Invalid proof" });
    }
  }
  if (metric === "hand_avg") {
    const { handCount } = req.body ?? {};
    if (typeof handCount !== "number" || handCount < 5) {
      return json(res, 400, { error: "hand_avg requires handCount >= 5" });
    }
  }
  if (!uid || typeof uid !== "string") return json(res, 400, { error: "Missing uid" });

  const member = `${uid}:${nickname ?? "Player"}:${sessionId ?? ''}`;
  const today = todayUTC();
  const dailyKey = `lb:${metric}:daily:${today}`;
  const alltimeKey = `lb:${metric}:alltime`;

  if (metric === "wins" || metric === "money_won") {
    // Wins and money_won are additive — increment
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
    // streak, fp, hand_best, hand_avg — only update if personal best
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
  const entries: { uid: string; nickname: string; score: number; session_id: string | null }[] = [];

  function parseMember(raw: string): { uid: string; nickname: string; session_id: string | null } {
    // Format: uid:nickname:sessionId (new) or uid:nickname (legacy)
    const firstColon = raw.indexOf(":");
    const uid = raw.slice(0, firstColon);
    const rest = raw.slice(firstColon + 1);
    const lastColon = rest.lastIndexOf(":");
    // If rest contains another colon it's the new format
    if (lastColon > 0 && lastColon < rest.length - 1) {
      const nickname = rest.slice(0, lastColon);
      const session_id = rest.slice(lastColon + 1) || null;
      return { uid, nickname, session_id };
    }
    // Legacy format — no session_id
    return { uid, nickname: rest, session_id: null };
  }

  if (raw.length > 0 && typeof raw[0] === "object" && "member" in raw[0]) {
    // Object format: [{ member, score }, ...]
    for (const item of raw) {
      const parsed = parseMember(String(item.member));
      entries.push({ ...parsed, score: Number(item.score) });
    }
  } else {
    // Flat format: [member, score, member, score, ...]
    for (let i = 0; i < raw.length; i += 2) {
      const parsed = parseMember(String(raw[i]));
      entries.push({ ...parsed, score: Number(raw[i + 1] ?? 0) });
    }
  }

  return json(res, 200, { entries, metric, scope });
}
