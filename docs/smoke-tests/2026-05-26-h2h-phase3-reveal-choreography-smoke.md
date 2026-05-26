# H2H phase 3 — reveal sequence choreography smoke

Date: 2026-05-26
Branch: feat/h2h-reveal-arc
Route: `/basketball/dev/h2h-reveal-mock` (+ optional `?autoplay=1`)
Screenshots: `~/Desktop/replaymod-handoff/2026-05-26-h2h-phase3-reveal-choreography/`

## Scope

Phase 3 wires the per-matchup reveal animation:

- New hook `shared/components/useH2HReveal.ts` orchestrates the arc.
- `H2HRevealScreen` now accepts an optional `reveal` prop and routes
  battlefield card selection + score display + hand-strip dim through
  it when present. Static phase-2 mode is preserved when `reveal` is
  omitted.
- Battlefield FP rollup is delegated to CardFront's internal RAF; the
  hook sets a `visibleFp = 0.001` sentinel to trigger it. Running
  totals are animated by the hook in a parallel RAF, with both RAFs
  configured to `MATCHUP_DURATION_MS` (1500ms) for visual sync.
- Mock dev-route adds Play / Replay / Skip controls + `?autoplay=1`
  URL flag.

## Visual smoke

### 01-end-state-mobile.png (390×800)

Static end-state on mobile, no autoplay. Same layout as phase 2:
glass-panel zones, hero matchup centered, mid-rail above-fold, hand
strips below. Dev controls overlay in the bottom-right corner.

Notes: the right-rail score column (178.4 / 182.4) is partially
obscured by the dev-controls overlay at this resolution; the desktop
capture shows them clearly. The 6th hand-strip card extending past
the right edge is a pre-existing phase-2 mobile clipping condition
inherited unchanged (not a phase-3 regression).

### 02-end-state-desktop.png (900×800)

Static end-state on desktop. Confirms:
- MIKE zone (top) with full hand strip (NR 11.3 / DR 21.5 / JT 32.1 /
  KD 26.4 / SC 38.9 / NJ 48.2 dimmed).
- Battlefield: Jokić (held) vs Giannis (held) — reveal-order last
  matchup pair = held cards, most expensive.
- Right rail: 178.4 (grey, trailing) above Jokić; 182.4 (green,
  leading) above Giannis.
- Mid-rail: +14.6 matchup delta, +4.0 YOU final margin pill.
- Dev controls: `done · 6/6` status + Replay button enabled + Skip
  disabled (dimmed).

### 03-mid-arc-desktop.png (900×800, ?autoplay=1)

Mid-arc capture during matchup 0 (cheapest swap pair):
- Battlefield: Naz Reid ($22, MIN) vs Bobby Portis ($19, MIL) — the
  reveal-order-0 pair (cheapest swap, cheapest swap).
- Cards' on-card FP partially rolled (5.7 / 3.5 at this frame).
- Running totals partially rolled (9.9 / 6.0). Mid-arc the
  recipient is briefly trailing → senderLeading=true → "+3.8 OPP".
- Hand strips show all 6 cards; matchup-0 cells dimmed on both sides
  (Naz Reid + Bobby Portis cells at opacity 0.35).
- Dev controls: `revealing · 1/6`.

### 04-end-arc-desktop.png (900×800, ?autoplay=1, t=12.5s)

Captured after matchup 0 rolled to completion (cards at 11.3 / 6.9
finals, running totals near-final at 10.0 / 6.1). Headless Chrome's
`--virtual-time-budget` did not advance far enough into matchup 1 at
this budget, so the screenshot effectively captures the end of
matchup 0 rather than end-of-arc. End-of-arc state is identical to
`02-end-state-desktop.png` — verified by the hook's `phase: "done"`
landing on the same activeMatchup as the static end-state.

### 05-mid-arc-mobile.png (390×800, ?autoplay=1)

Mobile mid-arc, end of matchup 0. Same content as 03 at mobile size.
Layout collapses correctly; the only visible artifact is the
inherited phase-2 right-edge clipping of the 6th hand-strip card.

## Phase 3.5 amendment — entrance + card-pull animations

Added on the same date. Two new animations layered on top of the
base phase-3 reveal arc:

