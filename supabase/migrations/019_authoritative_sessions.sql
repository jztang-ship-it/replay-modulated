BEGIN;
-- Real server-scored baseball/football results can be negative; the numeric
-- column bounds storage. The old client-input ceiling is no longer authority.
ALTER TABLE public.hand_log DROP CONSTRAINT IF EXISTS hand_log_total_fp_range;
ALTER TABLE public.hand_log ADD CONSTRAINT hand_log_total_fp_range CHECK(total_fp BETWEEN -99999.9 AND 99999.9);
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS sport text;
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS season text;
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS competition text;
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS challenge_id uuid REFERENCES public.shared_challenges(challenge_id);
ALTER TABLE public.hand_log ADD COLUMN IF NOT EXISTS authority_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.shared_challenges ADD COLUMN IF NOT EXISTS authority_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.challenge_attempts ADD COLUMN IF NOT EXISTS authority_version integer NOT NULL DEFAULT 1;
CREATE TABLE public.hand_sessions (
 hand_id text PRIMARY KEY, player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL, sport text NOT NULL CHECK(sport IN('basketball','baseball','football')),
 season text NOT NULL, competition text, challenge_id uuid REFERENCES public.shared_challenges(challenge_id),
 bet_amount integer NOT NULL CHECK(bet_amount IN(0,10,30,50,100)),
 state jsonb NOT NULL, revision integer NOT NULL DEFAULT 0, settled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
 UNIQUE(player_id,request_id)
);
ALTER TABLE public.hand_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hand_sessions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.hand_sessions TO service_role;
-- Only a committed hand contributes. Pool update rolls back with settlement.
CREATE TABLE public.authoritative_bonus_pools (
 scope text PRIMARY KEY, amount numeric NOT NULL DEFAULT 1000 CHECK(amount>=0)
);
ALTER TABLE public.authoritative_bonus_pools ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.authoritative_bonus_pools FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.authoritative_bonus_pools TO service_role;
CREATE OR REPLACE FUNCTION public.start_authoritative_hand(p_user uuid,p_id text,p_request uuid,
 p_sport text,p_season text,p_competition text,p_challenge uuid,p_bet integer,p_state jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h public.hand_sessions; v_balance integer;
BEGIN
 -- Lock the wallet BEFORE checking the retry key: retries/concurrent starts cannot double debit.
 INSERT INTO public.player_state(id) VALUES(p_user) ON CONFLICT DO NOTHING;
 SELECT balance INTO v_balance FROM public.player_state WHERE id=p_user FOR UPDATE;
 SELECT * INTO h FROM public.hand_sessions WHERE player_id=p_user AND request_id=p_request;
 IF FOUND THEN
  IF h.sport<>p_sport OR h.season<>p_season OR h.competition IS DISTINCT FROM p_competition
    OR h.challenge_id IS DISTINCT FROM p_challenge OR h.bet_amount<>p_bet THEN RAISE EXCEPTION 'request context mismatch'; END IF;
  RETURN to_jsonb(h);
 END IF;
 IF p_bet<0 OR v_balance<p_bet THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
 UPDATE public.player_state SET balance=balance-p_bet,updated_at=now() WHERE id=p_user;
 INSERT INTO public.hand_sessions(hand_id,player_id,request_id,sport,season,competition,challenge_id,bet_amount,state)
 VALUES(p_id,p_user,p_request,p_sport,p_season,p_competition,p_challenge,p_bet,p_state) RETURNING * INTO h;
 RETURN to_jsonb(h);
END $$;
-- CAS commits an entire server-generated turn, including final settlement. No metadata backfill.
CREATE OR REPLACE FUNCTION public.commit_authoritative_hand(p_user uuid,p_id text,p_revision integer,
 p_state jsonb,p_settle boolean,p_tier text,p_multiplier numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h public.hand_sessions; w public.player_state; r jsonb; fp numeric; payout integer;
 v_streak integer; mult numeric; won boolean; ids text[]; scores jsonb;
BEGIN
 SELECT * INTO h FROM public.hand_sessions WHERE hand_id=p_id AND player_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown hand'; END IF;
 IF h.settled THEN RETURN to_jsonb(h); END IF;
 IF h.expires_at<=now() THEN RAISE EXCEPTION 'hand expired'; END IF;
 IF h.revision<>p_revision THEN RAISE EXCEPTION 'stale revision'; END IF;
 IF p_settle THEN
  SELECT * INTO w FROM public.player_state WHERE id=p_user FOR UPDATE;
  SELECT round(sum((c->>'actualFp')::numeric),1),array_agg(c->>'basePlayerId'),
   jsonb_object_agg(c->>'basePlayerId',c->'actualFp') INTO fp,ids,scores
   FROM jsonb_array_elements(p_state->'roster') c;
  IF fp IS NULL OR cardinality(ids)<>5 THEN RAISE EXCEPTION 'invalid server result'; END IF;
  won:=p_tier NOT IN('BUST','ROOKIE'); v_streak:=CASE WHEN won THEN w.streak+1 WHEN p_tier='ROOKIE' THEN w.streak ELSE 0 END;
  mult:=CASE WHEN h.sport='football' THEN (CASE WHEN w.streak>=10 THEN 2.5 WHEN w.streak>=5 THEN 1.7 WHEN w.streak>=3 THEN 1.3 ELSE 1 END) ELSE (CASE WHEN w.streak>=10 THEN 2 WHEN w.streak>=5 THEN 1.5 WHEN w.streak>=3 THEN 1.2 ELSE 1 END) END;
  payout:=round(round(h.bet_amount*p_multiplier)*mult);
  UPDATE public.player_state SET balance=balance+payout,streak=v_streak,
    hands_played=hands_played+1,xp=xp+CASE WHEN won THEN 30 ELSE 10 END,updated_at=now() WHERE id=p_user;
  INSERT INTO public.hand_log(player_id,hand_id,roster_ids,total_fp,tier,payout,streak_at_play,verified,
   bet_amount,final_roster,scores,streak_multiplier,seed,is_ftue,is_protected,sport,season,competition,challenge_id,authority_version)
  VALUES(p_user,p_id,ids,fp,p_tier,payout,v_streak,true,h.bet_amount,p_state->'roster',scores,mult,'',false,false,
   h.sport,h.season,h.competition,h.challenge_id,2);
  IF h.bet_amount>0 THEN
   INSERT INTO public.authoritative_bonus_pools(scope,amount)
   VALUES(h.sport||COALESCE(':'||h.competition,''),1000+h.bet_amount*0.05)
   ON CONFLICT(scope) DO UPDATE SET amount=public.authoritative_bonus_pools.amount+EXCLUDED.amount-1000;
  END IF;
  p_state:=p_state||jsonb_build_object('hand',jsonb_build_object('hand_id',p_id,'total_fp',fp,'tier',p_tier,
    'payout',payout,'streak_at_play',v_streak,'balance',w.balance+payout,'sport',h.sport,'season',h.season));
 END IF;
 UPDATE public.hand_sessions SET state=p_state,revision=revision+1,settled=p_settle
 WHERE hand_id=p_id RETURNING * INTO h;
 RETURN to_jsonb(h);
END $$;
REVOKE ALL ON FUNCTION public.start_authoritative_hand(uuid,text,uuid,text,text,text,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.commit_authoritative_hand(uuid,text,integer,jsonb,boolean,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_authoritative_hand(uuid,text,uuid,text,text,text,uuid,integer,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_authoritative_hand(uuid,text,integer,jsonb,boolean,text,numeric) TO service_role;
-- Legacy authority is explicitly excluded, without deleting historical records.
CREATE UNIQUE INDEX challenge_attempts_v2_once ON public.challenge_attempts(challenge_id,hand_id) WHERE authority_version=2;
ALTER TABLE public.challenge_attempts ADD COLUMN IF NOT EXISTS server_result jsonb;
CREATE OR REPLACE FUNCTION public.submit_authoritative_attempt(p_user uuid,p_challenge uuid,p_hand text,p_name text,p_ref text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.shared_challenges; h public.hand_log; a public.challenge_attempts;
 first_at timestamptz; closes timestamptz; prev_best numeric; prev_win boolean; is_open boolean;
 is_self boolean; won boolean; personal boolean; flipped boolean; defended boolean;
 attempts integer; winners integer; best numeric; best_name text; result jsonb;
BEGIN
 -- Serialize every attempt against a challenge; windows/counters/winner transitions are atomic.
 SELECT * INTO c FROM public.shared_challenges WHERE challenge_id=p_challenge FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'challenge not found'; END IF;
 IF c.sender_kind IS DISTINCT FROM 'boss' AND c.authority_version<>2 THEN RAISE EXCEPTION 'legacy challenge requires recreation'; END IF;
 SELECT * INTO h FROM public.hand_log WHERE player_id=p_user AND hand_id=p_hand AND verified AND authority_version=2;
 IF NOT FOUND OR h.challenge_id IS DISTINCT FROM p_challenge OR h.sport<>c.sport OR h.season<>c.season THEN
  RAISE EXCEPTION 'hand not bound to challenge'; END IF;
 SELECT * INTO a FROM public.challenge_attempts WHERE challenge_id=p_challenge AND hand_id=p_hand AND authority_version=2;
 IF FOUND THEN RETURN a.server_result||jsonb_build_object('idempotent',true); END IF;
 SELECT min(created_at),max(score),COALESCE(bool_or(is_winner),false) INTO first_at,prev_best,prev_win
 FROM public.challenge_attempts WHERE challenge_id=p_challenge AND user_id=p_user AND authority_version=2;
 first_at:=COALESCE(first_at,now()); closes:=first_at+interval '1 hour'; is_open:=now()<=closes;
 is_self:=c.created_by IS NOT DISTINCT FROM p_user; won:=h.total_fp>c.target_fp;
 personal:=prev_best IS NULL OR h.total_fp>prev_best;
 flipped:=NOT is_self AND is_open AND won AND NOT prev_win;
 defended:=NOT is_self AND is_open AND NOT won AND c.created_by IS NOT NULL;
 INSERT INTO public.challenge_attempts(challenge_id,hand_id,user_id,user_name,score,score_breakdown,is_winner,referrer_token,authority_version)
 VALUES(p_challenge,p_hand,p_user,left(p_name,32),h.total_fp,h.final_roster,won,p_ref,2) RETURNING * INTO a;
 -- Only results inside each user's replay window count. Recompute avoids legacy poison and read-modify-write loss.
 SELECT count(*),count(*) FILTER(WHERE has_won) INTO attempts,winners FROM (
  SELECT user_id,bool_or(is_winner) AS has_won FROM (
   SELECT *,min(created_at) OVER(PARTITION BY user_id) AS start_at FROM public.challenge_attempts
   WHERE challenge_id=p_challenge AND authority_version=2 AND user_id IS DISTINCT FROM c.created_by
  ) t WHERE created_at<=start_at+interval '1 hour' GROUP BY user_id
 ) users;
 SELECT score,user_name INTO best,best_name FROM public.challenge_attempts
 WHERE challenge_id=p_challenge AND authority_version=2 ORDER BY score DESC,created_at,attempt_id LIMIT 1;
 UPDATE public.shared_challenges SET attempt_count=attempts,winner_count=winners,best_score=best,best_user_name=best_name,last_attempt_at=now()
 WHERE challenge_id=p_challenge;
 IF defended THEN PERFORM public.increment_challenges_defended(c.created_by); END IF;
 IF NOT is_self AND is_open AND c.created_by IS NOT NULL AND c.sender_kind IS DISTINCT FROM 'boss' THEN
 INSERT INTO public.user_notifications(user_id,type,payload) VALUES(c.created_by,'challenge_attempted',jsonb_build_object(
  'challenge_id',p_challenge,'attempter_name',left(p_name,32),'attempter_user_id',p_user,'attempter_score',h.total_fp,
  'target_score',c.target_fp,'is_winner',won,'attempter_roster',h.final_roster)); END IF;
 result:=jsonb_build_object('attempt_id',a.attempt_id,'score',h.total_fp,'is_winner',won,'is_practice',NOT is_open,
 'is_personal_best',personal,'winner_count_flipped',flipped,'defended_bumped',defended,
 'first_attempt_at',first_at,'first_attempt_at_ms',extract(epoch FROM first_at)*1000,
 'window_closes_at',closes,'window_closes_at_ms',extract(epoch FROM closes)*1000,'is_window_open',is_open,
 'attempt_count',attempts,'winner_count',winners,'best_score',best,'best_user_name',best_name,
 'user_best_score',greatest(h.total_fp,prev_best),'user_has_won',won OR prev_win,
 'is_best',NOT is_self AND is_open AND (c.best_score IS NULL OR h.total_fp>c.best_score));
 UPDATE public.challenge_attempts SET server_result=result WHERE attempt_id=a.attempt_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.submit_authoritative_attempt(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_authoritative_attempt(uuid,uuid,text,text,text) TO service_role;
COMMIT;
