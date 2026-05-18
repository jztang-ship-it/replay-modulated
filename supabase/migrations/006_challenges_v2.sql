-- supabase/migrations/006_challenges_v2.sql
-- Extend shared_challenges + create challenge_attempts. Idempotent.

ALTER TABLE public.shared_challenges
  ADD COLUMN IF NOT EXISTS initial_roster   jsonb          NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS challenger_name  text,
  ADD COLUMN IF NOT EXISTS trigger_type     text           NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS share_headline   text,
  ADD COLUMN IF NOT EXISTS roster_size      integer        NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS winner_count     integer        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_score       numeric(6,1),
  ADD COLUMN IF NOT EXISTS best_user_name   text,
  ADD COLUMN IF NOT EXISTS last_attempt_at  timestamptz;

-- target_score alias: shared_challenges already has target_fp — we keep that
-- column name internally and map to target_score at the API layer.

CREATE TABLE IF NOT EXISTS public.challenge_attempts (
  attempt_id   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid         NOT NULL REFERENCES public.shared_challenges(challenge_id) ON DELETE CASCADE,
  user_id      uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name    text,
  score        numeric(6,1) NOT NULL,
  score_breakdown jsonb,
  is_winner    boolean      NOT NULL,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_challenge_attempts_challenge
  ON public.challenge_attempts (challenge_id);

ALTER TABLE public.challenge_attempts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'challenge_attempts' AND policyname = 'attempts: public read'
  ) THEN
    CREATE POLICY "attempts: public read"
      ON public.challenge_attempts FOR SELECT USING (true);
  END IF;
END $$;

-- Anonymous attempts allowed (user_id nullable)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'challenge_attempts' AND policyname = 'attempts: open insert'
  ) THEN
    CREATE POLICY "attempts: open insert"
      ON public.challenge_attempts FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Reputation columns on player_profiles
ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS challenges_created   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS challenges_attempted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS challenges_won       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS challenges_defended  integer NOT NULL DEFAULT 0;

-- Atomic counter increment for challenge attempts
CREATE OR REPLACE FUNCTION public.increment_challenge_counters(
  p_challenge_id uuid,
  p_is_winner    boolean,
  p_score        numeric,
  p_user_name    text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.shared_challenges
  SET
    attempt_count    = attempt_count + 1,
    winner_count     = winner_count + (CASE WHEN p_is_winner THEN 1 ELSE 0 END),
    best_score       = GREATEST(COALESCE(best_score, -1), p_score),
    best_user_name   = CASE
                         WHEN p_score >= COALESCE(best_score, -1) THEN p_user_name
                         ELSE best_user_name
                       END,
    last_attempt_at  = now()
  WHERE challenge_id = p_challenge_id;
END;
$$;
