import {it,expect} from 'vitest';import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/019_authoritative_sessions.sql','utf8');
it('counts distinct users from authoritative in-window attempts, not KV increments',()=>{
 expect(sql).toContain('GROUP BY user_id');expect(sql).toContain("created_at<=start_at+interval '1 hour'");expect(sql).toContain('authority_version=2');
 const api=readFileSync('api/challenge/[id]/attempt.ts','utf8');expect(api).not.toContain('kv.incr');expect(api).toContain('submit_authoritative_attempt');
});
it('serializes window/counter transitions with a challenge row lock',()=>expect(sql).toContain('WHERE challenge_id=p_challenge FOR UPDATE'));
it('uses a unique challenge-hand binding without deleting historical attempts',()=>expect(sql).toContain('ON public.challenge_attempts(challenge_id,hand_id) WHERE authority_version=2'));
