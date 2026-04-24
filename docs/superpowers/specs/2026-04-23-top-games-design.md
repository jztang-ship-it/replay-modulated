# Top Games — Design Spec

**Date:** 2026-04-23
**Status:** Approved — brainstorming complete, ready for implementation plan
**Goal:** Identify genuinely extraordinary real-life performances in the gamelog dataset and treat them differently across the whole app — stat-first commentary, visible stamp + shimmer on the card, and (later) a collectible set. Sport-agnostic.

---

## Overview

Jokic's 30/21/22 shipped with flat commentary because the existing record detector only knows single-stat thresholds (75% of Wilt's 100, etc.) — no concept of composite rarity (30/20/20) or season top-10. The Top Games feature adds a tier-aware "top game" classifier that fires when a star card's real-life stat line qualifies, then overrides commentary + card visuals to acknowledge the moment.

**Three tiers** (only the highest-qualifying tier per hand fires; only one reason per message):

| Tier | Trigger | Commentary | Visual |
|---|---|---|---|
| **T1 `all_time`** | Stat crosses a hand-curated all-time threshold (e.g., 70+ pts, 30/20/20 TD) | Full archetype override → `historic_all_time`, stat-first copy | Platinum shimmer + `ALL-TIME` stamp |
| **T2 `season`** | Game is top-10 of current season in any tracked category | Full archetype override → `historic_season`, stat-first copy | Gold shimmer + `HISTORY!` stamp |
| **T3 `career`** | PURPLE/ORANGE/RED star's personal best (within 2-season dataset) in pts/reb/ast/threes | Additive detail `season_best_stat`, lighter in-line mention | No visual (commentary-only) |

Precedence is strict: T1 > T2 > T3. If a game qualifies for multiple tiers, the highest wins and everything else is silent for that message. Non-star cards never trigger any tier — "historic" only attaches to the hand's star.

Every T1/T2 template includes a rhetorical "check the line / flip it" beat. The shimmer + stamp is the pull; the copy is the push. Together they form the habit loop encouraging users to tap card backs to see the full game log.

Scope note: this spec covers **Phase 1 only** (data + detector + commentary + card-front visuals). Phase 2 (back-of-card emphasis) and Phase 3 (collection UI, gamelog packs, unlock mechanics) are explicitly deferred.

---

## Data Artifacts

Three new files per sport, plus one new generic composite-rule file. No changes to `game-logs.json`.

### 1. `shared/data/nbaAllTimeThresholds.ts` (hand-curated)

```ts
export interface AllTimeThreshold {
  category: string;        // 'pts' | 'reb' | 'ast' | 'threes' | 'stl' | 'blk' |
                           // 'td_30_20_20' | 'td_40_20_20' | 'td_60_10_10' |
                           // 'quad_double' | 'fifty_plus_game' | 'five_by_five'
  min: number;             // stat >= min qualifies; composites use min: 1 (rule does the work)
  label: string;           // flows into commentary via {topLabel} token
  priority: number;        // higher wins when multiple thresholds match in same tier
}

export const NBA_ALL_TIME_THRESHOLDS: AllTimeThreshold[] = [
  // Composites (higher priority — beat singles when both match)
  { category: "quad_double",     min: 1,  label: "quadruple-double — top-5 ever",           priority: 100 },
  { category: "td_60_10_10",     min: 1,  label: "60-point triple-double",                  priority: 95 },
  { category: "td_40_20_20",     min: 1,  label: "40/20/20 triple-double",                  priority: 90 },
  { category: "td_30_20_20",     min: 1,  label: "30/20/20 triple-double — top-5 ever",     priority: 85 },
  { category: "fifty_plus_game", min: 1,  label: "50+ point game",                          priority: 60 },
  { category: "five_by_five",    min: 1,  label: "5x5 — 5+ in five categories",             priority: 80 },
  // Singles
  { category: "pts",    min: 70, label: "70+ point game — top-30 ever", priority: 50 },
  { category: "reb",    min: 30, label: "30+ rebounds",                 priority: 40 },
  { category: "ast",    min: 20, label: "20+ assists",                  priority: 40 },
  { category: "threes", min: 12, label: "12+ threes",                   priority: 40 },
  { category: "stl",    min: 9,  label: "9+ steals",                    priority: 40 },
  { category: "blk",    min: 10, label: "10+ blocks",                   priority: 40 },
];
```

