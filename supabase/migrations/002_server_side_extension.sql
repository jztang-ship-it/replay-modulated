-- supabase/migrations/002_server_side_extension.sql
-- Extends 001_player_tables.sql for server-side hand resolution.
-- Does NOT modify existing columns — only adds new ones.

-- Extend player_state
ALTER TABLE public.player_state ADD COLUMN IF NOT EXISTS ftue_completed boolean NOT NULL DEFAULT false;
ALTER TABLE public.player_state ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;
ALTER TABLE public.player_state ADD COLUMN IF NOT EXISTS last_credit_claim timestamptz;

-- Extend hand_log
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS hand_id text;
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS bet_amount integer NOT NULL DEFAULT 10;
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS final_roster jsonb;
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS scores jsonb;
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS streak_multiplier numeric(3,1) NOT NULL DEFAULT 1.0;
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS is_ftue boolean NOT NULL DEFAULT false;
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false;
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS seed text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hand_log_hand_id ON public.hand_log(hand_id) WHERE hand_id IS NOT NULL;

-- resolve_hand RPC
-- Atomic: locks player_state row, updates balance/streak/hands_played, inserts hand_log.
-- Inputs match 001 column conventions: id (not user_id), hands_played (not hand_count), balance as integer.
CREATE OR REPLACE FUNCTION public.resolve_hand(
  p_user_id uuid,
  p_hand_id text,
  p_bet_amount integer,
  p_base_payout integer,
  p_is_win boolean,
  p_roster_ids text[],
  p_final_roster jsonb,
  p_scores jsonb,
  p_total_fp numeric(6,1),
  p_tier text,
  p_seed text,
  p_is_ftue boolean,
  p_is_protected boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state public.player_state%ROWTYPE;
  v_new_balance integer;
  v_new_streak integer;
  v_streak_multiplier numeric;
  v_final_payout integer;
  v_new_hands_played integer;
BEGIN
  -- Lock row for update
  SELECT * INTO v_state FROM public.player_state WHERE id = p_user_id FOR UPDATE;

  -- Auto-initialize if first time
  IF NOT FOUND THEN
    INSERT INTO public.player_state (id) VALUES (p_user_id);
    SELECT * INTO v_state FROM public.player_state WHERE id = p_user_id FOR UPDATE;
  END IF;

  -- Streak: win = STARTER or above (multiplier >= 1.5)
  v_new_streak := CASE WHEN p_is_win THEN v_state.streak + 1 ELSE 0 END;

  -- Streak multiplier (payout layer ONLY — never modifies FP or tier)
  v_streak_multiplier := CASE
    WHEN v_new_streak >= 10 THEN 2.0
    WHEN v_new_streak >= 5  THEN 1.5
    WHEN v_new_streak >= 3  THEN 1.2
    ELSE 1.0
  END;

  v_final_payout := FLOOR(p_base_payout * v_streak_multiplier);
  v_new_balance := v_state.balance + v_final_payout - p_bet_amount;
  v_new_hands_played := v_state.hands_played + 1;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.player_state SET
    balance       = v_new_balance,
    streak        = v_new_streak,
    hands_played  = v_new_hands_played,
    ftue_completed = CASE WHEN p_is_ftue THEN true ELSE v_state.ftue_completed END,
    xp            = v_state.xp + CASE WHEN p_is_win THEN 30 ELSE 10 END,
    updated_at    = now()
  WHERE id = p_user_id;

  INSERT INTO public.hand_log (
    player_id, hand_id, bet_amount, roster_ids, final_roster, scores,
    total_fp, tier, payout, streak_at_play, streak_multiplier,
    seed, is_ftue, is_protected, verified
  ) VALUES (
    p_user_id, p_hand_id, p_bet_amount, p_roster_ids, p_final_roster, p_scores,
    p_total_fp, p_tier, v_final_payout, v_new_streak, v_streak_multiplier,
    p_seed, p_is_ftue, p_is_protected, true
  );

  RETURN json_build_object(
    'balance',          v_new_balance,
    'streak',           v_new_streak,
    'streakMultiplier',  v_streak_multiplier,
    'finalPayout',       v_final_payout,
    'handsPlayed',       v_new_hands_played,
    'xp',               v_state.xp + CASE WHEN p_is_win THEN 30 ELSE 10 END
  );
END;
$$;
