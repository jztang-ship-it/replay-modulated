# Slate v2 — design

**Date:** 2026-05-05
**Status:** Spec — not yet implemented
**Brainstorm:** 2026-05-03 → 2026-05-05 (multi-session)
**Implementation timing:** Post-beta. Beta ships on the current full-pool system; slate v2 rolls out behind per-sport feature flags after beta data informs calibration.

## Context

Beta is shipping on the existing system: full player pool (~500 basketball, ~700 baseball), straightforward random deal from the full set. A friend playing the beta build called it tedious. Diagnosis from the multi-session brainstorm: the loop is functional, but with a pool that big, every card feels random and forgettable. There is no daily ritual, no learnable surface, no scarcity, no recognition rate, no reason for a casual fan to come back tomorrow.

The brainstorm walked through several false starts (per-user content unlocks, curated popularity tiers) before landing on a gambling-native architecture: rotate the *world* daily, keep the *user* light. Same slate for everyone today, different slate tomorrow. No collection mechanic. No XP-gated player unlocks. The product stays a slot-machine-tempo instant-fantasy game; what changes is that today's slate is a knowable, daily-fresh thing.

## Goal

Add a daily rotating *slate* — a small, recognizable, sport-specific subset of the full player pool — that gates the **normal deal path only**. Same slate for every user globally each UTC day. Pool size sized as ~10× the sport's hand-slot count. Eligibility derived from career fantasy points (objective, self-refreshing, no curated popularity index). Rotating composition with always-present "anchors" (top by career FP). Existing surfaces (Top Games, extreme hands, daily-bonus selection) keep working; the bonus pool now reads from today's slate so bonus players are always drawable.

End state: avg sports fan opens the app, sees today's slate (anchors + bonus players + countdown), recognizes the names, plays a few hands knowing what universe they're in, and has a reason to come back tomorrow because the deck rotates.

### Phasing

- **v1 (this spec, first rollout):** standard daily rotation only. No themed days. The daily-fresh signal comes from the rotating composition itself — Wordle-style world rotation is sufficient on its own to create a daily ritual.
- **v2 phase-2 (future enhancement):** themed-day content layered on top once v1 validates. The infrastructure for themes (`getThemeForDate`, `getThemedEligibility`, `getThemeMetadata`) ships in v1 returning the default null/standard behavior, so phase 2 is a content + per-sport-override addition with no API reshaping.

## Non-goals

