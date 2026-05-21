/// <reference types="node" />
import * as path from "path";
import * as fs from "fs";
// NB: getCachedSlate is loaded dynamically inside the --slate-v2 branch so
// that the default (no-flag) path stays identical to the legacy simulator
// and doesn't pull in shared/utils at module-init time. This matters under
// ts-node, where the basketball workspace's `type: "module"` triggers ESM
// resolution that doesn't follow extensionless ts imports the same way
// vitest/tsx do.
import type { getCachedSlate as GetCachedSlate } from "../utils/slateSelector";

interface BadgeDef {
  id: string; icon: string; label: string; fp: number;
  position?: string;
  trigger?: (s: Record<string, number>) => boolean;
  test?:    (s: Record<string, number>) => boolean;
  suppresses?: string[];
}
interface WinTier { name: string; minFp: number; multiplier: number; }
interface SportConfig {
  sportKey?: string; name?: string; sportLabel?: string;
  positions: string[]; rosterSlots: string[]; excludeFromFlex?: string[];
  salaryCap: number; maxPlayers?: number; minPlayers?: number;
  economyConfig?: { capMax?: number; salaryMin?: number; salaryMax?: number; salaryRatioFloor?: number; salaryRatioCeiling?: number; tierThresholds?: { tier: string; minSalary: number }[]; };
  salaryMin?: number; salaryMax?: number;
  projectionWeights?: Record<string, number>;
  positionProjectionWeights?: Record<string, Record<string, number>>;
  positionAliases?: Record<string, string>;
  winTiers?: WinTier[];
  winCondition?: { thresholds: { tier: string; minFP: number; multiplier?: number }[] };
  badges?: BadgeDef[];
  tierThresholds?: { tier: string; minSalary: number }[];
}

async function loadSportConfig(cwd: string): Promise<SportConfig> {
  const candidates = [
    path.join(cwd, "src", "adapters", "basketballConfig.ts"),
    path.join(cwd, "src", "adapters", "baseballConfig.ts"),
    path.join(cwd, "src", "adapters", "footballConfig.ts"),
    path.join(cwd, "src", "adapters", "sportConfig.ts"),
  ];
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    console.log("Config: " + c);
    let mod: any;
    try { mod = await import(c); } catch (e) {
      console.error("Failed to load " + c + ":", e); continue;
    }
    for (const key of Object.keys(mod)) {
      const val = mod[key];
      if (val && typeof val === "object" && val.positions && val.rosterSlots) {
        console.log("Export: " + key + "\n");
        return val as SportConfig;
      }
    }
  }
  throw new Error("Could not find sport config. Run from worldcup/ or basketball/.");
}

function computeFp(stats: Record<string, any>, position: string, config: SportConfig): number {
  const posUp = position.toUpperCase();
  const weights: Record<string, number> = (config.positionProjectionWeights?.[posUp]) ? config.positionProjectionWeights[posUp] : (config.projectionWeights ?? {});
  let fp = 0;
  for (const [key, w] of Object.entries(weights)) fp += Number(stats[key] ?? 0) * Number(w);
  // Apply optional per-position FP multiplier (matches the runtime's
  // shared/adapters/SportAdapter.computeFantasyPointsDetailed scaling).
  // Football uses GK = 4.0 to bring keeper FP into outfield-comparable
  // range. Sports without positionMultipliers see the raw FP unchanged.
  const m = (config as any).positionMultipliers?.[posUp];
  if (m !== undefined && Number.isFinite(m) && m !== 1) fp *= m;
  return Math.max(0, fp);
}

function computeBadgeBonus(stats: Record<string, any>, position: string, config: SportConfig): number {
  const posUp = position.toUpperCase();
  const earned: BadgeDef[] = [];
  for (const badge of (config.badges ?? [])) {
    try {
      if (badge.position && badge.position !== "ALL" && badge.position.toUpperCase() !== posUp) continue;
      const fn = badge.trigger ?? badge.test;
      if (typeof fn === "function" && fn(stats)) earned.push(badge);
    } catch {}
  }
  const suppressed = new Set<string>();
  for (const b of earned) for (const s of (b.suppresses ?? [])) suppressed.add(s);
  return earned.filter(b => !suppressed.has(b.id)).reduce((sum, b) => sum + (b.fp ?? 0), 0);
}

function extractWinTiers(config: SportConfig): WinTier[] {
  if (config.winTiers?.length) return config.winTiers;
  const defaults: Record<string, number> = { ROOKIE:1.5, STARTER:2.5, ALL_STAR:5, MVP:15 };
  if (config.winCondition?.thresholds) return config.winCondition.thresholds.map(t => ({ name: t.tier, minFp: t.minFP, multiplier: t.multiplier ?? defaults[t.tier] ?? 2 }));
  return [];
}