Parallel files: `shared/data/mlbAllTimeThresholds.ts`, `shared/data/worldcupAllTimeThresholds.ts`. Same shape, different category codes per sport (baseball: `cycle`, `40_40_game`; soccer: `hat_trick`, `clean_sheet_with_assist`, etc.). Phase 1 ships minimal seed entries for non-NBA sports; iteration happens as those sports mature.

### 2. `shared/data/compositeCategories.ts` (generic dispatcher)

Rule evaluators keyed by category code:

```ts
export const COMPOSITE_RULES: Record<string, (s: StatLine) => boolean> = {
  quad_double:     s => [s.pts, s.reb, s.ast, s.stl, s.blk].filter(v => v >= 10).length >= 4,
  td_30_20_20:     s => s.pts >= 30 && s.reb >= 20 && s.ast >= 20,
  td_40_20_20:     s => s.pts >= 40 && s.reb >= 20 && s.ast >= 20,
  td_60_10_10:     s => s.pts >= 60 && s.reb >= 10 && s.ast >= 10,
  fifty_plus_game: s => s.pts >= 50,
  five_by_five:    s => [s.pts, s.reb, s.ast, s.stl, s.blk].filter(v => v >= 5).length === 5,
  // baseball / worldcup composites live here too
};
```

Keeps threshold declarations data-only; keeps rule logic in one reviewable place.

### 3. `basketball/public/data/topGames_2425.json` (generated, committed to git)

```json
{
  "203999|2025-02-10": { "reasons": [{ "category": "td_30_20_20", "label": "30/20/20 triple-double — top-5 ever", "value": 1 }] },
  "1629029|2025-01-05": { "reasons": [{ "category": "pts", "label": "Top-10 scoring game of the season", "value": 73 }] }
}
```

- Key: `{basePlayerId}|{date}`
- Size: ~50-80 entries after dedup across 6-8 categories × top 10 each
- Each entry carries its own `reasons` array (already deduped at generation time, highest-priority first)

### 4. `basketball/public/data/careerHighs_2season.json` (generated, committed to git)

```json
{
  "203999": { "pts": 61, "reb": 27, "ast": 22, "threes": 6 },
  "1629029": { "pts": 73, "reb": 15, "ast": 17, "threes": 9 }
}
```

- Scope: players in `players.json` with `season === '2425'`, `active === true`, and `tier ∈ {'PURPLE', 'ORANGE', 'RED'}` (RED is empty today; included so future additions auto-qualify)
- ~36 entries in 2425, one per qualifying star
- Values are the max across both seasons (2324 + 2425) present in `game-logs.json`
- Honest framing: commentary calls these "season best" / "biggest number of the year," not "career high." Avoids overclaim for veterans whose true career highs predate our dataset.

### 5. Build script: `basketball/scripts/generateTopGames.mjs`

- **Inputs:** `game-logs.json`, `players.json`, `nbaAllTimeThresholds.ts`, `compositeCategories.ts`
- **Outputs:** `basketball/public/data/topGames_2425.json`, `basketball/public/data/careerHighs_2season.json`
- **Logic:**
  1. Filter game-logs to `season === '2425'`
  2. For each single-stat category, sort rows by stat value desc, take top 10
  3. For each composite category, collect all matching rows (usually few), take top 10 by "composite score" (e.g., pts+reb+ast for TDs)
  4. Merge into one map keyed by `{playerId}|{date}`; within each entry, sort `reasons` by priority desc
  5. For `careerHighs`: join players.json with game-logs.json, filter to PURPLE/ORANGE/RED, compute per-stat max across both seasons
- **Flags:**
  - `--dry-run` prints bucket counts without writing files: `pts: 12 games cross top-10 cutoff of 58; td_30_20_20: 1 game; five_by_five: 3 games; ...` — you tune thresholds here before committing outputs
- **Not in CI.** Manual step. Same curation cadence as the existing hand-edited `nbaRecords.ts`.

### Files touched in Phase 1

**New:**
- `shared/data/nbaAllTimeThresholds.ts`
- `shared/data/mlbAllTimeThresholds.ts` (minimal seed)
- `shared/data/worldcupAllTimeThresholds.ts` (minimal seed)
- `shared/data/compositeCategories.ts`
- `basketball/scripts/generateTopGames.mjs`
- `basketball/public/data/topGames_2425.json` (generated, committed)
- `basketball/public/data/careerHighs_2season.json` (generated, committed)
- `shared/components/TopGameOverlay.tsx`

