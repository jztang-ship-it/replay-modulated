// RD7.2 Phase 3 — NOD+ARGUE prototype batch.
//
// Generates ~80 REAL resolved 2425 H2H hands (real players, real salaries,
// real gamelog pulls via the pinned pickBiasedLog filter + real FP/badge
// funcs), across hold/fade policies for coverage, runs the Resolution
// Engine, and writes a plain-text review file with NOD and ARGUE columns
// for John. Hold/fade is modeled (no user); the FP/gamelog pulls are REAL.
//
// Output: ~/Desktop/replaymod-handoff/<date>/rd7.2-nod-batch.txt
// (reviewer-bound output → handoff dir, NOT committed to the repo.)

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { computeBasketballFp } from "../../adapters/fantasyPoints";
import { computeBasketballBadges } from "../../adapters/badges";
import { BasketballSportConfig } from "../../adapters/basketballConfig";
import { percentileFromStats, type PoolStatsFile } from "../playerPoolStats";
import { explainResolution, type YourCardFact } from "@shared/explanation/resolutionEngine";
import { lookupCulture } from "@shared/commentary/selectCommentary";

const SEASON = "2425";
const CAP = 250;
const ROSTER = 6;
const BATCH = 80;
const SEED = 7;
const HANDOFF_DATE = "2026-06-14";

const dir = fileURLToPath(new URL(`../../../public/data/seasons/${SEASON}`, import.meta.url));
const logsAll: any[] = JSON.parse(fs.readFileSync(`${dir}/gamelogs.json`, "utf8"));
const players: any[] = JSON.parse(fs.readFileSync(`${dir}/players.json`, "utf8"));
const poolFile: PoolStatsFile = JSON.parse(fs.readFileSync(`${dir}/playerPoolStats.v1.json`, "utf8"));

const WEIGHTS = BasketballSportConfig.projectionWeights as Record<string, number>;
const BADGES = BasketballSportConfig.badges as readonly any[];
const MIN_MINUTES = 10;

// Seeded PRNG (mulberry32) — deterministic, reproducible batch.
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);

// Index logs by basePlayerId + nickname lookup helpers.
const logsByPlayer = new Map<string, any[]>();
for (const l of logsAll) {
  const b = String(l.basePlayerId ?? "");
  if (!b) continue;
  (logsByPlayer.get(b) ?? logsByPlayer.set(b, []).get(b)!).push(l);
}
function tierOf(salary: number): string {
  return salary >= 73 ? "RED" : salary >= 58 ? "ORANGE" : salary >= 44 ? "PURPLE"
    : salary >= 30 ? "BLUE" : salary >= 23 ? "GREEN" : "WHITE";
}
function isPremium(salary: number): boolean { return salary >= 44; }
function minutesOf(s: any): number | null {
  const mp = s.mp ?? s.minutes ?? s.min ?? s.MIN ?? s.minutesPlayed;
  if (mp == null) return null;
  const str = String(mp); const m = str.includes(":") ? parseFloat(str.split(":")[0]) : parseFloat(str);
  return Number.isFinite(m) ? m : null;
}
function eligible(s: any, premium: boolean): boolean {
  if (!s) return false;
  if (!Object.values(s).some((v) => typeof v === "number" && v > 0)) return false;
  const mins = minutesOf(s);
  if (mins != null) { if (premium) { if (mins <= 0) return false; } else if (mins < MIN_MINUTES) return false; }
  return true;
}
function fpOf(stats: any, position: string): number {
  const withMeta = { ...stats, _position: position ?? "", _injured: false, _ejected: false };
  return computeBasketballFp(withMeta, WEIGHTS)
    + computeBasketballBadges(withMeta, BADGES).reduce((s, b) => s + (b.fp ?? 0), 0);
}

// Eligible player pool: has at least one resolvable gamelog + a salary.
const pool = players.filter((p) => {
  const b = String(p.basePlayerId ?? "");
  const ls = logsByPlayer.get(b) ?? [];
  return Number(p.salary) > 0 && ls.some((l) => eligible(l.stats, isPremium(Number(p.salary))));
});