function getEconomy(config: SportConfig) {
  const ec = config.economyConfig ?? {};
  return {
    salaryMin: ec.salaryMin ?? config.salaryMin ?? 5,
    salaryMax: ec.salaryMax ?? config.salaryMax ?? 65,
    salaryRatioFloor: ec.salaryRatioFloor ?? 0.3,
    salaryRatioCeiling: ec.salaryRatioCeiling ?? 2.0,
    capMax: ec.capMax ?? config.salaryCap ?? 180,
    tierThresholds: ec.tierThresholds ?? config.tierThresholds ?? [] as { tier: string; minSalary: number }[],
  };
}

function salaryFromProjection(proj: number, posMean: number, econ: ReturnType<typeof getEconomy>): number {
  const ratio = proj / Math.max(posMean, 1);
  const t = Math.max(0, Math.min(1, (ratio - econ.salaryRatioFloor) / (econ.salaryRatioCeiling - econ.salaryRatioFloor)));
  return Math.max(econ.salaryMin, Math.min(econ.salaryMax, Math.round(econ.salaryMin + t * (econ.salaryMax - econ.salaryMin))));
}

function tierFromSalary(salary: number, tiers: { tier: string; minSalary: number }[]): string {
  for (const t of tiers) { if (salary >= t.minSalary) return t.tier; }
  return "WHITE";
}

function makeNormalizePos(config: SportConfig) {
  const aliases = config.positionAliases ?? {};
  const positions = config.positions.map(p => p.toUpperCase());
  return (raw: string): string => {
    const up = (raw ?? "").trim().toUpperCase();
    if (positions.includes(up)) return up;
    const a = aliases[raw?.trim() ?? ""] ?? aliases[up];
    if (a) return a.toUpperCase();
    return positions[0] ?? "FLEX";
  };
}

const NON_SCORING = new Set(["passes_attempted","passes_completed","minutes_played"]);
function hasScoringStats(stats: Record<string, any>): boolean {
  return Object.entries(stats ?? {}).some(([k,v]) => !NON_SCORING.has(k) && typeof v === "number" && v > 0);
}

function makeRng(seed = 42) { let s = seed; return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; }; }
function pct(a: number[], p: number) { return a[Math.min(Math.floor(a.length * p / 100), a.length - 1)] ?? 0; }
function avg(a: number[]) { return a.length ? a.reduce((s,v)=>s+v,0)/a.length : 0; }
function bar(r: number, w = 25) { const f = Math.round(Math.min(r,50)/50*w); return "[" + "#".repeat(f) + ".".repeat(w-f) + "]"; }

/** Resolve the sport workspace directory from a sport-name positional arg.
 *  Walks up from process.cwd() looking for a directory that contains a
 *  matching <sport>/package.json — that directory is the repo root.
 *  Returns the absolute path to <repoRoot>/<sport>, or null on miss. */
function resolveSportWorkspace(sport: string, startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, sport);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

