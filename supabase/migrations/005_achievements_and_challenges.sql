-- supabase/migrations/005_achievements_and_challenges.sql
-- Achievement unlocks, shared challenges, and hand_log sport/season tracking.
-- Idempotent — safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- hand_log: add sport + season for per-sport leaderboard and challenge replay
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS sport text;
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS season text;

-- ─────────────────────────────────────────────────────────────────────────────
-- player_profiles: social display columns (extends 001)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS total_hands integer NOT NULL DEFAULT 0;
ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS lifetime_best_fp numeric(6,1) NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- user_achievements: permanent unlock log, one row per user per achievement
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id text        NOT NULL,
  sport          text        NOT NULL,
  unlocked_at    timestamptz NOT NULL DEFAULT now(),
  source_hand_id text,           -- hand_log.hand_id that triggered the unlock
  source_data    jsonb,          -- snapshot: { tier, totalFp, season, ... }
  UNIQUE (user_id, achievement_id)  -- each achievement can only be unlocked once
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user
  ON public.user_achievements (user_id);

CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement
  ON public.user_achievements (achievement_id);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "achievements: users read own"
  ON public.user_achievements FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "achievements: users insert own"
  ON public.user_achievements FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- shared_challenges: a hand packaged for async replay by others
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_challenges (
  challenge_id   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by     uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hand_id        text         NOT NULL,       -- references hand_log.hand_id
  sport          text         NOT NULL,
  season         text         NOT NULL,
  slate_seed     text         NOT NULL,
  target_fp      numeric(6,1) NOT NULL,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  expires_at     timestamptz,                 -- null = no expiry
  view_count     integer      NOT NULL DEFAULT 0,
  attempt_count  integer      NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_shared_challenges_created_by
  ON public.shared_challenges (created_by);

CREATE INDEX IF NOT EXISTS idx_shared_challenges_created_at
  ON public.shared_challenges (created_at DESC);

ALTER TABLE public.shared_challenges ENABLE ROW LEVEL SECURITY;

-- Challenges are designed to be shared — anyone can read
CREATE POLICY "challenges: public read"
  ON public.shared_challenges FOR SELECT
  USING (true);

CREATE POLICY "challenges: authenticated insert"
  ON public.shared_challenges FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- view_count / attempt_count increments happen server-side via service role
