# Football: bulldoze worldcup, rebuild on shared infra

**Date:** 2026-05-05
**Status:** Spec — pending review
**Owner:** John Tang
**Related:** `docs/superpowers/plans/2026-04-29-gameview-shared-phase-2-implementation.md` (Phase 2 cutover that worldcup pre-dates), `CLAUDE.md` (sport-agnostic architecture principles)

---

## Problem

The third sport in the monorepo currently lives at `worldcup/`. It pre-dates the Phase 2 GameView lift and is structurally drifted from the canonical basketball/baseball pattern: a 466-line forked `GameView.tsx`, a hardcoded `BonusPoolRow` with a `$12,451.29` seed, locally forked components/hooks that should be re-exports from `@shared`, and a `worldcupConfig.ts` that uses outdated tier names (no LEGEND ceiling) and outdated economy patterns. Adding it to production as-is would re-introduce exactly the duplication CLAUDE.md warns against ("If you find yourself copying a file from `basketball/` to `baseball/` and changing it slightly, *stop*").

Separately, the directory name `worldcup/` over-narrows the concept. Football is an umbrella — World Cup is one *competition*; EPL, La Liga, Bundesliga, MLS are others. The launch ships with World Cup data because the FIFA tournament arrives next month, but the codebase should not lock the sport identity to that single competition.

## Goals

- Replace the drifted `worldcup/` tree with a clean `football/` SPA built on the canonical shared infrastructure (Phase 2 shape: shared `GameView`, shared `LandingPage`, shared `bonusPoolStore`, shared engines/hooks/utils).
- Reframe the sport as **football** with **World Cup as the launch competition**. Architecture supports adding EPL / La Liga / etc. later by swapping data, without code restructuring.
- Reuse the substantive work that's already correct: the position-specific FP weights, the badges, the StatsBomb-derived `players.json` / `game-logs.json`, the `transformWorldCupData.mjs` pipeline.
- Integrate cleanly into the chooser landing, the build pipeline, and the bonus-pool API.

## Non-goals

- **Not designing the rotating-50-players-daily format.** That's an active design conversation in a separate workstream. Launch ships with basketball's full-pool model. The rotation spec slots in later via a single adapter method (`getPlayers()`), no architectural change required.
- **Not building EPL / La Liga / other competition data integrations.** Just naming and structuring so they *can* be added later. World Cup data is the only data source at launch.
- **Not redesigning the hand-cycle.** Deal → hold → draw → reveal → results is engine-level, identical across sports, untouched.
- **Not introducing a competition-switching UI.** No route, no toggle, no UI affordance. The competition is implicit in the data file at launch.
- **Not fetching real player headshots.** Country flag + last-name abbreviation (current `PlayerCard` behavior) ships at launch; headshot source is a future task.

## Approach: bulldoze

Two paths were considered:

**A. Bulldoze and rebuild (chosen).** Delete the drifted forks. Rewrite the SPA wrapper using basketball as the canonical reference. Keep only the data layer and the FP/badge configuration (which are already correct). Estimated effort: 1–2 days.

**B. Modernize in place.** Walk file-by-file, replacing local forks with shared imports incrementally. Risks subtle behavior carry-over from the forked GameView; takes longer due to untangling. Rejected.

The bulldoze is the right call because the drift is structural, not stylistic. The 466-line GameView fork doesn't represent a different game — it represents the pre-Phase-2 architecture. Lifting it into shape costs more than starting from the canonical template and dropping in the football-specific bits.

## Naming

- **Sport key:** `football` (was `worldcup`)
- **Directory:** `football/` (was `worldcup/`)
- **Vite base:** `/football/` (was `/worldcup/`)
- **Build output:** `dist/football/` (was `dist/worldcup/`)
- **Class:** `FootballSportConfig` (was `WorldCupSportConfig`)
- **Display label:** `Football` (was `World Cup`)
- **localStorage prefix:** `replaymod_football_*` (was `replaymod_wc_*`)
- **API sport whitelist:** `api/bonus-pool.ts:25` `SUPPORTED_SPORTS` set updated `worldcup` → `football`
- **Chooser card:** ⚽ Football, league pill: "World Cup '26"

The directory rename is a `git mv` operation followed by content rewrites. Imports across the repo (limited to the build script, the chooser, and the bonus-pool API) update as part of the same change.

## Architecture map

