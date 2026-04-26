# Reveal Lifecycle Design

**Date:** 2026-04-25
**Status:** Draft — design approved, implementation pending
**Related:** Top Games (`2026-04-23-top-games-design.md`)

## Summary

Sport-agnostic orchestrator for the reveal sequence shared across basketball, baseball, world cup, and any future sport. Codifies a clear pre-reveal / post-reveal separator and a two-layer model (card-level → team-level) so that all current and future animations land in a known order, at known offsets, with no overlap between layers.

This is the **authoritative source** for reveal-time animation timing. Future tweaks (top-game visual polish, badge variants, new effects) register handlers against the orchestrator's phase events rather than scheduling their own timers in component code.

## Motivation

Today, reveal-time animation logic is scattered:

- `basketball/src/views/GameView.tsx` owns spring/anchor coordination via `springHasFiredRef`, `frozenBarFpRef`, and a `gameState` enum.
- `shared/components/CardFront.tsx` owns per-card timing via `rollComplete`, `displayedFp`, `isRolling`, `fpRevealed`, `topGameThudFired`.
- New effects (top-game stamp + thud, polish work coming next) bolt their own timers onto these states.
- Baseball will need the same orchestration but currently has no shared abstraction to consume.

This causes:

1. Animations creeping into the wrong layer (e.g. tier-bar updates leaking into the per-card cascade on the anchor card).
2. Timing drift as new effects are added — each developer eyeballs offsets independently.
3. Sport-specific code re-implementing the same orchestration per sport.

The lifecycle spec consolidates the contract.

## Concepts

### The separator

A card transitions from pre-reveal to post-reveal at the instant **FP roll begins**.

- **Pre-reveal:** card hidden, flip animation, color blast, shake.
- **Separator instant:** trigger event `startCardReveal(cardId)` → phase becomes `card.value-rolling`.
- **Post-reveal:** all phases listed below.

The flip, color blast, and shake are **part of pre-reveal** and are NOT governed by the lifecycle orchestrator. They remain component-local and can be tuned independently. The lifecycle starts when value math begins.

### Two-layer model

Every reveal cascade has two layers. The relationship between them depends on whether the card is the anchor:

**Layer 1 — Card level (individual achievement):**
Fires once per card revealed. Contains everything tied to THIS player's individual contribution: FP roll-up, salary roll-down, badges, fire, top-game stamp + thud.

**Layer 2 — Team level (collective result):**
Fires once per hand, only after the ANCHOR card's Layer 1 fully completes. Contains everything tied to the TEAM result: tier bar spring, tier panel land, commentary.

For non-anchor cards (cards 1 through N-1):

- Layer 1 runs concurrently with the per-card tier bar increment.
- Card cascade ends at `card.complete`; no Layer 2 fires.

For the anchor card (card N):

