-- supabase/migrations/015_challenge_attempts_referrer_token.sql
--
-- Layer C (boss outbound forwards): persist the sender-stable referral token
-- that rides a forwarded boss link as ?ref={token}, so recipient attempts can be
-- grouped into a per-sender "lobby" (everyone who entered via one link, ranked
-- against each other) without accounts.
--
-- Background: a boss is the SINGLE global daily challenge row (one shared uuid;
-- migration 014). Forwarding never mints a new row — the referrer rides BESIDE
-- it as a URL ?ref param (delta-b, client-only: rm_referrer_token in
-- localStorage). To assemble the lobby (delta-c), the recipient's attempt must
-- carry that token so attempts can be filtered / grouped by it.
--
-- Add a plain TEXT referrer_token column — no FK, no constraints, NULLABLE, no
-- default — so the API can write the captured ?ref token alongside the attempt.
-- Existing rows get NULL (additive; no backfill, nothing existing changes).
-- Direct boss plays (no ?ref) and all human challenges write NULL, unchanged.
-- Mirrors the 010 anon_uid column add.
--
-- Index covers the lobby read delta-c will run: attempts for one challenge,
-- grouped by referrer, ranked by score. Partial (WHERE referrer_token IS NOT
-- NULL) so non-forwarded attempts don't bloat it — same pattern as the 010
-- anon_uid partial index (which keyed challenge_id, anon_uid, created_at).
--
-- Idempotent — column add and index create are both IF NOT EXISTS.
--
-- WRITE PATH NOT YET WIRED: the server insert (api/challenge/[id]/attempt.ts)
-- and the client capture (?ref off the URL -> challengeCtx -> useChallengeAttempt
-- body) are a SEPARATE pass, applied AFTER this column is live on prod. This
-- migration alone changes nothing about runtime behavior.

ALTER TABLE public.challenge_attempts
  ADD COLUMN IF NOT EXISTS referrer_token TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_challenge_attempts_challenge_referrer_score
  ON public.challenge_attempts (challenge_id, referrer_token, score DESC)
  WHERE referrer_token IS NOT NULL;
