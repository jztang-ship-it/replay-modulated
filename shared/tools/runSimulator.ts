/// <reference types="node" />
import * as path from "path";
import * as fs from "fs";

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
    path.join(cwd, "src", "adapters", "worldcupConfig.ts"),
    path.join(cwd, "src", "adapters", "basketballConfig.ts"),
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

async function main() {
  const N = parseInt(process.argv[2] ?? "1000", 10);
  const verbose = process.argv.includes("--verbose");
  const cwd = process.cwd();

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

  const players: any[] = JSON.parse(fs.readFileSync(playersFile, "utf8"));
  const rawLogs: any[] = JSON.parse(fs.readFileSync(logsFile, "utf8"));
  console.log("Loaded " + players.length + " players, " + rawLogs.length + " logs");

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
  const pool: PP[] = [];
  for (const p of players) {
    const id = String(p.basePlayerId ?? p.id ?? "").trim();
    const pos = normalizePos(p.position ?? "");
    const proj = projById.get(id);
    if (proj === undefined) continue;
    const salary = useLogProj ? salaryFromProjection(proj, posMeans[pos]??overallMean, econ) : (Number(p.salary??0)||salaryFromProjection(proj,posMeans[pos]??overallMean,econ));
    pool.push({id, name:p.name??id, position:pos, projFp:proj, salary, tier:tierFromSalary(salary, econ.tierThresholds)});
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
    }
    allFps.push(hfp);
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

  if (winTiers.length) {
    const TARGET: Record<string,number> = { ROOKIE:32, STARTER:13, ALL_STAR:5, MVP:1 };
    console.log("\n=== WIN TIER HIT RATES ===");
    let needsAdj = false;
    for (const tier of winTiers) {
      const rate = allFps.filter(f=>f>=tier.minFp).length/N*100;
      const target = TARGET[tier.name]??5;
      const flag = rate>target*1.5 ? "TOO EASY" : rate<target*0.5 ? "TOO HARD" : "GOOD";
      if (flag!=="GOOD") needsAdj=true;
      console.log("  " + tier.name.padEnd(9) + " >=" + String(tier.minFp).padStart(4) + " FP (" + tier.multiplier + "x)  " + rate.toFixed(1) + "%  " + bar(rate) + "  " + flag);
    }
    if (needsAdj) {
      const sorted = [...winTiers].sort((a,b)=>b.minFp-a.minFp);
      console.log("\n=== SUGGESTED THRESHOLDS ===");
      const out: {name:string;minFp:number;mult:number}[] = [];
      for (const tier of sorted) {
        const tp = TARGET[tier.name]??5;
        const rounded = Math.round(pct(allFps,100-tp)/5)*5;
        const actual = allFps.filter(f=>f>=rounded).length/N*100;
        out.push({name:tier.name,minFp:rounded,mult:tier.multiplier});
        console.log("  " + tier.name.padEnd(9) + " >=" + rounded + " FP (" + tier.multiplier + "x)  ->" + actual.toFixed(1) + "%");
      }
      console.log("\n  Paste into winTiers:");
      for (const s of out.sort((a,b)=>a.minFp-b.minFp)) {
        console.log('    { name: "' + s.name + '", minFp: ' + s.minFp + ', multiplier: ' + s.mult + ' },');
      }
    }

    const sorted = [...winTiers].sort((a,b)=>b.minFp-a.minFp);
    let ev = 0;
    for (let i=0;i<sorted.length;i++) {
      const lo=sorted[i].minFp, hi=i===0?Infinity:sorted[i-1].minFp;
      ev+=allFps.filter(f=>f>=lo&&f<hi).length/N*sorted[i].multiplier;
    }
    console.log("\n  EV: " + ev.toFixed(3) + (ev>1?"  HOUSE LOSES":ev<0.5?"  TOO PUNISHING":"  OK") + "  (target 0.70-0.85)");
  }

  if (verbose) {
    console.log("\n=== TOP 20 HANDS ===");
    allFps.slice(-20).reverse().forEach((fp,i)=>console.log("  #"+(i+1)+": "+fp.toFixed(1)+" FP"));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
