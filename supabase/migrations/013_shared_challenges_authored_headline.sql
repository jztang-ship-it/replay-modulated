-- supabase/migrations/013_shared_challenges_authored_headline.sql
-- Phase 3.2 (lock: docs/challenge-landing-v2-phase3.2-wire-authored-headline-
-- to-take-lock.md, commit ac4b032): extend shared_challenges with an
-- AUTHORED_HEADLINE column distinct from the existing share_headline.
--
-- Why a new column instead of overloading share_headline:
--   - share_headline carries either an authored line OR a bank-pick
--     chadShareTrashTalk string (when /api/headline returns null and the
--     client falls back). The landing's accept page must render ONLY
--     authored lines — never a bank pick — so the column the landing
--     reads must be authored-or-null, not authored-or-bank.
--   - share_headline behavior is unchanged: it continues to power the OG
--     share-card PNG (api/share/card.ts) and the native share-sheet text
--     body, both of which accept bank fallback gracefully.
--
-- The landing renders `data.authored_headline || takeCard.take` — when
-- the column is NULL (legacy rows, /api/headline timeout, validator
-- rejection, or any failure), the recipient sees today's exact behavior:
-- the take card generator's TAKE field unchanged.
--
-- Nullable, additive, idempotent. No NOT NULL, no DEFAULT that triggers a
-- row-rewrite, no FK constraints. Existing rows continue to function
-- with NULL; the landing falls back to the take card automatically.

ALTER TABLE public.shared_challenges
  ADD COLUMN IF NOT EXISTS authored_headline text;

-- No new indexes. The landing reads this column alongside the existing
-- columns via the same PK lookup on challenge_id (api/challenge/[id].ts
-- GET); no new query shape.
