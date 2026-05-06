/**
 * football/scripts/buildPlayerImageManifest.mjs
 *
 * One-shot lookup script that populates football/src/data/playerImageManifest.ts
 * with verified API-Football player IDs.
 *
 * Reads our players.json, calls API-Football's player-profile search per
 * player, picks the best match by name + nationality fit, writes results
 * back to the manifest TS file.
 *
 * Usage:
 *   API_FOOTBALL_KEY=<your-key> node football/scripts/buildPlayerImageManifest.mjs
 *
 * Options:
 *   --max=<N>          Limit lookups this run (default: 80, leaves headroom on
 *                      API-Football free-tier 100/day quota)
 *   --seasons=<a,b>    Active seasons to look up (default: "2022" — matches
 *                      football/src/adapters/footballConfig.ts activeSeasons)
 *   --force            Re-query players already in the manifest (overwrites)
 *   --dry-run          Don't write the manifest; print what would change
 *   --threshold=<N>    Min match score to accept (default: 8). Lower = more
 *                      forgiving but more false positives.
 *
 * Strategy per player:
 *   1. Search API-Football /players/profiles by last word of player name
 *      ("Messi" for "Lionel Andrés Messi Cuccittini")
 *   2. If 0 matches, retry with first-name + last-name
 *   3. Score each candidate:
 *        +10  full-name substring match (either direction)
 *        +5   nationality matches our team field exactly (case-insensitive)
 *        +2   nationality startsWith / endsWith match (Argentine vs Argentina)
 *        +3   surname-only fallback hit
 *   4. Pick highest-scoring candidate ≥ threshold
 *   5. On ties or low scores: log as "no confident match", skip
 *
 * Re-run safety:
 *   - Default skips players already in the manifest (use --force to override)
 *   - Idempotent — running twice is the same as once (modulo new manifest entries)
 *   - Rate-limited at ~3 req/sec via 350ms sleep between requests
 *   - Quota guard: hard-stops at --max requests this run
 *
 * Quota notes:
 *   - API-Football free tier: 100 requests/day
 *   - 622 players in 2022 pool → ~7 days at 80/day to seed everything
 *   - Paid tier ($19/mo "Pro") = 75k requests/day → seed in one run
 *   - Each player burns 1-2 requests (initial search + optional retry)
 *   - Suggest: run nightly with cron until manifest is full, then occasionally
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Args ────────────────────────────────────────────────────────────────────

const argMap = new Map(
  process.argv.slice(2).map(a => {
    const eq = a.indexOf("=");
    return eq > 0 ? [a.slice(0, eq), a.slice(eq + 1)] : [a, "true"];
  })
);
const opt = (k, fallback) => argMap.get(k) ?? fallback;

const API_KEY = process.env.API_FOOTBALL_KEY;
if (!API_KEY) {
  console.error("ERROR: API_FOOTBALL_KEY env var required.");
  console.error("Get one free at https://www.api-football.com/ and re-run:");
  console.error("  API_FOOTBALL_KEY=xxx node football/scripts/buildPlayerImageManifest.mjs");
  process.exit(1);
}

const MAX = parseInt(opt("--max", "80"), 10);
const FORCE = argMap.has("--force");
const DRY_RUN = argMap.has("--dry-run");
const THRESHOLD = parseInt(opt("--threshold", "8"), 10);
const SEASONS = String(opt("--seasons", "2022")).split(",").map(s => s.trim());
const BACKFILL_IMAGES = argMap.has("--backfill-images");
const SKIP_DOWNLOAD = argMap.has("--skip-download");

// ── Paths ───────────────────────────────────────────────────────────────────

const playersPath = resolvePath(__dirname, "../public/data/players.json");
const manifestPath = resolvePath(__dirname, "../src/data/playerImageManifest.ts");
const imagesDir = resolvePath(__dirname, "../public/players");

// ── Load players + existing manifest ────────────────────────────────────────

const allPlayers = JSON.parse(readFileSync(playersPath, "utf8"));
const players = allPlayers.filter(p => SEASONS.includes(String(p.season)));

const manifestSrc = readFileSync(manifestPath, "utf8");
const existing = new Map();
// Parse each entry's apiFootballId AND optional `local: true` /
// `processed: true` flags so re-runs preserve them. Tolerant to field order.
const entryRe = /"(\d+)":\s*\{([^}]*)\}/g;
let m;
while ((m = entryRe.exec(manifestSrc)) !== null) {
  const inside = m[2];
  const idMatch = inside.match(/apiFootballId:\s*(\d+)/);
  if (!idMatch) continue;
  const localFlag = /local:\s*true/.test(inside);
  const processedFlag = /processed:\s*true/.test(inside);
  existing.set(m[1], {
    apiFootballId: parseInt(idMatch[1], 10),
    ...(localFlag ? { local: true } : {}),
    ...(processedFlag ? { processed: true } : {}),
  });
}

console.log("─".repeat(60));
console.log(`Active seasons: ${SEASONS.join(",")}`);
console.log(`Players in pool: ${players.length}`);
console.log(`Existing manifest entries: ${existing.size}`);
console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "WRITE"}${FORCE ? " (force re-query)" : ""}`);
console.log(`Max lookups this run: ${MAX} (threshold ${THRESHOLD})`);
console.log("─".repeat(60));

// ── Lookup ──────────────────────────────────────────────────────────────────

const todo = BACKFILL_IMAGES ? [] : players.filter(p => {
  const id = String(p.basePlayerId ?? p.id);
  return FORCE || !existing.has(id);
});
if (!BACKFILL_IMAGES) {
  console.log(`Players to lookup this run: ${Math.min(todo.length, MAX)} of ${todo.length} unmanifested\n`);
}

const updated = new Map(existing);
const found = [];
const noMatch = [];

/**
 * Download a player headshot from API-Football's CDN to football/public/players/.
 *
 * The CDN (media.api-sports.io) is unauthenticated and uncounted against the
 * /v3/ API quota — these calls are free. Returns true on success (or when
 * the file already exists locally), false on 404/other failure.
 *
 * Why we mirror images: shipping them with the deploy makes the football
 * SPA self-contained. If API-Football's CDN goes down or changes URL
 * patterns, our cards still render.
 */
