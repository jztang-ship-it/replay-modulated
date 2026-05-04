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

## Implementation phasing — two PRs

The work ships in two reviewable PRs, not one giant pass. PR 1 makes football *exist*; PR 2 makes football *feel right*.

### PR 1 — bulldoze + playable loop (architecture, routing, build)

**In scope:**

- Delete `worldcup/`, create `football/` with the full rename (sport key, class, directory, paths, localStorage prefix)
- Rewrite the SPA shell: `App.tsx`, `GameView.tsx` (shim), `SportAdapter.ts`, `footballConfig.ts`, `SoccerCard.tsx`, `LandingPage.tsx` (shim), `ftueRoster.ts`
- Bonus pool API extended for per-competition keying (`bonus_pool:football:world_cup`); `SUPPORTED_SPORTS` updated
- Chooser updated with the third sport card; `scripts/build-vercel.sh` includes `football`; `vercel.json` rewrites added
- FTUE roster wired; basic deal → hold → draw → reveal → results loop works end-to-end (with seeded tier thresholds and placeholder coach copy)
- Cleanup audit pass (`grep -ri "GOAT"`, dead local `BonusPoolRow`/`$12,451.29` references, orphan imports)
- Repo-wide typecheck / lint / vitest all pass

**Out of PR 1:** stat→FP attribution UI, calibrated tier thresholds, football-specific commentary library, edge-case unit tests, polished FTUE coach copy, FLEX tooltip UI. Football inherits whatever the existing commentary system falls back to when no sport-library exists.

**Acceptance criteria for PR 1:** items #1–8, #11, #13 from the master list below.

### PR 2 — polish + validation (the layer that makes football feel right)

**In scope:**

- Stat → FP attribution rendering on every card back (the math layer from the Scoring clarity section)
- Simulator runs (`npx ts-node shared/tools/runSimulator.ts football 10000`) → calibrate tier thresholds; commit calibrated values back into `footballConfig.ts`
- Edge-case unit tests (substitutes, 0-min appearances, position fluidity, GK-scored-goal, red-card, penalty shootouts)
- FTUE coach copy refinements (soccer-specific phrasing in each beat)
- FLEX UI affordances (slot label + tooltip)
- 10k-hand simulator validation gate met (tier hit-rates, **position parity rates within 2× across anchor positions**)
- 50-hand qualitative gate met (boring < 20%, memorable > 30%)

**Acceptance criteria for PR 2:** items #9, #10, #12, #14 from the master list below.

### Deferred — post PR 2

- **Football commentary library** (`shared/commentary/libraries/football.json`) is deferred until the active player pool is locked. Until then, phrasing can't be tuned to the actual roster (Messi vs. Mbappé as the canonical "star_carry" line, etc.). Football inherits the existing fallback library at launch and gets its own when the data layer is stable. The "Commentary archetypes" section below is design *intent*, not a PR-1 or PR-2 deliverable.
- **Real headshot source** (Wikimedia Commons curation vs. paid API) — flag-plus-name fallback ships at both PRs.
- **Daily-50 rotation format** — separate workstream; slots in via `adapter.getPlayers()` when ready.
- **Multi-competition data** (EPL / La Liga / Bundesliga) — pool/leaderboard architecture is settled; data-pipeline work is per-competition and out of scope.
- **Competition-switching UI** — only relevant when football has 2+ competitions live.

## Position parity — the foundation

Soccer's central design problem: defenders don't post flashy numbers like forwards do, but their FP needs to feel *comparable* — otherwise the FLEX slot collapses to "always pick a forward" and the game becomes a one-position lottery. This is the same problem baseball solved between pitchers and batters, and the existing `worldcup/` work has the right answer for football.

**Three parity mechanisms already engineered, all preserved unchanged:**

1. **Position-specific FP weights** (`worldcupConfig.ts:54-101`).  Same raw stats are weighted differently per position so that the *typical* output ranges match. A goal is worth 22 FP for a FWD but 18 FP for a DEF (rare → heavily rewarded) and 60 FP for a GK (ultra-rare → massive). Tackles are worth 5 FP for DEF, 4 FP for MID, 2 FP for FWD. Pressures are weighted highest for MID (volume role), lowest for FWD. Calibrated so each position's typical game lands in the same 16–25 FP avg / 60–75 FP elite band.

