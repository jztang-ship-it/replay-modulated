// api/flavor.ts
//
// RD7.12 — the LLM-authored resolution Flavor endpoint. Authors ONE descriptive
// color line from a firewalled box-line fact set, validated FAIL-CLOSED before
// it can return. Mirrors api/headline.ts's plumbing (routeCommentary +
// timeout-race + null-on-any-failure); the client treats flavor:null exactly
// like a network failure and falls back to the deterministic RD7.11 line.
//
// HONESTY: the model is given ONLY stats + nickname + outcome tone (never the
// user's decision — see FlavorFacts), the router gets the forbidden-causation
// blocklist as bannedPhrases, AND every output passes validateFlavor (fail
// closed) before display. Beatdown losses never reach this endpoint (the client
// only POSTs win / close-loss facts).
//
// Wire contract (POST):
//   request:  { facts: FlavorFacts }
//   response: 200 { flavor: string|null, source?: "router", reason?: string }
//             400 { error } | 405 { error }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { waitUntil } from "@vercel/functions";
import { routeCommentary } from "./_lib/router/llmRouter.js";
import type { RouterConfig, PayoutTier } from "./_lib/router/types.js";
import {
  validateFlavor,
  type FlavorFacts,
} from "../shared/explanation/flavorValidator.js";
import {
  buildFlavorSystemPrompt,
  buildFlavorUserPrompt,
} from "../shared/explanation/flavorPrompt.js";

/** Server-side hard cap on the whole generation step (defense, not a deadline).
 *  Overridable for the smoke harness. */
const FLAVOR_TIMEOUT_MS = Number(process.env.FLAVOR_TIMEOUT_MS) || 2500;

/** Routing-key tier — Flavor doesn't vary by payout tier; a neutral constant. */
const FLAVOR_TIER: PayoutTier = "STARTER";

function buildRouterConfig(): RouterConfig {
  const anthropicApiKey = process.env.COMMENTARY_API_KEY;
  if (!anthropicApiKey) throw new Error("COMMENTARY_API_KEY not configured");
  return {
    namespace: "replaymod-flavor",
    defaultPrimary: "claude-haiku-4-5",
    anthropicApiKey,
    groqApiKey: process.env.GROQ_API_KEY,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    patchWindowMs: 1500,
  };
}

/** Minimal structural guard on the POSTed facts (fail closed on bad shape). */
function isFlavorFacts(x: unknown): x is FlavorFacts {
  if (!x || typeof x !== "object") return false;
  const f = x as Record<string, unknown>;
  if (f.outcome !== "win" && f.outcome !== "close-loss") return false; // beatdown never posted
  const p = f.player as Record<string, unknown> | undefined;
  if (!p || typeof p.last !== "string" || p.last.trim().length === 0) return false;
  const b = f.box as Record<string, unknown> | undefined;
  if (!b || typeof b.pts !== "number") return false;
  return true;
}

export interface GenerateFlavorResult {
  raw: string;
  backgroundWork?: Promise<void>;
  modelUsed?: string;
}

export async function generateFlavor(facts: FlavorFacts): Promise<GenerateFlavorResult> {
  const system = buildFlavorSystemPrompt();
  const user = buildFlavorUserPrompt(facts);
  const config = buildRouterConfig();
  // The forbidden framings are steered in the SYSTEM PROMPT and enforced by the
  // runtime validateFlavor gate (authoritative, fail-closed). routeCommentary's
  // own anti-redundancy bannedPhrases come from KV internally — its 4-arg
  // public interface is stable shared infra; not extended here.
  const result = await routeCommentary(system, user, FLAVOR_TIER, config);
  return { raw: result.commentary, backgroundWork: result.backgroundWork, modelUsed: result.modelUsed };
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<null>((resolve) => { handle = setTimeout(() => resolve(null), ms); });
  return Promise.race([p, timeoutPromise]).finally(() => { if (handle !== undefined) clearTimeout(handle); }) as Promise<T | null>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const facts = (req.body as { facts?: unknown })?.facts;
  if (!isFlavorFacts(facts)) return res.status(400).json({ error: "Missing or malformed facts" });

  let generated: GenerateFlavorResult | null = null;
  try {
    generated = await withTimeout(generateFlavor(facts), FLAVOR_TIMEOUT_MS);
  } catch {
    return res.status(200).json({ flavor: null, reason: "generator_error" });
  }
  if (!generated) return res.status(200).json({ flavor: null, reason: "timeout" });
  if (generated.backgroundWork) waitUntil(generated.backgroundWork);

  // FAIL CLOSED — display only on a full validation pass; else null → fallback.
  const v = validateFlavor(generated.raw, facts);
  if (!v.ok) return res.status(200).json({ flavor: null, reason: `validation:${v.reason}` });
  return res.status(200).json({ flavor: v.line, source: "router" });
}
