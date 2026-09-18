import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const GAME_VIEW=read("../GameView.tsx");

const REVEAL=read("../_useReveal.ts");
const SQL=read("../../../supabase/migrations/021_free_play_sessions.sql");
describe("authoritative economy wiring",()=>{
 it("starts a server hand without a stake",()=>{expect(GAME_VIEW).toContain("serverGame.current.start(");expect(GAME_VIEW).not.toContain("bet_amount:");});
 it("never debits or rakes in the round controller",()=>{expect(GAME_VIEW).not.toMatch(/charge:|rake:|entryFee:/);});
 it("locks on the server before the round controller",()=>{const s=GAME_VIEW.slice(GAME_VIEW.indexOf('const retryLock ='));expect(s.indexOf('turn("lock"')).toBeLessThan(s.indexOf('commitRound('));});
 it("only persists confirmed server settlement",()=>{expect(GAME_VIEW).toContain('serverResultRef.current = locked.hand');expect(GAME_VIEW).toContain('currentHandIdRef.current = locked.hand_id');expect(GAME_VIEW).not.toMatch(/logHandToDb\(/);});
 it("does not speculate local payouts",()=>{expect(REVEAL).not.toMatch(/calculatePayoutWithStreak\(tier/);expect(REVEAL).toContain('state.serverResultRef.current');expect(REVEAL).not.toMatch(/logHandToDb\(/);});
 it("SQL gates retries before mutable settlement work",()=>{expect(SQL).toMatch(/IF h.settled THEN RETURN to_jsonb\(h\); END IF/);expect(SQL).toContain('FOR UPDATE');});
});