- Per-user content unlocks (collection mechanic, era-locked cards, level-gated player access). Explicitly rejected during brainstorm — wrong shape for a gambling-tempo product.
- A curated "recognition tier" or "popularity index." Rejected as subjective, fragile, maintenance-heavy. Career FP is the proxy.
- **Themed-day rollout in v1.** Phase 2 enhancement. Infrastructure ships in v1 returning default null/standard behavior; actual themed-day content + per-sport schedules layer in only after v1 validates.
- VIP / comps / membership tier system. Slate v2 leaves an *API hook* (a `userTier` parameter on `selectDailySlate`) but does not implement tier logic. Separate future spec.
- Tournaments / PvP / real-money. Slate v2 leaves a *stable API* (`getCachedSlate`) callable by future tournament code but does not implement any tournament concept. Separate future spec.
- Pulse / news aggregator / BBS. Deferred indefinitely; recommended replacement is gameplay-anchored UGC (share cards, big-hand ticker, friend ghosts) which will be its own brainstorm.
- Recalibrating salary cap, win-tier thresholds, or repeat-limit parameters at spec time. Spec mandates **post-rollout simulation** to derive these per sport. The spec pins the *requirement*, not the numbers.
- Touching the live beta build. All implementation lands behind per-sport feature flags, default OFF in production. Beta runs to completion on current behavior.
- Modal / blocking UI for the slate panel. The panel is a non-interrupting collapsible drawer. Users can always start a hand without touching it.
- User-facing copy describing the repeat limit. The limit is invisible; users feel variety, never see "limit" or "cap" language.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SportAdapter (per sport)                  │
│  + getCareerFP(playerId)        // sport-specific FP rule    │
│  + getEligiblePool(n=200)       // top N by career FP        │
│  + getAnchors(count=10)         // top N by career FP        │
│  + getThemedEligibility(theme)  // themed-day override       │
│  + getThemeForDate(date)        // sport-defined schedule    │
│  + getThemeMetadata(themeKey)   // display copy              │
│  + getExclusionList()           // small manual list         │
│  + config: slateSize, anchorCount, weightExponent            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  shared/utils/slateEligibility.ts                            │
│  resolveEligibility(adapter, date, themeKey?) → string[]     │
│  - Calls adapter.getEligiblePool() or themed variant         │
│  - Subtracts adapter.getExclusionList()                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  shared/utils/slateSelector.ts                               │
│  selectDailySlate(adapter, eligible, date, theme, config)    │
│   → string[]                                                  │
│  - Anchors always included (if eligible)                     │
│  - Remaining slots = weighted random draw, weight = career FP│
│  - Deterministic seed: hash("slate-{sport}-{date}-{theme}")  │
│  - Stable, identical for all users globally per UTC day      │
│                                                               │
│  getCachedSlate(adapter, date, theme?) → string[]            │
│  - Memoized per (sport, date, theme) for runtime perf        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  shared/utils/dealGate.ts                                    │
│  getDealPool(adapter, fullPool, options?)                    │
│  - featureFlags.slateV2[sport] OFF → return fullPool         │
│  - options.bypassSlate true → return fullPool                │
│  - else → fullPool ∩ today's slate                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  shared/utils/sessionRepeatLimit.ts                          │
│  Per-sport, in-memory, per-tab. Sliding 10-hand window.      │
│  filter(pool, config) → pool minus over-represented players  │
│  record(playerIds) → update window state                     │
│  Pool-floor relaxation: if filter shrinks pool below floor,  │
│  return pre-filter pool (limit relaxes, never crashes deal). │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  shared/components/TodaysSlatePanel.tsx                      │
│  Pre-game UI surface. Default: theme banner + anchors +      │
│  bonus players + countdown + "see full slate" toggle.        │
│  Sport-agnostic; per-sport wrapper passes a SlatePanelAdapter│
│  with sport-rendered CardThumb component.                    │
└─────────────────────────────────────────────────────────────┘
```

### What gets reused, modified, or removed

| File | Status | Treatment |
|---|---|---|
| `shared/utils/dailyRotation.ts` | Removed in cleanup commit post-flag-flip | Subsumed by slate selector. Deterministic-seed pattern moves into `slateSelector.ts`. Deletion happens ~2 weeks after both sports are at flag-ON in production with no rollback. |
| `shared/utils/dailyBonus.ts` | Modified, behind flag | Bonus pool input changes from "full eligible pool" to **"today's slate ∩ ORANGE/PURPLE/BLUE/GREEN tiers."** When flag is OFF, behavior unchanged. When ON, bonus players are guaranteed to be in today's slate (drawable). |
| `shared/utils/bonusPoolStore.ts` | Untouched | Storage layer, no changes. |
| `shared/utils/extremeGames.ts` | Untouched | Top Games surface continues to draw from the full pool by passing `bypassSlate: true` through the deal gate. |
| `shared/engagement/*` | Untouched | XP, daily tasks, CollectScreen all continue to operate. |
| Existing deal call site(s) | +3 lines | Wire `getDealPool` + `sessionRepeatLimit` into existing flow at the single integration point. Implementation plan must inventory all current deal call sites in step 1 and consolidate if more than one exists. |

### Sport-isolation invariant

No slate v2 state, cache, or hook may be cross-sport. All per-sport state is keyed on `adapter.sportKey`:

- Slate cache key: `${sportKey}|${dateKey}|${themeKey}`
- `sessionRepeatLimit` instances are independent per sport
- `useDailySlate` hook binds to the adapter passed in; basketball and baseball mount independently with no shared state
- Existing per-sport conventions (streak, personal best, leaderboard, bonus pool) untouched

This is enforced by tests (Section "Testing strategy" below).

## Eligibility + slate selection algorithm

### Career FP — the proxy for fame

Default implementation in `SportAdapter` base class:

```ts
getCareerFP(playerId: string): number {
  const logs = this.getLogsByPlayer(playerId);
  const currentYear = new Date().getUTCFullYear();
  let total = 0;
  for (const log of logs) {
    const fp = this.computeFantasyPoints(log.stats);
    const seasonAge = currentYear - log.season;
    const recencyWeight = seasonAge <= 1 ? 2.0 : 1.0;
    total += fp * recencyWeight;
  }
  return total;
}
```

Recent-bias (last 2 seasons × 2) amplifies current relevance while preserving all-time legends. Per-sport override allowed; e.g., a sport may weight playoff games higher when computing career FP. The exact name of the existing per-player log accessor (`getLogsByPlayer` vs another) gets aligned during the implementation plan; the spec assumes such an accessor exists or is added.

Career FP is chosen because:
- Already in the data; no scraping or external signal needed.
- Self-refreshing — new seasons add to career totals automatically.
- Cross-era valid — captures both current stars and historical legends.
- Honest — it's a numeric production proxy, not a claim about fame.

It is not a perfect fame proxy. It correlates well enough that weighted draw by career FP produces a slate that reads as "famous players, with occasional deep cuts" — the desired feel.

### Eligibility resolver — pure function

```ts
// shared/utils/slateEligibility.ts
export function resolveEligibility(
  adapter: SportAdapter,
  date: Date,
  themeKey?: string,
): string[] {
  const base = themeKey
    ? (adapter.getThemedEligibility(themeKey) ?? adapter.getEligiblePool())
    : adapter.getEligiblePool();
  const excluded = new Set(adapter.getExclusionList());
  return base.filter(id => !excluded.has(id));
}
```

`adapter.getEligiblePool()` returns the top-N by career FP. **Recommended N = 200** per sport. Drawing 50–60 from a pool of 200 produces meaningful day-to-day variance while keeping recognizable players dominant.

### Slate selector

```ts
// shared/utils/slateSelector.ts
export type SlateConfig = {
  slateSize: number;       // default = adapter.rosterSize × 10
  anchorCount: number;     // default = 10
  weightExponent: number;  // default = 1.0 (linear)
};

export function selectDailySlate(
  adapter: SportAdapter,
  eligible: string[],
  date: Date,
  themeKey: string | undefined,
  config: SlateConfig,
  userTier?: string,                    // reserved hook for future VIP/comps spec
): string[] {
  const eligibleSet = new Set(eligible);
  const anchors = adapter.getAnchors().filter(id => eligibleSet.has(id));
  const anchorTake = anchors.slice(0, config.anchorCount);
  const anchorSet = new Set(anchorTake);
  const remaining = eligible.filter(id => !anchorSet.has(id));
  const rotatingCount = config.slateSize - anchorTake.length;

  const dateKey = utcDateKey(date);
  const seed = hashStr(`slate-${adapter.sportKey}-${dateKey}-${themeKey ?? "std"}`);
  const rng = seededRng(seed);

  const weights = remaining.map(id =>
    Math.pow(adapter.getCareerFP(id), config.weightExponent)
  );
  const drawn = weightedSampleWithoutReplacement(remaining, weights, rotatingCount, rng);

  return [...anchorTake, ...drawn];
}
```

In plain English:
- **Anchors** are placed first, deterministically. Top N by career FP per the adapter; always in today's slate when eligible.
- **Rotating slots** are filled by **weighted random draw without replacement**, weight = career FP^exponent. Default linear (exponent 1.0): a player with 2× career FP is 2× as likely to be drawn.
- **Determinism** comes from the `(sport, date, theme)`-seeded RNG. UTC date key. Same triple → same slate, globally. (Fixes the local-time-vs-UTC inconsistency between current `dailyRotation.ts` and `dailyBonus.ts` by standardizing on UTC.)
- The `userTier` parameter exists as a reserved hook for the future VIP/comps spec. Today, it is ignored. Stable signature; future spec can branch eligibility on tier without breaking the API.

### Default `SlateConfig` per sport

```ts
export function defaultSlateConfig(adapter: SportAdapter): SlateConfig {
  return {
    slateSize: adapter.config.slateSize ?? adapter.rosterSize * 10,
    anchorCount: adapter.config.anchorCount ?? 10,
    weightExponent: adapter.config.weightExponent ?? 1.0,
  };
}
```

Yields:
- Basketball: slateSize 60 (6 hand slots × 10)
- Baseball: slateSize 50 (5 hand slots × 10)
- Anchors: 10 each
- Weight exponent: 1.0 each

All overridable per sport in `basketball/src/adapters/basketballConfig.ts` (and likewise for baseball) without touching shared/.

### Caching

`getCachedSlate(adapter, date, themeKey)` memoizes per `(sport, date, theme)` triple. Eligibility computation (sort top-200 by career FP) is O(N log N) on the full pool — done once per data refresh. Slate selection is O(slateSize × log(eligibility)) — done once per day per sport per theme. Hot-path cost is a Map lookup.

## SportAdapter contract additions

Five methods added to the `SportAdapter` base class with computed defaults; sports override only what they need.

```ts
// 1. Career FP
getCareerFP(playerId: string): number {
  // default: recent-biased sum of computed FP across all season logs
}

// 2. Top-N eligibility pool
getEligiblePool(n: number = 200): string[] {
  // default: top n by getCareerFP
}

// 3. Anchors
getAnchors(count: number = 10): string[] {
  // default: top count by getCareerFP
}

// 4. Themed-day eligibility (sport opts in by overriding)
getThemedEligibility(themeKey: string): string[] | null {
  // default: null (no themes supported)
}

// 5. Theme schedule (sport opts in by overriding)
getThemeForDate(date: Date): string | null {
  // default: null (no themed days ever)
}

// 6. Theme metadata for UI
getThemeMetadata(themeKey: string): { displayName: string; description: string; iconKey?: string } | null {
  // default: null
}

// 7. Manual exclusion list
getExclusionList(): string[] {
  // default: returns this.config.exclusionList ?? []
}
```

Optional `SportConfigShape` additions:

```ts
export interface SportConfigShape {
  // ... existing fields ...
  slateSize?: number;        // default = rosterSize × 10
  anchorCount?: number;      // default = 10
  weightExponent?: number;   // default = 1.0
  exclusionList?: string[];  // default = []
  themes?: Record<string, { displayName: string; description: string; iconKey?: string }>;
}
```

Each entry in `exclusionList` requires a comment explaining *why* the player is excluded (data integrity, retired mid-season, banned, etc.). Convention enforced by code review.

A new sport added later (e.g., `worldcup` if it adopts slate v2) implements zero overrides for default behavior; declare `slateSize` in config and the rest works. Themed days can be added incrementally as content is curated.

## Deal-gate integration + session repeat limit

### Deal gate — thin filter

```ts
// shared/utils/dealGate.ts
import { isSlateV2Enabled } from "../featureFlags";
import { getCachedSlate } from "./slateSelector";
import type { SportAdapter } from "../adapters/SportAdapter";
import type { PlayerCard } from "../types";

export type DealOptions = {
  bypassSlate?: boolean;
  date?: Date;
  themeKey?: string;
};

export function getDealPool(
  adapter: SportAdapter,
  fullPool: PlayerCard[],
  options: DealOptions = {},
): PlayerCard[] {
  if (!isSlateV2Enabled(adapter.sportKey)) return fullPool;
  if (options.bypassSlate) return fullPool;
  const slateIds = getCachedSlate(adapter, options.date ?? new Date(), options.themeKey);
  const slateSet = new Set(slateIds);
  return fullPool.filter(p => slateSet.has(p.basePlayerId));
}
```

Existing deal logic at the integration point changes from a direct `adapter.getPlayers()` reference to a call through `getDealPool`. Implementation plan inventories all current deal call sites in its first step; the spec mandates a single integration point post-implementation. Top Games / extreme hands explicitly opt out by passing `bypassSlate: true`.

All existing per-hand draw invariants (randomness, position validation, salary-cap enforcement, any other checks the current draw enforces) continue to operate untouched on the post-gate, post-repeat-limit pool. Slate v2 changes the eligible pool only.

### Session repeat limit — sliding window with relaxation

Renamed from "frequency cap" to avoid collision with the salary cap. The salary cap is **hard, sport-specific, and unchanged by this spec**; only its numeric value may move post-calibration.

```ts
// shared/utils/sessionRepeatLimit.ts
export type RepeatLimitConfig = {
  windowSize: number;        // last N hands tracked
  maxAppearances: number;    // cap per window
  minPoolFloor: number;      // relaxation threshold
};

export const DEFAULT_REPEAT_LIMIT: RepeatLimitConfig = {
  windowSize: 10,
  maxAppearances: 3,
  minPoolFloor: 12,          // adapter.rosterSize × 2 in practice
};

export class SessionRepeatLimit {
  private recentHands: string[][] = [];

  filter(pool: PlayerCard[], config: RepeatLimitConfig): PlayerCard[] {
    if (this.recentHands.length === 0) return pool;
    const counts = new Map<string, number>();
    for (const hand of this.recentHands) {
      for (const id of hand) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const saturated = new Set<string>();
    for (const [id, n] of counts) {
      if (n >= config.maxAppearances) saturated.add(id);
    }
    const filtered = pool.filter(p => !saturated.has(p.basePlayerId));
    if (filtered.length < config.minPoolFloor) return pool;  // pool-floor relaxation
    return filtered;
  }

  record(playerIds: string[]): void {
    this.recentHands.push([...playerIds]);
    while (this.recentHands.length > 10) this.recentHands.shift();
  }

  reset(): void {
    this.recentHands = [];
  }
}
```

State is in-memory only, per-sport, per-tab. Resets on reload. No localStorage, no Supabase persistence. Numerics (window size, max appearances, floor) are calibration outputs — Section "Post-rollout calibration" below.

**Repeat limit is invisible to users.** No user-facing copy mentions a "limit," "cap," "cooldown," or any system rule. Users perceive variety as a natural property of the slate, not as a constraint imposed by the game. The `repeat_limit_relaxed` analytics event is internal-only, used for tuning. If the implementation plan ever proposes user-facing copy that references the repeat limit (e.g., "you've seen this player a lot today"), spec review must reject it.

### Composition at the integration point

```ts
// In the deal call site, post-integration
const fullPool = adapter.getPlayers();
const slatePool = getDealPool(adapter, fullPool);
const cappedPool = repeatLimit.filter(slatePool, DEFAULT_REPEAT_LIMIT);
const drawn = drawN(cappedPool, handSize);                   // existing function
repeatLimit.record(drawn.map(c => c.basePlayerId));
```

Three lines added. Existing draw logic unchanged.

### Edge cases

| Scenario | Behavior |
|---|---|
| Slate ∩ full pool below `handSize × 2` | Log warning, fall back to full pool. Indicates eligibility config bug. |
| Repeat limit shrinks pool below `minPoolFloor` | Auto-relax: return pre-filter pool. Limit is a soft preference, not a hard guarantee. |
| Slate cache miss (date rolled over mid-session) | First call after rollover recomputes; subsequent calls hit cache. No user-visible glitch. |
| Feature flag toggled mid-session | New `getDealPool` calls reflect new flag immediately. In-flight hand uses the pool it was dealt with. |
| `bypassSlate: true` while flag is OFF | No-op (gate already returned full pool). Harmless. |
| Slate ID exists but player missing from current `fullPool` | Filter is `slate ∩ fullPool` — naturally drops missing players. No special handling needed. |

## Themed days (phase 2) + UI surface

### Phase 2: themed-day infrastructure pre-built, content deferred

Themed days are **not part of the v1 rollout**. They are a phase-2 enhancement that layers content on top once v1 validates. To keep phase 2 a pure content addition with no API reshaping, the *infrastructure* ships in v1 with default-null behavior:

- `SportAdapter.getThemeForDate(date)` — base default returns null (no themed days). v1 doesn't override.
- `SportAdapter.getThemedEligibility(themeKey)` — base default returns null (slate selector falls back to standard eligibility). v1 doesn't override.
- `SportAdapter.getThemeMetadata(themeKey)` — base default returns null. v1 doesn't override.
- `selectDailySlate(...)` — accepts the `themeKey` parameter; passes through `undefined` in v1.

In v1, `getThemeForDate` always returns null, every day's slate is the standard rotation, and `TodaysSlatePanel` does not render any themed-day banner.

In phase 2, sports populate `themes` config and override `getThemeForDate` to declare their schedule:

```ts
// EXAMPLE FOR PHASE 2 (NOT v1) — basketball/src/adapters/SportAdapter.ts
override getThemeForDate(date: Date): string | null {
  switch (date.getUTCDay()) {
    case 0: return "rookie-only";
    case 6: return "throwback-1990s";
    default: return null;
  }
}
```

```ts
// EXAMPLE FOR PHASE 2 (NOT v1) — basketball/src/adapters/basketballConfig.ts
themes: {
  "rookie-only": {
    displayName: "Rookie Slate",
    description: "Today's slate is rookie-year games only. Bright lights, raw talent.",
    iconKey: "rookie-cap",
  },
  "throwback-1990s": {
    displayName: "90s Throwback",
    description: "Iverson, MJ, Penny — today's deck is the 1990s.",
    iconKey: "vhs",
  },
}
```

Phase 2 is content + per-sport overrides only. Shared code does not change.

### `useDailySlate` hook

```ts
// shared/hooks/useDailySlate.ts
export function useDailySlate(adapter: SportAdapter) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const ms = getMsUntilNextBonusRotation();  // existing util in dailyBonus.ts
    const t = setTimeout(() => setNow(new Date()), ms + 100);
    return () => clearTimeout(t);
  }, [now]);

  const themeKey = useMemo(() => adapter.getThemeForDate(now), [adapter, now]);
  const slateIds = useMemo(
    () => getCachedSlate(adapter, now, themeKey ?? undefined),
    [adapter, now, themeKey],
  );

  const players = useMemo(() => {
    const anchorSet = new Set(adapter.getAnchors());
    return slateIds.map(id => {
      const player = adapter.getPlayerById(id);
      return {
        id,
        name: player?.name ?? id,
        tier: player?.tier ?? "WHITE",
        isAnchor: anchorSet.has(id),
      };
    });
  }, [adapter, slateIds]);

  return {
    players,
    themeKey,
    msUntilRotation: getMsUntilNextBonusRotation(now),
  };
}
```

Reuses the existing `getMsUntilNextBonusRotation` so daily-bonus rotation and slate rotation tick together at UTC midnight. Single mental model for users.

### `TodaysSlatePanel` UI surface

Sport-agnostic component following the established `LandingPage` / `GameView` adapter-slot pattern:

```tsx
// shared/components/TodaysSlatePanel.tsx
type SlatePanelAdapter = {
  themeMetadata: { displayName: string; description: string; iconKey?: string } | null;
  anchors: Array<{ id: string; name: string; tier: TierColor }>;
  bonusPlayers: Array<{ id: string; name: string; bonus: 5 | 10 | 20 }>;
  rotatingCount: number;
  msUntilRotation: number;
  CardThumb: React.FC<{ playerId: string; isAnchor: boolean }>;
  fullSlatePlayers: Array<{ id: string; name: string; tier: TierColor; isAnchor: boolean }>;
  onCardTap?: (playerId: string) => void;
};

export function TodaysSlatePanel({ adapter }: { adapter: SlatePanelAdapter }) {
  // Default content (always shown):
  // - Theme banner (if themeMetadata is non-null)
  // - Anchors section: ~10 always-present stars, badged
  // - Bonus players section: today's 3 bonus players (reads from existing dailyBonus)
  // - Stat line: "Plus N more players rotating in today's slate. Start a hand to discover them."
  // - Countdown to next UTC midnight rotation
  //
  // Expandable (default collapsed):
  // - "See full slate" toggle reveals the full N-player grid
}
```

Default content shows only what is **already not a surprise**: anchors are conceptually always present, bonus players are already exposed via the existing dailyBonus surface. The rotating periphery (~37 of 50 in basketball, ~30 of 40 in baseball after anchors and bonus) stays hidden by default to preserve slot-machine surprise per hand. Power users can expand the toggle for the full list — opt-in transparency, not default.

### Where the panel lives

Placement: **collapsible drawer / panel in the launch/landing area. Never a blocking modal.** Auto-*expanded* once per UTC day on first launch; collapsed by default on every subsequent visit that day. One-tap dismiss to collapse. No friction before play — users can always start a hand without interacting with the panel at all.

The "auto-expand once per day" is the entire ritual signal; nothing else interrupts the user. If beta data later shows users want stronger daily-ritual cues, plan can revisit. Initial bias is toward minimum visible friction, given beta feedback identified the loop as already feeling tedious — the slate panel must add interest, not add a step.

### Top Games / slate UX disambiguation

The slate gates the **normal deal path only**. Top Games and other extreme-hand surfaces draw from the full backend pool by passing `bypassSlate: true` through the deal gate. To prevent user confusion (e.g., a user thinking Top Games is showing a player not in today's slate is a bug), the UI must clearly distinguish:

- `TodaysSlatePanel` is labeled and described as **today's pool for normal hands**, not the universe of all available cards.
- Top Games / extreme-hand surfaces include explicit copy along the lines of: *"Top Games surface notable historical performances from the full player library — these are not limited by today's slate."* Exact copy refined during the implementation plan.

This disambiguation is mandatory; tests verify the copy exists.

### Sport wrappers

```tsx
// basketball/src/components/BasketballSlatePanel.tsx (~30 LoC)
export function BasketballSlatePanel() {
  const adapter = useBasketballAdapter();
  const slate = useDailySlate(adapter);
  const bonusPlayers = useDailyBonusPlayers(adapter);  // existing hook or built from existing util
  return (
    <TodaysSlatePanel adapter={{
      themeMetadata: adapter.getThemeMetadata(slate.themeKey ?? ""),
      anchors: slate.players.filter(p => p.isAnchor),
      bonusPlayers,
      rotatingCount: slate.players.length - slate.players.filter(p => p.isAnchor).length - bonusPlayers.length,
      msUntilRotation: slate.msUntilRotation,
      CardThumb: BasketballCardThumb,
      fullSlatePlayers: slate.players,
      onCardTap: handleCardTap,
    }} />
  );
}
```

Baseball wrapper analogous. Each sport's wrapper is ~30 LoC, pure data plumbing.

## Future-spec hooks

### VIP / comps tier system

Slate v2 leaves a single API hook: `selectDailySlate` accepts an optional `userTier` parameter. Today, the parameter is ignored. When the VIP/comps spec is written, it can branch slate eligibility on tier (e.g., "Gold-tier users see a 70-player slate," or tier-gated themed days) without breaking the API signature. No premature implementation; just a stable extension point.

### Tournaments / PvP / real-money

Slate is a pure, callable, parameterized function. `getCachedSlate(adapter, date, themeKey)` is the public API any future system can call:
- A tournament can pull "today's slate" the same way the user-facing deal does.
- A scheduled tournament can pull a specific date's slate deterministically (e.g., "Saturday's themed slate").
- A tournament-exclusive theme can be added by a sport adapter without disturbing the user-facing schedule.

Slate v2 does not import any tournament concept. It exposes a stable function tournaments can call. Compatible without coupling.

## Testing strategy

### Pure-function unit tests (vitest)

| Target | Verifies |
|---|---|
| `slateEligibility.resolveEligibility` | Themed override returns correct subset; unknown theme falls back to standard; exclusion list subtracted correctly. |
| `slateSelector.selectDailySlate` | Anchors always present when eligible; slate size matches config; weighted draw respects career FP weights statistically (10k iterations); same input → same output. |
| `slateSelector` determinism | Same `(sport, date, theme)` produces identical slate across invocations and across simulated different users. |
| `sessionRepeatLimit` | Repeats counted correctly; saturated players excluded once threshold hit; pool-floor relaxation kicks in when limit shrinks pool below floor. |
| `dealGate.getDealPool` | Flag OFF → returns full pool unchanged; flag ON → returns slate ∩ pool; `bypassSlate: true` → returns full pool regardless of flag. |
| Date-key utilities | UTC-correct, handles DST transitions, handles year boundary. |

### SportAdapter contract tests (per-sport)

```ts
// shared/adapters/__tests__/slateContract.test.ts
describe.each([basketballAdapter, baseballAdapter])(
  "SportAdapter slate contract: %s",
  (adapter) => {
    test("getCareerFP returns finite non-negative number for every player", () => { ... });
    test("getEligiblePool returns at least slateSize × 3 players", () => { ... });
    test("getAnchors returns exactly anchorCount IDs, all in eligibility pool", () => { ... });
    test("getThemedEligibility returns null or array of valid IDs", () => { ... });
    test("getExclusionList contains only valid player IDs", () => { ... });
    test("getThemeForDate is stable across a year of dates", () => { ... });
  }
);
```

This is the drift-prevention enforcement referenced in CLAUDE.md. Adding a new sport without correctly implementing the slate contract methods fails CI.

### Sport-isolation tests (first-class invariant)

```ts
test("basketball slate cache does not affect baseball slate cache", ...);
test("session repeat limit instances are independent per sport", ...);
test("switching active sport resets per-sport state cleanly", ...);
test("rendering basketball + baseball slate panels concurrently shows distinct slates", ...);
```

### Integration tests (deal-flow end-to-end)

- Flag OFF: deal pulls from full pool exactly as today. Existing test suite still passes (regression check).
- Flag ON: deal pulls from today's slate. Slate IDs verified against pool.
- Flag ON + Top Games path: bypasses slate, pulls from full pool.
- Flag ON, repeat-limit triggered: 11th hand of session has saturated stars excluded.
- Flag ON, themed-day **infrastructure** (phase-2 ready): when a fixture adapter's `getThemedEligibility` returns a non-null array, eligibility derives from that array. v1 production adapters return null, so this test runs against a stub. Verifies API stability for phase 2.

### UI smoke tests (`TodaysSlatePanel`)

- Renders themed banner when theme metadata is present.
- Renders empty/loading state gracefully when slate isn't ready.
- Anchor badge appears on anchor players, not on rotating players.
- Countdown updates as time progresses (mocked clock).
- "See full slate" toggle expands and collapses correctly.

## Post-rollout calibration

A required gate between flag-ON staging and flag-ON production. Per-sport. Spec does not pin numbers; spec mandates the calibration step that produces them.

```
For each sport (basketball, baseball, …):
  1. Extend shared/tools/runSimulator.ts with --slate-v2 flag.
  2. Run: npx ts-node shared/tools/runSimulator.ts <sport> 100000 --slate-v2
  3. Compute distributions:
     - Mean FP per hand (vs. current full-pool baseline)
     - 90th / 95th / 99th percentile FP per hand
     - Roster-cost distribution under current salary cap
     - Per-tier appearance frequency in slate
     - Bonus-player draw rate (must be >= 30%)
  4. Compare against current production baselines:
     - Mean FP shifts >= 10% → recalibrate win-tier thresholds (MVP, GOAT, etc.)
       to preserve current win-rate distribution.
     - Salary distribution drifts meaningfully → recalibrate salaryCap,
       salaryCapMin, tier thresholds. HARD CAP PRESERVED; only numeric
       values may change. Per sport.
     - Bonus-player draw rate < 30% → adjust eligibility N or weight
       exponent so bonus players show up reliably in the slate.
  5. Document calibrated values in adapter config + commit message.
  6. Save calibration report at docs/superpowers/calibration/
     <date>-<sport>-slate-v2.md.
  7. Repeat per sport. Do not assume basketball numbers transfer to baseball.
```

The salary cap is **always hard, never soft, never relaxed at runtime**. Calibration may move the numeric value per sport; the runtime behavior of `isValidRoster` is unchanged.

## Rollout sequence

| Phase | Flag state | User-visible |
|---|---|---|
| 0. Spec approval | n/a | None |
| 1. Implementation behind flag | Defined, OFF in all envs | None |
| 2. CI green | OFF | None |
| 3. Local QA | ON locally | None (local only) |
| 4. Staging | ON in staging only | None (prod still OFF) |
| 5. Per-sport calibration | ON in calibration env | None (prod still OFF) |
| 6. Beta runs on prod | OFF in prod | Current full-pool behavior |
| 7. Beta concludes, data analyzed | OFF in prod | Current behavior |
| 8. Production rollout, basketball | ON for basketball, OFF for baseball | Basketball: slate v2; baseball: unchanged |
| 9. Production rollout, baseball | ON for both | Both sports on slate v2 |
| 10. Cleanup commit | n/a | Old code removed; behavior identical to phase 9 |

Phases 8 and 9 are deliberately staged. Basketball rolls out first; baseball follows ~1–2 weeks later after basketball is stable. Caps blast radius if slate v2 has an issue calibration didn't catch.

**Football and any future sport** follow the same per-sport flag-flip pattern as a phase 8.x: independent calibration run, independent flag (`VITE_FEATURE_SLATE_V2_FOOTBALL=true`), independent rollout window. Because the feature flag check is dynamic per sportKey (see Feature Flag section), no code change in `featureFlags.ts` is required to onboard football — only its env var and its adapter implementation.

## Feature flag

The flag check is **dynamic per sportKey**, not a hardcoded record. Adding a new sport (e.g., football) requires only setting the corresponding env var; no code change in `featureFlags.ts`:

```ts
// shared/featureFlags.ts (extended)
export const featureFlags = {
  topGames: /* existing */,
};