**Edited:**
- `shared/data/recordDetector.ts` (adds `detectTopGame` alongside existing `detectRecords`)
- `shared/commentary/types.ts` (adds `TopGameResult`, two archetypes, new template tokens)
- `shared/commentary/storySelector.ts` (calls `detectTopGame`, threads into context)
- `shared/commentary/promptBuilder.ts` or equivalent archetype-selection site (adds tier-based precedence)
- `shared/commentary/templates/` (new archetype libraries for `historic_all_time`, `historic_season`; detail for `season_best_stat`)
- `basketball/src/components/AthleteCardFront.tsx` (accepts `topGameTier` prop, renders `TopGameOverlay`)
- Card construction site in resolve/reveal flow (threads `topGame.tier` from commentary context into card props)

---

## Detection Pipeline

### Detector API

New public function in `shared/data/recordDetector.ts`, additive to the existing `detectRecords`:

```ts
export interface TopGameReason {
  category: string;
  label: string;
  value: number;
}

export interface TopGameResult {
  tier: 'all_time' | 'season' | 'career' | null;
  primaryReason: TopGameReason | null;   // the single reason commentary uses
  allReasons: TopGameReason[];           // for later surfacing in collection / profile UIs
}

export function detectTopGame(
  statLine: StatLine,
  playerId: string,
  date: string,
  playerTier: string,             // PURPLE | ORANGE | RED gates T3
  sport: string = 'basketball'
): TopGameResult;
```

### Precedence & reason selection

Walks tiers top-down; returns the first tier that has any match. Within that tier, `primaryReason` is chosen by a two-level sort:

1. **Primary: highest `priority`** from the thresholds table. Composites declare higher priorities than singles, so composites beat singles by construction.
2. **Tiebreaker: highest delta above threshold** — `(value - min) / min`. If two matches share the same priority, the one that exceeds its threshold by the larger proportion wins.

`allReasons` contains every match in the chosen tier, sorted by the same rules. Commentary never consumes `allReasons`; it's reserved for the Phase 3 collection/profile UI to show "this game earned these flags."

### Algorithm

