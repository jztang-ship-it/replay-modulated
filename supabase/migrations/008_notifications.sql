-- supabase/migrations/008_notifications.sql
--
-- In-app notifications. When a non-practice attempt completes against a
-- challenge, the API writes a row here for the challenge creator. The
-- client polls / fetches via GET /api/notifications and marks rows read
-- via PATCH /api/notifications.
--
-- Payload is jsonb so future notification types (head-to-head streaks,
-- rivalry milestones, etc.) can reuse the same surface without
-- migrating. For "challenge_attempted" the payload carries:
--   challenge_id, attempter_name, attempter_user_id, attempter_score,
--   target_score, is_winner.

CREATE TABLE IF NOT EXISTS public.user_notifications (
  notification_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            text        NOT NULL,
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz
);

-- Most queries fetch a user's unread notifications, newest first.
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON public.user_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_recent
  ON public.user_notifications (user_id, created_at DESC);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_notifications' AND policyname = 'notifications: own read'
  ) THEN
    CREATE POLICY "notifications: own read"
      ON public.user_notifications FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_notifications' AND policyname = 'notifications: own update'
  ) THEN
    CREATE POLICY "notifications: own update"
      ON public.user_notifications FOR UPDATE USING (user_id = auth.uid());
  END IF;
END $$;

-- Inserts always go through the service-role API path (api/challenge/...
-- writes them on attempt). No public INSERT policy.