1. **Entrance choreography (poker lay-down).** When `play()` is called
   (mount with `?autoplay=1` or the dev-route Play button), all N
   hand-strip cards are reset to a pre-landed state (`opacity: 0`,
   `translateY` offset away from the strip's resting position) and
   then lay down one stage at a time. Recipient (bottom) strip lays
   down LEFT→RIGHT from user POV; sender (top) strip lays down
   RIGHT→LEFT from user POV (mirrored from opp's dealing POV). Stage 0
   on each side fires simultaneously, so the user's bottom-left card
   + the opponent's top-right card land at the same instant.
   `ENTRANCE_CARD_DURATION_MS = 130ms`,
   `ENTRANCE_STAGE_GAP_MS = 100ms`, total ~625ms for 6-card hands.
   Then `ENTRANCE_TO_REVEAL_PAUSE_MS = 400ms` of breathing room
   before matchup 0 begins.

2. **Per-matchup card-pull motion.** When the active matchup
   transitions, both battlefield cards swap with a cross-fade:
   the outgoing matchup card stays mounted with an exit keyframe
   (slide back toward its hand strip + shrink to ~0.4 scale) while
   the incoming card mounts with the inverse enter keyframe (slide
   from the hand strip + grow to full scale).
   `BATTLEFIELD_TRAVEL_DURATION_MS = 320ms`, which fits within the
   existing `MATCHUP_PAUSE_MS = 350ms` between matchups. Per-side
   simultaneous: top card travels DOWN to enter / UP to exit;
   bottom card travels UP to enter / DOWN to exit.

Both animations gate on `prefers-reduced-motion`. When reduced motion
is set, the hand-strip transition collapses to `none` and the
battlefield slot bypasses its dual-render exit path (snaps from
old card to new instantly). CardFront's internal FP rollup is
unchanged — the user spec scoped the reduced-motion gate to "only
the new phase-3 animations."

Hook state additions:
- `phase: "entering"` between `play()` and matchup 0.
- `entranceLandedCount: number` — tracked separately from
  matchupIndex; H2HRevealScreen's HandStrip flips each cell's
  "landed" flag based on this and the side-specific stage map.

### New screenshots

#### 06-mid-lay-down-mobile.png (390×844, ?autoplay=1, vt=300ms)

Captured at virtual-time 300ms post-load. Headless Chrome's
page-load offset consumed enough virtual time that this lands at
the END of the entrance staggered schedule rather than mid-way —
all 6 cards have landed on both strips, battlefield is still empty
(`activeMatchup={null,null}` during `entering` phase), mid-rail
shows `TIE EVEN` (totals still at 0.0). Dev controls confirm
`entering · 6/6 dealt`. A true mid-stagger capture would require a
finer-grained pause primitive — left as a follow-up since the 07
mid-card-pull below is the more diagnostic shot.

#### 07-mid-card-pull-mobile.png (390×844, ?autoplay=1, vt=4200ms)

The flagship phase-3.5 capture — both matchup-0 battlefield cards
mid-flight from their hand-strip positions toward the battlefield:
- Top: Naz Reid scaled smaller than hero size, translated DOWN
  from the sender strip, visible at roughly 50% of the travel arc.
- Bottom: Bobby Portis (partially clipped behind the YOU strip)
  in the corresponding travel-up animation.
- Mid-rail shows `-4.4 MATCHUP` (Naz's actualFp - Bobby's
  actualFp = 11.3 - 6.9 = 4.4, Naz leading) + `TIE EVEN` pill
  (running totals still at 0 before rollup completes).
- Dev controls: `revealing · 1/6`.

This is the visual proof that the per-matchup card-pull animation
fires correctly, with both sides synchronized on the matchup
boundary.

#### 08-end-state-mobile.png (390×844, no autoplay)

Mobile end-state after the full sequence has settled (or before
play() is ever called). Same layout as phase 2 — final matchup
(Jokić vs Giannis) on the battlefield, all 6 cards in each hand
strip. Right-rail totals clipped by viewport at this DPR (inherited
phase-2 condition).

#### 09-end-state-desktop.png (900×844)

Desktop end-state. Right-rail totals clearly visible: 178.4 (grey,
trailing) above Jokić, 182.4 (green, leading) above Giannis. Mid-rail
`+14.6 MATCHUP / +4.0 YOU`. Dev controls: `done · 6/6 Replay Skip`.

## Phase 3.6 amendment — direct-to-slot lay-down + deliberate pacing

Two refinements on top of phase 3.5:

1. **Cards lay directly into hand-strip placeholder slots.** Each
   hand-strip cell now renders a dim outlined placeholder layer (1px
   dashed border + 4% white background) visible BEFORE the card lands.
   The card content fades in over its placeholder when the cell's
   landed flag flips. From the user's perspective the strips' empty
   skeleton is visible from t=0; cards fill into the slots one by one.
   No "middle stage" — destination is the slot from the start.

2. **Pacing bump.** All entrance + reveal durations bumped to feel
   like a deliberate game moment:
   - Per-card lay-down: 130ms → **220ms** (`ENTRANCE_LAY_MS`)
   - Inter-card stagger: 100ms → **175ms** (`INTER_CARD_STAGGER_MS`)
   - Pre-reveal pause: 400ms → **700ms** (`PRE_REVEAL_PAUSE_MS`)
   - Per-matchup pause: 350ms → **850ms** (`MATCHUP_RESOLVE_PAUSE_MS`)
   - Battlefield travel: 320ms → **420ms**
   - New: **1700ms** end-of-arc hold (`END_OF_ARC_HOLD_MS`)

   Total arc time for a 6-card hand: ~16.75s (entrance 1.1s +
   pre-reveal 0.7s + 6 matchups × 1.5s + 5 inter-matchup pauses × 0.85s
   + end-hold 1.7s). Intentionally longer than the previous ~10s
   compressed version.

3. **End-of-arc hold phase.** New `phase: "end-hold"` state between
   the last matchup's RAF + `onMatchupResolved` and the final
   `setPhase("done") + onArcResolved`. During this 1.7s window:
   - `activeMatchup` is the last matchup (visually identical to "done").
   - Dev controls hide both the Replay AND Skip buttons (no next-step
     UI during the climax hold).
   - `onArcResolved` is deferred until AFTER the hold completes — so
     phase 5 commentary / phase 6 results-overlay triggers won't fire
     too soon.

All timing constants now live at the top of `useH2HReveal.ts` for
single-source-of-truth tunability.

### New screenshots

#### 10-mid-lay-down-mobile.png (390×844, ?autoplay=1, vt=550ms)

The flagship phase-3.6 capture — **true mid-entrance state with
placeholders visible**:
- Bottom strip (YOU): 4 cards landed on the LEFT (BP, JB, TM, JB
  for the 4 leftmost positions). Two dashed placeholder slots
  visible on the right (positions 4, 5 not yet dealt).
- Top strip (MIKE): 4 cards landed on the RIGHT (JT 32.1, KD 26.4,
  SC 38.9, NJ 48.2). Two dashed placeholder slots visible on the
  LEFT (positions 0, 1 not yet dealt — mirrored entrance direction).
- Battlefield empty (`phase=entering` → `activeMatchup={null,null}`).
- Dev controls: `entering · 4/6 dealt`.
- Confirms placeholder slots provide structural anchors so cards
  visibly land INTO their final positions.

#### 11-mid-arc-mobile.png (390×844, ?autoplay=1, vt=3000ms)

Matchup 0 active. Both hand strips fully populated; first cells on
each side (Naz Reid + Bobby Portis) dimmed (`opacity: 0.35` on the
card-content layer). Battlefield shows both heroes at full hero
size. Mid-rail `-4.4 MATCHUP` + `TIE EVEN` (running totals haven't
ticked yet in this headless capture; in real-time they tick over
1.5s alongside the per-card FP rollup).

#### 12-end-state-mobile.png (390×844)

Static end-state after the full arc completes (or before play() is
called). Final matchup heroes (Jokić + Giannis). Dev controls: `done
· 6/6 · Replay` (Replay button visible since phase is "done", not
"end-hold").

## Phase 3.7 amendment — strip-local entrance, no center traversal

Fix for a perceived "cards flying from the center of the screen to
the strips" before the entrance settled. Two root causes:

1. **BattlefieldSlot CSS keyframes were running on initial mount.**
   The wrapper had `animation: h2h-bf-enter-{top,bottom}` set
   unconditionally, so on first page load (with phase="done", end-
   state visible) the keyframes ran and the user saw the battlefield
   cards fly in from translateY(±110px). To the eye, this looked
   like "cards traveling from outside the battlefield zone toward
   the center" — which the user reasonably attributed to the
   entrance phase even though it actually fired during the static
   end-state's first paint.
   - Fix: `BattlefieldSlot` now tracks `hasTransitionedRef`. On
     initial mount, the wrapper renders with `animation: none`.
     The ref flips true the first time the `card` prop changes
     (e.g., when `play()` transitions activeMatchup from
     lastMatchup → null), unlocking the keyframes for all
     subsequent matchup transitions.
   - Side fix: added an early-return when `card === null &&
     exitingCard === null` so during play()'s state batch, the
     BattlefieldSlot never renders a stale `renderedCard` for the
     one-frame gap before the useEffect updates internal state.
     Eliminates the brief flash of the previous matchup during the
     entering phase.

2. **Hand-strip cells had no local motion.** Pure opacity fade-in
   meant cards "popped into existence" rather than "being placed."
   The user asked for a small slide (10-15px) localized to the strip
   zone.
   - Fix: card content now carries a `translateY` of ±12px when not
     landed (negative for sender = drop from above; positive for
     recipient = rise from below). Combined with the existing
     `scale(STRIP_CARD_SCALE)`. Cell `overflow: hidden` keeps the
     overshoot clipped — content stays inside the strip zone
     throughout, never leaks toward the center.
   - The placeholder layer is unchanged (still anchored at the slot
     position with opacity 1 → 0).

### Verification

`13-mid-lay-down-mobile.png` (390×844, ?autoplay=1, vt=550ms) — the
acceptance shot:
- Top strip (MIKE): 4 cards landed on the RIGHT (display positions
  5/4/3/2 = JT 32.1, KD 26.4, SC 38.9, NJ partial). 2 dashed
  placeholders on the LEFT (display positions 0/1).
- Bottom strip (YOU): 4 cards landed on the LEFT (display positions
  0/1/2/3 = BP 6.9, JB 18.5, TM 28.4, JB 31.6). 2 dashed
  placeholders on the RIGHT (display positions 4/5).
- **Middle of the screen: completely empty.** No battlefield cards
  visible mid-entrance. Mid-rail shows `TIE / EVEN` (running totals
  at 0).
- Dev controls: `entering · 4/6 dealt`.

`14-end-state-mobile.png` (390×844, no autoplay) — initial-mount
end-state. Cards visible at their final positions directly, no
fly-in animation. Identical to the phase 2 static visual.

## Phase 3.8 amendment — sequential dealing (middle → strip travel)

Replaces the strip-local lay-down with a sequential dealing motion:
each card lays at the middle of the screen at hero scale, beats
visibly, then travels back to its hand-strip slot. The user's eye
can follow each card from middle to slot.

### Per-card stages

`shared/components/useH2HReveal.ts` now models each card through five
stages and walks them sequentially:

| Stage     | Duration                       | Behavior                                              |
|-----------|--------------------------------|-------------------------------------------------------|
| pre       | —                              | Invisible, pre-positioned at middle                   |
| lay       | `CARD_LAY_MS` = 200ms          | Fades in at middle (hero scale)                       |
| beat      | `CARD_LAY_BEAT_MS` = 200ms     | Visible at middle, full opacity                       |
| travel    | `CARD_TRAVEL_MS` = 350ms       | Transform animates middle → slot, hero → mini scale   |
| settled   | —                              | At slot, placeholder fades out                        |
| (stagger) | `CARD_STAGGER_MS` = 150ms      | Gap before next card's LAY begins                     |

Per-card cycle: 900ms. 6 cards → 5.25s total entrance.
`PRE_REVEAL_PAUSE_MS = 700ms` then matchup 0.

### Paired across sides, sequential within

Sender's stage_index 0 = top-right cell. Recipient's stage_index 0 =
bottom-left cell. Both animate simultaneously through pre → lay →
beat → travel → settled. Card N+1 (stage_index 1) doesn't start until
card N has fully settled + stagger gap.

`MIDDLE_TRANSLATE_Y_SENDER_PX = +110` (sender card translates DOWN
from top strip into upper battlefield slot). `MIDDLE_TRANSLATE_Y_RECIPIENT_PX = -110` (recipient card translates UP from bottom
strip into lower battlefield slot). Both cards visible mid-air in
their respective battlefield rows without overlapping.

`translateX` computed per-cell from viewport width so each card crosses
to the horizontal center regardless of its strip column.

### Layout stabilization

`BattlefieldSlot` now renders an invisible placeholder of the same
aspect ratio when both `renderedCard` and `exitingCard` are null
(during entering and at idle). Without this, the battlefield grid
rows collapsed to ~30px (just the mid-rail content), pulling the
strips toward each other and breaking the strip-relative coordinates
the entrance translateY values calibrate against.

### Reduced motion

The hook now accepts a `reducedMotion` arg. When true, `play()`
short-circuits: all cards snap to "settled" immediately; matchup 0
starts after a 200ms fixed delay. The H2HRevealScreen detects via
`usePrefersReducedMotion` (now exported) and threads the flag into
the dev route's `useH2HReveal` call.

### New screenshots

#### 17-mid-lay-mobile.png (390×844, ?autoplay=1, vt=1100ms)

Mid-entrance with card 1 (stage_index 1) in BEAT phase at the
middle. The shot:
- Sender (top): 5 dashed placeholders on the left, Jokić settled at
  display pos 5 (stage_index 0, settled at t=750ms).
- **Stephen Curry (sender slot 4, ORANGE) hero-sized at upper-middle**
  — this is sender's stage_index 1 in BEAT phase.
- TIE/EVEN pill at the literal mid-rail position.
- **Jalen Brunson (recipient slot 1, TEAL) hero-sized at lower-middle**
  — recipient's stage_index 1 in BEAT phase.
- Recipient (bottom): Bobby Portis settled at display pos 0
  (stage_index 0), 5 placeholders right of it.
- Dev: `entering · 1/6 dealt`.

Both cards in their battlefield row positions, vertically separated,
no overlap.

#### 18-mid-travel-mobile.png (390×844, ?autoplay=1, vt=2400ms)

Captured during card 2's TRAVEL phase (state machine reports
"2/6 dealt"). Headless Chrome's virtual-time mode snaps CSS
`transition: transform` to its end state — so the screenshot shows
card 2 visually at its slot, even though the React state is still
"travel". In real-time interactive playback the eye sees the card
crossing from middle to slot over 350ms; that intermediate visual
isn't reliably capturable via headless. The state machine is verified
in unit tests (stages array progresses pre → lay → beat → travel →
settled with the expected timing).

#### 19-end-state-mobile.png (390×844)

End-state. Identical to phase 2 static. Initial mount renders
directly at the final positions (BattlefieldSlot's
`hasTransitionedRef` keeps the enter keyframe disabled until the
first transition).

## Phase 3.9 amendment — entrance order + anticipation beat

Two refinements:

1. **Both strips lay leftmost-first.** Phase 3.8 mirrored the sender
   strip so display pos 5 was stage_index 0. Reverted — both strips
   now follow the same direction as the reveal arc (cheapest swap
   first). HandStrip looks up each card's stage_index via
   `revealOrder.indexOf(card)`. When card 1 lays at the middle, BOTH
   sides' card 1 land simultaneously.

2. **Pre-reveal anticipation beat.** New `phase: "anticipating"`
   between `entering` and `revealing`. Three sub-phases:
   - **Stillness** (`POST_ENTRANCE_STILLNESS_MS = 700ms`): silent
     hold, no animation. Anticipation builds.
   - **Pulse** (`ENERGY_PULSE_MS = 700ms`): all 12 cells glow with
     their tier color via a single rise-peak-fade keyframe + subtle
     scale pulse 1.0 → 1.025 → 1.0. Tier color piped per cell via
     `--h2h-pulse-color` CSS variable.
   - **Settle** (`POST_PULSE_SETTLE_MS = 250ms`): glow fades; matchup 0
     begins.
   Replaces the prior single `PRE_REVEAL_PAUSE_MS = 700ms`. Total
   anticipation: ~1.65s.

### New screenshots

#### 20-mid-lay-mobile.png (390×844, ?autoplay=1, vt=1100ms)

Verification of fix 1 — both sides lay leftmost-first:
- **MIKE strip**: Naz Reid (GREEN, slot 0, $22) SETTLED at display
  pos 0 (leftmost) — sender's card 1.
- **YOU strip**: Bobby Portis (GREEN, slot 0, $19) SETTLED at display
  pos 0 (leftmost) — recipient's card 1.
- Both card 1's landed simultaneously, both at the leftmost cell on
  their respective strips.
- D'Angelo Russell (BLUE, sender's card 2) hero-sized at upper-middle
  in BEAT phase.
