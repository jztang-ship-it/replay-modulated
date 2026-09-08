import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const GAME_VIEW=read("../GameView.tsx");

const hold=GAME_VIEW.slice(GAME_VIEW.indexOf('const retryLock ='));
const early=hold.slice(hold.indexOf('else if (earlyLock)'),hold.indexOf('// ── REDRAW HEAD'));
describe("authoritative early lock and retry",()=>{
 it("derives early lock from all held, multi-round, or pending lock retry",()=>{expect(hold).toContain('serverGame.current.pendingAction === "lock"');expect(hold).toContain('retryLock || (allHeld && maxRounds > 1 && !ftueActiveNow)');});
 it("never redraws during early lock",()=>{expect(early).not.toContain('turn("draw"');expect(early).not.toContain('beginDraw(');});
 it("resolves a fresh early-locked hand on the server",()=>{expect(early).toContain('if (roundsUsed === 1)');expect(early).toContain('turn("lock"');});
 it("reuses previously resolved cards before idempotent server lock",()=>{expect(early).toContain('finalRoster = markedRoster');expect(hold).toContain('finalRoster = locked.roster');});
 it("retries pending lock with the last server snapshot",()=>{expect(hold).toMatch(/if \(retryLock\) \{\s*finalRoster = serverGame.current.snapshot!.roster;/);});
 it("sends selection indices rather than player scores",()=>{expect(hold).toContain('markedRoster.flatMap((c, i) => c.wasHeld ? [i] : [])');expect(hold).not.toMatch(/(?:redrawRoster|resolveRoster)\(/);});
 it("the shared tail feeds the same roster into the round machine",()=>{expect(hold).toContain('userTappedReveal: earlyLock');expect(hold).toContain('resolvedRoster: finalRoster');});
});