1. **T1 — all-time thresholds.** Evaluate every simple threshold (`statLine[category] >= min`) and every composite rule (`COMPOSITE_RULES[category](statLine)`). Collect matches. If any → `tier: 'all_time'`, pick `primaryReason` per rules above, return.
2. **T2 — season top-10.** Look up `{playerId}|{date}` in the cached `topGames_2425.json`. Present → `tier: 'season'`, reasons from the entry, return.
3. **T3 — career high.** If `playerTier ∈ {PURPLE, ORANGE, RED}`, consult `careerHighs_2season.json[playerId]`. For each of pts / reb / ast / threes, if the stat line value **equals** the stored max → `tier: 'career'`, pick the highest-priority match as primary, return. (Ties, like 73 == 73, always qualify — it's still the peak.)
4. **No match** → return `tier: null, primaryReason: null, allReasons: []`.

### Call site

In `shared/commentary/storySelector.ts` (~line 220, next to the existing `detectRecords` call), once per hand, on the star card only:

```ts
const topGame = star?.statLine
  ? detectTopGame(star.statLine, star.basePlayerId, star.date, star.cardTier, sport)
  : { tier: null, primaryReason: null, allReasons: [] };
```

`topGame` is added to `CommentaryContext` as a peer of `recordEvents`. Non-star cards don't get checked — "historic" only attaches to the hand's carry. This keeps the signal meaningful and the detector cheap (one call per hand, not N).

### Caching

Lookup files are imported/fetched once at module init, cached in memory. No per-hand I/O. Cache key is `sport`; swapping sports reloads the appropriate set.

### Failure modes

- Missing lookup file → log once on init, skip that tier silently on each detect call, never throw.
- Player ID not in `careerHighs` map → skip T3, continue.
- Composite rule throws on malformed stat line (e.g., undefined `reb`) → catch, skip that rule, continue.
- All three tiers fail → `tier: null`, commentary falls back to the existing archetype pipeline, no regression.

---

## Commentary Integration

### New archetypes

Added to `CommentaryArchetype` in `shared/commentary/types.ts`:

- `historic_all_time` — T1 override
- `historic_season` — T2 override

Both sit **above** all normal archetype scoring. In whatever function picks the winning archetype (currently driven by context signals like star ratio, near-miss, etc.), a hard precedence check runs first:

```ts
if (context.topGame.tier === 'all_time') return 'historic_all_time';
if (context.topGame.tier === 'season')   return 'historic_season';
// else: existing archetype scoring
```

T3 (`tier === 'career'`) deliberately does **not** override. Instead, it sets a detail flag `season_best_stat` on the context that makes templates tagged `requires: ['season_best_stat']` eligible through the existing line-selection system. If no T3-specific template matches, the hand renders a normal archetype line — zero regression.

Naming convention to avoid drift: the detail/flag name and the `requires` tag name are both `season_best_stat` (snake_case, matching the existing `DetailId` convention in `shared/commentary/types.ts`). The template-interpolation **token** is `seasonBestStat` (camelCase, matching the other `TemplateData` fields). Same concept, two casings for two different subsystems.

### New template tokens

Added to `TemplateData`:

| Token | Type | Example |
|---|---|---|
| `topTier` | `'all_time' \| 'season' \| 'career' \| null` | `'all_time'` |
| `topStat` | `string` | `"22 ast"`, `"30/21/22"` |
| `topLabel` | `string` | `"30/20/20 triple-double — top-5 ever"` |
| `seasonBestStat` | `string` (T3 only) | `"best scoring night of the season so far"` |

### Template register & examples

New libraries: `shared/commentary/templates/historic_all_time.ts`, `historic_season.ts`. Separate files to ring-fence tone from the normal archetype libraries.

**`historic_all_time`** — no jokes, stat-first, card-back pointer every line:
> `"{topStat}. {topLabel}. Go read the line."`
> `"{topStat}. One of maybe five of these that ever happened. Flip the card."`
> `"{name} put up {topStat}. That box score belongs on a wall. Check it."`

**`historic_season`** — stat-first but slightly lighter, still serious:
> `"{topStat}. Top ten of the season. The win is a footnote."`
> `"Check the back. That's what a season-best {category} night looks like."`
> `"{name} just put up a top-ten {category} game of the year. Don't skim it."`

**`season_best_stat`** detail (T3) — a flavor line inserted into whatever normal archetype fires, not a takeover:
> `"Quietly: {name}'s {seasonBestStat}."`
> `"{name} carried it. Buried in the line: {seasonBestStat}."`

Every `historic_all_time` / `historic_season` template includes a card-back pointer beat (`check the line`, `read the box`, `flip it`, `that box score`). This is rhetorical, not a UI element — no button, no tooltip. The stamp + shimmer is the pull; the copy is the push.

### One reason per message — enforced

The commentary tokens consume `topGame.primaryReason` only. `allReasons` is never surfaced in a line. Two simultaneous achievements on the same game produce one mention of the highest-priority one.

---

## UI

### Component: `shared/components/TopGameOverlay.tsx`

Sport-agnostic, imported by each sport's card-front component.

```tsx
interface TopGameOverlayProps {
  tier: 'all_time' | 'season' | 'career' | null;
}
```

- `tier === 'all_time'` → platinum/holographic shimmer sweep on reveal + persistent `ALL-TIME` stamp top-right of card front
- `tier === 'season'` → warm gold shimmer sweep on reveal + persistent `HISTORY!` stamp top-right of card front
- `tier === 'career'` or `null` → renders nothing (T3 is commentary-only)

### Visual behavior

- **Reveal shimmer:** ~1.2s CSS keyframe. Triggered once on card-flip, not on every re-render. Tier-colored (platinum vs gold). Fades to static.
- **Stamp:** persists after shimmer ends. Positioned top-right of card front. Sized for mobile legibility. `z-index` above the photo, below the stat strip — never occludes primary numbers.
- **Motion hierarchy:** T1 shimmer reads rarer than T2 (cooler palette, slightly longer duration, more shimmer bands). The visual gap between T1 and T2 must be legible on a glance; that's the rarity signal.

### Integration

`AthleteCardFront.tsx` gets a new optional prop `topGameTier?: 'all_time' | 'season' | 'career' | null` and renders `<TopGameOverlay tier={topGameTier} />` inside the front face. Upstream, the card construction site in the resolve/reveal flow threads `context.topGame.tier` into this prop. Commentary and UI share the exact same source of truth — they can never drift.

### Scope boundaries

- No back-of-card changes in Phase 1. The habit loop ("flip it") is copy-driven only.
- No corner badge or secondary indicator for T3. Deliberate — T3 is verbal.
- No Collection/Profile surface in Phase 1. Deferred to Phase 3.

---

## Testing

### Unit tests

- `compositeCategories.ts`: edge cases for each rule. `td_30_20_20` accepts 30/20/20, rejects 29/20/20 and 30/19/20. `quad_double` accepts 10/10/10/10/2, rejects 10/10/10/9/9. Etc.
- `detectTopGame` precedence: fixture stat line + lookup fixtures where multiple tiers match → assert T1 wins. Fixture where only T2 matches → assert T2. Fixture where only T3 matches (star player) → assert T3. Fixture where T3 would match but player is BLUE (not star) → assert `null`.
- `primaryReason` ranking: within T1, composite beats single; among singles, furthest-above wins.

### Build-script smoke

Fixture gamelog with a known top-scorer and a known 30/20/20 → generator produces:
- `topGames_2425.json` contains both keys
- Each entry's `reasons` are deduped and priority-sorted
- `careerHighs_2season.json` contains correct maxes for the fixture stars

### Commentary integration tests

- Hand with star's `topGame.tier = 'all_time'` → assert `historic_all_time` archetype is selected and the output line contains one of the card-back pointer phrases (`check`, `flip`, `read`, `box score`).
- Hand with `tier = 'season'` → assert `historic_season` archetype, same pointer phrase check.
- Hand with `tier = 'career'` → assert a normal archetype runs AND a `season_best_stat` detail line appears (if templates for current archetype support it; if not, no regression).
- Hand with `tier = null` → assert normal archetype selection runs unchanged (regression guard).

### Visual smoke

Dev-only route `/devtools/topgame` renders `<TopGameOverlay>` in each variant against a sample card background. Lets visuals be iterated without needing to draw a qualifying hand in-game. Killed from prod builds.

---

## Analytics

One new event emitted in the existing analytics layer when `context.topGame.tier !== null` at reveal time:

```
top_game_revealed {
  tier: 'all_time' | 'season' | 'career',
  category: string,           // primaryReason.category
  playerId: string,
  isStarCard: true            // always true in Phase 1; keeps room for future expansion
}
```

Early telemetry goals: measure per-tier fire rate per user per session (sanity check on rarity distribution); measure whether `top_game_revealed` correlates with a later card-back tap or save-account conversion (habit-loop efficacy). Tuning direction after data arrives — not pre-committed.

---

## Rollout

1. Author thresholds. Run `generateTopGames.mjs --dry-run`. Eyeball bucket counts. Tune up/down until distribution reads right (T1 should fire roughly once every 40-80 hands for an active player, T2 every 10-20). Commit threshold file + generated JSONs together.
2. Ship detector + overlay + historic templates behind a feature flag (`featureFlags.topGames`). Flag on for internal testing.
3. Trigger known qualifying games manually (force-draw Jokic's 30/21/22, Luka's 73) and confirm: shimmer + stamp render, commentary uses `historic_all_time`, card-back pointer copy is present.
4. Flip flag on in prod.
5. Observe `top_game_revealed` for a week. Tune thresholds or template pool based on observed distribution and user behavior.

---

## Non-Goals (Phase 1)

- **Back-of-card emphasis**, tap-to-see tooltips, or any explicit UI affordance for viewing the game log.
- **Collection/Profile surfaces** — no "Top Games of 2024-25" browseable set, no profile flex, no shareable art.
- **Gamelog pack unlock** mechanics, task-system integration, or XP hooks.
- **Retroactive true career-high enrichment** from external sources (Basketball-Reference etc.). Phase 1 uses our 2-season dataset's max and frames it honestly.
- **Non-star cards** triggering any tier. Only the hand's star is evaluated.
- **Historic old-era games** being surfaced (we don't have their logs). Thresholds exist on paper for future-proofing but only mark games in our current data.

---

## Open Questions Deferred to Later Phases

These were raised and explicitly parked:

- **Collection location** — Profile tab vs new Collection tab. Revisit before Phase 3 when we know user engagement shape.
- **Gamelog pack unlock semantics** — "unlock more game logs" means more seasons? More players? Playoffs? TBD based on what users actually reach for.
- **Back-of-card habit loop specifics** — tooltip? One-time nudge? Answered from telemetry after Phase 1, not guessed.
- **True career-high enrichment** — manual curation of all-time personal bests for veterans, if the dataset-derived version feels misleading in practice.
