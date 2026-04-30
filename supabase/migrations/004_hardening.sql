-- supabase/migrations/004_hardening.sql
-- Pre-launch defense-in-depth: bound the columns that touch user-controlled
-- input or that downstream code (leaderboard KV keys, FP gauges) trusts. None
-- of these CHECKs change the existing happy path — every legitimate row in
-- prod today should already satisfy them. They exist to fail-fast on
-- malicious / corrupt writes that slip past the API layer (e.g. a forged
-- service-role-key request, a future direct insert, or a regressed call site).
--
-- Run from Supabase dashboard → SQL Editor (or `supabase db push` if linked).
-- Idempotent — safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- player_profiles.nickname: cap length so a 10000-char value can't bloat
-- leaderboard KV keys (member format: `uid:nickname:sessionId`). The Vercel
-- handler now truncates to 32 server-side; this is the schema-level twin.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_profiles_nickname_length'
  ) THEN
    ALTER TABLE public.player_profiles
      ADD CONSTRAINT player_profiles_nickname_length
      CHECK (length(nickname) BETWEEN 1 AND 32);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- hand_log.total_fp: realistic per-hand range across both sports.
--   Lower bound: -50 (a pitcher can legitimately go negative; -50 is far past
--                any plausible single-hand outing).
--   Upper bound: 800 (matches FP_CEILING_BY_SPORT.baseball in
--                api/leaderboard.ts; basketball ceiling is 300).
-- The leaderboard handler enforces the per-sport ceiling on submit; this is
-- defense-in-depth for direct hand_log writes (e.g. from logHandToDb).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hand_log_total_fp_range'
  ) THEN
    ALTER TABLE public.hand_log
      ADD CONSTRAINT hand_log_total_fp_range
      CHECK (total_fp >= -50 AND total_fp <= 800);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- player_state.balance: integer cents-equivalent. Cap at 100M to prevent
-- runaway values from a runaway streak/multiplier bug.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_state_balance_range'
  ) THEN
    ALTER TABLE public.player_state
      ADD CONSTRAINT player_state_balance_range
      CHECK (balance >= 0 AND balance <= 100000000);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- player_state.streak: leaderboard handler caps streak metric at 100.
-- Keep a generous 1000 here so legitimate users on tear streaks aren't
-- blocked, but a forged "999999999" can't land.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_state_streak_range'
  ) THEN
    ALTER TABLE public.player_state
      ADD CONSTRAINT player_state_streak_range
      CHECK (streak >= 0 AND streak <= 1000);
  END IF;
END $$;