async function downloadImage(apiFootballId, basePlayerId) {
  const localPath = resolvePath(imagesDir, `${basePlayerId}.png`);
  if (existsSync(localPath)) return true;

  const cdnUrl = `https://media.api-sports.io/football/players/${apiFootballId}.png`;
  try {
    const resp = await fetch(cdnUrl);
    if (!resp.ok) {
      console.warn(`    ✗ image ${apiFootballId} → HTTP ${resp.status}`);
      return false;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 200) {
      // CDN sometimes returns a tiny "no image" placeholder rather than a 404.
      console.warn(`    ✗ image ${apiFootballId} → too small (${buf.length} bytes), skipping`);
      return false;
    }
    if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true });
    writeFileSync(localPath, buf);
    return true;
  } catch (err) {
    console.warn(`    ✗ image ${apiFootballId} → ${err.message}`);
    return false;
  }
}

async function searchProfiles(query, attempt = 0) {
  // API-Football's search field accepts only alphanumerics + spaces.
  // Strip hyphens, periods, apostrophes, etc. that survived diacritic
  // normalization (e.g. "Seung-Gyu" → "Seung Gyu", "Diogo M. Costa" →
  // "Diogo M Costa").
  const cleaned = query.replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const url = `https://v3.football.api-sports.io/players/profiles?search=${encodeURIComponent(cleaned)}`;
  const resp = await fetch(url, {
    headers: {
      "x-rapidapi-key": API_KEY,
      "x-rapidapi-host": "v3.football.api-sports.io",
    },
  });
  // Free-tier rate limit is ~10 req/minute. Back off and retry once on 429.
  if (resp.status === 429 && attempt === 0) {
    console.warn(`  HTTP 429: rate-limited, backing off 65s and retrying once…`);
    await new Promise(r => setTimeout(r, 65_000));
    return searchProfiles(query, 1);
  }
  if (!resp.ok) {
    console.warn(`  HTTP ${resp.status}: ${resp.statusText}`);
    return [];
  }
  const data = await resp.json();
  if (data.errors && Object.keys(data.errors).length > 0) {
    console.warn(`  API errors:`, data.errors);
    return [];
  }
  return Array.isArray(data.response) ? data.response : [];
}

