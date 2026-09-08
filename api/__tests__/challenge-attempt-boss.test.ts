import {it,expect} from 'vitest';import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/019_authoritative_sessions.sql','utf8');
it('never notifies a boss sender or its absent owner',()=>expect(sql).toContain("c.created_by IS NOT NULL AND c.sender_kind IS DISTINCT FROM 'boss'"));
it('only humans require the newly authoritative source challenge; baked boss fixtures remain supported',()=>expect(sql).toContain("c.sender_kind IS DISTINCT FROM 'boss' AND c.authority_version<>2"));
it('returns the stored attempt before changing counters on a retry',()=>{expect(sql.indexOf("IF FOUND THEN RETURN a.server_result")).toBeLessThan(sql.indexOf('IF defended THEN'));});
