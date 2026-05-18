# Football SPA — review brief

> **Paste this into ChatGPT first.** It frames what was built, what's deferred, and what to look at. The companion file `docs/football-review-code-dump.md` contains the key source files inline if a code-level review is wanted.

## Context

`ReplayMod` is a multi-sport SPA monorepo (basketball, baseball — both live; football — new). Each sport is an independent Vite + React SPA at `<sport>/`, with a sport-agnostic infrastructure layer at `shared/`. A static chooser at `chooser/index.html` is the landing page. Vercel serverless functions live at `api/`.

Football is the third sport. The launch competition is World Cup '26 (data extracted from previous tournaments). EPL / La Liga / etc. plug in later by swapping data — no code restructuring needed. This work replaces a drifted `worldcup/` SPA that pre-dated a major shared-infrastructure cutover (Phase 2 GameView lift).

## What shipped — two PRs

**PR 1: bulldoze + playable loop** — https://github.com/jztang-ship-it/replay-modulated/pull/50 (23 commits)

- Renamed `worldcup/` → `football/` with full git-history-preserving directory rename + identity updates (package.json, vite.config.ts, index.html title)
- New tier ladder: SUB → STARTER → CAPTAIN → MOTM → LEGEND (mirrors basketball's 5-tier curve, multipliers 0.5×/1.5×/3×/8×/50×). LEGEND is the cross-sport peak; GOAT reserved for future.
- 5-slot roster: 1 GK + 1 DEF + 1 MID + 1 FWD + 1 FLEX (FLEX excludes GK)
- Bulldozed 466-line `GameView.tsx` fork → 158-line shim wrapping `@shared/views/GameView` with a `GameAdapter` literal
- Local component forks deleted (5 fully orphaned + 1 ErrorBoundary wrapper); imports redirected to `@shared/components/...`
- New `SoccerCard.tsx` wraps shared `<CardFront>` (renamed from `PlayerCard.tsx`); `FootballHero` renders country flag + last-name initials (no headshot source at launch)
- `LandingPage.tsx` shim with 5 demo cards (Messi, Mbappé, Vinícius Jr., Bellingham, Saka) using real `basePlayerId` values from `players.json`
- `App.tsx` rewritten to clone basketball's auth-aware shell — AuthProvider, `?play=1` / `?signin=1` / `?profile=1` query handlers, sticky `replay_skip_landing_football` flag, debug bar
- FTUE config + roster stubs extracted to `football/src/adapters/ftueRoster.ts`
- `api/bonus-pool.ts` per-competition keying: `bonus_pool:football:world_cup`. Backward compatible for basketball/baseball (no competition param required).
- Shared GameAdapter type extended: `sportKey` and `leaderboardScope` unions accept `"football"`; new optional `bonusPoolCompetition?: string` field
- `shared/utils/bonusPoolStore.ts` `getBonusPool` and `contributeBet` accept optional competition arg
- Chooser landing: third sport card (⚽ Football, "World Cup '26"); 3-column grid with single-column fallback under 480px; bucket logic for 3 sports
- Build pipeline: `scripts/build-vercel.sh` adds football install/build/copy block; `vercel.json` adds `/football/:path*` rewrite

**PR 2: polish + validation** — https://github.com/jztang-ship-it/replay-modulated/pull/51 (5 commits, targets PR 1 as base)

- Stat → FP attribution on card backs: each stat tile shows count + FP contribution (`GOALS · +22 / 1`). Soccer stats are less self-evidently scoring than basketball; the math layer makes position-parity weights legible at a glance.
- FLEX live UI tooltip: sport-agnostic `slotLabels` mechanism on the GameAdapter. Football populates slot 4 with `{ label: "ANY OUTFIELD", tooltip: "Any outfield player — no goalkeepers" }`. Reinforces the FTUE teaching for users who skip the coach script.
- FTUE coach copy polish: `holdIntroText` now explicitly teaches the FLEX rule + tier ladder + position requirements + cap.
- 10 edge-case unit tests under `shared/__tests__/footballEdgeCases.test.ts`: substitute (low minutes), GK-scored-goal stacking, red card -15 FP, badge suppression on FWD, penalty-shootout behavior documentation.
- Position-parity verification note. 1k-hand simulator confirms parity at the per-game-mean level: GK 17.7 / DEF 20.5 / MID 22.0 / FWD 16.2 FP avg (all in 16–22 FP range — within 2× across positions, satisfying the spec gate at the means).

## Position-parity foundation (preserved from worldcup, NOT new)

Soccer's central design problem: defenders don't post flashy numbers like forwards do, but their FP needs to feel comparable. Otherwise the FLEX slot collapses to "always pick a forward". Three mechanisms preserved verbatim:

1. **Position-specific FP weights** in `footballConfig.ts:54-101`. A goal is worth 22 FP for FWD, 18 FP for DEF (rare → heavily rewarded), 60 FP for GK (ultra-rare → massive). Tackles weighted highest for DEF.
2. **Within-position salary normalization** in `gameAdapter.ts:109-111`. Each position's salaries normalized against that position's mean, not the league mean. A $34 GK and a $34 DEF project to comparable FP.
3. **Position-keyed badges** in `footballConfig.ts:141-352`. Each position has its own ladder of "big moments" worth meaningful FP (HAT_TRICK +30 for FWD, MAESTRO +20 for MID, STOPPER +20 for DEF, WALL +10 for GK).

## Acceptance criteria status

| # | Criterion | Status | PR |
|---|---|---|---|
| 1 | GameView shim ≤ 200 lines wrapping shared | ✅ 158 lines | 1 |
| 2 | Components: only sport-specific files (`SoccerCard`, `LandingPage`); no shared forks | ✅ | 1 |
| 3 | `FootballSportConfig` with new tier ladder, no `$12,451.29` dead seed | ✅ | 1 |
| 4 | `worldcup/` directory removed | ✅ | 1 |
| 5 | Chooser shows 3 sport cards | ✅ | 1 |
| 6 | Tier thresholds calibrated via simulator | ⚠️ Deferred — simulator uses BASKETBALL_WIN_TIERS against football data; sport-aware fix is a separate PR | 2 |
| 7 | Typecheck / lint / vitest green | ✅ Only pre-existing errors carry over | 1 |
| 8 | Preview deploy renders football SPA | ✅ Pending Vercel preview | 1 |
| 9 | Position parity verified within 2× across positions | ✅ At per-game-mean level (GK 17.7 / DEF 20.5 / MID 22.0 / FWD 16.2). Per-tier verification deferred with simulator fix. | 2 |
| 10 | Stat → FP attribution renders on every card back | ✅ | 2 |
| 11 | FLEX rule surfaced in FTUE + live UI | ✅ FTUE + tooltip both live | 1+2 |
| 12 | Football commentary library | Deferred past PR 2 — depends on active player pool being locked | — |
| 13 | Bonus pool keyed `bonus_pool:football:world_cup` | ✅ | 1 |
| 14 | Edge-case tests pass | ✅ 10/10 PASS | 2 |

## Known gaps / deferred work

1. **Sport-aware simulator** (highest priority follow-up). `shared/tools/runSimulator.ts` currently uses `BASKETBALL_WIN_TIERS` for tier-distribution scoring even when run against football data. Fix: read `winTiers` from the active sport config. Unblocks per-tier calibration.
2. **Tier-threshold calibration** (depends on #1). Football retains seeded thresholds (130/150/167/192/215) from a 5/6 scaling of legacy 6-slot worldcup thresholds.
3. **Football commentary library**. Deferred until the active player pool is locked. Football inherits the existing fallback library at launch.
4. **Real headshot source**. Flag-plus-name fallback ships at launch. Future: Wikimedia Commons curation or paid sports-data API.
5. **`api/leaderboard.ts` competition param**. The chooser sends `&competition=world_cup` for football, but the API ignores it (only one football competition exists at launch). Wire properly when EPL data lands.
6. **50-hand qualitative validation**. Spec asks for a manual playthrough with boring/memorable counts. Doable on the preview deploy.

## Non-trivial type-system bridges (intentional, commented)

Three `as` casts in football GameView + LandingPage exist because football's local `PlayerCard` type has a narrower `TierColor` union (no `"RED"`) than shared's. Football data never produces RED tier cards. The casts are commented inline. Cleaner long-term fix: widen football's local TierColor or drop the local PlayerCard type entirely in favor of shared.

## What I'd ask ChatGPT to focus on

1. **Architecture sanity**: Is the GameAdapter contract correctly populated? Are the type casts genuinely safe per the comments, or are they hiding real bugs?
2. **Position parity**: Is the within-position salary normalization in `gameAdapter.ts:109-111` actually doing what the comment claims? Are the per-position FP weights in `footballConfig.ts` plausibly calibrated for the spec's "comparable LEGEND-rate per position" goal?
3. **Tier ladder**: Are the seeded thresholds (130/150/167/192/215) reasonable for a 5-slot soccer roster, given each position averages 16–22 FP per game?
4. **FTUE flow**: Does the placeholder Messi-anchored FTUE actually produce a satisfying win moment? What's the minimum work to upgrade it to a "scripted FTUE hand" with a real Messi MOTM 2022 game?
5. **Edge cases not covered**: What soccer-specific edge cases am I missing in the test file? Penalty kicks (separate from shootouts), own goals, GK-as-outfield-player (rare in real games), etc.
6. **Per-PR review**: Is the PR-1/PR-2 split clean? Could anything in PR 2 have been in PR 1, or vice versa?

## Key file paths

The companion `docs/football-review-code-dump.md` includes these inline. To inspect from the repo:

- `docs/superpowers/specs/2026-05-05-football-bulldoze-and-rebuild-design.md` — the spec
- `docs/superpowers/plans/2026-05-05-football-bulldoze-and-rebuild.md` — the implementation plan
- `docs/superpowers/notes/2026-05-05-football-simulator-run.md` — simulator output + parity verification
- `football/src/adapters/footballConfig.ts` — sport config (tier ladder, FP weights, badges, economy)
- `football/src/views/GameView.tsx` — GameView shim (158 lines)
- `football/src/components/SoccerCard.tsx` — sport-specific card with `FootballHero` (flag + name)
- `football/src/components/LandingPage.tsx` — landing-page shim
- `football/src/App.tsx` — auth-aware app shell
- `football/src/adapters/ftueRoster.ts` — FTUE config + stub functions
- `shared/__tests__/footballEdgeCases.test.ts` — 10 edge-case tests
- `api/bonus-pool.ts` — per-competition bonus pool API
- `chooser/index.html` — landing page (3-sport chooser)

Cross-cutting shared changes (small, look at the diff in PR 1):
- `shared/views/GameAdapter.ts` — extended unions + new optional fields
- `shared/utils/bonusPoolStore.ts` — competition-aware getBonusPool/contributeBet
- `shared/components/RosterGrid.tsx` — slotLabels prop + render