/** Strip Unicode diacritics so API-Football's alphanumeric-only search
 *  doesn't reject queries like "Milinković" or "Höjbjerg". */
function normalize(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")  // strip combining diacritical marks
    .replace(/[ø]/gi, "o")
    .replace(/[æ]/gi, "ae")
    .replace(/[ß]/g, "ss")
    .replace(/[ł]/gi, "l");
}

function scoreCandidate(candidate, ourName, ourTeam, ourSurname, ourFirstName) {
  const apiName = normalize(String(candidate?.player?.name ?? "")).toLowerCase();
  const apiFirst = String(candidate?.player?.firstname ?? "").toLowerCase();
  const apiLast = String(candidate?.player?.lastname ?? "").toLowerCase();
  const apiNat = String(candidate?.player?.nationality ?? "").toLowerCase();
  const ourNameLc = normalize(ourName).toLowerCase();
  const ourTeamLc = ourTeam.toLowerCase();
  const ourSurnameLc = normalize(ourSurname).toLowerCase();
  const ourFirstLc = normalize(ourFirstName).toLowerCase();

  // Nationality fit. Three states:
  //   - exact / loose match → bonus points
  //   - unknown (API has no nationality) → neutral, no bonus
  //   - clear contradiction → hard reject (return 0 below)
  let natScore = 0;
  let natContradicts = false;
  if (!apiNat) {
    natScore = 0;
  } else if (apiNat === ourTeamLc) {
    natScore = 5;
  } else if (apiNat.startsWith(ourTeamLc.slice(0, 4)) || ourTeamLc.startsWith(apiNat.slice(0, 4))) {
    natScore = 2;
  } else {
    natContradicts = true;
  }

  // Hard reject when API record's nationality is known and contradicts ours.
  // Filters generic-surname mis-hits like "Seung-Gyu Kim [South Korea]" →
  // "Kim [Brazil]". Trade-off: rejects correct matches when API has stale
  // nationality (Edouard Mendy listed France instead of Senegal). Wrong-player
  // images are worse than missing ones — flag fallback handles misses cleanly.
  if (natContradicts) return 0;

  // Build the most complete API-side name we can — combine firstname +
  // lastname if both populated. API-Football often returns name="Ryan"
  // for the famous Australia keeper while firstname="Mathew" lastname="Ryan".
  // Using the joined form here disambiguates "Mathew Ryan" from random Ryans.
  const fullApiName = (apiFirst && apiLast) ? `${apiFirst} ${apiLast}` : apiName;
  // The shorter side of a substring match must be substantial: at least 6
  // chars, or 2+ words. Blocks generic single-surname API records ("Kim",
  // "Mendy", "Ryan") from claiming a full-name match against our long
  // canonical names. Retains real matches like "K. Schmeichel" because
  // they're 12+ chars even if 1-token.
  const isSubstantial = (str) => {
    const trimmed = String(str).trim();
    if (!trimmed) return false;
    if (trimmed.length >= 6) return true;
    return trimmed.split(/\s+/).filter(Boolean).length >= 2;
  };
  const fullMatch = fullApiName.includes(ourNameLc) || ourNameLc.includes(fullApiName);
  const shorter = fullApiName.length < ourNameLc.length ? fullApiName : ourNameLc;

  let s = natScore;
  // Full-name substring match — strongest signal, but only if the shorter
  // side is substantial. Otherwise it's a generic surname collision.
  if (fullMatch && isSubstantial(shorter)) s += 10;
  // Surname matches AND first-name overlaps — disambiguates same-surname
  // players (e.g. Alisson Becker vs. Henrique Becker, both "Brazil").
  else if (apiName.includes(ourSurnameLc) && ourFirstLc &&
           (apiName.includes(ourFirstLc) || apiFirst.startsWith(ourFirstLc.slice(0, 3)))) {
    s += 7;
  }
  // Surname-only — weakest, only meaningful with the nationality bonus.
  else if (apiName.includes(ourSurnameLc) || apiLast === ourSurnameLc) s += 2;

  return s;
}

