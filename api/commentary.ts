/**
 * api/commentary.ts — Vercel serverless function.
 * Proxies commentary generation through the multi-LLM router.
 * ANTHROPIC_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY stay server-side.
 *
 * POST { system: string, user: string, tier?: string }
 *   → { commentary: string, tone: string }
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { routeCommentary } from "../shared/router/llmRouter";
import type { RouterConfig, PayoutTier } from "../shared/router/types";

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

  try {
    const result = await routeCommentary(body.system, body.user, tier, config)
    return json(res, 200, { commentary: result.commentary, tone: result.tone })
  } catch (err: any) {
    console.error("Commentary handler error:", err);
    return json(res, 500, { error: "internal_error", message: err?.message });
  }
}
