/**
 * scripts/sampleCommentary.ts — Offline basketball commentary sampler.
 *
 * Drives the REAL production assembler (shared/commentary/selectCommentary) the
 * same way GameView does (same copyInput shape: roster with projectedFp/actualFp,
 * winTier, register, streak, topGame, …) so the printed lines match what a player
 * sees in the TierGauge — without anyone playing a hand.
 *
 * It generates N synthetic hands spanning every tier (BUST→LEGEND) and a spread of
 * hand shapes (star-carry, balanced, ugly-win, collapse, near-miss, badge-explosion,
 * career-night, historic-*, multi-star, …) so low-frequency archetypes actually fire.
 * Stats are jittered per-hand by a fixed seed, so runs are byte-for-byte reproducible.
 *
 * For each sample it prints: the tier, the classified archetype, the exact template
 * that fired (read back from the anti-repeat history — the same recordUsage() call
 * the engine makes internally), and the FULL ASSEMBLED commentary (framing + primary
 * + secondary, already composed by applyFraming inside selectCommentary).
 *
 * At the end it prints a frequency table (archetype counts, template counts) and
 * flags every basketball template that NEVER fired across the run — candidate
 * dead / unreachable copy.
 *
 *   Usage:
 *     npx tsx scripts/sampleCommentary.ts [N]            # default N=200
 *     npx tsx scripts/sampleCommentary.ts 200 --grep cash   # only samples whose text contains "cash"
 *
 * Reproducibility notes:
 *   - Fully seeded: the engine uses seededRandom/pickSeeded + a localStorage-backed
 *     anti-repeat/tone history (polyfilled below). No Math.random() is on this path
 *     as long as cards keep min >= 20 (the only Math.random() branch is the
 *     sub-10-minute low-min copy variant, which these hands never trigger).
 *   - "Never-fired" means "not reached by THIS sampler's N hands / these hand
 *     shapes" — not a proof of unreachability in production. DISABLED templates
 *     (enabled:false) and requires-gated templates are annotated as such.
 *   - Synthetic player names don't match the culture DB, so culture-secondary
 *     lines and nickname framing stay quiet. Real names would surface more
 *     secondary copy; the primary framing (the scrub target) is unaffected.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── localStorage polyfill (anti-repeat + tone history persist across hands) ──
// Must exist before the first selectCommentary() call. Nothing in the module
// graph touches localStorage at import time, so setting it here is sufficient.
const _store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (_store.has(k) ? _store.get(k)! : null),
  setItem: (k: string, v: string) => void _store.set(k, String(v)),
  removeItem: (k: string) => void _store.delete(k),
  clear: () => _store.clear(),
};

// Synthetic names aren't in the culture DB → the culture layer logs a
// once-per-name "missing basePlayerId" warning. Expected here; silence it so
// the sample output stays clean.
console.warn = () => {};

const { selectCommentary } = await import("../shared/commentary/selectCommentary.ts");
const { classifyArchetype } = await import("../shared/commentary/classifyArchetype.ts");
const { getRepeatHistory } = await import("../shared/commentary/antiRepeat.ts");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../shared/commentary/libraries/basketball.json"), "utf8"),
);

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const grepIdx = argv.indexOf("--grep");
const GREP: string | null = grepIdx >= 0 ? (argv[grepIdx + 1] ?? "").toLowerCase() : null;
const N = Number(argv.find((a) => /^\d+$/.test(a)) ?? 200);

// ── deterministic PRNG (mulberry32) ─────────────────────────────────────────
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── tier ladder (plausible 5-card FP bands) ──────────────────────────────────
const TIER: Record<string, { floor: number; next: string | null; nextMin: number }> = {
  BUST:     { floor: 0,   next: "ROOKIE",   nextMin: 90 },
  ROOKIE:   { floor: 90,  next: "STARTER",  nextMin: 120 },
  STARTER:  { floor: 120, next: "ALL_STAR", nextMin: 150 },
  ALL_STAR: { floor: 150, next: "MVP",      nextMin: 185 },
  MVP:      { floor: 185, next: "LEGEND",   nextMin: 225 },
  LEGEND:   { floor: 225, next: null,       nextMin: 0 },
};

const FIRST = ["Marcus", "Deon", "Elias", "Trey", "Kian", "Rome", "Nash", "Zeke", "Cade", "Bo"];
const LAST = ["Vale", "Pryce", "Okafor", "Reyes", "Salt", "Bram", "Cole", "Doss", "Fenn", "Ives"];
const OPPS = ["BOS", "DEN", "MIA", "PHX", "NYK", "LAL", "MIL", "GSW"];

function nm(r: () => number) {
  return `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
}

function star(name: string, salary: number, actualFp: number, projectedFp: number, extra: any = {}) {
  const pts = Math.round(actualFp * 0.55), reb = Math.round(actualFp * 0.22), ast = Math.round(actualFp * 0.18);
  return {
    name, salary, actualFp, projectedFp, cardTier: "ORANGE",
    statLine: { pts, reb, ast, stl: 1, blk: 1, min: 34 },
    opponent: extra.opp ?? "BOS", homeAway: extra.homeAway ?? "A", wasHeld: false,
    achievements: extra.achievements ?? [], extremeFlags: extra.extremeFlags ?? [],
    team: extra.team, teams: extra.teams,
  };
}
function support(name: string, salary: number, actualFp: number, projectedFp: number) {
  const pts = Math.round(actualFp * 0.6), reb = Math.round(actualFp * 0.25), ast = Math.round(actualFp * 0.15);
  return { name, salary, actualFp, projectedFp, cardTier: "BLUE",
    statLine: { pts, reb, ast, stl: 0, blk: 0, min: 28 }, opponent: "BOS", homeAway: "H", wasHeld: false, achievements: [], extremeFlags: [] };
}

/** Build a full CommentaryInput (GameView copyInput shape). */
function hand(opts: {
  winTier: string; totalFp: number; starRatio: number; starFp?: number; starSalary?: number;
  streak?: number; prevStreak?: number; achievements?: any[]; extremeFlags?: any[]; topGame?: any;
  costar?: boolean; r: () => number;
}) {
  const r = opts.r;
  const isBust = opts.winTier === "BUST";
  const t = TIER[opts.winTier];
  const sSalary = opts.starSalary ?? 60;
  const sFp = opts.starFp ?? (isBust ? 30 : 45);
  const sProj = Math.max(1, Math.round(sFp / opts.starRatio));
  const s = star(nm(r), sSalary, sFp, sProj, {
    opp: OPPS[Math.floor(r() * OPPS.length)], homeAway: r() < 0.5 ? "H" : "A",
    achievements: opts.achievements, extremeFlags: opts.extremeFlags,
  });
  const roster: any[] = [s];
  if (opts.costar) roster.push(star(nm(r), 45, 70, Math.round(70 / 1.4), { opp: s.opponent }));
  // Support cards must stay below the intended star's actualFp — selectStar()
  // picks the highest-FP card, so an over-scoring role player would hijack the
  // star (and the archetype) on low-star-FP shapes (star_failed/cold/ugly_win).
  const suppCap = Math.max(8, sFp - 4);
  while (roster.length < 5) {
    const aFp = Math.min(suppCap, 10 + Math.floor(r() * 12));
    roster.push(support(nm(r), 20 + Math.floor(r() * 15), aFp, 20));
  }

  return {
    sport: "basketball",
    totalFp: opts.totalFp,
    winTier: opts.winTier,
    nextTier: t.next,
    tierFloor: t.floor,
    nextTierMin: t.nextMin,
    streak: opts.streak ?? 0,
    prevStreak: opts.prevStreak ?? 0,
    isBust,
    handCount: 10,
    roster,
    topGame: opts.topGame ?? { tier: null, primaryReason: null, allReasons: [] },
    streakTiers: [],
  };
}

