-- supabase/migrations/009_challenge_attempts_update_policy.sql
--
-- Add a permissive UPDATE policy to public.challenge_attempts so QA
-- backdating of created_at works through the standard Supabase client.
--
-- Migration 006 enabled RLS on the table and added INSERT and SELECT
-- policies only. Under RLS-without-an-UPDATE-policy, UPDATEs from the
-- anon and authenticated roles match zero rows and silently return
-- success — Postgres reports no error, no rows are touched. This
-- looked like a trigger "overriding" created_at back to NOW() during
-- 1-hour-replay-window backdate testing; it was simply the UPDATE
-- never applying.
--
-- The policy is permissive (USING true, WITH CHECK true) because the
-- table is QA-only mutable today and the production API mutates via
-- the service role, which bypasses RLS regardless. Tightening the
-- policy can come in a later migration once a real user-update flow
-- exists (none today — every attempt-row mutation we ship goes
-- through supabaseAdmin in api/challenge/[id]/attempt.ts).
--
-- Idempotent: wrapped in the standard "if not exists" pg_policies
-- check used elsewhere in the migration set.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'challenge_attempts'
      AND policyname = 'attempts: open update'
  ) THEN
    CREATE POLICY "attempts: open update"
      ON public.challenge_attempts FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
