BEGIN;
-- Dedicated free-play database only. Refuse an economy database or existing
-- financial records rather than deleting a mother's data by accident.
DO $$ DECLARE tbl text; populated boolean; fn record; BEGIN
 IF current_setting('replay.free_play_database',true) IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Set replay.free_play_database=true only in the dedicated free-play database';
 END IF;
 FOREACH tbl IN ARRAY ARRAY['player_state','hand_sessions','authoritative_bonus_pools','reward_claims'] LOOP
  IF to_regclass('public.'||tbl) IS NOT NULL THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',tbl) INTO populated;
   IF populated THEN RAISE EXCEPTION 'Refusing to remove nonempty economy table: %',tbl; END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.hand_log WHERE payout<>0 OR bet_amount<>0 OR streak_multiplier<>1) THEN
  RAISE EXCEPTION 'Refusing to remove financial hand history';
 END IF;
 FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN('grant_coins','resolve_hand','start_authoritative_hand','commit_authoritative_hand') LOOP
  EXECUTE format('DROP FUNCTION %s',fn.signature);
 END LOOP;
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
  -- Persist only the score/achievement/challenge audit contract.
  INSERT INTO public.hand_log(player_id,hand_id,roster_ids,total_fp,tier,verified,
   final_roster,scores,seed,is_ftue,is_protected,sport,season,competition,challenge_id,authority_version)
  VALUES(p_user,p_id,ids,fp,p_tier,true,p_state->'roster',scores,'',false,false,
   h.sport,h.season,h.competition,h.challenge_id,2);
  p_state:=p_state||jsonb_build_object('hand',jsonb_build_object('hand_id',p_id,'total_fp',fp,
   'tier',p_tier,'sport',h.sport,'season',h.season));
 END IF;
 UPDATE public.free_play_sessions SET state=p_state,revision=revision+1,settled=p_settle
 WHERE hand_id=p_id RETURNING * INTO h;
 RETURN to_jsonb(h);
END $$;

DROP TABLE IF EXISTS public.reward_claims;
DROP TABLE IF EXISTS public.authoritative_bonus_pools;
DROP TABLE IF EXISTS public.hand_sessions;
DROP TABLE IF EXISTS public.player_state;
ALTER TABLE public.hand_log DROP COLUMN payout, DROP COLUMN bet_amount,
 DROP COLUMN streak_multiplier, DROP COLUMN streak_at_play;
COMMIT;