const REC = (tier: string) => ({
  tier,
  primaryReason: { category: "pts", label: tier === "record" ? "an all-time 61-point night" : tier === "career" ? "a career-high 55 points" : "one of the season's best scoring nights", value: tier === "record" ? 61 : 55, rank: tier === "record" ? 1 : 3 },
  allReasons: [{ category: "pts", label: "scoring", value: 55, rank: 3 }],
});
const QUAD = [{ id: "QUAD_DBL", label: "quadruple double" }];
const TRIP = [{ id: "TRIPLE_DBL", label: "triple double" }];
const EXTREME = [{ type: "scoring_explosion", tier: 1, priority: 10, headline: "55 PTS, 12 REB, 10 AST", keyStat: "pts", value: 55 }];

// ── declustered input generation (INPUT ONLY — selection logic untouched) ──
// The engine seed = |floor(totalFp*13) + streak*7 + isBust?3|. If each archetype's
// hands sit in a ±5% FP band at a fixed streak, the seed takes only a handful of
// values → weightedRandom tone + seed-jittered template pick concentrate (the DIAG
// collapse). Spreading totalFp across the FULL tier band + varying streak 0-6
// declusters the seed so tone coverage tracks the weight tables and "never-fired"
// reflects real reachability.

/** Uniform across the FULL win-tier band (drives every intensity within the tier). */
function winFp(winTier: string, r: () => number) {
  const t = TIER[winTier];
  const hi = t.next ? TIER[t.next].floor : t.floor + 40;
  return Math.round(t.floor + (hi - t.floor) * (0.04 + r() * 0.92));
}
/** Streak 0..6 — varies the streak*7 seed term (win hands). */
function st(r: () => number) { return Math.floor(r() * 7); }
/** BUST loss, non-near-miss / non-collapse: totalFp 30..84 → gap 6..60.
 *  gap>5 keeps it out of near_miss; prevStreak stays 0 (unset) so collapse can't
 *  fire; the wide gap spans bust_close/mid/bad intensities → full tone spread.
 *  (Streak stays 0 here — a lost hand's current streak is 0 in production; the
 *  wide gap alone declusters the dominant floor(totalFp*13) seed term.) */