function pickWeighted(cands: any[], r: () => number): any {
  const tot = cands.reduce((s, p) => s + Number(p.salary) ** 2, 0);
  let x = r() * tot;
  for (const p of cands) { x -= Number(p.salary) ** 2; if (x <= 0) return p; }
  return cands[cands.length - 1];
}

/** Assemble a real 6-card roster ≤ CAP with ≥1 RED/ORANGE anchor. */
function dealRoster(r: () => number): any[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const used = new Set<string>();
    const anchors = pool.filter((p) => Number(p.salary) >= 58);
    const anchor = pickWeighted(anchors, r);
    const roster = [anchor]; used.add(anchor.id);
    let spend = Number(anchor.salary);
    let ok = true;
    for (let i = 1; i < ROSTER; i++) {
      const remaining = CAP - spend;
      const slotsLeft = ROSTER - i;
      const maxForThis = remaining - (slotsLeft - 1) * 13; // leave 13 min for the rest
      const cands = pool.filter((p) => !used.has(p.id) && Number(p.salary) <= maxForThis);
      if (cands.length === 0) { ok = false; break; }
      const pick = pickWeighted(cands, r);
      roster.push(pick); used.add(pick.id); spend += Number(pick.salary);
    }
    if (ok && roster.length === ROSTER && spend <= CAP) {
      return roster.map((p, slotIndex) => ({
        basePlayerId: String(p.basePlayerId), name: p.name, team: p.team,
        salary: Number(p.salary), tier: tierOf(Number(p.salary)), position: p.position ?? "",
        slotIndex, id: p.id,
      }));
    }
  }
  throw new Error("dealRoster failed");
}

/** Redraw the faded slots (held kept) for new players under remaining cap. */
function redraw(baseline: any[], heldSlots: Set<number>, r: () => number): any[] {
  const held = baseline.filter((c) => heldSlots.has(c.slotIndex));
  const used = new Set(held.map((c) => c.id));
  let spend = held.reduce((s, c) => s + c.salary, 0);
  const out = [...held];
  const fadeCount = ROSTER - held.length;
  for (let i = 0; i < fadeCount; i++) {
    const remaining = CAP - spend;
    const slotsLeft = fadeCount - i;
    const maxForThis = remaining - (slotsLeft - 1) * 13;
    const cands = pool.filter((p) => !used.has(p.id) && Number(p.salary) <= maxForThis);
    const pick = cands.length ? pickWeighted(cands, r) : pool.filter((p) => !used.has(p.id)).sort((a, b) => a.salary - b.salary)[0];
    used.add(pick.id); spend += Number(pick.salary);
    out.push({ basePlayerId: String(pick.basePlayerId), name: pick.name, team: pick.team, salary: Number(pick.salary), tier: tierOf(Number(pick.salary)), position: pick.position ?? "", id: pick.id });
  }
  return out.map((c, slotIndex) => ({ ...c, slotIndex, wasHeld: heldSlots.has(baseline.find((b) => b.id === c.id)?.slotIndex ?? -1) }));
}

/** Resolve one card: pull a real eligible gamelog uniformly, compute FP. */
function resolveCard(card: any, r: () => number): { actualFp: number; pulledStats: any } {
  const ls = (logsByPlayer.get(card.basePlayerId) ?? []).filter((l) => eligible(l.stats, isPremium(card.salary)));
  if (ls.length === 0) return { actualFp: 0, pulledStats: {} };
  const log = ls[Math.floor(r() * ls.length)];
  return { actualFp: fpOf(log.stats, card.position), pulledStats: log.stats };
}

const POLICIES: Array<{ name: string; held: (b: any[]) => Set<number> }> = [
  { name: "hold-all", held: (b) => new Set(b.map((c) => c.slotIndex)) },
  { name: "hold-top2", held: (b) => new Set([...b].sort((x, y) => y.salary - x.salary).slice(0, 2).map((c) => c.slotIndex)) },
  { name: "hold-3", held: (b) => new Set([...b].sort((x, y) => y.salary - x.salary).slice(0, 3).map((c) => c.slotIndex)) },
  { name: "full-redraw", held: () => new Set<number>() },
  { name: "random", held: (b) => new Set(b.filter(() => rnd() < 0.5).map((c) => c.slotIndex)) },
];

