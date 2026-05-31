-- supabase/migrations/012_shared_challenges_trigger_detail.sql
-- Phase 5c S1 (design lock 8f7e288): extend shared_challenges with the four
-- trigger-detail fields needed by the recipient contextual trash-talk intro.
--
-- All columns nullable, additive, idempotent. No NOT NULL, no DEFAULT that
-- triggers a row-rewrite, no FK constraints. Existing rows continue to
-- function with NULL across all four; recipient intro degrades to the
-- per-trigger generic fallback per the design lock's B-rule.
--
-- Field mapping (TriggerResult → column):
--   nearMissGap         → near_miss_gap         (miss only)
--   nearMissNextTier    → near_miss_next_tier   (miss only)
--   anchorBasePlayerId  → anchor_base_player_id (rare_pull today; design-
--                                                forward for future per-trigger
--                                                anchors)
--   topGameTier         → top_game_tier         (rare_pull only; values are
--                                                "record" | "career" | "season")
--
-- Idempotent — safe to re-run.

ALTER TABLE public.shared_challenges
  ADD COLUMN IF NOT EXISTS near_miss_gap         numeric(6,1),
  ADD COLUMN IF NOT EXISTS near_miss_next_tier   text,
  ADD COLUMN IF NOT EXISTS anchor_base_player_id text,
  ADD COLUMN IF NOT EXISTS top_game_tier         text;

-- No new indexes. The recipient intro reads these columns alongside
-- trigger_type via the existing PK lookup on challenge_id (api/challenge/
-- [id].ts GET); no new query shape needs an index.