/**
 * Per-sport slate v2 enablement.
 * Reads VITE_FEATURE_SLATE_V2_<SPORTKEY> at runtime.
 * Default OFF for any sport whose env var is unset or not "true".
 *
 * Examples:
 *   VITE_FEATURE_SLATE_V2_BASKETBALL=true
 *   VITE_FEATURE_SLATE_V2_BASEBALL=false
 *   VITE_FEATURE_SLATE_V2_FOOTBALL=false   (works as soon as football ships, no code change)
 */
export function isSlateV2Enabled(sportKey: string): boolean {
  if (typeof import.meta === "undefined") return false;
  const envKey = `VITE_FEATURE_SLATE_V2_${sportKey.toUpperCase()}`;
  return ((import.meta as any).env?.[envKey] === "true");
}
```

`dealGate` and `useDailySlate` consult `isSlateV2Enabled(adapter.sportKey)`. Per-sport granularity supports the staged rollout in Section "Rollout sequence." Default OFF in production. **Extensible to football and any future sport without modifying `featureFlags.ts`.**

## Observability

Existing analytics already track `hand_won`, `hand_lost`, `streak_*`, `multiplier_selected`, `task_completed`. Slate v2 adds:

- `slate_panel_opened` — user viewed today's slate
- `slate_full_view_expanded` — user expanded the full-50 list
- `slate_themed_day_seen` — engagement on themed days
- `slate_player_drawn` — per-player draw frequency (sampled, not per-event)
- `repeat_limit_relaxed` — fires when frequency limit relaxes (signals tuning needed)

Pre/post-rollout dashboards: mean FP per hand, win-rate per tier, Day-1/Day-7/Day-30 retention, hands per session, panel engagement rate.

## Rollback

```
1. Flip per-sport flag OFF in Vercel env vars.
2. Wait for next deploy / cache flush (~5 min).
3. Verify deal-flow returns full pool (server logs).
4. Optional: post-mortem.
5. Fix, re-test, re-roll out behind flag.
```

No DB rollback. No code revert needed. The flag IS the rollback.

## Open decisions deferred to implementation plan

- Exact name/signature of the existing per-player log accessor (`getLogsByPlayer` vs. `getLogsByKey` vs. other) — alignment during plan.
- Single integration point inventory — plan step 1 enumerates current deal call sites; if more than one, plan consolidates first.
- `TodaysSlatePanel` placement — default proposed (dedicated landing-area panel, auto-shown once per UTC day); plan refines based on visual mock review.
- Basketball + baseball initial themed-day schedules — phase-2 work, not part of v1. v1 ships with `getThemeForDate` returning null on every adapter.
- Basketball + baseball initial exclusion lists — content; populated during plan based on data audit.
- Shared RNG utilities — `hashStr` and `seededRng` are currently duplicated in `dailyRotation.ts` and `dailyBonus.ts`. Plan step 2 hoists them to `shared/utils/seededRng.ts` and updates both call sites + the new slate selector to consume the shared version.
- `weightedSampleWithoutReplacement(items, weights, count, rng)` — new helper required for the slate selector. Plan implements alongside slate selector with its own unit tests covering bias direction, edge cases (zero weights, count > items.length), and determinism.
- `utcDateKey(date)` shared utility — current `getDailyBonusDateKey` in `dailyBonus.ts` does this. Plan either renames/exposes that function or extracts a shared helper; slate selector uses the shared version.
- Player-by-id lookup on adapter — illustrative `adapter.getPlayerById(id)` in `useDailySlate` may need to be added to the `SportAdapter` base class if not already present. Plan verifies and adds if missing.
- Wrapper hook names in the `BasketballSlatePanel` / `BaseballSlatePanel` examples (`useBasketballAdapter`, `useDailyBonusPlayers`) are illustrative. Plan uses whichever existing hooks/singletons each sport's wrappers already follow.

## Effort

| Bucket | LoC | Time |
|---|---|---|
| Pure logic (eligibility, selector, deal gate, repeat limit, themed-day registry) | ~400 | 4–6 days |
| SportAdapter additions (base + per-sport overrides where needed) | ~150 | 2–3 days |
| UI (`TodaysSlatePanel` + per-sport wrappers + `useDailySlate` hook) | ~280 | 4–6 days |
| Tests (unit + contract + isolation + integration + smoke) | ~400 | 4–6 days |
| Simulator extension + calibration tooling | ~150 | 2–3 days |
| Per-sport calibration runs + tuning | n/a | 1–2 days per sport |
| Docs + adapter config tweaks | ~50 | 1 day |
| **Total** | **~1,400 LoC** | **~3 weeks engineering + ~1 week per sport calibration** |
