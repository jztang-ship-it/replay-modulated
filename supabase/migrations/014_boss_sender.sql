-- supabase/migrations/014_boss_sender.sql
-- Phase 2 (boss delivery consumer): make a daily boss playable through the
-- EXISTING challenge receive path (shared_challenges → /api/challenge/[id] →
-- ChallengeLandingScreen) by writing the contract's sender-facing projection
-- into shared_challenges and marking the row with a non-human sender_kind.
-- No parallel path, no new id type.
--
-- Mirrors the 012/013 style: additive, nullable, idempotent. No row-rewrite
-- DEFAULT except the single sender_kind marker (which carries an explicit
-- 'player' so every legacy human row reads as a player challenge), no FK
-- constraints on the new provenance columns.
--
-- Field mapping (bossContract.toSharedChallengeRow → column):
--   sender_kind        → sender_kind        ('boss' for bosses; 'player' default)
--   instance.instanceId→ instance_key       (natural daily key "date|slot|id";
--                                             the uuid PK stays auto-generated —
--                                             the daily instance UPSERTS on this
--                                             key and resolves to ONE shared uuid
--                                             for everyone that day)
--   identity.identityId→ boss_identity_id    (regeneration + audit)
--   instance.bankVersion→ boss_bank_version  (regenerate against the SAME bank)
--   proj.toughDay      → tough_day           (headliner couldn't hit band today)
--
-- Idempotent — safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- The one marker + the daily-instance natural key + boss provenance.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.shared_challenges
  ADD COLUMN IF NOT EXISTS sender_kind       text NOT NULL DEFAULT 'player',
  ADD COLUMN IF NOT EXISTS instance_key      text,
  ADD COLUMN IF NOT EXISTS boss_identity_id  text,
  ADD COLUMN IF NOT EXISTS boss_bank_version text,
  ADD COLUMN IF NOT EXISTS tough_day         boolean;

-- Partial unique key: the daily boss instance upserts on instance_key and
-- resolves to one shared uuid for everyone that day. Human rows stay NULL and
-- are exempt from the constraint (partial WHERE instance_key IS NOT NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_shared_challenges_instance_key
  ON public.shared_challenges (instance_key)
  WHERE instance_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Relax owner + close the RLS hole IN THE SAME MIGRATION.
--
-- A boss is an ownerless challenge, so created_by must become nullable. But
-- dropping NOT NULL would otherwise let an anon caller insert a row with
-- created_by = null past the old WITH CHECK (created_by = auth.uid()). We
-- re-tighten the HUMAN insert policy to (created_by = auth.uid() AND auth.uid()
-- IS NOT NULL) so a nullable created_by can't be spoofed. Boss writes go
-- through the service role (supabaseAdmin), which bypasses RLS — they're
-- unaffected by this policy; this only re-secures the human path.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.shared_challenges ALTER COLUMN created_by DROP NOT NULL;

DROP POLICY IF EXISTS "challenges: authenticated insert" ON public.shared_challenges;
CREATE POLICY "challenges: authenticated insert"
  ON public.shared_challenges FOR INSERT
  WITH CHECK (created_by = auth.uid() AND auth.uid() IS NOT NULL);
