/**
 * api/commentary.ts — Vercel serverless function.
 * Proxies commentary generation through the multi-LLM router.
 * ANTHROPIC_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY stay server-side.
 *
 * POST { system: string, user: string, tier?: string }
 *   → { commentary: string, tone: string }
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { routeCommentary } from "./_lib/router/llmRouter";
import type { RouterConfig, PayoutTier } from "./_lib/router/types";
import { makeKV, getRecentPhrases } from "./_lib/router/kvStore";

const VALID_TIERS = new Set(['BUST','ROOKIE','STARTER','ALL_STAR','MVP','GOAT'])

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const anthropicApiKey = process.env.COMMENTARY_API_KEY;
  if (!anthropicApiKey) return json(res, 500, { error: "COMMENTARY_API_KEY not configured" });

  const body = (req.body ?? {}) as { system?: string; user?: string; tier?: string };
  if (!body.system || !body.user) return json(res, 400, { error: "system and user prompts required" });

  const tier = (body.tier && VALID_TIERS.has(body.tier) ? body.tier : 'BUST') as PayoutTier

  const config: RouterConfig = {
    namespace: 'replaymod',
    defaultPrimary: 'claude-haiku-4-5',
    anthropicApiKey,
    groqApiKey: process.env.GROQ_API_KEY,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    patchWindowMs: 1500,
  }

  // Fetch recent banned phrases from KV for anti-redundancy injection
  let systemWithBanned = body.system
  try {
    const kv = makeKV()
    const bannedPhrases = await getRecentPhrases(kv, 'replaymod')
    if (bannedPhrases.length > 0) {
      systemWithBanned = body.system + `\n\nSESSION-BANNED PHRASES (used recently — NEVER use any of these in your output):\n${bannedPhrases.slice(0, 15).map(p => `- "${p}"`).join('\n')}`
    }
  } catch (err) {
    console.error('[COMMENTARY] KV fetch failed, proceeding without banned phrases:', err instanceof Error ? err.message : err)
  }

  try {
    const result = await routeCommentary(systemWithBanned, body.user, tier, config)
    return json(res, 200, { commentary: result.commentary, tone: result.tone })
  } catch (err: any) {
    console.error("Commentary handler error:", err);
    // Never 500 — return a safe fallback so the game keeps running
    return json(res, 200, {
      commentary: "Off night. The numbers don't lie.",
      tone: "deadpan"
    })
  }
}
