import fs from "node:fs";

const path = "public/data/players.json";
const players = JSON.parse(fs.readFileSync(path, "utf8"));

const byId = new Map();
const byBaseSeasonPos = new Map();
const byBase = new Map();
const byNameTeamSeason = new Map();
const missingBase = [];

function norm(s) {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

for (const p of players) {
  const id = String(p.id ?? "").trim();
  const base = String(p.basePlayerId ?? "").trim();
  const season = String(p.season ?? "").trim();
  const pos = String(p.position ?? "").trim();
  const team = String(p.team ?? "").trim();
  const name = String(p.name ?? "").trim();

  if (id) (byId.get(id) ?? byId.set(id, []).get(id)).push(p);

  if (!base) missingBase.push(p);

  if (base) {
    (byBase.get(base) ?? byBase.set(base, []).get(base)).push(p);

    const k = `${base}|${season}|${pos}`;
    (byBaseSeasonPos.get(k) ?? byBaseSeasonPos.set(k, []).get(k)).push(p);
  }

  const nts = `${norm(name)}|${norm(team)}|${season}|${pos}`;
  (byNameTeamSeason.get(nts) ?? byNameTeamSeason.set(nts, []).get(nts)).push(p);
}

// Report
const dupId = [...byId.entries()].filter(([, arr]) => arr.length > 1);
const dupBaseSeasonPos = [...byBaseSeasonPos.entries()].filter(([, arr]) => arr.length > 1);
const dupNameTeamSeason = [...byNameTeamSeason.entries()].filter(([, arr]) => arr.length > 1);

console.log("Players:", players.length);
console.log("Missing basePlayerId:", missingBase.length);

console.log("\n[1] Duplicate raw `id` (should be 0):", dupId.length);
for (const [k, arr] of dupId.slice(0, 25)) {
  console.log("  id:", k, "count:", arr.length, "names:", [...new Set(arr.map((x) => `${x.name} (${x.team}, ${x.season})`))]);
}

console.log("\n[2] Duplicate `basePlayerId|season|position` (should be 0):", dupBaseSeasonPos.length);
for (const [k, arr] of dupBaseSeasonPos.slice(0, 25)) {
  console.log("  key:", k, "count:", arr.length, "ids:", arr.map((x) => x.id));
}

console.log("\n[3] Duplicate name+team+season+pos (review):", dupNameTeamSeason.length);
for (const [k, arr] of dupNameTeamSeason.slice(0, 25)) {
  console.log("  key:", k, "count:", arr.length, "baseIds:", [...new Set(arr.map((x) => x.basePlayerId))]);
}

console.log("\n[4] `basePlayerId` appearing across multiple seasons (EXPECTED):");
const multiSeason = [...byBase.entries()]
  .map(([base, arr]) => {
    const seasons = [...new Set(arr.map((x) => String(x.season)))];
    return { base, seasons, count: arr.length, name: arr[0]?.name, team: arr[0]?.team };
  })
  .filter((x) => x.seasons.length >= 2)
  .sort((a, b) => b.seasons.length - a.seasons.length);

console.log("Count:", multiSeason.length);
for (const x of multiSeason.slice(0, 25)) {
  console.log(`  base:${x.base}  seasons:${x.seasons.join(",")}  rows:${x.count}  ${x.name} (${x.team})`);
}