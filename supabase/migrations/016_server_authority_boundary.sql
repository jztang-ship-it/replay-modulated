-- 016_server_authority_boundary.sql
-- Close the two direct client-write paths. All authoritative writes must use
-- service-role API functions / SECURITY DEFINER functions.

DROP POLICY IF EXISTS "Users insert own hands" ON public.hand_log;
DROP POLICY IF EXISTS "achievements: users insert own" ON public.user_achievements;
DROP POLICY IF EXISTS "attempts: open insert" ON public.challenge_attempts;
DROP POLICY IF EXISTS "challenges: authenticated insert" ON public.shared_challenges;

-- The client must not be able to invoke the settlement RPC with forged values.
REVOKE EXECUTE ON FUNCTION public.resolve_hand(
  uuid, text, integer, integer, boolean, text[], jsonb, jsonb, numeric, text, text, boolean, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_hand(
  uuid, text, integer, integer, boolean, text[], jsonb, jsonb, numeric, text, text, boolean, boolean
) TO service_role;

-- Keep existing rows readable by their owner, but require an authoritative
-- server path for inserts. This policy is intentionally absent: the service
-- role bypasses RLS and the API owns all writes.


-- Challenge creation and attempt rows are also authoritative. Both are now
-- written by server-role API handlers after checking verified hand_log rows.
REVOKE INSERT ON public.shared_challenges FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON public.challenge_attempts FROM PUBLIC, anon, authenticated;
GRANT INSERT ON public.shared_challenges TO service_role;
GRANT INSERT ON public.challenge_attempts TO service_role;
