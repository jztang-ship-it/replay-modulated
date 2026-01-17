import fs from "fs";
import path from "path";

type Log = Record<string, any>;
const MIN_MINUTES = 1;

function num(x: any) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function hasAnyNumericStat(stats: Record<string, any>): boolean {
  for (const v of Object.values(stats)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return true;
  }
  return false;
}

function getMinutes(log: Log): number {
  const stats = log?.stats ?? {};
  return num(log?.minutesPlayed ?? stats?.minutes ?? stats?.mins ?? 0);
}

function hasDate(log: Log): boolean {
  const d = String(log?.matchDate ?? log?.date ?? "");
  return d.trim().length >= 8;
}

function isValidLog(log: Log): boolean {
  const stats = log?.stats;
  if (!stats || typeof stats !== "object") return false;
  if (Object.keys(stats).length === 0) return false;
  if (!hasAnyNumericStat(stats)) return false;

  if (!hasDate(log)) return false;

  const mins = getMinutes(log);
  if (mins < MIN_MINUTES) return false;

  // Ensure objective actual FP exists
  const tp = stats.total_points;
  if (tp === undefined || tp === null || !Number.isFinite(Number(tp))) return false;

  return true;
}

function main() {
  const fp = path.resolve(process.cwd(), "src/data/football/processed-epl-cards/game-logs.json");
  const raw = JSON.parse(fs.readFileSync(fp, "utf8")) as Log[];

  const before = raw.length;
  const cleaned = raw.filter(isValidLog);
  const after = cleaned.length;

  const out = path.resolve(process.cwd(), "src/data/football/processed-epl-cards/game-logs.cleaned.json");
  fs.writeFileSync(out, JSON.stringify(cleaned, null, 2), "utf8");

  console.log(`Logs before: ${before}`);
  console.log(`Logs after:  ${after}`);
  console.log(`Removed:     ${before - after}`);
  console.log(`Wrote:       ${out}`);

  console.log("Sample cleaned keys:", Object.keys(cleaned[0] || {}));
  console.log("Sample matchDate:", cleaned[0]?.matchDate);
  console.log("Sample minutes:", cleaned[0]?.minutesPlayed, cleaned[0]?.stats?.minutes);
  console.log("Sample total_points:", cleaned[0]?.stats?.total_points);
}

main();