async function main() {
  const KNOWN_SPORTS = ["basketball", "baseball", "football", "worldcup"];
  const argv = process.argv.slice(2);
  const flags = argv.filter(a => a.startsWith("--"));
  const positional = argv.filter(a => !a.startsWith("--"));

  let sportArg: string | null = null;
  let N = 1000;
  for (const arg of positional) {
    if (KNOWN_SPORTS.includes(arg)) { sportArg = arg; continue; }
    const n = parseInt(arg, 10);
    if (Number.isFinite(n) && n > 0) { N = n; continue; }
    console.warn(`[runSimulator] Ignored unrecognized positional arg: ${arg}`);
  }

  const verbose = flags.includes("--verbose");
  const slateV2 = flags.includes("--slate-v2");

  let cwd = process.cwd();
  if (sportArg) {
    const resolved = resolveSportWorkspace(sportArg, cwd);
    if (!resolved) {
      console.error(`[runSimulator] Could not find sport workspace "${sportArg}" — walked up from ${cwd}.`);
      process.exit(1);
    }
    cwd = resolved;
    console.log(`Sport workspace: ${cwd}`);
  }

  const config = await loadSportConfig(cwd);
  const sportName = config.sportLabel ?? config.name ?? "Sport";
  const econ = getEconomy(config);
  const winTiers = extractWinTiers(config);
  const normalizePos = makeNormalizePos(config);
  const useLogProj = !!config.positionProjectionWeights;
  const rosterSize = config.maxPlayers ?? config.minPlayers ?? config.rosterSlots.length;

  console.log("ReplayMod Simulator -- " + sportName);
  console.log("Hands: " + N + "  FP mode: " + (useLogProj ? "position-specific" : "flat"));
  console.log("Roster: [" + config.rosterSlots.join(", ") + "]  Cap: $" + econ.capMax + "\n");

  const dataBases = [path.join(cwd,"public","data"), path.join(cwd,"data")];
  let playersFile = "", logsFile = "";
  for (const base of dataBases) {
    for (const f of ["players.json","players.raw.json"]) { const p = path.join(base,f); if (fs.existsSync(p)) { playersFile=p; break; } }
    for (const f of ["game-logs.json","game-logs.raw.json"]) { const p = path.join(base,f); if (fs.existsSync(p)) { logsFile=p; break; } }
    if (playersFile && logsFile) break;
  }
  if (!playersFile || !logsFile) { console.error("Could not find data files"); process.exit(1); }
  console.log("Players: " + playersFile + "\nLogs: " + logsFile + "\n");

  const allPlayers: any[] = JSON.parse(fs.readFileSync(playersFile, "utf8"));
  const allRawLogs: any[] = JSON.parse(fs.readFileSync(logsFile, "utf8"));

  // Apply active-seasons filter from config so the simulator sees the same
  // pool the runtime does. Sports without activeSeasons configured see no
  // filter (full pool). Football: ["2022"] — drops 2018 squads + their logs.
  const activeSeasons = (config as any).activeSeasons as string[] | undefined;
  const players: any[] = activeSeasons?.length
    ? allPlayers.filter(p => activeSeasons.includes(String(p?.season ?? "")))
    : allPlayers;
  const rawLogs: any[] = activeSeasons?.length
    ? allRawLogs.filter(l => activeSeasons.includes(String(l?.season ?? "")))
    : allRawLogs;
  if (activeSeasons?.length) {
    console.log(`Active seasons: ${activeSeasons.join(", ")} → ${players.length}/${allPlayers.length} players, ${rawLogs.length}/${allRawLogs.length} logs`);
  } else {
    console.log("Loaded " + players.length + " players, " + rawLogs.length + " logs");
  }

  const logMap = new Map<string, any[]>();
  for (const log of rawLogs) {
    const key = String(log.basePlayerId ?? log.playerId ?? "").trim();
    if (!key) continue;
    const stats = log.stats ?? log;
    if (!hasScoringStats(stats)) continue;
    if (!logMap.has(key)) logMap.set(key, []);
    logMap.get(key)!.push(log);
  }
  console.log("Scoring logs: " + logMap.size + " players\n");

  const projById = new Map<string, number>();
  const posSums: Record<string,number> = {}, posCounts: Record<string,number> = {};
  for (const p of players) {
    const id = String(p.basePlayerId ?? p.id ?? "").trim();
    const pos = normalizePos(p.position ?? "");
    if (!id) continue;
    let proj: number;
    if (useLogProj) {
      const logs = logMap.get(id) ?? [];
      if (!logs.length) continue;
      const fps = logs.map((l: any) => computeFp(l.stats ?? l, pos, config)).filter((f: number) => f > 0);
      if (!fps.length) continue;
      proj = avg(fps);
    } else {
      proj = Number(p.avgFP ?? p.projectedFp ?? 0);
      if (!proj) continue;
    }
    projById.set(id, proj);
    posSums[pos] = (posSums[pos]??0)+proj;
    posCounts[pos] = (posCounts[pos]??0)+1;
  }

  const overallMean = avg([...projById.values()]);
  const posMeans: Record<string,number> = {};
  for (const pos of config.positions) {
    const up = pos.toUpperCase();
    posMeans[up] = (posCounts[up]??0) > 0 ? posSums[up]/posCounts[up] : overallMean;
  }

  console.log("=== POSITION MEANS ===");
  for (const pos of config.positions) {
    const up = pos.toUpperCase();
    console.log("  " + up + ": " + (posMeans[up]??overallMean).toFixed(1) + " FP avg  (" + (posCounts[up]??0) + " players)");
  }
  console.log("");

  type PP = { id:string; name:string; position:string; projFp:number; salary:number; tier:string; };
  const fullPool: PP[] = [];
  for (const p of players) {
    const id = String(p.basePlayerId ?? p.id ?? "").trim();
    const pos = normalizePos(p.position ?? "");
    const proj = projById.get(id);
    if (proj === undefined) continue;
    const salary = useLogProj ? salaryFromProjection(proj, posMeans[pos]??overallMean, econ) : (Number(p.salary??0)||salaryFromProjection(proj,posMeans[pos]??overallMean,econ));
    fullPool.push({id, name:p.name??id, position:pos, projFp:proj, salary, tier:tierFromSalary(salary, econ.tierThresholds)});
  }

  // Slate v2: restrict deal pool to today's slate (calibration runs only).
  // The simulator has no real SportAdapter; we synthesize a minimal
  // CacheableAdapter shape from the simulator's already-computed pool,
  // using projFp as a stand-in for career FP (the sim has no multi-season
  // career totals; projFp is the per-game projection averaged from logs).
  // Slate sizing follows defaultSlateConfig: rosterSize * 10 by default.
  let pool: PP[] = fullPool;
  let slateIds: Set<string> | null = null;
  if (slateV2) {
    const sportKey = config.sportKey ?? config.name ?? "sport";
    const fpById = new Map(fullPool.map(p => [p.id, p.projFp]));
    const ids = fullPool.map(p => p.id);
    const simAdapter = {
      sportKey,
      rosterSize,
      config: {
        slateSize: rosterSize * 10,
        anchorCount: Math.min(10, Math.max(0, Math.floor(rosterSize * 10 * 0.2))),
        weightExponent: 1.0,
      },
      getAnchors: () => {
        // Top-N by projFp as anchors (mirrors SportAdapter default behavior).
        return [...fullPool].sort((a, b) => b.projFp - a.projFp)
          .slice(0, simAdapter.config.anchorCount).map(p => p.id);
      },
      getCareerFPById: (id: string) => fpById.get(id) ?? 0,
      getEligiblePool: () => ids,
      getThemedEligibility: (_themeKey: string) => null,
      getExclusionList: () => [],
    };
    // Dynamic import: keeps the default (no-flag) path zero-impact under
    // ts-node, which doesn't always resolve extensionless ESM imports of
    // shared/* from the basketball workspace. `npx tsx ...` resolves both
    // forms cleanly; the calibration runbook recommends tsx for --slate-v2
    // runs. We try the explicit `.js` first (tsx ESM remap), then fall
    // back to extensionless (ts-node CJS) to support both runners.
    let slateMod: { getCachedSlate: typeof GetCachedSlate };
    try {
      slateMod = await import("../utils/slateSelector.js" as string);
    } catch {
      slateMod = await import("../utils/slateSelector" as string);
    }
    const slate = slateMod.getCachedSlate(simAdapter as any, new Date());
    slateIds = new Set(slate);
    pool = fullPool.filter(p => slateIds!.has(p.id));
    console.log("=== SLATE V2 (calibration) ===");
    console.log("  Sport:       " + sportKey);
    console.log("  Full pool:   " + fullPool.length);
    console.log("  Slate size:  " + slateIds.size + " (config slateSize=" + simAdapter.config.slateSize + ", anchors=" + simAdapter.config.anchorCount + ")");
    console.log("  Restricted:  " + pool.length + " players survive slate intersection\n");
  }

  const byPos: Record<string,PP[]> = {};
  for (const pos of config.positions) byPos[pos.toUpperCase()] = [];
  for (const p of pool) { (byPos[p.position]??=[]).push(p); }
  const excludeFlex = new Set((config.excludeFromFlex??[]).map(p => p.toUpperCase()));
  const flexPool = pool.filter(p => !excludeFlex.has(p.position));

  console.log("=== POOL SIZES ===");
  for (const pos of config.positions) console.log("  " + pos.toUpperCase() + ": " + (byPos[pos.toUpperCase()]??[]).length);
  console.log("  TOTAL: " + pool.length + "\n");

  const missing = config.positions.filter(p => !(byPos[p.toUpperCase()]?.length));
  if (missing.length) { console.error("No players for: " + missing.join(", ")); process.exit(1); }

  // Correlation check
  console.log("=== SALARY/PROJ CORRELATION ===");
  for (const pos of config.positions) {
    const up = pos.toUpperCase();
    const ps = (byPos[up]??[]).sort((a,b)=>b.salary-a.salary);
    if (ps.length < 5) continue;
    const top5 = ps.slice(0,5), bot5 = ps.slice(-5);
    const corr = avg(top5.map(p=>p.projFp)) > avg(bot5.map(p=>p.projFp)) ? "OK" : "INVERTED";
    console.log("  " + up + "  top5: $" + avg(top5.map(p=>p.salary)).toFixed(0) + " -> " + avg(top5.map(p=>p.projFp)).toFixed(1) + " FP   bot5: $" + avg(bot5.map(p=>p.salary)).toFixed(0) + " -> " + avg(bot5.map(p=>p.projFp)).toFixed(1) + " FP  " + corr);
  }
  console.log("");

  // Simulate
  const rng = makeRng(42);
  const posFpS: Record<string,number[]> = {}, posBdgS: Record<string,number[]> = {};
  for (const pos of config.positions) { posFpS[pos.toUpperCase()]=[]; posBdgS[pos.toUpperCase()]=[]; }
  const allFps: number[] = [];
  // Hand FPs grouped by anchor-position. Anchor = highest-salary card in
  // the dealt roster (within-position salary normalization means that's
  // also the highest-projected). Used to verify position-parity gate:
  // LEGEND-rate ratio across positions should land within 2×.
  const fpsByAnchorPos: Record<string, number[]> = {};
  const rosterCosts: number[] = [];
  const tierCounts: Record<string, number> = {};
  let slatePlayerDraws = 0; // rosters built fully from slate (always true when slateV2 ON)
  let totalRosterSlots = 0;
  let totalBdg = 0;
  const start = Date.now();

  for (let i = 0; i < N; i++) {
    if (i > 0 && i % 2000 === 0) process.stdout.write("  " + i + "/" + N + "...\n");
    const used = new Set<string>(), roster: PP[] = [];
    let totalSal = 0;
    const pick = (pool: PP[]) => { const a = pool.filter(p=>!used.has(p.id)); return a.length ? a[Math.floor(rng()*a.length)] : null; };

    for (const slot of config.rosterSlots) {
      if (slot.toUpperCase() === "FLEX") continue;
      const sp = byPos[slot.toUpperCase()] ?? [];
      const left = rosterSize - roster.length;
      const aff = sp.filter(p=>!used.has(p.id) && totalSal+p.salary <= econ.capMax-(left-1)*econ.salaryMin);
      const p = pick(aff.length ? aff : sp);
      if (p) { roster.push(p); used.add(p.id); totalSal+=p.salary; }
    }
    const fc = config.rosterSlots.filter(s=>s.toUpperCase()==="FLEX").length;
    for (let f = 0; f < fc; f++) {
      const rem = fc - f;
      const aff = flexPool.filter(p=>!used.has(p.id) && totalSal+p.salary <= econ.capMax-(rem-1)*econ.salaryMin);
      const p = pick(aff.length ? aff : flexPool);
      if (p) { roster.push(p); used.add(p.id); totalSal+=p.salary; }
    }

    let hfp = 0;
    for (const player of roster) {
      const logs = logMap.get(player.id) ?? [];
      if (!logs.length) continue;
      const log = logs[Math.floor(rng()*logs.length)];
      const stats = log.stats ?? log;
      const fp = computeFp(stats, player.position, config);
      const bdg = computeBadgeBonus(stats, player.position, config);
      hfp += fp + bdg; totalBdg += bdg;
      posFpS[player.position]?.push(fp);
      posBdgS[player.position]?.push(bdg);
      tierCounts[player.tier] = (tierCounts[player.tier] ?? 0) + 1;
      totalRosterSlots++;
      if (slateIds && slateIds.has(player.id)) slatePlayerDraws++;
    }
    rosterCosts.push(totalSal);
    allFps.push(hfp);
    // Track hand-FP by anchor-position (highest-salary card in the roster)
    if (roster.length > 0) {
      const anchor = roster.reduce((a, b) => (a.salary >= b.salary ? a : b));
      const pos = anchor.position.toUpperCase();
      (fpsByAnchorPos[pos] ??= []).push(hfp);
    }
  }

  allFps.sort((a,b)=>a-b);
  const handAvg = avg(allFps);
  const avgBdg = totalBdg/N;
  console.log("Done " + N + " hands in " + ((Date.now()-start)/1000).toFixed(2) + "s\n");

  console.log("=== PER-POSITION FP ===");
  for (const pos of config.positions) {
    const up = pos.toUpperCase();
    const fps = (posFpS[up]??[]).sort((a,b)=>a-b);
    if (!fps.length) continue;
    const a = avg(fps);
    console.log("  " + up + "  avg:" + a.toFixed(1) + "  p90:" + pct(fps,90).toFixed(1) + "  p99:" + pct(fps,99).toFixed(1) + "  badge/game:+" + avg(posBdgS[up]??[]).toFixed(1));
  }

  console.log("\n=== TEAM FP DISTRIBUTION ===");
  console.log("  Min:    " + allFps[0].toFixed(1));
  console.log("  P25:    " + pct(allFps,25).toFixed(1));
  console.log("  Median: " + pct(allFps,50).toFixed(1));
  console.log("  Avg:    " + handAvg.toFixed(1));
  console.log("  P75:    " + pct(allFps,75).toFixed(1));
  console.log("  P90:    " + pct(allFps,90).toFixed(1));
  console.log("  P99:    " + pct(allFps,99).toFixed(1));
  console.log("  Max:    " + allFps[allFps.length-1].toFixed(1));
  console.log("  Avg badge/hand: +" + avgBdg.toFixed(1));

  // === MULTI-SCENARIO THRESHOLD COMPARISON ===
  type TierDef = { tier: string; minFP: number; multiplier: number };

  // Win-tier multipliers MUST stay in sync with basketball/src/utils/payoutLogic.ts
  // (BASKETBALL_WIN_TIERS) and shared/components/GameBar.tsx STREAK_LABELS.
  // Order: highest tier first inside each scenario for legibility; calcEV sorts.
  // Active-sport scenario — reads winTiers from the loaded config.
  // For non-basketball sports (football/baseball/etc) this is the
  // canonical scenario; the legacy basketball-hardcoded scenarios below
  // remain for sport=basketball comparison and are non-authoritative
  // when running other sports.
  const activeSportTiers: TierDef[] = winTiers.map(t => ({
    tier: t.name,
    minFP: t.minFp,
    multiplier: t.multiplier,
  }));

  const SCENARIOS: { label: string; desc: string; tiers: TierDef[] }[] = [
    {
      label: "ACTIVE SPORT (config-driven)",
      desc:  `Tiers from ${config.sportLabel ?? config.sportKey ?? "sport"} config — authoritative for the loaded sport`,
      tiers: activeSportTiers,
    },
    {
      label: "CURRENT (baseline)",
      desc:  "Existing thresholds — for reference only (basketball-tuned)",
      tiers: [
        { tier: "ROOKIE",   minFP: 185, multiplier: 0.5 },
        { tier: "STARTER",  minFP: 205, multiplier: 1.5 },
        { tier: "ALL_STAR", minFP: 225, multiplier: 3   },
        { tier: "MVP",      minFP: 235, multiplier: 8   },
        { tier: "LEGEND",   minFP: 255, multiplier: 50  },
      ],
    },
    {
      label: "PROTECTED (hands 2-30)",
      desc:  "Newbie phase — tighter gap vs Live, floor guarantee does the heavy lifting",
      tiers: [
        { tier: "ROOKIE",   minFP: 175, multiplier: 0.5 },
        { tier: "STARTER",  minFP: 200, multiplier: 1.5 },
        { tier: "ALL_STAR", minFP: 220, multiplier: 3   },
        { tier: "MVP",      minFP: 230, multiplier: 8   },
        { tier: "LEGEND",   minFP: 255, multiplier: 50  },
      ],
    },
    {
      label: "LIVE (hand 31+)",
      desc:  "Standard play — current basketball tiers (BASKETBALL_WIN_TIERS)",
      tiers: [
        { tier: "ROOKIE",   minFP: 185, multiplier: 0.5 },
        { tier: "STARTER",  minFP: 205, multiplier: 1.5 },
        { tier: "ALL_STAR", minFP: 225, multiplier: 3   },
        { tier: "MVP",      minFP: 235, multiplier: 8   },
        { tier: "LEGEND",   minFP: 255, multiplier: 50  },
      ],
    },
    {
      label: "LIVE ALT (slightly easier)",
      desc:  "If Live EV too punishing — nudge ROOKIE down to 180",
      tiers: [
        { tier: "ROOKIE",   minFP: 180, multiplier: 0.5 },
        { tier: "STARTER",  minFP: 205, multiplier: 1.5 },
        { tier: "ALL_STAR", minFP: 225, multiplier: 3   },
        { tier: "MVP",      minFP: 235, multiplier: 8   },
        { tier: "LEGEND",   minFP: 255, multiplier: 50  },
      ],
    },
  ];

  // Streak multipliers from shared/utils/payoutLogic.ts STREAK_TIERS.
  // 3 wins → 1.3x | 5 wins → 1.7x | 10 wins → 2.5x. The tuple is (target, mult).
  const STREAK_RULES: Array<[number, number]> = [[10, 2.5], [5, 1.7], [3, 1.3]];
  const STREAK_TARGETS = STREAK_RULES.map(([t]) => t);
  const STREAK_LABELS: Record<number, string> = Object.fromEntries(
    STREAK_RULES.map(([t, m]) => [t, `${m}x payout`])
  );
  function streakMultiplierFor(streakLen: number): number {
    for (const [t, m] of STREAK_RULES) if (streakLen >= t) return m;
    return 1.0;
  }
  const SESSION_HANDS = 10;
  const NUM_SESSIONS = Math.max(N, 10000);

  function payoutForFp(tiers: TierDef[], fp: number): number {
    const sorted = [...tiers].sort((a, b) => b.minFP - a.minFP);
    for (const t of sorted) if (fp >= t.minFP) return t.multiplier;
    return 0;
  }

  /** Per-hand EV — ignores streak multipliers. */
  function calcEV(tiers: TierDef[], fps: number[]): number {
    let sum = 0;
    for (const f of fps) sum += payoutForFp(tiers, f);
    return sum / fps.length;
  }

  /** Session-level simulation: applies the active streak multiplier to each
   *  hand's payout and reports both streak hit rates and the streak-aware EV.
   *  rookieFP defines the "win" threshold that grows the streak counter. */
  function runStreaks(
    rookieFP: number, fps: number[], tiers: TierDef[]
  ): { hits: Record<number, number>; evWithStreak: number } {
    const hits: Record<number, number> = {};
    STREAK_TARGETS.forEach(t => { hits[t] = 0; });
    let totalPayout = 0;
    let totalHands = 0;
    for (let s = 0; s < NUM_SESSIONS; s++) {
      let streak = 0, maxStreak = 0;
      for (let h = 0; h < SESSION_HANDS; h++) {
        const fp = fps[Math.floor(Math.random() * fps.length)];
        const isWin = fp >= rookieFP;
        // Streak multiplier applies to non-bust wins only; bust resets streak.
        const mult = isWin ? streakMultiplierFor(streak) : 1.0;
        totalPayout += payoutForFp(tiers, fp) * mult;
        totalHands += 1;
        if (isWin) { streak++; if (streak > maxStreak) maxStreak = streak; }
        else streak = 0;
      }
      STREAK_TARGETS.forEach(t => { if (maxStreak >= t) hits[t]++; });
    }
    return { hits, evWithStreak: totalPayout / totalHands };
  }

  console.log("\n" + "=".repeat(65));
  console.log("  SCENARIO COMPARISON  (" + NUM_SESSIONS.toLocaleString() + " sessions x " + SESSION_HANDS + " hands)");
  console.log("=".repeat(65));

  for (const scenario of SCENARIOS) {
    // Lowest-threshold tier (formerly hardcoded as "ROOKIE" — sport-agnostic now).
    const lowestTier = scenario.tiers.reduce((a, b) => a.minFP <= b.minFP ? a : b);
    const winRate = allFps.filter(f => f >= lowestTier.minFP).length / N * 100;
    const ev = calcEV(scenario.tiers, allFps);
    const { hits: streaks, evWithStreak } = runStreaks(lowestTier.minFP, allFps, scenario.tiers);
    const flagFor = (e: number) =>
      e > 1 ? "HOUSE LOSES" : e > 0.92 ? "TOO GENEROUS" : e >= 0.78 ? "TARGET ZONE" : e >= 0.62 ? "SLIGHTLY PUNISHING" : "TOO PUNISHING";

    console.log("\n--- " + scenario.label + " ---");
    console.log("    " + scenario.desc);
    console.log("");

    // Per-anchor-position hit rates (parity check) — only printed for the
    // ACTIVE SPORT scenario to keep the legacy-basketball scenarios concise.
    if (scenario.label.startsWith("ACTIVE SPORT") && Object.keys(fpsByAnchorPos).length > 0) {
      console.log("    Tier hit rates by ANCHOR POSITION (parity check):");
      const positions = Object.keys(fpsByAnchorPos).sort();
      const header = "Pos".padEnd(6) + "Hands".padStart(7);
      const tierHeader = scenario.tiers.map(t => t.tier.padStart(10)).join("");
      console.log("    " + header + tierHeader);
      const legendTier = scenario.tiers.reduce((a, b) => a.minFP >= b.minFP ? a : b);
      const ratesByPos: Record<string, number> = {};
      for (const pos of positions) {
        const fps = fpsByAnchorPos[pos];
        const cells = scenario.tiers.map(t => {
          const r = fps.filter(f => f >= t.minFP).length / fps.length * 100;
          return (r.toFixed(1) + "%").padStart(10);
        }).join("");
        const legendRate = fps.filter(f => f >= legendTier.minFP).length / fps.length * 100;
        ratesByPos[pos] = legendRate;
        console.log("    " + pos.padEnd(6) + String(fps.length).padStart(7) + cells);
      }
      // Parity gate: LEGEND-rate max/min ratio should be ≤ 2× per the spec.
      // If any position has 0% LEGEND rate, parity is broken outright (one
      // position is unreachable at the top tier).
      const rates = Object.values(ratesByPos);
      if (rates.length >= 2) {
        const max = Math.max(...rates);
        const min = Math.min(...rates);
        if (min === 0 && max > 0) {
          console.log(`    LEGEND-rate parity: BROKEN — ${Object.entries(ratesByPos).filter(([_,r]) => r === 0).map(([p]) => p).join("/")} unreachable at LEGEND while ${Object.entries(ratesByPos).filter(([_,r]) => r === max).map(([p]) => p).join("/")} hits ${max.toFixed(2)}%`);
        } else if (min > 0) {
          const ratio = max / min;
          const flag = ratio <= 2 ? "OK" : ratio <= 4 ? "MARGINAL" : "BROKEN";
          console.log(`    LEGEND-rate ratio (max/min across anchor positions): ${ratio.toFixed(2)}x  [${flag}]`);
        }
      }
      console.log("");
    }

    // Tier hit rates
    for (const t of scenario.tiers) {
      const rate = allFps.filter(f => f >= t.minFP).length / N * 100;
      const barW = Math.round(Math.min(rate, 50) / 50 * 20);
      console.log("    " + t.tier.padEnd(9) + " >=" + String(t.minFP).padStart(4) + " FP  " +
        String(rate.toFixed(1) + "%").padStart(6) + "  [" + "#".repeat(barW) + ".".repeat(20-barW) + "]");
    }

    console.log("");
    console.log("    Win rate (ROOKIE+):       " + winRate.toFixed(1) + "%");
    console.log("    EV (no streak):           " + ev.toFixed(3) + "  " + flagFor(ev));
    console.log("    EV (with streak bumps):   " + evWithStreak.toFixed(3) + "  " + flagFor(evWithStreak));

    // Streak rates
    console.log("    Streaks (per " + SESSION_HANDS + "-hand session):");
    for (const t of STREAK_TARGETS) {
      const rate = streaks[t] / NUM_SESSIONS * 100;
      const feel = rate > 40 ? "very common" : rate > 20 ? "common" : rate > 8 ? "occasional" : rate > 2 ? "rare" : "very rare";
      const bonus = STREAK_LABELS[t] ? " <- " + STREAK_LABELS[t] : "";
      console.log("      " + String(t + "-win:").padEnd(8) + String(rate.toFixed(1) + "%").padStart(6) + "  " + feel + bonus);
    }
  }

  console.log("\n" + "=".repeat(65));
  console.log("  RECOMMENDATION SUMMARY");
  console.log("=".repeat(65));
  console.log("  Hand 1:      FTUE (hardcoded star, guaranteed good)");
  console.log("  Hands 2-30:  PROTECTED thresholds (invisible to user)");
  console.log("  Hand 31+:    LIVE thresholds");
  console.log("  Streak multipliers: " + STREAK_RULES.map(([t, m]) => `${t}-win=${m}x`).join("  "));
  console.log("");

  if (verbose) {
    console.log("\n=== TOP 20 HANDS ===");
    allFps.slice(-20).reverse().forEach((fp,i) => console.log("  #"+(i+1)+": "+fp.toFixed(1)+" FP"));
  }

  // === Slate v2 calibration metrics (machine-readable) ===
  // Always emitted at the end so calibration jobs can `tail | grep` for it.
  // When --slate-v2 is OFF this just confirms baseline metrics; when ON it
  // is the canonical output the calibration runbook parses.
  const sortedCosts = [...rosterCosts].sort((a, b) => a - b);
  const tierFreq: Record<string, number> = {};
  if (totalRosterSlots > 0) {
    for (const [tier, n] of Object.entries(tierCounts)) {
      tierFreq[tier] = +(n / totalRosterSlots).toFixed(4);
    }
  }
  const slateMetrics = {
    sport: config.sportKey ?? config.name ?? "sport",
    hands: N,
    slateV2: slateV2,
    slateSize: slateIds ? slateIds.size : null,
    fullPoolSize: fullPool.length,
    dealPoolSize: pool.length,
    meanFP: +avg(allFps).toFixed(2),
    p90FP: +pct(allFps, 90).toFixed(2),
    p95FP: +pct(allFps, 95).toFixed(2),
    p99FP: +pct(allFps, 99).toFixed(2),
    meanRosterCost: +avg(rosterCosts).toFixed(2),
    p90RosterCost: +pct(sortedCosts, 90).toFixed(2),
    bonusFPPerHand: +(totalBdg / N).toFixed(2),
    slatePlayerDrawRate: totalRosterSlots > 0 ? +(slatePlayerDraws / totalRosterSlots).toFixed(4) : 0,
    tierFrequency: tierFreq,
  };
  console.log("\n=== SLATE_V2_METRICS_JSON ===");
  console.log(JSON.stringify(slateMetrics, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
