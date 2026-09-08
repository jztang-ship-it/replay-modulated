import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const GAME_VIEW=read("../GameView.tsx");

describe("scripted FTUE cannot issue authoritative outcomes",()=>{
 it("disables both render and action FTUE gates until a server tutorial exists",()=>{expect(GAME_VIEW).toContain('const ftueActive = false');expect(GAME_VIEW).toContain('const ftueActiveNow = false');});
 it("never invokes client scripted deal, redraw or resolution",()=>{expect(GAME_VIEW).not.toMatch(/ftueScriptedHand!?\.(?:deal|redraw|resolve)\(/);});
 it("never uses the client adapter as an authority fallback",()=>{expect(GAME_VIEW).not.toMatch(/await (?:dealInitialRoster|redrawRoster|resolveRoster)\(/);expect(GAME_VIEW).toContain('serverGame.current.start(');expect(GAME_VIEW).toContain('serverGame.current.turn("draw"');expect(GAME_VIEW).toContain('serverGame.current.turn("lock"');});
});