2. **Within-position salary normalization** (`worldcup/src/adapters/gameAdapter.ts:109-111`, comment: *"Salary derived FROM proj (within-position normalisation). This is the key: same proj = same salary regardless of position"*). Each position's salaries are normalized against that position's mean, not the league mean. A $34 GK and a $34 DEF and a $34 MID all project to comparable FP — different stats, same expected output. This is what stops the FLEX from defaulting to FWD.

3. **Position-keyed badges** (`worldcupConfig.ts:141-352`). Each position has its own ladder of "big moments" worth meaningful FP:

| Position | Tier 1 (top) | Tier 2 | Tier 3 | Independent |
|----------|--------------|--------|--------|-------------|
| FWD | HAT_TRICK +30 | BRACE +15 | POACHER +15 | CREATOR +18, SHARP +8 |
| MID | MAESTRO +20 | DYNAMO +18 | PLAYMAKER +12 | BOX_TO_BOX +10, PRESS_KING +10 |
| DEF | STOPPER +20 | GUARDIAN +15 | BULLDOZER +12 | OVERLAP +15, CLEAN_SHEET +10 |
| GK | WALL +10 | KEEPER +5 | — | CLEAN_SHEET +10 |

A DEF can hit 50+ FP through a STOPPER + OVERLAP combo without scoring a goal. A GK can hit 50+ via WALL + CLEAN_SHEET + high save count. The "big moment" is reachable from every position. This is the soccer answer to the user concern that "DF isn't going to have as flashy numbers as a FW" — they don't *need* to; they have their own moments calibrated to comparable FP.

**What this means for the bulldoze:** these three mechanisms (the position-specific weights, the within-position salary normalization, the position-keyed badge ladders) are kept verbatim. They are the foundation, not a future task. The bulldoze is structural cleanup *around* this work, not a redo of it.

**Validation gate before launch (added to acceptance criteria):** the 10k-hand simulator must report comparable LEGEND-rate-by-anchor-position. If FWD-anchored hands hit LEGEND 5× more often than DEF-anchored hands, the parity is broken and weights/badges need adjustment before ship.

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

Anchor: **Messi** (FWD, salary $60). Drawn FTUE result uses a real Messi-MOTM game from extracted 2022 World Cup data so the win-moment is grounded in actual history (not a synthetic "designed to feel good" outcome).

**FTUE roster composition** (5 cards, $180 cap):

| Slot | Position | Player | Salary | Why |
|------|----------|--------|--------|-----|
| 1 | FWD | Messi | $60 | Anchor — frames the cap; FWD slot |
| 2 | GK | (mid-tier WC keeper) | $25 | Teaches GK position requirement; lowest salary |
| 3 | DEF | (mid-tier WC defender) | $30 | Teaches DEF position requirement |
| 4 | MID | (mid-tier WC midfielder) | $35 | Teaches MID position requirement |
| 5 | FLEX | (mid-tier WC FWD or MID) | $30 | **Critical**: teaches FLEX rule |

Total: $180 — exactly at cap, teaching that the cap is real and binding.

**FTUE teaching beats** (each step in the existing `CoachLayer.tsx` flow gets soccer-specific copy):