```
shared/views/GameView.tsx       ←  football/src/views/GameView.tsx (~150-line shim)
                                   ├─ builds GameAdapter from sportAdapter
                                   └─ <SharedGameView adapter={...} />

shared/components/LandingPage   ←  football/src/components/LandingPage.tsx (~140-line shim)
                                   └─ builds LandingAdapter (5 demo cards: Messi, Mbappé,
                                      Vinícius, Bellingham, Saka), passes to shared

shared/components/CardFront     ←  football/src/components/SoccerCard.tsx
                                   └─ wraps CardFront with soccer stat tiles
                                      (FWD: G/A/SOT/KP/DRB · MID: G/A/KP/TKL/PRS ·
                                       DEF: G/A/TKL/INT/CLR · GK: SV/GC/CLR/MIN)

shared/utils/bonusPoolStore     ←  inherited automatically via shared GameView
                                   ($1k seed, 5% rake, daily distribution via leaderboard)

shared/utils/payoutLogic        ←  WIN_TIERS pulled from sportAdapter.winTiers
shared/engines/*                ←  re-exported, no local copies
shared/hooks/{useFTUE, useEmotionalReveal}  ←  imported directly, no local copies
```

## Files: delete, keep, rewrite, create

### Delete

- `football/src/views/GameView.tsx` (466-line fork)
- `football/src/components/{GameBar,WinCelebration,AppHeader,RosterGrid,PlayerCard,CardBackGeneric,ErrorBoundary}.tsx` (most are shorter forks of shared components)
- `football/src/hooks/{useEmotionalReveal,useCardFlipState}.ts` (forks; use shared)
- `football/src/engines/{dataEngine,economyEngine,resolveEngine,rosterEngine}.ts` (stubs/re-exports — replace with direct shared imports at call sites)
- The local `BonusPoolRow` component and the `$12,451.29` hardcoded seed
- The local `STARTING_BALANCE`, `BASE_BET`, etc. duplicates of shared constants

### Keep (already correct)

- `football/public/data/{players,game-logs}.json` and `.raw.json` (StatsBomb-derived World Cup data)
- `football/scripts/transformWorldCupData.mjs` (FP-weight pipeline; rename considered but the file is World-Cup-data-specific so the name is accurate — leave as-is for now, generalize when EPL/La Liga data lands)
- The position-specific FP weights (calibrated per FPL/DraftKings principles)
- The badge taxonomy (HAT_TRICK / BRACE / POACHER / MAESTRO / DYNAMO / etc., position-keyed)
- The `tierThresholds` salary buckets
- The `statDisplay` per-position stat tile mappings
- `positionAliases` (StatsBomb position string normalization)

### Rewrite

- `football/src/App.tsx` — clone basketball's shell. Auth flow, `?play=1` / `?signin=1` / `?profile=1` query handlers, sticky `replay_skip_landing` flag, debug bar, lifted `Profile` and `RegisterModal` at App level.
- `football/src/adapters/footballConfig.ts` (renamed from `worldcupConfig.ts`) — new tier names (SUB → STARTER → CAPTAIN → MOTM → LEGEND, see Tier ladder section), drop stale references, `sportKey: "football"`, `displayLabel: "Football"`, header tagline references "World Cup '26" as the active competition.
- `football/src/views/GameView.tsx` — new ~150-line shim that builds a `GameAdapter` and passes it to `@shared/views/GameView`. Mirrors `basketball/src/views/GameView.tsx`.
- `football/src/adapters/SportAdapter.ts` — full implementation of the shared `SportAdapter` contract. Currently extends shared with no overrides; will need `displayPosition`, `normalizePosition`, `isPitcherPosition`-equivalent (`isGoalkeeperPosition`), `getPositionLimits`, `headshotUrl(id) => null`, `CardComponent: SoccerCard`, etc.
- `football/src/adapters/gameAdapter.ts` — implements deal / redraw / resolve using the shared engines.

### Create

- `football/src/components/SoccerCard.tsx` — sport-specific card. Follows the basketball `AthleteCard` / baseball `BaseballCard` pattern: wraps shared `<CardFront>`, supplies soccer stat tiles and the country-flag-plus-last-name hero block (the "no headshot" affordance).
- `football/src/components/LandingPage.tsx` — ~140-line shim. Builds a `LandingAdapter` with a 5-card demo roster (Messi, Mbappé, Vinícius, Bellingham, Saka) and passes it to `@shared/components/LandingPage`.
- `football/src/adapters/ftueRoster.ts` — Messi-anchored 5-card FTUE roster + drawn-roster snapshot from a real Messi-MOTM 2022 game.
- `football/src/utils/{playerCulture,teamFlavor,soundPack}.ts` — sport-specific data files (commentary phrasing, audio asset list, etc.). Pattern matches `basketball/src/utils/`.

## Tier ladder

