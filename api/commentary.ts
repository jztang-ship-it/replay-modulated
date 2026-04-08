/**
 * api/commentary.ts — Vercel serverless function.
 *
 * Proxies commentary generation requests to the Anthropic API. The
 * ANTHROPIC_API_KEY env var stays server-side and never reaches the client.
 *
 * POST { system: string, user: string }
 *   → { commentary: string, tone: string }
 *
 * Mirrors api/leaderboard.ts conventions (CORS, json helper, error shape).
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 200;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: "ANTHROPIC_API_KEY not configured" });
  }

  const body = (req.body ?? {}) as { system?: string; user?: string };
  if (!body.system || !body.user) {
    return json(res, 400, { error: "system and user prompts required" });
  }

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: body.system,
        messages: [{ role: "user", content: body.user }],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("Anthropic error:", upstream.status, errText);
      return json(res, 502, { error: "upstream_error", status: upstream.status });
    }

    const payload = (await upstream.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = payload.content?.[0]?.text?.trim() ?? "";
    if (!text) return json(res, 502, { error: "empty_response" });

    // Parse the model's JSON output. Be forgiving of leading/trailing prose.
    let parsed: { commentary?: string; tone?: string } = {};
    try {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        parsed = JSON.parse(text.slice(start, end + 1));
      } else {
        parsed = { commentary: text };
      }
    } catch {
      parsed = { commentary: text };
    }

    if (!parsed.commentary) return json(res, 502, { error: "missing_commentary" });

    return json(res, 200, {
      commentary: parsed.commentary,
      tone: parsed.tone ?? "observational",
    });
  } catch (err: any) {
    console.error("Commentary handler error:", err);
    return json(res, 500, { error: "internal_error", message: err?.message });
  }
}