function nick(name: string, tier: string, basePlayerId: string, team: string): string | null {
  // Real culture lookup (stars only: RED/ORANGE always, PURPLE gated, others
  // null). Optional flavor garnish — the engine drops it under budget.
  const c = lookupCulture(name, "basketball", tier, 0, basePlayerId, team);
  const nn = c?.nicknames?.[0];
  return nn && nn.trim() ? nn.trim() : null;
}

// PRODUCTION FIDELITY (RD7.2 resolve-semantics confirm): the recipient
// replays the sender's INITIAL DEAL for PERSONNEL (held slots keep the
// sender's player, per ChallengeLandingScreen initial_roster /
// H2HRecipientPlay), but EVERY card — held AND faded — gets its OWN fresh
// independent pull via resolveCards (fresh seed per resolve, fresh
// pickBiasedLog per card). NO shared pull, NO cancellation: a held player
// scores a different actualFp on each side and DOES move the margin.
// Margins are therefore wide (difference of two ~independent 6-pull sums) —
// that width is production-real, not an artifact. Sender plays the deal too.
const SENDER_POLICY = 2; // "hold-3" — a decent sender

function makeHand(policyIdx: number): { row: string; margin: number; register: string; leaf: string } {
  // ONE shared initial deal (the sender's deal the recipient replays).
  const baseline = dealRoster(rnd);

  // SENDER plays the deal → target. Independent resolve (own seed via rnd).
  const senderFinal = redraw(baseline, POLICIES[SENDER_POLICY].held(baseline), rnd);
  const mikeResolved = senderFinal.map((c) => ({ ...c, ...resolveCard(c, rnd) }));
  const mikeTotal = mikeResolved.reduce((s, c) => s + c.actualFp, 0);

  // RECIPIENT replays the SAME deal with this hand's policy. Personnel
  // overlaps on held slots; EVERY card resolves independently (fresh pull).
  const held = POLICIES[policyIdx].held(baseline);
  const finalCards = redraw(baseline, held, rnd);
  const resolvedYou = finalCards.map((c) => ({ ...c, ...resolveCard(c, rnd) }));
  const yourTotal = resolvedYou.reduce((s, c) => s + c.actualFp, 0);
  const margin = yourTotal - mikeTotal;

  // Mike's single LUCK outlier — biggest SWING above his own median (a real
  // monster game, not a high-pctile scrub). Luck fact only; engine gates it.
  let mikeOutlier: { name: string; percentile: number; actualFp: number; swing: number } | null = null;
  for (const c of mikeResolved) {
    const ps = poolFile.players[`${c.basePlayerId}|${SEASON}`];
    if (!ps) continue;
    const swing = c.actualFp - ps.p50;
    if (!mikeOutlier || swing > mikeOutlier.swing) {
      mikeOutlier = { name: c.name, percentile: percentileFromStats(c.actualFp, ps), actualFp: c.actualFp, swing };
    }
  }

  const facts: YourCardFact[] = resolvedYou.map((c) => {
    const ps = poolFile.players[`${c.basePlayerId}|${SEASON}`];
    const percentile = ps ? percentileFromStats(c.actualFp, ps) : null;
    return {
      name: c.name, tier: c.tier, salary: c.salary, wasHeld: !!c.wasHeld,
      fp: c.actualFp, percentile, poolMedian: ps ? ps.p50 : null, nickname: nick(c.name, c.tier, c.basePlayerId, c.team),
    };
  });

  const { text, classification } = explainResolution({ yourCards: facts, margin, opponentOutlier: mikeOutlier });

  const cardLines = resolvedYou
    .map((c) => {
      const ps = poolFile.players[`${c.basePlayerId}|${SEASON}`];
      const pct = ps ? percentileFromStats(c.actualFp, ps) : null;
      const hf = c.wasHeld ? "HELD " : "fade ";
      return `      ${hf} $${String(c.salary).padStart(2)} ${c.name.padEnd(22)} ${c.actualFp.toFixed(1).padStart(6)}fp  ${pct == null ? " off-pool" : `pctile ${String(Math.round(pct)).padStart(3)}`}`;
    })
    .join("\n");

  const wl = margin > 1.5 ? "WIN " : margin < -1.5 ? "LOSS" : "TIE ";
  const leaf = classification.register === "agency" ? (classification.leaf ?? "A?") : "C";
  const row = [
    `[${POLICIES[policyIdx].name}]  ${wl}  margin ${margin >= 0 ? "+" : ""}${margin.toFixed(1)}   you ${yourTotal.toFixed(1)} / mike ${mikeTotal.toFixed(1)}`,
    cardLines,
    `   CLASS: ${classification.register}${leaf ? " / " + leaf : ""}${classification.mikeBadBeat ? " (+bad-beat)" : ""}`,
    `   >>>   ${text}`,
    `   NOD [  ]      ARGUE [  ]      notes: ____________________________________`,
  ].join("\n");
  return { row, margin, register: classification.register, leaf };
}