function lossFp(r: () => number) { return 30 + Math.floor(r() * 55); }

// ── hand-shape specs: cover every archetype incl. loss variants + intensities ──
type Spec = { label: string; gen: (r: () => number) => any };
const SPECS: Spec[] = [
  { label: "star_carry / STARTER", gen: (r) => hand({ winTier: "STARTER", totalFp: winFp("STARTER", r), starRatio: 1.5, starFp: 55, streak: st(r), r }) },
  { label: "star_carry / STARTER (2)", gen: (r) => hand({ winTier: "STARTER", totalFp: winFp("STARTER", r), starRatio: 1.6, starFp: 60, streak: st(r), r }) },
  { label: "star_carry_big / ALL_STAR", gen: (r) => hand({ winTier: "ALL_STAR", totalFp: winFp("ALL_STAR", r), starRatio: 1.6, starFp: 70, streak: st(r), r }) },
  { label: "star_carry_big / MVP", gen: (r) => hand({ winTier: "MVP", totalFp: winFp("MVP", r), starRatio: 1.7, starFp: 80, streak: st(r), r }) },
  { label: "star_carry_big / LEGEND", gen: (r) => hand({ winTier: "LEGEND", totalFp: winFp("LEGEND", r), starRatio: 1.8, starFp: 92, streak: st(r), r }) },
  { label: "star_delivered / STARTER", gen: (r) => hand({ winTier: "STARTER", totalFp: winFp("STARTER", r), starRatio: 1.1, starFp: 45, streak: st(r), r }) },
  { label: "star_delivered / ALL_STAR", gen: (r) => hand({ winTier: "ALL_STAR", totalFp: winFp("ALL_STAR", r), starRatio: 1.05, starFp: 55, streak: st(r), r }) },
  { label: "balanced_win / STARTER", gen: (r) => hand({ winTier: "STARTER", totalFp: winFp("STARTER", r), starRatio: 0.9, starFp: 38, streak: st(r), r }) },
  { label: "ugly_win(→rookie_neutral) / ROOKIE", gen: (r) => hand({ winTier: "ROOKIE", totalFp: winFp("ROOKIE", r), starRatio: 0.7, starFp: 28, streak: st(r), r }) },
  { label: "rookie_neutral / ROOKIE", gen: (r) => hand({ winTier: "ROOKIE", totalFp: winFp("ROOKIE", r), starRatio: 1.0, starFp: 34, streak: st(r), r }) },
  { label: "near_miss / BUST", gen: (r) => hand({ winTier: "BUST", totalFp: 90 - (1 + Math.floor(r() * 5)), starRatio: 0.9, starFp: 30, streak: st(r), r }) },
  { label: "collapse / BUST", gen: (r) => hand({ winTier: "BUST", totalFp: 30 + Math.floor(r() * 40), starRatio: 0.8, starFp: 26, prevStreak: 5 + Math.floor(r() * 3), streak: 0, r }) },
  { label: "star_carried_loss / BUST", gen: (r) => hand({ winTier: "BUST", totalFp: lossFp(r), starRatio: 1.4, starFp: 55, r }) },
  { label: "star_failed / BUST", gen: (r) => hand({ winTier: "BUST", totalFp: lossFp(r), starRatio: 0.5, starFp: 18, r }) },
  { label: "star_cold / BUST", gen: (r) => hand({ winTier: "BUST", totalFp: lossFp(r), starRatio: 0.7, starFp: 26, r }) },
  { label: "everyone_flat / BUST", gen: (r) => hand({ winTier: "BUST", totalFp: lossFp(r), starRatio: 0.85, starFp: 30, r }) },
  { label: "multi_star_carry / MVP", gen: (r) => hand({ winTier: "MVP", totalFp: winFp("MVP", r), starRatio: 1.4, starFp: 95, costar: true, streak: st(r), r }) },
  { label: "badge_explosion win / ALL_STAR", gen: (r) => hand({ winTier: "ALL_STAR", totalFp: winFp("ALL_STAR", r), starRatio: 1.3, starFp: 65, achievements: QUAD, streak: st(r), r }) },
  { label: "badge_explosion loss / BUST", gen: (r) => hand({ winTier: "BUST", totalFp: lossFp(r), starRatio: 1.2, starFp: 48, achievements: TRIP, r }) },
  { label: "career_night win / MVP", gen: (r) => hand({ winTier: "MVP", totalFp: winFp("MVP", r), starRatio: 1.7, starFp: 88, extremeFlags: EXTREME, streak: st(r), r }) },
  { label: "career_night loss / BUST", gen: (r) => hand({ winTier: "BUST", totalFp: lossFp(r), starRatio: 1.3, starFp: 70, extremeFlags: EXTREME, r }) },
  { label: "historic_record win / ALL_STAR", gen: (r) => hand({ winTier: "ALL_STAR", totalFp: winFp("ALL_STAR", r), starRatio: 1.5, starFp: 70, topGame: REC("record"), streak: st(r), r }) },
  { label: "historic_record loss / BUST", gen: (r) => hand({ winTier: "BUST", totalFp: lossFp(r), starRatio: 1.2, starFp: 60, topGame: REC("record"), r }) },
  { label: "historic_career win / MVP", gen: (r) => hand({ winTier: "MVP", totalFp: winFp("MVP", r), starRatio: 1.6, starFp: 80, topGame: REC("career"), streak: st(r), r }) },
  { label: "historic_career loss / BUST", gen: (r) => hand({ winTier: "BUST", totalFp: lossFp(r), starRatio: 1.2, starFp: 58, topGame: REC("career"), r }) },
  { label: "historic_season win / STARTER", gen: (r) => hand({ winTier: "STARTER", totalFp: winFp("STARTER", r), starRatio: 1.4, starFp: 55, topGame: REC("season"), streak: st(r), r }) },
  { label: "historic_season loss / BUST", gen: (r) => hand({ winTier: "BUST", totalFp: lossFp(r), starRatio: 1.2, starFp: 52, topGame: REC("season"), r }) },
];

