-- supabase/migrations/010_challenge_attempts_anon_uid.sql
--
-- Cluster anonymous challenge attempts by a stable per-browser identity
-- so the 1-hour replay window math works without sign-in.
--
-- Background: challenge_attempts.user_id is a uuid REFERENCES
-- auth.users(id). Anonymous players have no auth row, so the API
-- writes user_id = null for them. Without any identity, the server
-- can't tell that two anonymous attempts came from the same browser,
-- so every attempt looks like a "first attempt" with a fresh 60:00
-- window. (attempt.ts:128-130 calls this out as the only safe
-- degradation.)
--
-- Add a plain TEXT anon_uid column — no FK, no constraints — so the
-- client can send its localStorage rm_uid ("u_abc123def…") and the
-- server can cluster on it. Authenticated attempts continue to use
-- user_id; anonymous attempts use anon_uid. Tests for "is this the
-- user's first attempt?" check whichever identity column is in scope.
--
-- Index covers the per-user-per-challenge ordered-by-created_at query
-- the API runs to find first_attempt_at. Mirrors
-- idx_challenge_attempts_challenge_user_created from migration 007
-- (which keyed on user_id).
--
-- Idempotent — column add and index create are both IF NOT EXISTS.

ALTER TABLE public.challenge_attempts
  ADD COLUMN IF NOT EXISTS anon_uid TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_challenge_attempts_challenge_anon_created
  ON public.challenge_attempts (challenge_id, anon_uid, created_at)
  WHERE anon_uid IS NOT NULL;