describe("RD7.2 Phase 3 — nod+argue batch (PRODUCTION FIDELITY: independent pulls)", () => {
  it("generates the production-fidelity batch and writes the review file", () => {
    expect(pool.length).toBeGreaterThan(100);
    const hands = Array.from({ length: BATCH }, (_, i) => makeHand(i % POLICIES.length));

    // Margin-distribution bands (confirm it resembles real play before reading).
    const band = (m: number) => { const a = Math.abs(m); return a <= 5 ? "≤5" : a <= 13 ? "5–13" : a <= 25 ? "13–25" : ">25"; };
    const bands: Record<string, number> = { "≤5": 0, "5–13": 0, "13–25": 0, ">25": 0 };
    for (const h of hands) bands[band(h.margin)]++;
    // Class split overall + within close (≤13) hands (the real-play number).
    const agency = hands.filter((h) => h.register === "agency").length;
    const close = hands.filter((h) => Math.abs(h.margin) <= 13);
    const closeAgency = close.filter((h) => h.register === "agency").length;

    const header = [
      "RD7.2 — RESOLUTION ENGINE — NOD+ARGUE REVIEW BATCH  (PRODUCTION FIDELITY)",
      `season ${SEASON} · ${BATCH} hands · seed ${SEED} (reproducible) · cap $${CAP}`,
      "Pairing: recipient replays the sender's deal for PERSONNEL; EVERY card (held + faded) resolves",
      "INDEPENDENTLY (fresh pull) — production semantics, no shared-pull/cancellation. Margins are wide & REAL.",
      "",
      "MARGIN DISTRIBUTION:  " + Object.entries(bands).map(([k, v]) => `${k}: ${v}`).join("   "),
      `CLASS:  agency ${agency} / variance ${BATCH - agency}`,
      `WITHIN CLOSE (≤13, n=${close.length}):  agency ${closeAgency} / variance ${close.length - closeAgency}   ← the real-play-representative split`,
      "",
      "HOW TO READ each hand:",
      "  [policy]  W/L  margin  totals   →  your 6 cards (HELD/fade, salary, actualFp, percentile-in-own-pool)",
      "  CLASS = engine classification (agency A1 conviction-paid / A2 conviction-failed / A3 gamble-paid /",
      "          A4 gamble-failed / A5 'wasn't enough' ; variance C ; +bad-beat = loss luck clause)",
      "  >>>   = the explanation line the user would see.",
      "  NOD = sounds human (tone)?   ARGUE = could you, who was THERE, rebut it (truth)?",
      "  Class B (allocation) GATED OFF in v1; cap language INVISIBLE in v1 (both intentional).",
      "",
      "=".repeat(90),
      "",
    ].join("\n");
    const body = hands.map((h) => h.row).join("\n\n" + "-".repeat(90) + "\n\n");
    const out = `${header}${body}\n`;

    const handoffDir = `${os.homedir()}/Desktop/replaymod-handoff/${HANDOFF_DATE}`;
    fs.mkdirSync(handoffDir, { recursive: true });
    const outPath = `${handoffDir}/rd7.2-nod-batch.prod.txt`; // production-fidelity batch (independent pulls)
    fs.writeFileSync(outPath, out);

    expect((out.match(/^   >>> {3}/gm) ?? []).length).toBe(BATCH);
    expect((out.match(/^   CLASS:/gm) ?? []).length).toBe(BATCH);
    // eslint-disable-next-line no-console
    console.log(`[Phase3-prod] wrote ${BATCH} hands → ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB) | bands ${JSON.stringify(bands)} | close-agency ${closeAgency}/${close.length}`);
  });
});