Five winning tiers + BUST below floor. Names parallel basketball's role-progression but soccer-coded; multipliers mirror basketball's curve.

| Tier | Multiplier | Soccer parallel |
|------|------------|-----------------|
| BUST | 0× | below SUB threshold |
| **SUB** | 0.5× | bench player getting minutes |
| **STARTER** | 1.5× | starting XI |
| **CAPTAIN** | 3× | armband-worthy game |
| **MOTM** | 8× | Man of the Match |
| **LEGEND** | 50× | tournament-defining |

GOAT is reserved for a future ceiling extension and intentionally not used here. (Basketball already moved off GOAT to LEGEND; football matches.)

**FP thresholds:** to be calibrated by the win-tier simulator (`shared/tools/runSimulator.ts football 10000`) against extracted World Cup data. Initial seeds derived from a 5/6 scaling of the current 6-slot worldcup thresholds:

| Tier | Initial seed | Calibration target hit rate |
|------|--------------|------------------------------|
| SUB | ~130 FP | ~25% of hands |
| STARTER | ~150 FP | ~12% |
| CAPTAIN | ~167 FP | ~5% |
| MOTM | ~192 FP | ~1.5% |
| LEGEND | ~215 FP | ~0.3% |

Final values land in the implementation plan after simulator runs.

## Roster shape

Five slots, positional requirements with one wildcard:

```
[ GK ] [ DEF ] [ MID ] [ FWD ] [ FLEX ]
```

- `rosterSize: 5`
- `rosterSlots: ["GK", "DEF", "MID", "FWD", "FLEX"]`
- `excludeFromFlex: ["GK"]` (FLEX cannot be a second goalkeeper)
- `salaryCap: 180`
- `economyConfig.salaryMax: 60` (anchor cap)

Fewer slots than basketball (5 vs 6) compensates for soccer's lower per-player FP variance — every slot's outcome carries more weight, which sharpens the dramatic arc rather than flattening it.

## FTUE

Anchor: **Messi** (FWD, salary $60).

Other four cards: 1 GK + 1 DEF + 1 MID + 1 FLEX, mid-tier salaries to leave cap room for Messi. The drawn FTUE roster uses a real Messi-MOTM game from extracted 2022 World Cup data so the FTUE win-moment is grounded in actual history.

