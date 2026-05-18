-- supabase/migrations/007_replay_window.sql
--
-- 1-hour replay-window foundation.
--
-- The window is per-(user, challenge): it starts at the user's FIRST
-- attempt against a given challenge and runs for 60 minutes. Within the
-- window, replays can update the user's best score and flip the
-- challenge-level winner_count. After the window, replays are pure
-- practice — no counters touch.
--
-- All the relevant data already exists in challenge_attempts.created_at;
-- this migration only adds an index so the per-(user, challenge) MIN
-- and MAX lookups the API does on every attempt are fast. The
-- challenges_defended counter already exists on player_profiles from
-- migration 006; the API now writes to it directly (UPSERT) on every
-- losing attempt within window.

CREATE INDEX IF NOT EXISTS idx_challenge_attempts_challenge_user_created
  ON public.challenge_attempts (challenge_id, user_id, created_at)
  WHERE user_id IS NOT NULL;

-- Atomic "increment-or-create" helper for the challenger's defended
-- counter. We use UPSERT semantics because the challenger's
-- player_profiles row may not exist yet (auth.users → profile creation
-- isn't enforced by a trigger today). If it doesn't exist, we create a
-- minimal row with defended = 1; otherwise increment the existing value.
CREATE OR REPLACE FUNCTION public.increment_challenges_defended(
  p_user_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.player_profiles (id, challenges_defended)
  VALUES (p_user_id, 1)
  ON CONFLICT (id) DO UPDATE
    SET challenges_defended = public.player_profiles.challenges_defended + 1;
END;
$$;
