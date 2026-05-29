-- supabase/migrations/011_player_profile_ftue.sql
--
-- Phase 5b piece 1 — Item B (FTUE bypass for signed-in users, doc lock
-- edc58d9). Adds a server-side FTUE-completion flag on player_profiles
-- so signed-in users' FTUE state follows them across devices, browsers,
-- and local-storage clears.
--
-- NULL = unknown — treated as "completed" per B7 of the lock (bias
-- against re-firing FTUE for existing users; downside of the
-- newly-signed-up-without-anon-play case is minor and explicitly
-- accepted by the lock).
-- true  = completed.
-- false = needs FTUE (not used by any current code path; reserved
--         for a future explicit reset).

ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS ftue_completed boolean;
