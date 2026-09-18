BEGIN;
-- Separate from monetary hand_sessions. No wallet creation, balance locking,
-- XP/coin grants, stake, multiplier or prize pool updates in these functions.
CREATE TABLE IF NOT EXISTS public.free_play_sessions (
 hand_id text PRIMARY KEY, player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL, sport text NOT NULL CHECK(sport='basketball'),
 season text NOT NULL, competition text CHECK(competition IS NULL),
 challenge_id uuid REFERENCES public.shared_challenges(challenge_id),
 state jsonb NOT NULL, revision integer NOT NULL DEFAULT 0, settled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
 UNIQUE(player_id,request_id)
);
ALTER TABLE public.free_play_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_play_sessions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.free_play_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.start_free_play_hand(p_user uuid,p_id text,p_request uuid,
 p_sport text,p_season text,p_competition text,p_challenge uuid,p_state jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h public.free_play_sessions;
BEGIN
 IF p_sport IS DISTINCT FROM 'basketball' OR p_competition IS NOT NULL THEN RAISE EXCEPTION 'invalid game context'; END IF;
 -- Serialize duplicate requests without locking or touching a financial record.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text||':'||p_request::text,0));
 SELECT * INTO h FROM public.free_play_sessions WHERE player_id=p_user AND request_id=p_request;
 IF FOUND THEN
  IF h.sport<>p_sport OR h.season<>p_season OR h.competition IS DISTINCT FROM p_competition
   OR h.challenge_id IS DISTINCT FROM p_challenge THEN RAISE EXCEPTION 'request context mismatch'; END IF;
  RETURN to_jsonb(h);
 END IF;
 INSERT INTO public.free_play_sessions(hand_id,player_id,request_id,sport,season,competition,challenge_id,state)
 VALUES(p_id,p_user,p_request,p_sport,p_season,p_competition,p_challenge,p_state) RETURNING * INTO h;
 RETURN to_jsonb(h);
END $$;

CREATE OR REPLACE FUNCTION public.commit_free_play_hand(p_user uuid,p_id text,p_revision integer,
 p_state jsonb,p_settle boolean,p_tier text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h public.free_play_sessions; fp numeric; ids text[]; scores jsonb;
BEGIN
 SELECT * INTO h FROM public.free_play_sessions WHERE hand_id=p_id AND player_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown hand'; END IF;
 IF h.settled THEN RETURN to_jsonb(h); END IF;
 IF h.expires_at<=now() THEN RAISE EXCEPTION 'hand expired'; END IF;
 IF h.revision<>p_revision THEN RAISE EXCEPTION 'stale revision'; END IF;
 IF p_settle THEN
  IF p_tier IS NULL OR p_tier NOT IN('BUST','ROOKIE','STARTER','ALL_STAR','MVP','LEGEND') THEN RAISE EXCEPTION 'invalid score tier'; END IF;
  SELECT round(sum((c->>'actualFp')::numeric),1),array_agg(c->>'basePlayerId'),
   jsonb_object_agg(c->>'basePlayerId',c->'actualFp') INTO fp,ids,scores
   FROM jsonb_array_elements(p_state->'roster') c;
  IF fp IS NULL OR cardinality(ids)<>5 THEN RAISE EXCEPTION 'invalid server result'; END IF;
  -- hand_log is the existing score/achievement/challenge audit contract. Its
  -- legacy monetary columns are inert compatibility values, never computed.
  INSERT INTO public.hand_log(player_id,hand_id,roster_ids,total_fp,tier,payout,streak_at_play,verified,
   bet_amount,final_roster,scores,streak_multiplier,seed,is_ftue,is_protected,sport,season,competition,challenge_id,authority_version)
  VALUES(p_user,p_id,ids,fp,p_tier,0,0,true,0,p_state->'roster',scores,1,'',false,false,
   h.sport,h.season,h.competition,h.challenge_id,2);
  p_state:=p_state||jsonb_build_object('hand',jsonb_build_object('hand_id',p_id,'total_fp',fp,
   'tier',p_tier,'sport',h.sport,'season',h.season));
 END IF;
 UPDATE public.free_play_sessions SET state=p_state,revision=revision+1,settled=p_settle
 WHERE hand_id=p_id RETURNING * INTO h;
 RETURN to_jsonb(h);
END $$;
REVOKE ALL ON FUNCTION public.start_free_play_hand(uuid,text,uuid,text,text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.commit_free_play_hand(uuid,text,integer,jsonb,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_free_play_hand(uuid,text,uuid,text,text,text,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_free_play_hand(uuid,text,integer,jsonb,boolean,text) TO service_role;
-- Apply only to the dedicated free-play database, never the mother's database.
REVOKE ALL ON public.player_state FROM PUBLIC,anon,authenticated;
DO $$ DECLARE fn record; BEGIN
 FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
 ('grant_coins','resolve_hand','start_authoritative_hand','commit_authoritative_hand') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn.signature);
 END LOOP;
END $$;
COMMIT;
