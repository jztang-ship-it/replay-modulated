import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const GAME_VIEW=read("../GameView.tsx");

it("binds recipient start to the challenge, rather than trusting its browser snapshot",()=>{expect(GAME_VIEW).toContain('challenge_id: challengeCtx!.challengeId');expect(GAME_VIEW).toContain('serverGame.current.start(');});
it("server reconstructs challenge cards from trusted catalog and zeros held/score fields",()=>{const c=read("../../../api/hand/_lib/catalog.ts");expect(c).toContain('pool.find(');expect(c).toContain('wasHeld:false,actualFp:0');});