`ftueTextConfig` carries soccer-specific coach copy in `holdIntroText`, teaching:
- The position requirements (GK/DEF/MID/FWD locked + 1 FLEX)
- The salary cap and how Messi anchors it
- The captain/MOTM ladder via card-tier colors (per the prelaunch FTUE color-tier teaching landed in #45)

## Headshots

Country flag + last-name abbreviation. This is the current `PlayerCard.tsx` rendering pattern and ships unchanged. No external image source is wired at launch. The `adapter.headshotUrl(id)` returns `null`, which the shared CardFront treats as "use the sport's flag/initials fallback."

A real headshot source (Wikimedia Commons, paid sports API, etc.) is deferred to a future task.

## Data layer

- Source: `football/public/data/players.json` and `game-logs.json`, generated by `transformWorldCupData.mjs` from raw StatsBomb data.
- Pool model at launch: **basketball's full-pool model verbatim** — every hand draws from the entire player set, no daily rotation.
- Adapter exposes `getPlayers()` and `getLogsByKey()` matching the shared `SportAdapter` contract.
- The "today's stars" / daily-bonus pool concept (`adapter.buildBonusPool()`, `adapter.getDailyBonusMapNow()`) maps onto the shared infrastructure unchanged.
- When the rotation-50 spec lands, only `getPlayers()` and possibly `buildBonusPool()` change. No other architectural impact.

## Bonus pool

Inherits the canonical shared system automatically by virtue of using shared `GameView`:

- KV-backed via `shared/utils/bonusPoolStore.ts`
- `BONUS_POOL_SEED = 1000` (was `$12,451.29` in the dead local code)
- `BONUS_POOL_DAILY_BASE = 1000` (daily injection)
- `RAKE_RATE = 5%` per bet
- Distributed daily via leaderboard, 60/40 split (Session Score / Best Hand), top 10 with the standard 35/20/12/8/6/5/4/4/3/3% distribution

The `api/bonus-pool.ts` `SUPPORTED_SPORTS` set is updated to include `football` (and remove `worldcup`).

## Cleanup

While the football bulldoze is in flight, audit the rest of the repo:

- `grep -ri "GOAT" .` (excluding node_modules and dist) — confirm no stale GOAT tier references survive anywhere. Basketball moved off it; the audit catches anything that drifted back.
- Confirm no callers reference the deleted local `BonusPoolRow` pattern with the `$12,451.29` seed anywhere outside the to-be-deleted football files.
- Confirm no callers reference deleted football components in tests, scripts, or docs.
- `jackpot` rename: verified clean — only two repo references exist (`api/bonus-pool.ts:17` is a guidance *enforcing* the no-jackpot rule; `baseball/src/utils/playerCulture.ts` line is unrelated flavor text). No work required.

These get folded into a single cleanup task in the implementation plan, not a separate PR.

## Build + chooser integration

- **`scripts/build-vercel.sh`:** add `football` to the install + build matrix. Copy `football/dist` → `dist/football/`.
- **`football/vite.config.ts`:** `base: '/football/'`.
- **`vercel.json` rewrites:** add `/football/:path*` rewrite mirroring basketball/baseball.
- **`chooser/index.html`:** add a third sport card. Layout shifts from a 2-card grid to a 3-card grid (or stacks on narrow viewports). Card displays:
  - emoji ⚽
  - name "Football"
  - league pill "World Cup '26" (replaces basketball's "NBA" / baseball's "MLB")
  - TO BEAT preview, sourced from `/api/leaderboard?sport=football&metric=hand_best&scope=daily&limit=1`
- The bucket-A/B/C user-state logic in chooser extends to handle three sports (currently hardcoded for two). Bucket B's "New for you" pill correctly identifies which sport(s) the user hasn't tried.

## Forward-looking architecture (intentional design touches)

The directory and naming reflect the long-term shape, even though World Cup is the only data source at launch:

- `football/` (not `worldcup/`) — sport identity is the umbrella.
- `FootballSportConfig` (not `WorldCupSportConfig`) — config is sport-level.
- The `transformWorldCupData.mjs` script is competition-specific by design and stays named accordingly. When EPL data lands, a sibling `transformEPLData.mjs` joins it.
- The `api/bonus-pool.ts` ledger key is `bonus_pool:football` — one bucket for the sport, regardless of competition. (Open question for a later spec: do EPL and World Cup share a leaderboard, or do competitions get their own pool/leaderboard? Out of scope here.)
- No competition-switching UI ships. Implicit in the data file. When a second competition is added, that's its own design conversation.

## Testing & verification

- `npm --prefix football run typecheck` — green
- `npm --prefix football run lint` — green
- `npx vitest run` — full suite green (catches any GOAT/old-bonus-pool references that broke)
- `bash scripts/build-vercel.sh` locally — produces `dist/football/` alongside `dist/basketball/` and `dist/baseball/`, with the chooser at `dist/index.html` showing all three sport cards
- `npx ts-node shared/tools/runSimulator.ts football 10000` — calibrate tier thresholds to the target hit rates in the Tier ladder section
- Preview deploy → manual smoke:
  - FTUE walkthrough (5-card Messi-anchored deal, hold, draw, MOTM win moment lands)
  - Daily-bonus roll-in renders without errors
  - Card-tier colors visible in `holdIntroText` (the #45 teaching)
  - Bonus pool widget shows sensible value (KV-backed, not hardcoded)
- Chooser smoke: clicking ⚽ Football routes to `/football/?play=1` and lands in FTUE for new users

## Acceptance criteria

A reviewer should be able to confirm, via the implementation plan's PR(s):

1. `football/src/views/GameView.tsx` is a thin shim (≤ ~200 lines) wrapping `@shared/views/GameView`, structurally parallel to `basketball/src/views/GameView.tsx`.
2. `football/src/components/` contains only legitimately sport-specific files (`SoccerCard.tsx`, `LandingPage.tsx`); no forks of canonical shared components.
3. `FootballSportConfig` uses the new tier ladder (SUB / STARTER / CAPTAIN / MOTM / LEGEND), references the canonical bonus-pool system, and has no hardcoded `$12,451.29` seed or other dead old-system values.
4. `worldcup/` directory no longer exists at the repo root.
5. The chooser landing shows three sport cards; clicking each routes to the correct SPA.
6. Tier thresholds are calibrated, not seeded — backed by simulator output committed alongside the config.
7. Type check, lint, and vitest all pass repo-wide.
8. Preview deploy renders the football SPA cleanly with FTUE → game → results loop working end-to-end.

## Open questions / future specs (not part of this work)

- **Daily-50 rotation format** — active design conversation, separate workstream. Slots in via `adapter.getPlayers()` when ready.
- **Real headshot source** — Wikimedia Commons curation vs. paid API. Future task; flag-plus-name is the launch fallback.
- **Multi-competition support** — adding EPL / La Liga / etc. as additional data sources under the football umbrella. Future spec; defines whether competitions share a leaderboard or get their own.