1. **Deal step** — Coach intro: "Five players. One Argentine ace anchoring it. Let's see what we got."
2. **Hold step (`holdIntroText`)** — teaches three things in sequence:
   - **Position lockouts**: "GK / DEF / MID / FWD slots are fixed — you can only swap a goalkeeper for another goalkeeper, etc."
   - **The FLEX slot rule** (the one the review flagged): "The FLEX takes any outfield position — DEF, MID, or FWD. **Not GK** — only one keeper per side, just like a real match."
   - **Card-tier colors** (per #45 launch teaching): how to read salary tier from card border color
3. **Draw step** — "Hold who you trust. Redraw the rest."
4. **Reveal step** — Real game stats roll in. Messi's actual 2022 MOTM line plays out tile-by-tile (goal → +22 FP, assist → +8 FP, HAT_TRICK badge → +30 FP, etc. — see Scoring clarity section).
5. **Win step** — MOTM tier hits with a soccer-specific celebration line. Tier ladder is shown (SUB → STARTER → CAPTAIN → MOTM → LEGEND) so the user sees they landed on tier 4 of 5.

**FTUE acceptance criteria** (validation, not just specification):

- After FTUE completes, the user understands the 5-slot positional structure (verified by: most users' first non-FTUE hand respects position requirements)
- The user has seen Messi's 2022 MOTM moment land at MOTM or LEGEND tier (verified by: drawn FTUE roster + game produces ≥190 FP total in simulator)
- The user understands FLEX ≠ GK (verified during the bulldoze: FLEX UI in non-FTUE play also reinforces this — see UI section below)

**FLEX UI affordances (review concern #4)** — beyond FTUE teaching, the live game UI surfaces the FLEX rule:

- The FLEX slot card displays a small label ("ANY OUTFIELD") in the slot header
- If the deal/redraw ever proposes a GK in the FLEX slot, the engine rejects it server-side (already enforced by `excludeFromFlex: ["GK"]` in the roster generator at `gameAdapter.ts:142`); no UI surface for the rejection because users never see it happen
- On hover/tap of the FLEX slot, an inline tooltip: "Any outfield player (no goalkeepers)" — non-blocking, dismissable

## Headshots

Country flag + last-name abbreviation. This is the current `PlayerCard.tsx` rendering pattern and ships unchanged. No external image source is wired at launch. The `adapter.headshotUrl(id)` returns `null`, which the shared CardFront treats as "use the sport's flag/initials fallback."

A real headshot source (Wikimedia Commons, paid sports API, etc.) is deferred to a future task.

## Data layer

- Source: `football/public/data/players.json` and `game-logs.json`, generated by `transformWorldCupData.mjs` from raw StatsBomb data.
- Pool model at launch: **basketball's full-pool model verbatim** — every hand draws from the entire player set, no daily rotation.
- Adapter exposes `getPlayers()` and `getLogsByKey()` matching the shared `SportAdapter` contract.
- The "today's stars" / daily-bonus pool concept (`adapter.buildBonusPool()`, `adapter.getDailyBonusMapNow()`) maps onto the shared infrastructure unchanged.
- When the rotation-50 spec lands, only `getPlayers()` and possibly `buildBonusPool()` change. No other architectural impact.

## Bonus pool — per-competition

Inherits the canonical shared system (`shared/utils/bonusPoolStore.ts`) automatically by using shared `GameView`. **Decision locked: each competition gets its own pool and its own leaderboard.** EPL hands compete against EPL hands; World Cup hands compete against World Cup hands. Mixing competitions in a single pool would create the imbalance the review flagged (different scoring environments, different stat distributions) and dilute the "tournament moment" feel of competitions like the World Cup.

**Schema (KV keys):**

| Key | Use |
|-----|-----|
| `bonus_pool:basketball` | Basketball (NBA only — no qualifier needed) |
| `bonus_pool:baseball` | Baseball (MLB only — no qualifier needed) |
| `bonus_pool:football:world_cup` | Football, World Cup competition (launch) |
| `bonus_pool:football:epl` *(future)* | Football, EPL competition |
| `bonus_pool:football:la_liga` *(future)* | Football, La Liga competition |

**Pool parameters (unchanged from canonical):**

- `BONUS_POOL_SEED = 1000` (was `$12,451.29` in the dead local code)
- `BONUS_POOL_DAILY_BASE = 1000` (daily injection per pool)
- `RAKE_RATE = 5%` per bet
- Distributed daily via leaderboard, 60/40 split (Session Score / Best Hand), top 10 with the standard 35/20/12/8/6/5/4/4/3/3% distribution
- Each competition gets its own daily injection and rake bucket — pools never mix

**API changes (`api/bonus-pool.ts`):**

- Accept optional `competition` query param: `GET ?sport=football&competition=world_cup`
- For sports without competitions (basketball/baseball), `competition` is omitted; key remains `bonus_pool:<sport>`
- For football, `competition` is **required**; missing param returns 400
- `SUPPORTED_SPORTS` set: replace `worldcup` with `football`
- A new `SUPPORTED_COMPETITIONS` map: `{ football: ["world_cup"] }` at launch; extends as competitions are added

**Leaderboard scope:** `/api/leaderboard?sport=football&competition=world_cup&metric=...`. Same pattern as the bonus pool. A football-EPL hand never competes against a football-WC hand in the rankings. The chooser's TO BEAT preview for the football card pulls from `competition=world_cup` at launch.

**Migration:** basketball and baseball keep their current keys (`bonus_pool:basketball`, `bonus_pool:baseball`) at launch. If/when those sports add a second competition (e.g., college basketball), their keys migrate to `bonus_pool:<sport>:<competition>` in a separate, dedicated change. Out of scope here.

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
- **Bonus pool and leaderboard are per-competition**, keyed `<sport>:<competition>` for football (see Bonus pool section). Resolves the review concern that EPL + World Cup mixing would create imbalance.
- No competition-switching UI ships at launch. Competition is implicit in the data file (`football/public/data/players.json` is World Cup data; future EPL data lands at `football/public/data/players-epl.json` or similar). The competition-switching UI is a separate spec when a second competition is added.

## Game feel validation (review concern #1)

Soccer's lower per-match stat variance creates a real risk that hands feel undifferentiated — too many "everyone scored 0 goals, everyone got ~15 FP" outcomes. Validation is mandatory before launch.

**Quantitative gate (10k-hand simulator):**

- Tier hit-rate distribution must match Tier ladder targets within ±20% (SUB ~25%, STARTER ~12%, CAPTAIN ~5%, MOTM ~1.5%, LEGEND ~0.3%, BUST ~56%). If hit rates are too compressed (most hands clustering in STARTER/CAPTAIN), thresholds get re-spaced to spread the outcomes.
- **LEGEND-rate-by-anchor-position** must be comparable: if FWD-anchored hands hit LEGEND at 0.5% but DEF-anchored at 0.05%, parity is broken (see Position parity section).
- **FP separation between adjacent tiers** must be ≥20 FP at the lower end and ≥30 FP at the top — this is what makes the tier transitions feel earned rather than incremental.

**Qualitative gate (50 manual hands, played as a user):**

- Count "boring" hands (where the user can't articulate *why* they got the result) — should be < 20%
- Count "memorable" hands (the user can describe the standout play) — should be > 30%
- Verify big-moment payoffs land hard: a HAT_TRICK badge animation must feel categorically different from a SHARP badge

If the qualitative gate fails, the diagnosis is one of: badge FP values too small, position weights too flat, or the reveal-stage commentary not landing the moment.

## Scoring clarity (review concern #2)

Soccer stats are less self-evidently scoring than basketball. "Messi: 1G 1A" doesn't translate to a number the way "LeBron: 40 pts" does. The card back must show the math.

**Stat → FP attribution on the card back** (extends the existing `statDisplay` config):

```
                  GOALS         1     +22 FP
                  ASSISTS       1      +8 FP
                  SHOTS ON TGT  3     +12 FP
                  KEY PASSES    2      +6 FP
                  DRIBBLES      4      +8 FP
                  ──────────────────────────
                  STATS                +56 FP
                  HAT_TRICK 🎩         +30 FP
                  ──────────────────────────
                  TOTAL                +86 FP
```

Each stat tile shows both the count *and* its FP contribution. Badges show their bonus separately and the total ties out. This makes "why did this player score 86" answerable at a glance.

**Reveal-stage emphasis:** the existing FP roll-up animation in `useEmotionalReveal.ts` plays this same math live — each stat tile pulses as it adds to the running total. For soccer this is more important than for basketball (each individual contribution is smaller, so seeing the build-up matters more).

## Commentary archetypes — design intent (deferred to post-PR 2)

> **Status:** Design intent only. Not a PR-1 or PR-2 deliverable. Commentary phrasing depends on the active player pool — Messi vs. Mbappé as the canonical "star_carry" line, etc. — and we won't know how to write good lines until the pool is locked. At launch, football inherits whatever the existing commentary system falls back to (sport-agnostic templates from the registry's `legacyStoryIds`). The football library lands in a separate spec when the data layer is stable.

The shared archetype system (`shared/commentary/archetypes.ts`) is sport-agnostic — `star_carry`, `balanced_win`, `badge_explosion`, `everyone_flat`, `star_failed`, `collapse`, etc. The phrasing per sport lives in `shared/commentary/libraries/<sport>.json`. When football is ready for a real library, it will need:

**`shared/commentary/libraries/football.json`** — populated for every active archetype (currently 13: 9 win, 4 loss, plus `badge_explosion` and `career_night` shared between).

Soccer-specific phrasing requirements:

- **Star carry (FWD anchor lights up):** "Messi turned in a tournament moment — 2G 1A and the crowd lost it." Goal-driven, named.
- **Balanced win:** "No single explosion — everyone did their job. The kind of result that wins tournaments." Distribution language.
- **Star carry from MID (playmaker night):** distinct from FWD carry. "Bellingham ran the midfield — 8 key passes, 2 assists, MOTM material." Surfaces assists/KP, not just goals.
- **Defensive masterclass (DEF anchor carries):** "Van Dijk locked the back four — 3 tackles, 5 clearances, OVERLAP for the assist." Surfaces tackles/INT/CLR + the rare DEF goal/assist as the badge moment.
- **Goalkeeper heroics (GK carry):** "Martinez stood on his head — 6 saves, clean sheet, the WALL came in." Surfaces saves and clean sheet.
- **Star failed (anchor was the culprit):** "Mbappé went missing. 0G, 1 SOT — sometimes the favourite no-shows." Names the culprit explicitly.
- **Everyone flat (collective bust):** "Quiet match all around — no goals, low key passes. Nothing to write home about." Soccer-specific framing of the low-scoring outcome.

**Culprit identification in losses** is already handled by the `selectCommentary.ts` archetype-selection logic (it identifies the lowest-FP-vs-projection card and routes to `star_failed` or `star_cold`). Football inherits this mechanism for free at PR 1.

**Reserved archetypes worth activating when the football library lands** (currently `active: false` in the registry):

- `anchor_underperformed` — fallback for `star_failed`, useful for soccer where the anchor often doesn't post negative FP, just zero
- `one_player_threw` — useful for the rare red-card scenario (-15 FP from a single play)
- `wrong_star_wrong_night` — when the user picked the wrong anchor and another sub-tier player overperformed

Activation happens with the library landing, not before.

## Data edge cases (review concern #5)

StatsBomb data has known wrinkles. The implementation must handle:

- **Substitutes and minutes_played**: a player who came on at 70' has only 20 minutes of stats. The CLEAN_SHEET badge requires `minutes_played >= 60` — verified to gate correctly. Per-stat normalization (per-90, per-game) is *not* applied — we use raw match totals so the "right place at the right time" element is preserved.
- **0-minute appearances**: players named in the squad but didn't enter. Filtered out at the `filterScoringLogs` step (`gameAdapter.ts:31-38`) — no scoring stats means they don't make the eval pool. Verify edge case: a GK who didn't make a save still has stats (clean sheet, minutes); confirm the filter handles this correctly.
- **Position fluidity**: a player listed as "Right Wing Back" plays as a DEF in the World Cup. Handled by `positionAliases` in `worldcupConfig.ts:23-32`. Verify all StatsBomb position strings are mapped; unmapped positions default to MID which would skew DEF parity.
- **GK anomalies**: a GK who scored a goal (rare but real — extracted data has examples). Should hit the GK badge ladder *and* the goal weight (60 FP for GK). Ensure these stack correctly rather than getting suppressed.
- **Red-card scenarios**: -15 FP from `red_cards >= 1` plus likely low minutes. Should produce a coherent narrative, not a confusing zero (handled by reserved `one_player_threw` archetype, see Commentary section).
- **Penalty shootouts**: World Cup data may include or exclude shootout goals. Confirm whether penalty-shootout goals count toward the `goals` stat in source data; document the choice in code comments.

These cases get explicit unit tests in `shared/commentary/__tests__/` and `worldcup/scripts/__tests__/` (or wherever the data-pipeline tests live in the new `football/` tree).

## Testing & verification

- `npm --prefix football run typecheck` — green
- `npm --prefix football run lint` — green
- `npx vitest run` — full suite green (catches any GOAT/old-bonus-pool references that broke)
- `bash scripts/build-vercel.sh` locally — produces `dist/football/` alongside `dist/basketball/` and `dist/baseball/`, with the chooser at `dist/index.html` showing all three sport cards
- `npx ts-node shared/tools/runSimulator.ts football 10000` — must satisfy quantitative game-feel gates (see Game feel validation section): tier hit-rate targets, position-anchor parity, FP separation between tiers
- 50 manual hands played end-to-end — must satisfy qualitative gates (boring < 20%, memorable > 30%)
- Edge-case unit tests pass (substitutes, 0-min, position fluidity, GK goals, red cards, penalty shootouts)
- Preview deploy → manual smoke:
  - FTUE walkthrough lands all five teaching beats (Deal → Hold position-lockout → Hold FLEX rule → Hold tier-colors → Reveal stat→FP roll-up → Win MOTM tier)
  - Daily-bonus roll-in renders without errors
  - Card-tier colors visible in `holdIntroText` (the #45 teaching)
  - Bonus pool widget shows sensible value (KV-backed at `bonus_pool:football:world_cup`, not hardcoded)
  - FLEX tooltip surfaces on hover/tap
  - Stat→FP attribution visible on every card back
- Chooser smoke: clicking ⚽ Football routes to `/football/?play=1` and lands in FTUE for new users

## Acceptance criteria

A reviewer should be able to confirm, via the implementation plan's PRs. Each criterion is tagged with the PR it lands in.

1. **(PR 1)** `football/src/views/GameView.tsx` is a thin shim (≤ ~200 lines) wrapping `@shared/views/GameView`, structurally parallel to `basketball/src/views/GameView.tsx`.
2. **(PR 1)** `football/src/components/` contains only legitimately sport-specific files (`SoccerCard.tsx`, `LandingPage.tsx`); no forks of canonical shared components.
3. **(PR 1)** `FootballSportConfig` uses the new tier ladder (SUB / STARTER / CAPTAIN / MOTM / LEGEND), references the canonical bonus-pool system, and has no hardcoded `$12,451.29` seed or other dead old-system values.
4. **(PR 1)** `worldcup/` directory no longer exists at the repo root.
5. **(PR 1)** The chooser landing shows three sport cards; clicking each routes to the correct SPA.
6. **(PR 2)** Tier thresholds are calibrated, not seeded — backed by simulator output committed alongside the config.
7. **(PR 1)** Type check, lint, and vitest all pass repo-wide.
8. **(PR 1)** Preview deploy renders the football SPA cleanly with FTUE → game → results loop working end-to-end.
9. **(PR 2)** **Position parity verified**: 10k-hand simulator reports comparable LEGEND-rate by anchor position (FWD/MID/DEF/GK within 2× of each other). DEF and GK anchors must demonstrably reach LEGEND tier in the data, not just theoretically.
10. **(PR 2)** **Stat → FP attribution renders** on every card back; no card shows just stat counts without their FP contribution.
11. **(PR 1: FTUE teaching beat; PR 2: live-game tooltip)** **FLEX rule surfaced** in both FTUE and live UI.
12. **(deferred)** Football commentary library — out of scope for both PRs; lands in a separate spec when the player pool is locked.
13. **(PR 1)** **Bonus pool keyed per-competition**: `bonus_pool:football:world_cup` exists in KV; basketball/baseball keys unchanged.
14. **(PR 2)** **Edge-case tests pass**: substitutes, 0-minute, position fluidity, GK-scored-goal, red-card, penalty-shootout cases all have tests and pass.

## Open questions / future specs (not part of this work)

- **Daily-50 rotation format** — active design conversation, separate workstream. Slots in via `adapter.getPlayers()` when ready.
- **Real headshot source** — Wikimedia Commons curation vs. paid API. Future task; flag-plus-name is the launch fallback.
- **Multi-competition data integrations** — adding EPL / La Liga / etc. as additional data sources under the football umbrella. The pool/leaderboard architecture is settled (per-competition); the data-pipeline work for each new competition is its own task.
- **Competition-switching UI** — when football has 2+ competitions, users need a way to switch between them. Out of scope at launch (only World Cup).
- **Basketball/baseball pool key migration** — if/when those sports add a second competition, migrate their KV keys from `bonus_pool:<sport>` to `bonus_pool:<sport>:<competition>`. Out of scope here.