// ── template id → metadata (for firing attribution + dead-copy report) ──
const ID_META = new Map<string, { archetype: string; register: string; tone: string; enabled: boolean; requires?: string[] }>();
for (const [arch, arr] of Object.entries(LIB)) {
  if (!Array.isArray(arr)) continue;
  for (const t of arr as any[]) {
    if (t.id) ID_META.set(t.id, { archetype: arch, register: t.register, tone: t.tone, enabled: t.enabled !== false, requires: t.requires });
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
const archCount = new Map<string, number>();
const tmplCount = new Map<string, number>();
// DIAGNOSTIC: actual tone selectTone() chose per hand (read back from the
// rm_recent_tones history it writes) + per-archetype tone distribution.
const toneCount = new Map<string, number>();
const perArchTone = new Map<string, Map<string, number>>();
let nonTemplate = 0;      // culture-override / static-fallback paths (no recordUsage)
let printed = 0;
let prevLineKey = JSON.stringify(getRepeatHistory().lineIds);

const bar = "─".repeat(78);
console.log(bar);
console.log(`COMMENTARY SAMPLER — N=${N}  specs=${SPECS.length}${GREP ? `  --grep "${GREP}"` : ""}`);
console.log(bar);

for (let i = 0; i < N; i++) {
  const spec = SPECS[i % SPECS.length];
  const r = rng(0x9e37 + i * 2654435761);
  const input = spec.gen(r);

  const cls = classifyArchetype(input as any);
  const { primary, secondary } = selectCommentary(input as any);

  // fired template = last id appended to anti-repeat history this call
  const afterKey = getRepeatHistory().lineIds;
  const afterStr = JSON.stringify(afterKey);
  let fired: string | null = null;
  if (afterStr !== prevLineKey) fired = afterKey[afterKey.length - 1] ?? null;
  prevLineKey = afterStr;

  // actual tone chosen this hand = last entry selectTone() pushed to history
  const toneHist = JSON.parse(_store.get("rm_recent_tones") ?? "[]");
  const selTone: string = toneHist[toneHist.length - 1] ?? "?";
  toneCount.set(selTone, (toneCount.get(selTone) ?? 0) + 1);
  const pat = perArchTone.get(cls.archetype) ?? perArchTone.set(cls.archetype, new Map()).get(cls.archetype)!;
  pat.set(selTone, (pat.get(selTone) ?? 0) + 1);

  archCount.set(cls.archetype, (archCount.get(cls.archetype) ?? 0) + 1);
  if (fired) tmplCount.set(fired, (tmplCount.get(fired) ?? 0) + 1);
  else nonTemplate++;

  const assembled = secondary ? `${primary}  ${secondary}` : primary;

  if (GREP && !assembled.toLowerCase().includes(GREP)) continue;
  printed++;

  const idx = String(i + 1).padStart(3, "0");
  const firedLabel = fired ?? "(non-template: override/fallback)";
  console.log(`#${idx} [${input.winTier}] archetype=${cls.archetype}  template=${firedLabel}`);
  console.log(`   ► ${primary}`);
  console.log(`   ↳ ${secondary ?? "(no secondary)"}`);
}

// ── frequency + dead-copy report ──────────────────────────────────────────────
console.log("\n" + bar);
console.log(`ARCHETYPE FREQUENCY (classified, ${N} hands)`);
console.log(bar);
[...archCount.entries()].sort((a, b) => b[1] - a[1]).forEach(([a, c]) =>
  console.log(`  ${String(c).padStart(4)}  ${a}`));

console.log("\n" + bar);
console.log("TEMPLATE FIRING FREQUENCY (by archetype → template id ×count)");
console.log(bar);
const byArch = new Map<string, Array<[string, number]>>();
for (const [id, c] of tmplCount) {
  const a = ID_META.get(id)?.archetype ?? "(unknown)";
  (byArch.get(a) ?? byArch.set(a, []).get(a)!).push([id, c]);
}
[...byArch.keys()].sort().forEach((a) => {
  const rows = byArch.get(a)!.sort((x, y) => y[1] - x[1]);
  const total = rows.reduce((s, [, c]) => s + c, 0);
  console.log(`  ${a}  (${total} fired, ${rows.length} distinct templates)`);
  rows.forEach(([id, c]) => console.log(`      ${String(c).padStart(3)}  ${id}`));
});
console.log(`  non-template paths (culture-override / static fallback): ${nonTemplate}`);

console.log("\n" + bar);
console.log("NEVER-FIRED TEMPLATES (candidate dead / unreachable copy this run)");
console.log(bar);
const deadByArch = new Map<string, string[]>();
for (const [id, meta] of ID_META) {
  if (tmplCount.has(id)) continue;
  const tags: string[] = [];
  if (!meta.enabled) tags.push("DISABLED");
  if (meta.requires?.length) tags.push(`requires=${JSON.stringify(meta.requires)}`);
  const line = `${id} [${meta.register}/${meta.tone}]${tags.length ? " " + tags.join(" ") : ""}`;
  (deadByArch.get(meta.archetype) ?? deadByArch.set(meta.archetype, []).get(meta.archetype)!).push(line);
}
if (deadByArch.size === 0) console.log("  (every template fired at least once)");
let deadTotal = 0;
[...deadByArch.keys()].sort().forEach((a) => {
  const rows = deadByArch.get(a)!;
  deadTotal += rows.length;
  console.log(`  ${a}  (${rows.length} never fired)`);
  rows.forEach((l) => console.log(`      ${l}`));
});

console.log("\n" + bar);
console.log("SUMMARY");
console.log(bar);
console.log(`  hands generated      : ${N}`);
console.log(`  samples printed      : ${printed}${GREP ? ` (filtered by --grep "${GREP}")` : ""}`);
console.log(`  archetypes fired     : ${archCount.size}/18`);
console.log(`  distinct templates   : ${tmplCount.size}/${ID_META.size}`);
console.log(`  never-fired templates: ${deadTotal}/${ID_META.size}`);
console.log(`  non-template paths   : ${nonTemplate}`);
console.log(bar);

// ── DIAGNOSTIC: tone collapse trace ───────────────────────────────────────────
const TONES = ["hype", "warm", "culture_wry", "observational", "analytical", "deadpan"];

console.log("\n" + bar);
console.log("DIAG 1 — SELECTED-TONE DISTRIBUTION (what selectTone() actually returned)");
console.log(bar);
[...toneCount.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, c]) =>
  console.log(`  ${String(c).padStart(4)}  ${t}   (${((c / N) * 100).toFixed(1)}%)`));