- Layer 1 runs first, with tier bar **frozen** (no per-card tier increment during anchor's value-roll).
- Hard separator gap (~250ms default) after `card.complete`.
- Layer 2 fires: tier spring → panel land → commentary.

**The hard separator is a feature, not a bug.** Layer 2 is the team result and deserves its own beat. Even when Layer 1 contains a top-game celebration that's visually larger than Layer 2, the two never overlap.

### Anchor detection

The anchor is the **last card** in the reveal sequence. The orchestrator tracks card count per hand and marks the final card as anchor.

Sport-agnostic: each sport passes its card count when initializing the orchestrator (basketball: 6, baseball: defined by baseball's GameView). The orchestrator does the math.

## Phase definitions

### Per-card phases (Layer 1)

| Phase | Fires when | Contains |
|---|---|---|
| `pre-reveal` | card dealt, awaiting trigger | flip, color blast, shake (terminal pre-orchestrator phase — NOT orchestrator-controlled) |
| `card.value-rolling` | separator instant (user reveals card) | FP roll-up + salary roll-down concurrent (~450ms). Non-anchor: tier bar increment also concurrent. Anchor: tier bar frozen. |
| `card.effects-mounting` | `card.value-rolling` complete | badges, fire, top-game stamp + thud + recoil. Effects mount in sport-specified order, staggered ~80ms each. |
| `card.complete` | all card-level animations done | Terminal for non-anchor cards. For anchor: triggers the hard separator gap before Layer 2. |

### Per-hand phases (Layer 2 — anchor only)

| Phase | Fires when | Contains |
|---|---|---|
| `layer-2.spring` | anchor's `card.complete` + 250ms separator gap | Tier bar spring (sweeping motion adding anchor's FP to running total) |
| `layer-2.panel` | spring complete | Tier panel land (win/lose result reveal) |
| `layer-2.commentary` | panel land complete | Commentary appears |
| `layer-2.complete` | commentary fully shown | Terminal — ready for next hand |

### Timing defaults

| Beat | Default | Rationale |
|---|---|---|
| Value-rolling duration | 450ms | Existing FP roll duration |
| Effect stagger | 80ms between effects | Visual breathing room; eye registers each as separate beat |
| Hard separator gap (anchor only) | 250ms | Beat of breath between Layer 1 and Layer 2 — not zero (would feel rushed), not lingering (would feel dead) |
| Spring duration | inherit existing | Don't change established spring physics |
| Panel land | inherit existing | |
| Commentary appearance | inherit existing | |

These are sport-overridable defaults. The orchestrator exposes them as configuration; sports can tune for their own pacing if needed.

## Architecture

### File layout

```
shared/lifecycle/
  RevealOrchestrator.ts       # central class
  useRevealPhase.ts           # hook for components
  types.ts                    # phase enums, payload types
  __tests__/
    RevealOrchestrator.test.ts
    useRevealPhase.test.ts
```

### Phase enum

```typescript
export type RevealPhase =
  | 'pre-reveal'
  | 'card.value-rolling'
  | 'card.effects-mounting'
  | 'card.complete'
  | 'layer-2.spring'
  | 'layer-2.panel'
  | 'layer-2.commentary'
  | 'layer-2.complete';

export interface PhasePayload {
  phase: RevealPhase;
  cardId: string | null;   // null for layer-2 phases (team-level)
  isAnchor: boolean;        // meaningful only on per-card phases
  handId: string;
}
```

### Orchestrator API

```typescript
export class RevealOrchestrator {
  constructor(config: {
    handId: string;
    cardCount: number;
    timing?: Partial<TimingDefaults>;
  });

  // Lifecycle control (called by sport implementation)
  startCardReveal(cardId: string): void;          // pre-reveal → card.value-rolling
  completeCardValueRoll(cardId: string): void;    // → card.effects-mounting
  completeCardEffects(cardId: string): void;      // → card.complete (and Layer 2 if anchor)
  completeLayerTwoBeat(beat: 'spring' | 'panel' | 'commentary'): void;

  // Subscriptions
  on(phase: RevealPhase, handler: (payload: PhasePayload) => void): () => void;

  // Queries
  getCurrentPhase(cardId?: string): RevealPhase | null;
  isAnchor(cardId: string): boolean;

  // Lifecycle
  destroy(): void;
}
```

### Component hook

```typescript
export function useRevealPhase(cardId?: string): {
  phase: RevealPhase | null;
  isAnchor: boolean;
  // Convenience flags
  isValueRolling: boolean;
  isEffectsMounting: boolean;
  isLayerTwoActive: boolean;
};
```

### Sport implementation pattern

```typescript
// In basketball/src/views/GameView.tsx
const orchestrator = useRevealOrchestrator({
  handId: currentHandId,
  cardCount: 6,
});

// Per-card components consume phase via hook
function CardSlot({ cardId }: Props) {
  const { phase, isAnchor } = useRevealPhase(cardId);
  // FP roll fires when phase === 'card.value-rolling'
  // Effects mount when phase === 'card.effects-mounting'
}

// Layer 2 components subscribe to team-level phases
function TierGauge() {
  const { isLayerTwoActive } = useRevealPhase();
  // Spring animates only when isLayerTwoActive === true
}
```

### Sport-agnostic boundary

What lives in `shared/lifecycle/` (sport-agnostic):

- Phase enum and transition rules
- Two-layer model (anchor detection, hard separator gap)
- Phase payload structure
- Default timings
- The RevealOrchestrator class itself
- The useRevealPhase hook

What sport implementations provide:

- Card count per hand
- Value calculators (FP, salary)
- Effect components (fire, badges, top-game stamp)
- The ordered set of effects that fire at `card.effects-mounting`
- Layer 2 components (tier bar, panel)
- Theme / styling

## Migration plan

This spec describes the END STATE. Migration happens as a sequence of small, independently shippable PRs:

1. **Scaffold** — create `shared/lifecycle/` files. No consumers yet, no behavior change.
2. **Wrap basketball reveals** — instantiate the orchestrator in `basketball/src/views/GameView.tsx`. Existing state (`springHasFiredRef`, `frozenBarFpRef`) STAYS but starts being driven by orchestrator events. `CardFront`'s `rollComplete` becomes orchestrator-emitted rather than self-managed.
3. **Wire baseball** — add the orchestrator to baseball's GameView; baseball gets the same phase contract for free.
4. **Migrate top-game polish (separate parallel branch)** — full-card flash, sibling card dim, glitter drift register handlers on `card.effects-mounting` instead of bolting onto the existing thud timer.
5. **Cleanup** — remove the now-redundant ad-hoc state in CardFront/GameView that's superseded by orchestrator.

Each PR is independently reviewable and shippable.

## Out of scope (for this spec)

- **Pre-reveal animations** — flip, color blast, shake stay component-local. Lifecycle starts at the separator.
- **Hand resolution and game session state** — `gameState === "DEALING" | "HOLD" | "DRAWING"` are macro game phases unrelated to reveal animation timing.
- **Sound design content** — sounds hook into phase events, but their actual audio content (synthesized vs sourced, mix levels) is a separate concern.
- **Top-game visual polish details** — full-card flash, sibling card dim, glitter drift are designed in a separate spec; this spec only ensures they have a clean place to register.
- **FTUE / onboarding flow** — independent of reveal lifecycle.

## Test plan

### Unit tests (`shared/lifecycle/__tests__/`)

- Phase transitions fire in expected order for a non-anchor card: `pre-reveal` → `card.value-rolling` → `card.effects-mounting` → `card.complete` (terminal).
- Phase transitions fire for anchor card: per-card phases + 250ms separator + `layer-2.spring` → `layer-2.panel` → `layer-2.commentary` → `layer-2.complete`.
- Non-anchor card NEVER triggers any `layer-2.*` phase.
- Multiple cards can be in different phases simultaneously (e.g. card 1 in `effects-mounting` while card 2 starts `value-rolling`).
- `on(phase, handler)` returns an unsubscribe function that actually unsubscribes.
- `destroy()` cancels pending timers and detaches all subscriptions.
- Sport-overridden timings take effect.

### Integration tests

- Full basketball 6-card reveal: orchestrator fires 6 × Layer 1 phase sequences + 1 × Layer 2 sequence; total duration matches budget.
- State at each phase boundary matches snapshot expectations.
- Same orchestrator instantiated for baseball (different card count) produces correct anchor detection.

### Visual / manual QA

- Side-by-side comparison: pre-migration basketball reveal vs orchestrator-driven reveal — visually identical.
- Stopwatch verification of the 250ms separator gap on the anchor card.
- Cross-sport smoke: basketball + baseball reveals both feel coherent under the same orchestrator.

## Open questions (deferred to implementation phase)

- Exact API for sport-specific effect ordering — enum-based registration vs ordered array prop?
- Should the orchestrator survive across hands (one instance per session) or be torn down + recreated per hand?
- Error recovery — if a sport implementation never calls `completeCardEffects()`, timeout fallback or stuck phase?
- TypeScript — strict generic over sport, or sport-untyped?

These are intentionally deferred. They're implementation-level choices that don't change the design contract.

## References

- Top Games design: `docs/superpowers/specs/2026-04-23-top-games-design.md`
- Existing anchor logic: `basketball/src/views/GameView.tsx` — `springHasFiredRef`, `frozenBarFpRef`, lines ~830-1190
- Existing per-card state: `shared/components/CardFront.tsx` — `rollComplete`, `displayedFp`, lines ~313-417