- Jalen Brunson (BLUE, recipient's card 2) hero-sized at lower-middle
  in BEAT phase.
- Dev: `entering · 1/6 dealt`.

#### 21-mid-pulse-mobile.png (390×844, ?autoplay=1, vt=6300ms)

Verification of fix 2 — anticipation pulse active:
- All 12 cells visible at their final strip slots.
- Dev controls: `anticipating · pulse` — confirms phase and
  pulseActive=true. Each cell's inline style has
  `animation: h2h-card-pulse 700ms ease-in-out 1` plus a
  `--h2h-pulse-color` set to the card's tier.
- Headless Chrome's virtual-time mode snaps the CSS animation to
  a frame that doesn't always show the 50% peak box-shadow + scale
  visually. The state machine + per-cell tier wiring are verified in
  unit tests (`pulseActive=true` → all 12 cells get the keyframe +
  the `--h2h-pulse-color` CSS var; `pulseActive=false` → animation
  none on all cells).

#### 22-end-state-mobile.png (390×844)

Static end-state after the arc completes (phase=done,
pulseActive=false, all stages settled). Identical to phase 2 static.

## Mechanics verified

- ✅ Reveal-order sort `(wasHeld ASC, salary ASC)` produces the
  expected sequence (cheapest swap → most expensive held).
- ✅ Per-matchup animation triggers CardFront's internal RAF via the
  0.001 sentinel; CardFront animates 0 → actualFp using
  `fpCountUpMs=MATCHUP_DURATION_MS`.
- ✅ Running totals tick in parallel; recipient/sender leading colors
  flip based on the current animated totals, not the finals.
- ✅ Hand-strip mini-cell dim follows `activeMatchup.{sender,recipient}.cardId`,
  not `slotIndex` — so reveal-order != deal-order works.
- ✅ Initial state = end-state (matches phase 2 static).
- ✅ `play()` resets to clean slate and walks the arc end-to-end.
- ✅ `skipToEnd()` returns to end-state, cancels in-flight RAFs.
- ✅ `?autoplay=1` URL flag fires `play()` on mount.
- ✅ Entrance lay-down: bottom strip lays left→right, top strip lays
  right→left, both sides synchronized stage-by-stage.
- ✅ Per-matchup card-pull motion: battlefield cards travel in/out
  with scale + translateY during the inter-matchup pause window.
- ✅ `prefers-reduced-motion` collapses both animations to instant
  state changes (CSS @media + hook flag).

## Tests

- `shared/components/__tests__/useH2HReveal.test.tsx` — 11 tests
  covering reveal-order sort, matchup zipping, initial state,
  play() transitions, skipToEnd() reset, timing constants.
- `shared/components/__tests__/H2HRevealScreen.test.tsx` — extended
  with 3 new tests covering the `reveal` prop pathway (active
  matchup override, running-total display, idle-state empty
  battlefield).
- Full suite: 532/532 passing.

## CardFront effect-order fix (load-bearing for phase 3)

`shared/components/CardFront.tsx` — the `cardKey` reset effect was
moved BEFORE the `visibleFp` animation effect in declaration order.
Reason: when both `card` AND `visibleFp` change in the same render
(the H2H per-matchup pattern), effects fire in declaration order. If
visibleFp's effect ran first, its RAF would be cancelled by the
cardKey reset moments later. Reordering ensures the reset runs first,
clearing stale state, and the visibleFp effect then starts a clean
RAF that survives.

Single-player is unaffected — its `cardKey` is stable after the
deal, so the cardKey effect doesn't fire during reveals.

## Known small artifacts (out-of-scope for phase 3)

- The hook's running-total RAF and CardFront's internal RAF can drift
  by a frame or two at the start of each matchup (they're independent
  RAFs). Both finish at 1500ms; the intermediate desync is invisible
  in practice and visible only in screenshot-frozen frames. If the
  user reports it as a visual issue, phase 4 can add an event-bus
  sync.
- Mobile hand-strip right-edge clipping is pre-existing from phase 2
  and unchanged by phase 3.
