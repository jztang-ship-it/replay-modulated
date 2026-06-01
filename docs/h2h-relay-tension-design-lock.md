# H2H relay-tension — design lock

**Type:** feature design lock (full-frame), phased build.
**Branch:** `feat/relay-tension-phase-1` off main @ `f3724d9`.

## What the relay is

The recipient reveal's three right-column numbers (opponent total top, my total bottom, delta middle) should feel like a 4×100 anchor leg — lead swinging set by set, chase / be-chased tension legible at a glance. Today the totals climb in lockstep and the delta updates per set, but the numbers carry no dramatic vocabulary: no growth, no leader emphasis, no per-set "did this leg go my way" flash, no momentum tag at a flip, no anchor-anticipation moment before the deciding set. This doc locks the full frame and phases the build.

## Confirmed foundation (carried from recon — do not re-derive)

- Both `senderRunningTotal` / `recipientRunningTotal` climb per-set in sync inside `runMatchup` (`shared/components/useH2HReveal.ts:614-615, 628-631`).
- Leading state is computed LIVE on the reveal surface — `recipientLeading = recipientDisplayTotal > senderDisplayTotal` and reciprocal at `shared/components/H2HRevealScreen.tsx:1183-1184`, derived from `reveal.senderRunningTotal`/`recipientRunningTotal`.
- `ScoreCell` is unified at `shared/components/H2HScoreRail.tsx`, takes `isLeading` and is wired live on both surfaces (call sites at `H2HRevealScreen.tsx:1308, 1331` and `H2HResultsOverlay.tsx:756, 760`). The forward-intent comment in `H2HScoreRail.tsx:62-79` calls out: outer div = Z2 (leader brightness/glow) attachment, inner div = Z1 (size growth) attachment.
- Set-boundary hook exists: `onMatchupResolved(index, matchup, { senderTotal, recipientTotal })` (`useH2HReveal.ts:307, 654-658`).
- Delta already splits reveal=this-set-discrepancy / results=final-gap. Reveal-side: `MidRailContent` at `H2HRevealScreen.tsx:857-897` computes `recipientCard.actualFp − senderCard.actualFp` from the active matchup. Results-side: `[data-h2h-overlay-final-gap-float]` at `H2HResultsOverlay.tsx:773-824` renders `recipient.totalFp − sender.totalFp`.
- Per-set magnitude is one pure call: `planRevealBeats(card)` (`useH2HReveal.ts:129-169`) returns `shakeType ∈ legendary|big|hype|cold|frozen|null` from `actualFp/projectedFp` ratio.

## Locked design — full frame

### Two channels, deliberately independent

Size and glow are **separate channels**:

- **Size (Z1)** — answers "how big this game is getting." Both totals GROW as scores climb, never shrink below baseline. The leader grows bigger than the trailer at every instant. Bounded so a blowout doesn't make the number unreadable or clip.
- **Glow / brightness (Z2)** — answers "who's winning." Leader gets brightness + glow. Trailer does not. Independent of size, so in a TIGHT race where both numbers are close in size, the glow still tells the user who's ahead.

The two-channel test (device-check): in a tight race, the user must be able to tell who's leading at a glance. If size alone has to carry that read, it'll fail in the close-race case — that's why glow is its own channel.

### Z1 — size model