console.log("\n" + bar);
console.log("DIAG 2 — PER-ARCHETYPE SELECTED-TONE (rows: archetype → tone counts)");
console.log(bar);
console.log(`  ${"archetype".padEnd(20)} ${TONES.map((t) => t.slice(0, 4).padStart(5)).join(" ")}`);
[...perArchTone.keys()].sort().forEach((a) => {
  const m = perArchTone.get(a)!;
  console.log(`  ${a.padEnd(20)} ${TONES.map((t) => String(m.get(t) ?? 0).padStart(5)).join(" ")}`);
});

// pool + fired grouped by archetype+tone
const poolAT = new Map<string, Map<string, number>>();   // enabled templates per arch+tone
const qByArch = new Map<string, Set<number>>();
for (const [arch, arr] of Object.entries(LIB)) {
  if (!Array.isArray(arr)) continue;
  for (const t of arr as any[]) {
    if (t.enabled === false) continue;
    const m = poolAT.get(arch) ?? poolAT.set(arch, new Map()).get(arch)!;
    m.set(t.tone, (m.get(t.tone) ?? 0) + 1);
    (qByArch.get(arch) ?? qByArch.set(arch, new Set()).get(arch)!).add(t.qualityScore ?? 7);
  }
}
const firedAT = new Map<string, Map<string, number>>();  // distinct fired per arch+tone
for (const id of tmplCount.keys()) {
  const meta = ID_META.get(id); if (!meta) continue;
  const m = firedAT.get(meta.archetype) ?? firedAT.set(meta.archetype, new Map()).get(meta.archetype)!;
  m.set(meta.tone, (m.get(meta.tone) ?? 0) + 1);
}

console.log("\n" + bar);
console.log("DIAG 3 — qualityScore UNIFORMITY per archetype (distinct q values in enabled pool)");
console.log(bar);
[...qByArch.keys()].sort().forEach((a) =>
  console.log(`  ${a.padEnd(20)} q-values: {${[...qByArch.get(a)!].sort().join(", ")}}`));

console.log("\n" + bar);
console.log("DIAG 4 — POOL vs FIRED by archetype+tone  (fired-distinct / enabled-pool | hands-selected-this-tone)");
console.log(bar);
[...poolAT.keys()].sort().forEach((a) => {
  const pool = poolAT.get(a)!;
  const fired = firedAT.get(a) ?? new Map();
  const selT = perArchTone.get(a) ?? new Map();
  const cells = TONES.filter((t) => pool.has(t)).map((t) =>
    `${t.slice(0, 4)}:${fired.get(t) ?? 0}/${pool.get(t)}|${selT.get(t) ?? 0}`);
  console.log(`  ${a.padEnd(20)} ${cells.join("  ")}`);
});
console.log(bar);
