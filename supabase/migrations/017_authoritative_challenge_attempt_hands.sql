-- Bind challenge attempts to the server-verified hand that produced them.
-- The API writes this column from hand_log after authenticating the caller;
-- clients cannot use it to replace the score.

ALTER TABLE public.challenge_attempts
  ADD COLUMN IF NOT EXISTS hand_id text;

CREATE INDEX IF NOT EXISTS idx_challenge_attempts_challenge_hand
  ON public.challenge_attempts (challenge_id, hand_id);
