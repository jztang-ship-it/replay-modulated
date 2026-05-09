# Basketball historical data extraction

This directory contains scripts for building the multi-season player + gamelog pool
that powers the daily-season-pick slate (one season randomly chosen per UTC day, ~60
players drawn from that season's pool).

## Architecture: per-season files

The runtime model is **one season per day**. Today's RNG picks a season; the slate is
built only from that season's pool. So the client only needs that season's data per
day, not all of it.

```
basketball/public/data/seasons/
├── _manifest.json          ← list of available seasons
├── 7980/
│   ├── players.json        ← ~100 KB per season
│   └── gamelogs.json       ← ~8-10 MB per season
├── 8081/
│   ├── players.json
│   └── gamelogs.json
...
└── 2425/
    ├── players.json
    └── gamelogs.json
```

| Scope | Size |
|---|---|
| One season's `players.json` | ~100 KB |
| One season's `gamelogs.json` | ~8–10 MB |
| Mobile day-of download | ~10 MB (HTTP-cached) |
| All 46 seasons combined | ~360 MB |

For the full 46-season corpus, host gamelog files on Supabase Storage or a static
CDN (free tier is 1 GB). Players files (~5 MB combined) can ship in the build.

## Running the extractor

### One-shot, full historical run (recommended)

```bash
# From the repo root, on your local machine (NOT CI — stats.nba.com blocks
# most cloud IPs):
node basketball/scripts/extractNbaSeason.mjs --from=1996-97 --to=2024-25 --skip-existing
```

This pulls ~29 seasons from `stats.nba.com`, paces requests at 600 ms, retries on 429,
and writes per-season files. Takes about 1–2 minutes total (mostly network latency).

`--skip-existing` makes it idempotent — re-running doesn't re-fetch seasons whose files
already exist. So if it dies mid-run, just re-run.

### Range or single season

```bash
# Single season:
node basketball/scripts/extractNbaSeason.mjs --season=2018-19

# A range:
node basketball/scripts/extractNbaSeason.mjs --from=2010-11 --to=2014-15

# Dry-run (logs what it would do, doesn't write):
node basketball/scripts/extractNbaSeason.mjs --season=2024-25 --dry-run
```

## Source choice — and what to do if the source breaks

### Primary: stats.nba.com (free, no key)

Pros:
- Free, no auth, no rate-limit quota (just rate limits per IP)
- All seasons since 1946 — though pre-1979 has no 3pt line, pre-1973 no blocks/steals
- Same source NBA.com itself uses — most consistent with what users recognize

Cons:
- Blocks most cloud IPs (CI, Vercel, Codespaces, this Claude Code sandbox)
- Aggressive rate-limiting; needs polite headers (User-Agent, Referer, x-nba-stats-token)
- Undocumented schema — may break without notice

**Run from a residential connection (your laptop on home wifi).** If you get repeated
403/timeout, see fallbacks below.

### Fallback A: balldontlie.io (paid tier $9/mo)

If NBA Stats blocks you:

1. Sign up at https://app.balldontlie.io/ — paid tier is $9/mo, 5,000 req/min.
2. Set `BDL_API_KEY=your_key` in env.
3. Adapt the extractor: balldontlie's schema is similar but uses different endpoint
   names. The mapping work is `~30 lines of additional code in extractNbaSeason.mjs`,
   parameterized by `--source=balldontlie`.

(Adapter not implemented yet — write it on demand if NBA Stats fails.)

### Fallback B: basketball-reference.com (HTML scrape)

Most comprehensive coverage (1946 onward, complete), but:
- HTML scrape — brittle, slow
- Robots.txt asks for >3 second delays between requests
- ~10× longer total run time

Treat as last resort if both NBA Stats and balldontlie are unavailable. Existing
patterns: see `football/scripts/buildPlayerImageManifest.mjs` for a similar
polite-scrape structure.

## Era cutoffs and why

The slate inclusion principle is **rule-based, not curated**. The boundary rule for
NBA inclusion is data quality:

| Era | Cutoff reason |
|---|---|
| Post-1996 | "Modern era" — full advanced stats, position consistency, comparable pace |
| 1979-80 to 1995-96 | Three-point line introduced; needed for FP formula |
| 1973-74 to 1978-79 | Blocks/steals tracked but no 3pt line — formula systematically gives 0 for 3PM, but otherwise works |
| Pre-1973-74 | Blocks/steals NOT tracked — formula systematically under-credits defensive players. **Don't include.** |

Recommended:
- **v1: 1996-97 → present** (~29 seasons, ~870 player-seasons by salary aggregate)
- **v2: 1979-80 → present** (~46 seasons, ~1,400 player-seasons)
- **No further back** — formula degrades.

## Position data caveat

`stats.nba.com/leaguedashplayerstats` doesn't return player position. The current
extractor leaves `position: ""` and `positionFull: ""`. Two options to fill in:

1. **Merge from the existing static positions file** (`basketball/public/data/nba-positions.json`)
   keyed by player name. Already used by older `Exportbasketballdata.mjs`.
2. **Fetch per-player profile** via `commonplayerinfo` endpoint — one extra request per
   unique player. ~3,000 unique players over 30 years × 600 ms = 30 minutes. One-time
   cost; cache the result.

For first run, option 1 is faster. Add a post-processing step.

## Dependencies

`extractNbaSeason.mjs` uses node 18+ built-in `fetch`. No npm install needed.
`splitIntoPerSeasonFiles.mjs` reads/writes JSON only; same.

## Output verification

After extraction, sanity-check a season:

```bash
# Total counts:
jq 'length' basketball/public/data/seasons/2018-19/players.json
jq 'length' basketball/public/data/seasons/2018-19/gamelogs.json

# Top 5 by avgFP:
jq 'sort_by(-.avgFP) | .[0:5] | .[] | {name, team, avgFP, salary, tier}' \
   basketball/public/data/seasons/2018-19/players.json
```

Expected: top players by avgFP for that season should be the recognizable names
(e.g. 2018-19 = Harden, Giannis, AD, Westbrook, Lillard).

## What this does NOT include

- **Season picker logic** (per-day RNG that chooses today's season) — separate module,
  not yet built.
- **Runtime read path** — `dataEngine.ts` still reads the monolithic `players.json` and
  `game-logs.json`. Migration to read per-season files is a follow-up PR.
- **Headshot URLs** — handled separately (see `downloadHeadshots.mjs`,
  `uploadHeadshots.mjs`).
