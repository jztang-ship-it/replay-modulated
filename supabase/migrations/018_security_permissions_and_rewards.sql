BEGIN;
-- Remove QA bypasses, including table/column privileges inherited by browser roles.
DROP POLICY IF EXISTS "attempts: open update" ON public.challenge_attempts;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.challenge_attempts, public.shared_challenges,
  public.hand_log, public.player_state, public.user_achievements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_challenge_counters(uuid,boolean,numeric,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.increment_challenges_defended(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.increment_challenge_counters(uuid,boolean,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_challenges_defended(uuid) TO service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.player_profiles FROM PUBLIC,anon,authenticated;
GRANT INSERT(id,nickname,is_anonymous), UPDATE(id,nickname,is_anonymous) ON public.player_profiles TO authenticated;
-- Do not trust a browser's anonymous-status assertion, including during an upsert.
CREATE OR REPLACE FUNCTION public.profile_auth_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 SELECT COALESCE(u.is_anonymous,false) INTO NEW.is_anonymous FROM auth.users u WHERE u.id=NEW.id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.profile_auth_status() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS profile_auth_status ON public.player_profiles;
CREATE TRIGGER profile_auth_status BEFORE INSERT OR UPDATE ON public.player_profiles
 FOR EACH ROW EXECUTE FUNCTION public.profile_auth_status();
CREATE TABLE public.reward_claims (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 campaign text NOT NULL, feedback_id uuid REFERENCES public.feedback_submissions(id),
 amount integer NOT NULL CHECK(amount=100), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,campaign)
);
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reward_claims FROM PUBLIC,anon,authenticated;
-- Historical feedback has no trustworthy payout ledger. Mark its campaign consumed
-- rather than awarding the same historical submission a second time after cutover.
INSERT INTO public.reward_claims(user_id,campaign,feedback_id,amount)
 SELECT DISTINCT ON(user_id) user_id,'feedback_v1',id,100
 FROM public.feedback_submissions ORDER BY user_id,created_at,id;
CREATE OR REPLACE FUNCTION public.grant_coins(p_amount int,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid:=auth.uid(); v_feedback uuid; v_claimed integer;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
 IF p_reason IS DISTINCT FROM 'feedback_v1' OR p_amount IS DISTINCT FROM 100 THEN
  RAISE EXCEPTION 'invalid reward'; END IF;
 SELECT id INTO v_feedback FROM public.feedback_submissions WHERE user_id=v_user
 ORDER BY created_at,id LIMIT 1;
 IF v_feedback IS NULL THEN RAISE EXCEPTION 'feedback required'; END IF;
 INSERT INTO public.reward_claims(user_id,campaign,feedback_id,amount)
 VALUES(v_user,'feedback_v1',v_feedback,100) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_claimed=ROW_COUNT;
 IF v_claimed=0 THEN RAISE EXCEPTION 'reward already claimed'; END IF;
 INSERT INTO public.player_state(id) VALUES(v_user) ON CONFLICT DO NOTHING;
 UPDATE public.player_state SET balance=balance+100,updated_at=now() WHERE id=v_user;
END $$;
REVOKE ALL ON FUNCTION public.grant_coins(int,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.grant_coins(int,text) TO authenticated;
COMMIT;
