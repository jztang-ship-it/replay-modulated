/**
 * api/me.ts — Vercel serverless function.
 *
 * GET (with `Authorization: Bearer <access_token>`)
 * Validates the Supabase JWT and returns the user's auth state.
 *
 * Always returns 200. A missing/bad/expired token degrades to anonymous —
 * the chooser uses this to bucket users into a "signed-in" presentation
 * without breaking on a brittle localStorage read.
 *
 * Response: { isAnonymous: boolean, nickname: string | null, uid: string | null }
 *
 * Cache-Control: private, no-store — auth state must not be cached at the edge.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

type MeResponse = {
  isAnonymous: boolean;
  nickname: string | null;
  uid: string | null;
};

const ANONYMOUS: MeResponse = { isAnonymous: true, nickname: null, uid: null };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");

  if (!supabase) return res.status(200).json(ANONYMOUS);

  const auth = req.headers.authorization ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(200).json(ANONYMOUS);

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(200).json(ANONYMOUS);

  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const nickname =
    typeof meta.nickname === "string" ? meta.nickname :
    typeof meta.full_name === "string" ? meta.full_name :
    null;

  return res.status(200).json({
    isAnonymous: data.user.is_anonymous ?? false,
    nickname,
    uid: data.user.id,
  } satisfies MeResponse);
}
