// scripts/buildFplLogsEnriched.mjs
import fs from "node:fs";
import path from "node:path";

const FPL_BASE = "https://fantasy.premierleague.com/api";
const MIN_MINUTES = 20;

// run from frontend/
const ROOT = process.cwd();
const PLAYERS_PATH = path.join(ROOT, "public", "data", "players.json");
const OUT_PATH = path.join(ROOT, "public", "data", "game-logs.enriched.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "ReplayMod local dev" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function iso(v) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function buildTeamsMap(bootstrap) {
  const m = new Map();
  for (const t of bootstrap.teams || []) {
    m.set(Number(t.id), { name: t.name, short: t.short_name });
  }
  return m;
}

function getPlayerId(p) {
  const raw = String(p.playerId ?? p.id ?? "").trim();
  // your ids look like "134-2023" sometimes — FPL needs just "134"
  const m = raw.match(/^\d+/);
  return m ? m[0] : "";
}


function getBasePlayerId(p) {
  const raw = String(p.basePlayerId ?? p.playerId ?? p.id ?? "").trim();
  const m = raw.match(/^\d+/);
  return m ? m[0] : raw; // fallback
}


function normalizeRow({ playerId, basePlayerId, season }, row, teamsById) {
  const date = iso(row.kickoff_time);
  const wasHome = row.was_home;
  const oppId = row.opponent_team;

  const opp = teamsById.get(Number(oppId));
  const opponent = opp?.short || opp?.name || "";

  const homeAway = wasHome === true ? "H" : wasHome === false ? "A" : undefined;

  const teamH = row.team_h_score;
  const teamA = row.team_a_score;
  const score =
    typeof teamH === "number" && typeof teamA === "number" ? `${teamH}-${teamA}` : undefined;

  const minutes = Number(row.minutes ?? 0);

  return {
    id: row.fixture != null ? `${playerId}-${row.fixture}-${date}` : `${playerId}-${date}`,
    sport: "football",
    playerId: String(playerId),
    basePlayerId: String(basePlayerId || playerId),
    season: season ?? undefined,
    matchDate: date,
    minutesPlayed: minutes,
    meta: {
      date,
      opponent,
      homeAway,
      fixtureId: row.fixture ?? undefined,
      score,
    },
    stats: { ...row },
    events: {
      goals_scored: row.goals_scored ?? 0,
      assists: row.assists ?? 0,
      clean_sheets: row.clean_sheets ?? 0,
      saves: row.saves ?? 0,
      yellow_cards: row.yellow_cards ?? 0,
      red_cards: row.red_cards ?? 0,
      penalties_saved: row.penalties_saved ?? 0,
      penalties_missed: row.penalties_missed ?? 0,
      own_goals: row.own_goals ?? 0,
      goals_conceded: row.goals_conceded ?? 0,
      bonus: row.bonus ?? 0,
      bps: row.bps ?? 0,
      total_points: row.total_points ?? 0,
      minutes: row.minutes ?? 0,
    },
  };
}

async function main() {
  if (!fs.existsSync(PLAYERS_PATH)) {
    console.error("Missing:", PLAYERS_PATH);
    process.exit(1);
  }

  console.log("Loading players:", PLAYERS_PATH);
  const players = readJson(PLAYERS_PATH);

  console.log("Fetching teams map (bootstrap-static)...");
  const bootstrap = await fetchJson(`${FPL_BASE}/bootstrap-static/`);
  const teamsById = buildTeamsMap(bootstrap);
  console.log("Teams:", teamsById.size);

  const out = [];
  let okPlayers = 0;
  let skippedPlayers = 0;
  let failedPlayers = 0;

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const playerId = getPlayerId(p);
    const basePlayerId = getBasePlayerId(p);
    const season = p.season ?? undefined;

    if (!playerId) {
      skippedPlayers++;
      continue;
    }

    if (i % 50 === 0) console.log(`Progress ${i}/${players.length}`);

    try {
      const summary = await fetchJson(`${FPL_BASE}/element-summary/${playerId}/`);
      const history = summary?.history || [];

      let kept = 0;
      for (const row of history) {
        if (!row.kickoff_time) continue;
        if (typeof row.was_home !== "boolean") continue;
        if (row.opponent_team == null) continue;

        const minutes = Number(row.minutes ?? 0);
        if (minutes < MIN_MINUTES) continue;

        const log = normalizeRow({ playerId, basePlayerId, season }, row, teamsById);
        if (!log.meta.date || !log.meta.opponent || !log.meta.homeAway) continue;

        out.push(log);
        kept++;
      }

      if (kept > 0) okPlayers++;
      else skippedPlayers++;

      await sleep(60);
    } catch (e) {
      failedPlayers++;
      console.warn("Failed", playerId, e.message);
      await sleep(150);
    }
  }

  console.log("Writing:", OUT_PATH);
  writeJson(OUT_PATH, out);

  console.log("Done.");
  console.log("Players OK:", okPlayers);
  console.log("Players skipped (no usable logs):", skippedPlayers);
  console.log("Players failed fetch:", failedPlayers);
  console.log("Total logs:", out.length);

  const missingOpp = out.filter((x) => !x.meta?.opponent).length;
  const missingHA = out.filter((x) => !x.meta?.homeAway).length;
  console.log("Missing opponent:", missingOpp);
  console.log("Missing homeAway:", missingHA);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