function lastWord(s) {
  return String(s).trim().split(/\s+/).filter(Boolean).pop() ?? "";
}

function firstWord(s) {
  return String(s).trim().split(/\s+/).filter(Boolean)[0] ?? "";
}

function firstAndLastWord(s) {
  const parts = String(s).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

// --backfill-images: skip the lookup loop entirely; just iterate existing
// manifest entries and download any image we don't have locally yet. No
// API-Football /v3/ calls (free CDN GETs only). Use to backfill cached
// images for entries that were manifested before image-mirroring landed.
if (BACKFILL_IMAGES) {
  console.log("\n[BACKFILL-IMAGES] Downloading images for existing manifest entries…");
  let downloaded = 0;
  let already = 0;
  let failed = 0;
  for (const [basePlayerId, entry] of existing.entries()) {
    const localPath = resolvePath(imagesDir, `${basePlayerId}.png`);
    if (existsSync(localPath)) {
      already += 1;
      updated.set(basePlayerId, { ...entry, local: true });
      continue;
    }
    process.stdout.write(`  ${basePlayerId} (apiId=${entry.apiFootballId}) → `);
    const ok = await downloadImage(entry.apiFootballId, basePlayerId);
    if (ok) {
      console.log("✓");
      downloaded += 1;
      updated.set(basePlayerId, { ...entry, local: true });
    } else {
      console.log("(skipped)");
      failed += 1;
      updated.set(basePlayerId, entry);
    }
    // CDN rate-limits are far looser than the API but throttle anyway.
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`\n[BACKFILL-IMAGES] downloaded=${downloaded} already-local=${already} failed=${failed}`);
}

const queriedThisRun = todo.slice(0, MAX);
let httpCalls = 0;

for (let i = 0; i < queriedThisRun.length; i++) {
  const p = queriedThisRun[i];
  const id = String(p.basePlayerId ?? p.id);
  const ourName = String(p.name ?? "");
  const ourTeam = String(p.team ?? "");
  const ourSurname = lastWord(ourName);
  const ourFirstName = firstWord(ourName);

  if (!ourSurname) {
    console.log(`[${i + 1}/${queriedThisRun.length}] ${ourName} → SKIP (no surname)`);
    continue;
  }

  process.stdout.write(`[${i + 1}/${queriedThisRun.length}] ${ourName} (${ourTeam}) → `);

  // Strategy 1: surname only (normalized for diacritics)
  let candidates = await searchProfiles(normalize(ourSurname));
  httpCalls += 1;

  // Strategy 2: if no good initial match, retry with first+last (normalized)
  if (candidates.length === 0 || candidates.every(c => scoreCandidate(c, ourName, ourTeam, ourSurname, ourFirstName) < THRESHOLD)) {
    const flw = firstAndLastWord(ourName);
    if (flw && flw !== ourSurname) {
      const more = await searchProfiles(normalize(flw));
      httpCalls += 1;
      candidates = candidates.concat(more);
    }
  }

  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreCandidate(c, ourName, ourTeam, ourSurname, ourFirstName);
    if (s > bestScore) { best = c; bestScore = s; }
  }

  if (best && bestScore >= THRESHOLD) {
    const apiId = best.player.id;
    console.log(`${best.player.name} [${best.player.nationality}] id=${apiId} (score ${bestScore})`);
    let local = false;
    if (!SKIP_DOWNLOAD && !DRY_RUN) {
      local = await downloadImage(apiId, id);
      if (local) console.log(`    ✓ image cached → public/players/${id}.png`);
    }
    updated.set(id, { apiFootballId: apiId, ...(local ? { local: true } : {}) });
    found.push({ basePlayerId: id, name: ourName, apiId, apiName: best.player.name });
  } else {
    console.log(`no confident match (best score ${bestScore})`);
    noMatch.push({ basePlayerId: id, name: ourName, team: ourTeam });
  }

  // Polite spacing — API-Football free tier rate-limits at ~10 req/min.
  // 7s spacing keeps us comfortably below that.
  await new Promise(r => setTimeout(r, 7_000));
}

