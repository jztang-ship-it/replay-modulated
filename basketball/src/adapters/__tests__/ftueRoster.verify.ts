import { dealFTUERoster, redrawFTUERoster } from "../ftueRoster";

const W: Record<string, number> = { pts:1.0, reb:1.2, ast:1.5, stl:2.0, blk:2.0, turnovers:-1.0 };

function calcFp(stats: Record<string,number>, badgeFp: number): number {
  return Math.round((Object.entries(W).reduce((s,[k,w]) => s+(stats[k]??0)*w, 0) + badgeFp) * 10) / 10;
}

async function verify() {
  const { roster } = await dealFTUERoster();
  const drawn = await redrawFTUERoster({ currentCards: roster, lockedCardIds: new Set(["ftue-tatum"]) });
  const cards = [
    roster.find((c:any) => c.cardId === "ftue-tatum"),
    ...drawn.roster.filter((c:any) => !c.wasHeld),
  ].filter(Boolean);

  let pass = true;
  for (const card of cards) {
    const c = card as any;
    const badgeFp = (c.achievements??[]).reduce((s:number,a:any)=>s+(a.fp??0),0);
    const computed = calcFp(c.statLine??{}, badgeFp);
    const declared = c.actualFp;
    const ok = Math.abs(computed - declared) < 0.15;
    console.log(`${ok?"✅":"❌"} ${c.name}: computed ${computed} ${ok?"=":"≠"} declared ${declared}`);
    if (!ok) pass = false;
  }
  if (!pass) { console.error("\nFAILED — fix actualFp values"); process.exit(1); }
  else console.log("\nAll FTUE FP values verified ✅");
}
verify();