- Baseline scale = `1.0` (= the existing 22px font on the inner glyph of ScoreCell).
- `sizeProgress = runningTotal / referenceTotal` where `referenceTotal = max(senderFinalTotal, recipientFinalTotal)`. Both sides use the same reference so at end-of-game the leader's `sizeProgress = 1.0` and the trailer's `sizeProgress = trailing.final / leading.final < 1.0`. This naturally puts the leader at maximum size without a separate boost.
- Score-progress contribution: `SIZE_PROGRESS_MAX = 0.12` (12% growth as the leader's running total climbs from 0 → final).
- Leader bonus: `LEADER_BONUS = 0.08` (8% extra when leading). Adds to whichever side is the live leader.
- Tie bonus: `TIE_BONUS = 0.04` (4% extra applied to BOTH sides when tied — see "Tie" below).
- Formula: `scale = 1 + sizeProgress * SIZE_PROGRESS_MAX + (state === "leading" ? LEADER_BONUS : 0) + (state === "tied" ? TIE_BONUS : 0)`.
- Hard clamp: `MAX_SCALE = 1.30`. A 6-card 200-FP win caps cleanly under this; 30% growth on a 22px glyph = ~29px — still inside the 80px right-rail column.
- Monotonicity: `sizeProgress` is monotonic in `runningTotal` (which is monotonic during reveal), so size never shrinks during the climb. At a lead-flip set boundary, the side that loses the lead drops `LEADER_BONUS`, which IS a small shrink — Phase 2's lead-change pop addresses that visually; for Phase 1 the swap is just a step (acceptable; the doc records this).
- Applied via `transform: scale(N)` on the inner glyph div (Z1 attachment point). Transform doesn't reflow, so the cell's grid footprint stays stable.

### Z2 — leader glow / brightness

- Applied to the outer flex-centered cell div (Z2 attachment point) so layout (grid placement, score Y-centering) is untouched.
- `state === "leading"`: outer div gets a `filter: drop-shadow(0 0 8px WINNING_COLOR_GLOW)` (where `WINNING_COLOR_GLOW = "rgba(34, 197, 94, 0.55)"`, derived from `WINNING_COLOR`). Inner glyph also gets `textShadow: "0 0 6px WINNING_COLOR_GLOW"` for a slight halo on the digits themselves.
- `state === "trailing"`: outer div gets no shadow; inner glyph stays plain. (No "anti-glow" — the absence of glow IS the signal.)
- `state === "tied"`: see Tie section.
- Transition: `filter` + `textShadow` transition over `LEADER_TREATMENT_TRANSITION_MS = 200` so a lead change feels intentional (Phase 1 lead-flip is a step, Phase 2 will sharpen it).

### Tie — dead-heat state

Today's predicate `x > y` is FALSE for both sides at exact tie, so both render `TRAILING_COLOR` (grey) — reads as "both losing," wrong. The Phase 1 fix: a third state.

- Trigger: `senderRunningTotal === recipientRunningTotal && runningTotal > 0`. (Both-zero is the pre-reveal state, not a tie.)
- Both numbers render in `DELTA_NEUTRAL` color (`#E5E7EB`, off-white).
- Both numbers get the `TIE_BONUS` size addition (so they pop together).
- Both outer cells get a subtle pulsing glow in tie color: `filter: drop-shadow(0 0 6px rgba(229, 231, 235, 0.45))`, animated via a `tie-glow-pulse` keyframe (0.7 → 1.0 → 0.7 opacity ramp over 1100ms, infinite).
- Reads as "charged — too close to call," not "both losing."
- Single-frame ties during the rollup tick are accepted (a tie may flicker for one frame as totals cross); the transition timing on filter/textShadow smooths it visually.

### Lead-change pop — set-boundary only

- Totals climb live and continuously: the chase IS visible frame-by-frame as numbers approach and cross.
- The dramatic SWAP (size redistribute + glow handoff + momentum tag) fires ONLY at a set boundary when `onMatchupResolved` commits a new leader. NOT on transient mid-rollup crossings.
- A set that *gains ground* but doesn't *flip the lead* gets the scaled pop on the number (Phase 2) and the delta color (Phase 1) but NO size-swap and NO momentum tag.
- ~300ms sharp pop on the new leader's number.
- Reserved for genuine lead changes — keeps the swap meaningful.
- Doc note for later: revisit a single tasteful mid-roll flip on device if the climb feels placid. DO NOT build mid-roll now.

### Delta color flash — per-set sign

- Sign of `recipientCard.actualFp − senderCard.actualFp` (already the rendered value at `MidRailContent`):
  - `> 0` → green flash (the leg went my way).
  - `< 0` → red flash (the leg went theirs).
  - `=== 0` → no flash, neutral color, no pulse.
- One-shot per set: 250ms color-pop + small scale-pulse (1.0 → 1.15 → 1.0). Then settles to the steady delta color (today's `matchupDelta > 0 ? WINNING_COLOR : TRAILING_COLOR` treatment).
- Implementation: `key={matchupIndex}` on the inner delta block forces React to remount each set, retriggering a CSS keyframe. No state plumbing.

### Scaled pops (Phase 2)

Number-pop magnitude tied to `planRevealBeats(activeMatchup.{sender,recipient}).shakeType`. Big set = harder punch on the running total at set-boundary commit. Dud = barely nudges. Not constant.

- `legendary` / `big` → strong pop (e.g., scale 1.15 over 280ms).
- `hype` (dead-band) → light pop (scale 1.06 over 200ms).
- `cold` / `frozen` → muted (scale 1.03 over 180ms) — the magnitude is real but downward.

Phase 2 only. Phase 1 keeps the number stable at set boundaries except for Z1's monotonic climb.

### Momentum tags (Phase 2)

On a set-boundary flip ONLY (same condition as the size/glow swap):

- Transient text element, ~250ms visible + ~150ms fade-out.
- Copy set, small: `"TAKES THE LEAD"`, `"BACK ON TOP"`, `"SWING"`. Pick one per flip type later.
- Placement: **right-middle column, close to the score+delta cluster.** All the numbers live in the right rail — the tag joins them. Specifically: a new absolute-positioned child of the existing positioned grid wrapper (`H2HRevealScreen.tsx:1268-1361` battlefield grid, already `position: relative`). No new overlay system.
- Coexistence with the delta float: the delta float lives at `top: 50%, right: 0`. The tag lands ABOVE the delta (e.g., `top: 30%`) for 250ms, then fades. The delta's per-set flash and the tag are sequenced — flash fires at set commit (t=0), tag fires at t=80ms so they don't visually fight. Net result: green flash on the delta + "TAKES THE LEAD" above it for a quarter-second.

### Anchor moment (Phase 3)

Pre-reveal frame on the deciding final set: **"Remaining: BRUCE BROWN / Need: 15.1"** (or analogous depending on roles).

- Host in the existing `paused` phase between matchups (`useH2HReveal.ts:682` already exists; 850ms + extension as needed). No new phase.
- Inputs:
  - Upcoming card identity → `senderRevealOrder[matchupIndex + 1]` / `recipientRevealOrder[matchupIndex + 1]` (both exported from the hook return).
  - Remaining sets → `matchupCount - matchupIndex - 1`.
  - Points-needed-to-overtake → `senderRunningTotal − recipientRunningTotal` (signed).
  - Decisiveness predicate → small pure helper (~10 lines): walk remaining matchups, compare best/worst-case finals against current gap, decide if this set locks the outcome. NET-NEW but data is fully in hand.
- Player names: come from the user's own card data (each card carries display name) — fine to use, no separate name pipeline needed.
- Visual: large player name + "Need: ±N FP" line + the small numbers cluster dimmed underneath.
- Duration: extend `paused` for the deciding set to ~1500ms via the same `intermediateAdvanceDelay = max(MATCHUP_RESOLVE_PAUSE_MS, pendingPostRollupMs)` extension already in place (`useH2HReveal.ts:678-681`). Add an `anchorAnticipationMs` term to the max.

Phase 3 only. The emotional peak — composes the Phase 1 + 2 vocabulary.

### Commentary collapse (Phase 1)

The reveal surface has NO commentary today (left rail is `aria-hidden` placeholder at `H2HRevealScreen.tsx:1286`). **This relay design keeps reveal commentary-free** — the right column does all the storytelling.

Results-side commentary is two-block today at `H2HResultsOverlay.tsx:725-751` — white headline + orange trash-talk. The collapse: one block, one color.

- Picks the headline copy (the punchline) and renders ONLY that, in white.
- Trash-talk line is dropped from the render. Generator (`shared/commentary/chadChallenge`) UNCHANGED — the copy is still produced; we just don't render it.
- Purely presentational. Reaches no voice/copy code.
- Net effect: cleaner results header, no two-tone competition with the right-column number drama.

### Ambient closeness (stretch, doc only)

A tighter race could shift a faint ambient tint over the metric area (the right rail's background or a subtle vignette). Tune last — easy to overcook. Spec when we get there. Phase 1 ignores.

## Cross-surface handoff — first-class requirement

The reveal → results crossfade (`shared/components/H2HRecipientReveal.tsx:195` `showOverlay = reveal.phase === "done"`, `OVERLAY_CROSSFADE_MS`) must NOT visually snap. Stated as the load-bearing invariant:

> **What the user sees at the LAST reveal frame must equal what they see at the FIRST results frame.**

Three known traps from recon, each addressed structurally:

1. **Z2 leader glow must render identically on `surface="reveal"` and `surface="overlay"`.** The shared `ScoreCell` derives its glow purely from the `state` prop — both surfaces feed the same `state` calculation (`leading | trailing | tied` from running totals on reveal, from final totals on overlay). The CSS rules are unified inside `ScoreCell`. Glow either renders on both or neither.
2. **Z1 size pop must return to identity before `done` phase.** The Phase 1 size formula uses `sizeProgress`, which at `phase === "done"` equals `runningTotal / referenceTotal = finalTotal / referenceTotal`. The same value the results surface computes at mount. There is no transient transform; size is a steady function of the displayed totals, so `done`-phase size and overlay-mount size are equal by construction.
   - For Phase 2 pops (scale spikes on set commit): they MUST `transform: scale(1)` at rest before the LAST set's hold completes. The `END_OF_ARC_HOLD_MS = 1700` window (`useH2HReveal.ts:240`) is the breather; the pop animation must complete inside it. Phase 2 will state this explicitly.
3. **Delta color: reveal float's final pre-crossfade color must match results float's final-gap color.**
   - Reveal-side last-set delta color: sign of `recipientCard.actualFp − senderCard.actualFp` for the FINAL matchup.
   - Results-side gap color: sign of `recipient.totalFp − sender.totalFp`.
   - These signs CAN differ if the final set goes one way but the cumulative game went the other (e.g., I lose the last leg but still win overall). At handoff, the user would see a green reveal-delta jump to a red results-gap.
   - Phase 1 mitigation: at `phase === "done"` (or `end-hold`), the reveal-side MidRailContent SWITCHES from per-set sign to final-gap sign (same formula as results). The per-set "this leg" reading served its purpose by then; the final hold shows the same gap the overlay will render. No visual jump at crossfade.

### Device-check the handoff explicitly

Harness can't see a one-frame snap (lesson #5). The Phase 1 device-check includes:

- Watch the crossfade transition closely. Score positions match. Glow persists. No leftover scale-down. Delta color continuous.

## Phasing

| Phase | Scope | Build now? |
|---|---|---|
| **Phase 1** | Z1 size growth + Z2 leader glow; tie dead-heat; per-set delta flash + pulse; results commentary collapse; harness gap-fillers + Phase-1 assertable assertions | **YES** |
| **Phase 2** | Set-boundary lead-change pop (size/glow swap) + scaled number pops + momentum tags | doc only |
| **Phase 3** | Anchor moment frame + decisiveness pure helper | doc only |
| **Stretch** | Ambient closeness | doc only |

## Phase 1 — assertable visuals + harness gap-fillers

### Gap-fillers (must pass GREEN on pre-Phase-1 main — they are standing guards, not pre-fix-fails)

Pre-Phase-1 main's right column is currently correct; these assertions exist to prevent future drift. They must run green on f3724d9 before any code changes, AND run green after Phase 1's right-column rework — a red gap-filler post-Phase-1 means Phase 1 broke the right column.

1. Reveal-side `[data-h2h-mid-rail-float]` center-X is in the right HALF of the battlefield grid (mirrors the existing results-side X guard).
2. Reveal-side `[data-h2h-mid-rail-float]` center-Y is between the top and bottom hero rows (within tolerance of their midpoint).
3. Results-side `[data-h2h-overlay-final-gap-float]` center-Y is between the top and bottom hero cells (within tolerance of their midpoint).
4. Visibility tripwires: both delta floats have computed `opacity > 0` AND their bounding rect is not clipped by ancestor `overflow: hidden`.

### Phase-1 assertable visuals (pre-fix-fail required)

For each new visual that the harness can see, an assertion that FAILS on pre-Phase-1 main and PASSES after Phase 1:

5. **Leader glow on the leading score cell at results end-state**: `getComputedStyle(leadingScoreOuter).filter` includes a `drop-shadow` (or `boxShadow !== "none"`). Pre-Phase-1: no filter on the outer cell → assertion fails. Post-Phase-1: drop-shadow present → assertion passes.
6. **Size scale on the leading score cell at results end-state**: `getComputedStyle(leadingScoreInner).transform` is a non-identity matrix (parsed `a > 1`). Pre-Phase-1: no transform → assertion fails. Post-Phase-1: `scale(>1)` → assertion passes.

### Feel-based properties (left to device, NOT assertable)

- Z1 size-growth curve smoothness during the climb.
- Z2 glow intensity / readability in tight-race scenarios.
- Delta flash pop intensity and color saturation.
- Tie pulse pacing.
- Crossfade snap (handoff) — this is the load-bearing device-check.

## Tie state — exact visual

Locked once for clarity:

- Both number colors: `DELTA_NEUTRAL = "#E5E7EB"`.
- Both outer cells: `filter: drop-shadow(0 0 6px rgba(229, 231, 235, 0.45))` + a `tie-glow-pulse` keyframe (0.7 → 1.0 → 0.7 opacity, 1100ms, infinite, ease-in-out).
- Both size scales: `1 + sizeProgress * 0.12 + 0.04` (TIE_BONUS, no LEADER_BONUS).
- No textShadow.
- Detection: `Math.abs(senderRunningTotal - recipientRunningTotal) < 0.05 && senderRunningTotal > 0`. The `< 0.05` tolerance avoids the floating-point "almost zero" edge case; the `> 0` filter excludes the pre-reveal zero-state.

## Implementation surface for Phase 1

- `shared/components/H2HScoreRail.tsx` — extend `ScoreCell` API: replace `isLeading: boolean` with `state: "leading" | "trailing" | "tied"`; add `sizeProgress: number` (0..1). Add Z1 (inner div `transform: scale`) + Z2 (outer div `filter: drop-shadow`) + tie keyframe. Export keyframe-injection helper if needed.
- `shared/components/H2HRevealScreen.tsx` — derive `state` and `sizeProgress` for both sides, pass to `ScoreCell`. Add per-set delta flash to `MidRailContent` via `key={matchupIndex}` + CSS keyframe. At `phase === "done" | "end-hold"`, switch delta to final-gap sign so the handoff doesn't jump.
- `shared/components/H2HResultsOverlay.tsx` — derive `state` and `sizeProgress` (sizeProgress = `total / referenceTotal` at end-state, both = 1 for the leader). Pass to `ScoreCell`. Adopt the leader glow on the final-gap float so the handoff continuity holds. Collapse the two-block commentary to one block / one color.
- `scripts/verify-h2h-play-layout.mjs` — 4 gap-fillers + 2 Phase-1 assertable assertions.

## Gates

- `npm test`
- `npx tsc --noEmit`
- Visual harness (`npm run verify:visual`)
- Function count stays 11/12
- `scripts/build-vercel.sh` (shared/ touched)

## Verification

No Vercel preview — recipient reveal uses per-origin anon + the dev mock route is stripped. Device-verify on PROD after merge, once Production flips to the new merge hash and shows Ready.

### Dev-only relay debug overlay (Phase 2.5)

For verifying the relay's numeric values live (Z1 applied scale, leader glow on/off, pop kind/magnitude, set-boundary log), a dev-only overlay is available. It's instrumentation, not a feature.

- **Activate locally:** start the dev server (`npm run dev`) and append `?relayDebug=1` to the basketball mock URL. Example: `http://localhost:5173/basketball/dev/h2h-play-mock?relayDebug=1`.
- **Gating:** double-gated. `import.meta.env.DEV` constant-folds to `false` in prod builds (Vite tree-shakes the `RelayDebugOverlay` import out of the bundle entirely); even in a dev build the overlay requires the `?relayDebug=1` querystring before it renders. Cannot reach a real user.
- **What it shows:** per-cell applied scale (live computed transform) + resting scale (data-attr) + effective rendered size in px + leader state + Z2 glow on/off + pop kind/magnitude/duration; both running totals + gap; a rolling log of the last 8 set-boundary events with flip/leader/pop info.
- **Observation, not coupling:** reads existing state via the `reveal` prop + DOM data-attributes + `getComputedStyle`. The relay components were not given new state to feed the overlay. The only relay-side touch was adding `data-h2h-score-pop-magnitude`, `data-h2h-score-pop-duration-ms`, `data-h2h-score-rest-scale`, and `data-h2h-score-size-progress` data-attributes to `ScoreCell` — read-only, zero behavior impact.


Phase 1 device-check items (each on its own line):

1. The race READS live — numbers visibly climb and cross; the leader is clear via glow even when sizes are close (TWO-CHANNEL test — verify in a TIGHT race specifically).
2. Numbers grow (Z1) but never shrink below baseline; no clipping at blowout.
3. Delta flashes green/red correctly per set with the pulse.
4. Tie dead-heat state reads as charged, NOT as "both losing."
5. **Crossfade does NOT snap** — last reveal frame == first results frame: glow persists, no leftover scale, delta color continuous.

Verify both a bright-tier scenario AND a tight-race scenario — these exercise the two-channel legibility and the handoff.
