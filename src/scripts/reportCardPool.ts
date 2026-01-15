import fs from "fs";
import path from "path";

type PlayerCard = {
  id: string;
  name: string;
  position: string;
  salary: number;
  tier?: string;
  basePlayerId?: string;
};

function processedDirForSport(sportId: string): string {
  const root = process.cwd();
  if (sportId === "football") {
    const footballOverride = process.env.FOOTBALL_PROCESSED_DIR;
    const dirName =
      footballOverride && footballOverride.trim().length > 0
        ? footballOverride.trim()
        : "processed";
    return path.join(root, "src", "data", "football", dirName);
  }
  return path.join(root, "src", "data", sportId, "processed");
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function inc(obj: Record<string, number>, k: string, by = 1) {
  obj[k] = (obj[k] || 0) + by;
}

async function main() {
  const dir = processedDirForSport("football");
  const playersPath = path.join(dir, "players.json");

  const players = safeReadJson<PlayerCard[]>(playersPath, []);
  if (players.length === 0) {
    console.log(`No players found at: ${playersPath}`);
    process.exit(1);
  }

  const tiers = ["ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE", "UNK"];
  const positions = Array.from(new Set(players.map((p) => p.position))).sort();

  // counts[tier][position]
  const counts: Record<string, Record<string, number>> = {};
  for (const t of tiers) {
    counts[t] = {};
    for (const pos of positions) counts[t][pos] = 0;
  }

  // also track unique base players per tier/pos (important for “no duplicate basePlayerId” rule)
  const uniq: Record<string, Record<string, Set<string>>> = {};
  for (const t of tiers) {
    uniq[t] = {};
    for (const pos of positions) uniq[t][pos] = new Set<string>();
  }

  for (const p of players) {
    const tier = (p.tier && tiers.includes(p.tier)) ? p.tier : "UNK";
    inc(counts[tier], p.position, 1);
    const base = (p.basePlayerId && p.basePlayerId.trim().length > 0) ? p.basePlayerId : p.id;
    uniq[tier][p.position].add(base);
  }

  console.log(`\n=== Card Pool Report ===`);
  console.log(`Dir: ${dir}`);
  console.log(`Players(cards): ${players.length}`);
  console.log(`Positions: ${positions.join(", ")}\n`);

  for (const t of tiers) {
    const row = counts[t];
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    if (total === 0) continue;

    console.log(`${t} (cards=${total})`);
    for (const pos of positions) {
      const c = row[pos] || 0;
      const u = uniq[t][pos].size;
      console.log(`  ${pos}: cards=${c} | uniqueBasePlayers=${u}`);
    }
    console.log("");
  }

  // Quick “anchor variety” heuristic: how many ORANGE+PURPLE per position
  const anchorTiers = ["ORANGE", "PURPLE"];
  console.log(`=== Anchor Pool (ORANGE+PURPLE) ===`);
  for (const pos of positions) {
    const cards =
      (counts["ORANGE"][pos] || 0) + (counts["PURPLE"][pos] || 0);
    const unique =
      uniq["ORANGE"][pos].size + uniq["PURPLE"][pos].size; // ok as heuristic
    console.log(`  ${pos}: cards=${cards} | approxUniqueBasePlayers=${unique}`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