// ── Write manifest ──────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(60));
console.log(`HTTP calls this run: ${httpCalls}`);
console.log(`Matched: ${found.length}`);
console.log(`No match: ${noMatch.length}`);
console.log(`Manifest size: ${existing.size} → ${updated.size}`);

if (DRY_RUN) {
  console.log("[DRY RUN] No file written. Re-run without --dry-run to commit changes.");
  process.exit(0);
}

// We still need to write when only the `local` flag changed for existing
// entries (size unchanged but flag flipped). Compare entries deeply.
const changed = updated.size !== existing.size || [...updated.entries()].some(([k, v]) => {
  const prev = existing.get(k);
  if (!prev) return true;
  return prev.apiFootballId !== v.apiFootballId
      || !!prev.local !== !!v.local
      || !!prev.processed !== !!v.processed;
});
if (!changed) {
  console.log("No changes to write.");
  process.exit(0);
}

// Generate the updated manifest. Preserves the header comment block;
// rewrites only the PLAYER_IMAGE_MANIFEST object.
const headerEnd = manifestSrc.indexOf("export const PLAYER_IMAGE_MANIFEST");
const footerStart = manifestSrc.indexOf("/** Look up external IDs");
if (headerEnd === -1 || footerStart === -1) {
  console.error("ERROR: Couldn't find expected anchors in manifest file. Aborting write.");
  console.error("Expected 'export const PLAYER_IMAGE_MANIFEST' and '/** Look up external IDs'");
  process.exit(1);
}

const header = manifestSrc.slice(0, headerEnd);
const footer = manifestSrc.slice(footerStart);

const sortedEntries = [...updated.entries()].sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
const playerNameById = new Map(allPlayers.map(p => [String(p.basePlayerId ?? p.id), p.name]));
const teamById = new Map(allPlayers.map(p => [String(p.basePlayerId ?? p.id), p.team]));

const manifestBody = [
  "export const PLAYER_IMAGE_MANIFEST: Record<string, ExternalIds> = {",
  ...sortedEntries.map(([k, v]) => {
    const name = playerNameById.get(k) ?? "?";
    const team = teamById.get(k) ?? "?";
    const fields = [`apiFootballId: ${v.apiFootballId}`];
    if (v.local) fields.push(`local: true`);
    if (v.processed) fields.push(`processed: true`);
    return `  // ${name} (${team})\n  "${k}": { ${fields.join(", ")} },`;
  }),
  "};",
  "",
  "",
].join("\n");

const newSrc = header + manifestBody + footer;
writeFileSync(manifestPath, newSrc, "utf8");
console.log(`Wrote ${manifestPath}`);

if (noMatch.length > 0) {
  console.log("\nUnmatched players (review by hand or rerun with --threshold=4):");
  for (const x of noMatch.slice(0, 20)) {
    console.log(`  ${x.basePlayerId}  ${x.name}  (${x.team})`);
  }
  if (noMatch.length > 20) console.log(`  …and ${noMatch.length - 20} more`);
}
