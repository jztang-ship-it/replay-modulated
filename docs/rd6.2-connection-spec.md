RD6.2 — the connection moment (delta beef-up + synchronized dual-blink)

Goal: make Mike's number matter again now that it's fixed. Two coupled
changes keyed to the existing per-set resolution (deltaLandedKey).

A. Delta beef-up (restyle/relabel, NOT a rewire)
- Source unchanged: per-set delta = recipientCard.actualFp −
  senderCard.actualFp; resets each set.
- Copy: delta > 0 → "Gained X.X FP"; delta < 0 → "Lost X.X FP";
  delta == 0 → "Even".
- Color: gained → green (reuse the YOU/leader-glow green for consistency);
  lost → red; even → neutral gray.
- Size: font-size PROPORTIONAL to the inner-corner team-total FP. Reference
  the SAME size value the box totals use (single source of truth so they
  scale together). Baseline ratio 1:1 (scale-peer); centered isolation +
  color make it the focal point. Tunable up (~1.1–1.2×) on glass if it
  doesn't dominate.
- Position unchanged: mid-rail center between the two heroes.
- Keep existing h2h-mid-rail-flash; compose with the new size/color.

B. Synchronized dual-blink (NET-NEW primitive) — separate stage 6.2-B,
   not built in this ticket.
- Both inner-corner totals (Mike top, YOU bottom) blink in sync on each
  set resolution, keyed to deltaLandedKey → blink+blink+delta on one frame.
- OPACITY/brightness only, NEVER scale (scale owned by the existing glyph
  pop; would collide). De-risked by polish-A (FP constant-size).
- Shape: opacity 1.0 → 0.35 floor → 1.0; ~180ms default; ease-out. Single
  blink per total per resolution. No layout movement.

---

B-build (2026-06-12): synchronized dual-blink primitive — implementation

The blink primitive is added to the shared `ScoreCell` (H2HScoreRail.tsx)
so both reveal-side corner totals AND the results-side corner totals
have access to the same code path. In practice the reveal screen drives
it via the `blink` prop; the overlay never passes a `blink` prop, so
the totals there sit at the resting opacity 1.0 — that's the no-snap
guard.

Wiring:
- Both corner ScoreCells (Mike top, YOU bottom) on the reveal surface
  consume the SAME `blink.key` (= popState.deltaLandedKey, the same key
  the existing scale-pop uses). Same key → both blinks fire on the
  same React render commit → same animation frame.
- Source: H2HRevealScreen builds senderScoreCell + recipientScoreCell
  inside its render; both receive `blink={{ key: popState.deltaLandedKey,
  durationMs: BLINK_DURATION_MS }}`. The reduced-motion case omits the
  `blink` prop entirely (undefined → useEffect short-circuits → no
  animation).

Layered concurrency with the existing scale-pop:
- POP: WAAPI animation on the INNER GLYPH (`innerRef`), `transform: scale`.
- BLINK: WAAPI animation on the OUTER WRAPPER, `opacity`.
- Different elements, different properties → CSS does not need to
  arbitrate. The pop's transform composes onto the inner; the blink's
  opacity composes onto the outer (which contains the inner). Both
  visible simultaneously.

CSS animation conflict — tie-pulse:
- When state === "tied", the outer wrapper runs `animation:
  h2h-score-tie-pulse 1100ms ease-in-out infinite` (opacity 0.7 ↔ 1.0).
- WAAPI animations override CSS keyframe animations on the same
  property per the Web Animations spec — the blink's opacity drop
  takes priority while it runs.
- With `fill: "none"` on the blink, the outer reverts to "no WAAPI
  opacity" when the blink ends → the CSS tie-pulse resumes from
  wherever its keyframe is at that moment. Visually: tie-pulse,
  brief blink dip, tie-pulse resumes. Clean.

Resting state invariant (no-snap guard):
- ScoreCell renders with NO inline opacity on the outer (just `filter`,
  `transition`, and CSS `animation`). Default opacity = 1.0.
- The blink uses `fill: "none"`, so after BLINK_DURATION_MS the
  WAAPI animation's effect disappears → opacity returns to its CSS-
  default 1.0.
- On the results overlay: no `blink` prop passed → no WAAPI animation
  → opacity is unaffected, always 1.0. Reveal→results crossfade: the
  reveal's blink (180ms) completes within FINAL_HOLD_MS (1500ms) +
  overlay crossfade (350ms), so by overlay mount the reveal's outer
  is back at opacity 1.0 — matches the overlay's mount opacity 1.0.

Reduced-motion handling:
- The caller (H2HRevealScreen) detects `usePrefersReducedMotion()` and
  conditionally OMITS the `blink` prop. The ScoreCell does NOT need
  its own media-query check — single source of truth via the prop.
- Under reduced motion: no opacity dip, no animation. The totals
  render plain. Consistent with how other H2H animations gate
  (handStrip, anchor-frame entrance, etc.).

FINAL-set blink:
- The blink fires on the FINAL set's resolution too (deltaLandedKey
  changes one last time when phase enters end-hold). This coincides
  with the FINAL verdict reading on the mid-rail. Spec'd as intended.
  If glass reads as "too much" at the verdict (the blink + the
  Won/Lost copy + the corner-glow + the FINAL_HOLD_MS dwell all
  layered), the next lever is to suppress blink when
  `popState.deltaLandedKey === matchupCount - 1`. Held for John's
  call.

Locked: BLINK_FLOOR = 0.35. Tunable: BLINK_DURATION_MS (default 180).
Both exported from H2HScoreRail.tsx as the single source of truth.

Locked: blink depth 0.35. Tunable on glass: duration, delta size ratio.

---

Amendment 2026-06-12 (RD6.2-A revision, post-first-glass)

A1. Delta vertical anchor — re-target from hero-stack midpoint to
    team-total baseline midpoint.
- Pre-amendment: delta floated at `top: 50%; translateY(-50%)` inside
  the battlefield grid (data-h2h-battlefield, position:relative). That
  position equals the midpoint of the two hero cards' box centers AND
  the midpoint of the two corner FP box centers (which happen to be
  geometrically symmetric about the hero region center — verified by
  computation).
- The box-center midpoint and the BASELINE midpoint differ by ~30% of
  the corner FP fontSize (= ~6px at fontSize 20). The baselines sit
  below the box centers because the corner FP glyphs are rendered in
  `alignItems:center` ZoneHeader bands; the visible baseline of a
  digit sits below the visual center of the line box.
- Post-amendment: delta's vertical CENTER aligns to the midpoint of
  the two corner FP BASELINES — visually reads as the "third number"
  in the same baseline-cluster as Mike and YOU's totals, rather than
  hovering between the two hero cards.
- Mechanism: shift the existing absolute-positioned float by +6px
  via `translateY(calc(-50% + 6px))`. The shift value is keyed
  conceptually to `SCORE_CELL_FONT_SIZE_PX × 0.3` (baseline-from-
  center fraction for Inter at the corner FP weight). Tunable on
  glass — log it as a hardcoded literal with the rationale so the
  next person knows what knob to turn.
- Identical anchor on reveal AND results (no-snap). On results the
  mid-rail element doesn't render today, so the anchor change is
  reveal-side-only by default. If RD6.2 ever ships a results-side
  mid-rail FINAL, it must use the same translateY shift.

A2. Terminal/FINAL state — INHERITS the per-set delta treatment.
- Copy: delta > 0 → "Won X.X FP" (green); delta < 0 → "Lost X.X FP"
  (red); tie → "Even" (neutral). Note: "Won" not "Gained" — the
  per-set per-card framing is per-card-swing-gained; the terminal
  state is the whole-game-margin-won. Same verb shape (past tense)
  but different lexicon to mark the difference.
- Size: tied to `SCORE_CELL_FONT_SIZE_PX` (= 20) — the SAME shared
  source the per-set delta uses. Single source of truth across all
  three glyph types (corner FP, per-set delta, FINAL delta).
- Color: WINNING_COLOR / LOSING_COLOR / DELTA_NEUTRAL — same as
  per-set.
- The "final" eyebrow sublabel is retired (the new copy "Won X.X FP"
  already signals terminal; the sublabel was redundant chrome).
- The h2h-mid-rail-flash brightness/scale pulse is intentionally NOT
  fired on the FINAL state — finalGapOverride === undefined gating
  preserved; final is steady-state, not a per-set transition.

A3. Coexistence audit (report-only — no change here).
- The results overlay renders a "YOU BEAT MIKE" / "YOU LOST TO MIKE"
  headline AND a "+X.X FP" / "−X.X FP" hero magnitude at fontSize 32
  in the commentary block (gridRow:1, gridColumn:"1 / span 2"). With
  RD6.2-A delivering a beefed mid-rail FINAL at fontSize 20 on the
  REVEAL surface only, the two big colored numbers coexist only
  during the reveal→results crossfade window (~250ms). After
  crossfade the overlay covers the reveal and the mid-rail FINAL
  disappears. If RD6.2 ever extends the FINAL element to the results
  surface, John reviews the headline-vs-FINAL coexistence then.

---

C. Right-column narrative rail (delta → gap, sequenced)

Goal: the right column tells ONE evolving story per set, never two
things at once. The "next opponent + need" gap moves OUT of the center
battlefield overlay INTO the right column, sequenced AFTER the per-set
delta — reaction first (what just happened), then stakes (what's next).
The center next-up overlay (AnchorFrame) is retired entirely. This is
reveal-side only — results overlay has no mid-rail and owns its own
headline+hero verdict (no no-snap concern).

Per-set state machine (every set except the LAST):
  1. Set N resolves → DELTA appears in the right-column slot.
     Copy: "Gained X.X FP" (green) / "Lost X.X FP" (red) / "Even" (neutral).
     [RD6.2-B's total-blink will later fire on this same frame.]
  2. DELTA dwells ~1500ms (PER_SET_DWELL_MS, tunable on glass).
  3. DELTA → GAP crossfade ~250ms (RAIL_CROSSFADE_MS — opacity only,
     matches the existing OVERLAY_CROSSFADE_MS philosophy).
  4. GAP persists through the inter-set pause until set N+1 starts
     revealing.
     Copy: stacked vertically in the narrow column —
       Eyebrow "NEXT" (uppercase, 9px, low contrast)
       Player name (14px, weight 900, word-break safe for long names
         like "Luka Dončić" or "Giannis Antetokounmpo")
       Need line (13px, "Need +X.X" green / "Hold +X.X" amber /
         "Even" neutral — keyed off (senderRunning − recipientRunning)).
  5. When set N+1 enters "revealing" → reset slot state, render DELTA
     for the rolling per-set delta.

Last set (terminal — no crossfade to a gap):
  1. Final set resolves → DELTA becomes FINAL verdict ("Won X.X FP" /
     "Lost X.X FP" / "Even"), per A2's restyle.
  2. FINAL HELD ~1500ms (FINAL_HOLD_MS) before the existing
     reveal→results overlay crossfade fires.
  3. Overlay crossfade (350ms, OVERLAY_CROSSFADE_MS, existing) takes
     over. The held FINAL hands off across the crossfade — the verdict
     lands before the results page does.

Sourcing (NO rewire — pure derived data from existing hook state):
  - DELTA source: unchanged (RD6.2-A path — per-set delta from
    recipientCard.actualFp − senderCard.actualFp; FINAL via
    finalGapOverride = recipient.totalFp − sender.totalFp at done /
    end-hold).
  - GAP "next opponent": reveal.senderRevealOrder[matchupIndex + 1].name
    (the opponent's card scheduled for the next matchup).
  - GAP "need": signed (senderRunningTotal − recipientRunningTotal),
    framed as "Need +X.X" (recipient behind), "Hold +X.X" (recipient
    ahead), or "Even" (within 0.05 epsilon).

Hook timing change (subsumes the prior pre-final-only ANCHOR_HOLD_MS
extension): every non-final paused window now floors at ANCHOR_HOLD_MS
(1500ms) so the per-set rail's dwell → crossfade → gap-glance sequence
fits inside the paused phase. The pre-RD6.2-C hook only extended the
penultimate paused window (gated by isFinalSetDecisive); the broader
floor makes the per-set cycle uniform. Per-arc total reveal time grows
by ~3.9s (650ms × 6 non-final matchups) — accepted as the cost of the
narrative rail; tunable on glass.

Slot height reservation: the float container reserves a fixed height
(~80px) to host both delta and gap absolute-positioned children.
Switching state via opacity crossfade only — NO height change → no
layout jump in the right column when delta swaps with gap. Long player
names wrap at word breaks (Inter's natural wordBreak); 2-line names
stay within the reserved height.

Retired by C: the center AnchorFrame overlay (data-h2h-anchor-frame)
that previously covered the battlefield's center column at the pre-
final pause. The isFinalSetDecisive helper stays (it remains the
sealed/blowout detector if a future feature wants it) but no longer
gates a UI element.

Locked: PER_SET_DWELL_MS = 1500, RAIL_CROSSFADE_MS = 250, FINAL_HOLD_MS
= 1500, slot height 80. Tunable on glass: any of the above. The 1500ms
values intentionally re-use the existing ANCHOR_HOLD_MS so the spec has
one "dwell quantum" governing all per-set holds.

---

C-revision (2026-06-12, post-first-glass): per-set gap retired in favor
of once-pre-final-decisive

What the previous C got wrong:
- The original AnchorFrame gate was final-set-specific:
  isFinalSetDecisive(finalRecipientCard, finalSenderCard) gated whether
  the gap was meaningful at all. Its data (finalRecipientCard.name,
  anchor.needPoints) is the FINAL set's framing — not a generic "next
  opponent + need" computable mid-arc.
- Per-set generalization made the SAME final-card name + final-set need
  show after every set (stale on intermediate sets, correct only at
  penultimate). And the broader paused floor added ~3.9s per 6-set
  reveal — a real pacing tax on every single user.
- Correct framing per John's image-2 call: the right column shows the
  PER-SET DELTA every set (the reaction). The GAP is a SINGLE
  pre-final-decisive suspense beat — the stakes of the deciding set —
  sequenced after that set's delta, then handing to the final reveal.
  Sealed/blowout games show no gap; the delta cycle just runs into the
  FINAL.

Corrected state machine:

  Every non-final, non-pre-final-decisive set:
    1. Set N resolves → DELTA appears in the right-column slot.
       Copy/color/size per RD6.2-A (Gained / Lost / Even, fontSize 20).
    2. DELTA persists through the inter-set pause (MATCHUP_RESOLVE_PAUSE_MS,
       restored to the prior 850ms default — no per-set 1500ms floor).
    3. When set N+1 enters "revealing" → DELTA resets and the rolling
       per-set delta animates as usual.

  Penultimate paused, IF isFinalSetDecisive().decisive === true:
    1. Set N-1 (penultimate) resolves → DELTA appears as usual.
    2. DELTA dwells until ANCHOR_HOLD_MS (1500ms — the original
       anchorHoldMs extension, restored to its pre-revision form: fires
       only here, not on every set).
    3. DELTA → GAP crossfade (RAIL_CROSSFADE_MS = 250ms, opacity only).
    4. GAP "NEXT / <finalRecipientCard.name> / Need +X.X" persists
       through to the final set's "revealing" entry.

  Penultimate paused, sealed/blowout (decisive === false):
    - No GAP. Column just shows the penultimate delta until the final
      set's "revealing" advances it. Same as a regular non-final pause.

  Final set:
    1. Final set resolves → DELTA becomes FINAL verdict ("Won X.X FP" /
       "Lost X.X FP" / "Even"), per A2's restyle.
    2. FINAL HELD for FINAL_HOLD_MS (1500ms — KEPT from prior C; the
       ~0ms→1.5s legibility fix stands).
    3. Existing overlay crossfade (350ms) takes over.

Sourcing (correct — matches pre-C AnchorFrame data):
  - DELTA: unchanged from RD6.2-A.
  - GAP "next opponent": reveal.recipientRevealOrder[matchupCount - 1]
    .name — the FINAL set's recipient card (which the user is about
    to face). NOT senderRevealOrder[matchupIndex + 1] (which was the
    wrong abstraction the prior C tried).
  - GAP "need": from isFinalSetDecisive().needPoints — the FINAL-set
    framing-aware projection, NOT (senderRunning - recipientRunning).

Retired by the revision:
- The broader paused-window floor (max(..., ANCHOR_HOLD_MS)) in
  useH2HReveal.ts. The prior pre-C pre-final-only `anchorHoldMs`
  branch is restored. Net: −650ms × 5 non-final-non-pre-final
  boundaries ≈ −3.25s per 6-set arc.
- The per-set dwell timer in RightColumnRail. The gap-show condition
  is now phase===paused + matchupIndex===matchupCount-2 +
  isFinalSetDecisive().decisive (same as the original AnchorFrame
  gate, just landing in the right-column slot instead of as a center
  overlay).

Kept from prior C:
- RightColumnRail as the slot host (80px reserved height; both layers
  absolute-positioned; opacity-only crossfades).
- FINAL_HOLD_MS = 1500 (the verdict-legibility fix).
- AnchorFrame component deletion (its behavior moved into the rail's
  gap layer under the SAME isFinalSetDecisive gate as the original
  mount; just relocated visually from center column to right column).

Glass-tunable: ANCHOR_HOLD_MS (1500), RAIL_CROSSFADE_MS (250),
FINAL_HOLD_MS (1500), the 14px gap-name fontSize (drop to 12 if
"Giannis Antetokounmpo" overflows on real hardware).

---

C-rev2 (2026-06-12, post-second-glass): re-center reaffirmed, dwell
900ms, gap on every game

Three corrections to § C-revision:

1. SLOT ANCHOR (reaffirmation, not a fix): the RightColumnRail slot's
   vertical CENTER aligns to the midpoint between Mike's and YOU's
   team-total baselines. Investigation finding: the float wrapper's
   `transform: translateY(calc(-50% + 6px))` (the A-revision shift)
   STILL applies post-C. For an 80px child, the wrapper's geometric
   center lands at grid_50% + 6, which equals the baseline midpoint
   per the A-revision math (Inter's baseline-from-center offset at
   fontSize 20 weight 950 ≈ 6px).

   What changed pre-C → branch: the wrapper's BOUNDING BOX grew from
   ~22px (single line of MidRailContent) to 80px (RAIL_SLOT_HEIGHT_PX).
   The slot's CENTER did not move. The delta line inside is still
   flex-centered, so its visible Y equals the slot center = baseline
   midpoint. No anchor-position correction was needed; the +6 baseline
   correction still applies to the SLOT via the wrapper transform.

   If a future change moves the slot height or wrapper transform, the
   correction must re-track: slot CENTER == midpoint of corner-total
   baselines, NOT hero-stack midpoint.

2. PRE-FINAL DELTA DWELL: PRE_FINAL_DELTA_DWELL_MS 400 → 900.

   The 400ms first-pass value clipped the delta — the rolling delta
   landed and within ~100-150ms of read time the slot crossfaded to
   gap. The pre-final set IS the climax; the per-set "Gained/Lost X.X
   FP" deserves a full read before the stakes layer takes over.

   Widening the pre-final paused window to accommodate:
     ANCHOR_HOLD_MS bumped 1500 → 2000ms.
     Budget breakdown inside the 2000ms paused window:
       - Delta rolling + landing: ~POST_TOTALS_HOLD_MS (250ms) + the
         delta RAF (~MATCHUP_DURATION_MS-aligned in practice).
       - Delta dwell post-land: 900ms (PRE_FINAL_DELTA_DWELL_MS).
       - Delta → Gap crossfade: 250ms (RAIL_CROSSFADE_MS).
       - Gap readable hold: remaining ~850ms.

   Non-pre-final pauses unchanged (MATCHUP_RESOLVE_PAUSE_MS = 850ms).
   The pre-final window may exceed 1500ms — it's the climax, allowed
   to run long. Per-arc reveal duration for 6 sets grows by 500ms
   relative to C-revision (from 17.6s to 18.1s) — acceptable trade
   for a readable climax.

3. GAP GATE: DROP isFinalSetDecisive().decisive.

   The gap "NEXT / <finalRecipientCard.name> / Need +X.X" now fires
   in the penultimate paused window of EVERY decisive-or-not arc.
   Sealed/blowout games no longer suppress the gap. New gate:

     gapShouldFire = isPaused
                  && matchupCount >= 2
                  && matchupIndex === matchupCount - 2
                  && finalRecipientCard exists

   Rationale: (a) Consistent closing beat — every arc gets the same
   visual cadence into the final card. (b) Absence-of-gap previously
   leaked that the game was already decided ("oh, no anchor moment →
   blowout"); removing that signal preserves suspense even on
   already-sealed arcs.

   Copy stays "Need: +X.X" / "Hold: X.X" / "TIED" literally even when
   the gap is mathematically unreachable. The helper's `needPoints`
   is `abs(senderRunning - recipientRunning)` regardless of decisive;
   on a sealed game it just shows a large value. [TBD with John —
   the literal copy may want different framing for unreachable cases
   like "Out of reach" or similar.]

Tests touching the prior decisive gate: existing
`isFinalSetDecisive` helper tests in `__tests__/useH2HReveal.test.tsx`
test the HELPER directly (math) and remain valid — the helper itself
is unchanged; only the UI gate dropped its `.decisive` check. The
H2HRevealScreen single negative-existence guard for legacy AnchorFrame
data-attrs also remains valid (those attrs are emitted only via the
data-h2h-rail-gap element now; the legacy data-h2h-anchor-frame
selector still returns null since that element is permanently gone).

---

C-rev3 (2026-06-12, post-hardware-glass): measured-anchor correction +
gap text bump to match delta

Two fixes confirmed on John's hardware. The A-revision math (translateY
calc(-50% + 6px)) and the gap-text typography (14/12 fontSizes) read
WRONG on real devices — not theoretical. Both corrected by measurement-
informed values; the prior math-derived defenses are retired.

1. SLOT ANCHOR — MEASURED CORRECTION
   - John's report: the delta line sits HIGH, "up near the top hero's
     face" rather than on the line between Mike's and YOU's corner
     totals.
   - Math-derived analysis (pre-rev3) computed wrapper center at
     `grid_50% + 6`, claimed-equal to the corner-total baseline
     midpoint. The math assumed the battlefield grid is the absolute-
     positioned-ancestor's content box and that the grid's content
     height equals HERO_MIN_HEIGHT (no slack). Both true per spec; the
     real-device render still reads as visually high — there's a gap
     between the theoretical math and the rendered position that no
     amount of analysis closes from CSS source.
   - Resolution: REPLACE the +6 literal with +51 (current +6 plus the
     ~45px downward shift John estimates from hardware). The literal is
     now a MEASURED baseline-midpoint correction, not a math-derived
     baseline-from-center offset. If hardware glass shows the new value
     is off by N px, increment the literal by N — direct measurement
     trumps derived math here.
   - Documented as a measured value, not a magic number. Future
     contributors: do not "recompute" this value from CSS measurements;
     it is calibrated against actual phone rendering.

2. GAP TEXT SIZE — MATCH THE DELTA
   - John's report: "NEXT / <player> / NEED +X.X" reads smaller than
     the per-set delta beside it. Inconsistent typography.
   - Resolution: player name fontSize 14 → SCORE_CELL_FONT_SIZE_PX (20).
     Need line fontSize 12 → SCORE_CELL_FONT_SIZE_PX (20). Eyebrow
     "NEXT" stays at fontSize 9 (label, not value).
   - Long-name tradeoff (flagged for John's call): at fontSize 20 in
     the 80px-wide slot, char width ≈ 13-14px → max ~6 chars per line.
     - "LeBron James" → breaks at space: "LeBron / James" (2 lines).
       Fits cleanly.
     - "Luka Dončić" → "Luka / Dončić" (2 lines). Fits.
     - "Giannis Antetokounmpo" → "Giannis / Antetok / ounmpo" (3 lines
       since "Antetokounmpo" exceeds 80px). Total stacked content
       (eyebrow + name + need) ≈ 84-106px, OVERFLOWS the 80px slot.
     The 80px slot height (RAIL_SLOT_HEIGHT_PX) accommodates LeBron-
     class names cleanly; Giannis-class names overflow at the bigger
     font size. Tradeoff: glassed at fontSize 20 per directive
     ("if it overflows at the bigger size, that's the tradeoff to
     flag, not silently shrink back"). Levers on John's call: bump
     RAIL_SLOT_HEIGHT_PX, drop name fontSize back to 14 for long
     names only, or accept the overflow.

Unchanged from C-rev2: blink primitive (B), gap gate (pre-final paused
+ finalRecipientCard exists, sealed/blowout NOT suppressed), ANCHOR_HOLD_MS =
2000, PRE_FINAL_DELTA_DWELL_MS = 900, FINAL_HOLD_MS = 1500.

---

C-rev3 closeout MIS-BUILD (2026-06-12) — STRUCK / REVERTED

The block below this one (slot 80→110, word-break recipe, long-name
typography) implemented a SUPERSEDED plan. John's decision was to
DROP the player name from the gap entirely, which eliminates the
overflow problem at its root. The slot does not grow, the word-break
recipe is moot, and the typography tuning never had a long-name to
fight. Block kept below for diff history; do NOT use it as a current-
state reference. The CORRECTED closeout follows after.

1. RAIL_SLOT_HEIGHT_PX 80 → 110.
   - Long names like "Giannis Antetokounmpo" at fontSize 20 stack to
     3 lines in the gap layer (NEXT eyebrow + 2-3 lines of name +
     Need line) ≈ 84-106px. The 80px slot overflowed. 110px fits
     3-line names cleanly with a small margin.
   - The +51 anchor (translateY) is UNCHANGED. The slot's center
     stays at the same Y because translateY(-50%) compensates for the
     element's own height — wrapper center = parent_50% + 51
     regardless of whether the wrapper is 80px or 110px tall. Only
     the slot's BOUNDING BOX grew; the visible delta line + gap
     content midpoint did not move.
   - Clearance vs hero cards (at the binding 390-viewport, where grid
     is shortest):
       Slot top edge:    grid_50% + 51 - 55 = grid_50% - 4  → ~3px below the top hero card's bottom edge.
       Slot bottom edge: grid_50% + 51 + 55 = grid_50% + 106 → ~99px INSIDE the bottom hero card's top.
     The 3px above-card clearance is tight but cleanly positioned at
     the row gap; the bottom card overlap is significant (slot box
     covers ~63% down the bottom card). The gap layer's content
     centers within the slot, so the BOTTOM line of the gap stack
     sits ~slot_center + 30 = grid_50% + 81, which is ~74px into the
     bottom card. The gap layer is pointer-events:none and uses a
     transparent background, so the bottom card stays visually intact
     underneath; only the gap's text glyphs overlay the card. If
     hardware glass reads as "the gap content is crowding the bottom
     card", the lever is to nudge the +51 anchor back UP toward the
     geometric midpoint, accepting the previous "delta sits high"
     visual.

2. Word-break: prefer space-breaks, mid-word as last resort.
   - Pre-rev3-closeout: `wordBreak: "break-word"` (non-standard alias
     for word-break:normal + overflow-wrap:anywhere) chopped
     "Antetokounmpo" into "Antetok / ounmpo" even though the space
     between "Giannis" and "Antetokounmpo" was a valid break point.
   - Post-rev3-closeout: `wordBreak: "normal"` + `overflowWrap:
     "break-word"` — the standard pair that breaks at whitespace
     first, then mid-word only when a single token still exceeds the
     line width.
   - For "Giannis Antetokounmpo" at fontSize 20 in 80px width:
     - "Giannis" (≈68px) fits on line 1.
     - "Antetokounmpo" (≈145px) exceeds 80px → mid-word break (last
       resort): "Antetoko / unmpo" on lines 2-3.
   - Result: 3 lines total — "Giannis / Antetoko / unmpo". Cleaner
     than the prior "Antetok / ounmpo" chop because the first/last
     name boundary is preserved.

Blink-on-final state: NOT KILLED (kept). The directive's bracketed
"KEEP → no change. KILL → suppress" alternatives were not
explicitly decided in this turn's brief; default to KEEP — the
blink fires on the FINAL set's resolution alongside the FINAL verdict.
If John's glass says it overstays its welcome, the one-line conditional
named in § B (suppress when popState.deltaLandedKey === matchupCount -
1) is ready to apply.

---

C-rev3 closeout CORRECTED (2026-06-12, post-hardware-glass-2):
drop the player name from the gap; slot stays 80px

The actual decision (vs the mis-build above): retire the
finalRecipientCard.name rendering from the gap layer entirely. With
no name, there is no long-name problem — no Giannis overflow, no
mid-word break to tune, no slot growth needed.

The corrected gap layer reads:

  Eyebrow: "LAST CARD"                (small label, fontSize 9)
  Value:   "Need: +X.X"               (fontSize SCORE_CELL_FONT_SIZE_PX = 20)

— stacked vertically, centered in the slot. The value's color +
copy framing still come from isFinalSetDecisive().{framing,
needPoints}:
  overtake → "Need: +X.X"  (green, recipient must climb)
  hold     → "Hold: X.X"   (amber, recipient must defend)
  tie      → "TIED"        (neutral)

Reverted from the mis-build:
- `RAIL_SLOT_HEIGHT_PX: 110 → 80`. The two-line stack (eyebrow +
  value) ≈ 32px tall; the 80px slot holds it comfortably with margin
  above and below.
- Removed the `wordBreak: "normal"` + `overflowWrap: "break-word"`
  combo on the (now-removed) name element. No text wraps in the
  corrected gap; both lines are single-token.

Removed DOM:
- `data-h2h-rail-gap-name` element retired with the name itself.
  Tests asserting this attribute updated/removed accordingly.

Kept unchanged:
- `+51px` translateY delta anchor.
- Blink primitive (B) — fires on every set including FINAL.
- Gap gate: penultimate paused + finalRecipientCard exists (any
  game; sealed/blowout still shows).
- Pacing: ANCHOR_HOLD_MS=2000, PRE_FINAL_DELTA_DWELL_MS=900,
  FINAL_HOLD_MS=1500.
- Need literal "+X.X" copy even when unreachable (per C-rev2 lock).

Blink-on-final state: KEPT (John confirmed). Documented explicitly
this turn — no more "default to keep" ambiguity. The blink fires on
the FINAL set's resolution alongside the FINAL verdict.

---

C-rev3 ROOT-CAUSE FIX (2026-06-12, post-hardware-glass-3): measured
delta anchor + results verdict full-width centering

Three prior attempts at delta centering failed for the same root
reason: the anchor used a hand-tuned `translateY(calc(-50% + Npx))`
literal inside the battlefield grid (50% = midpoint of the two HERO
CARDS — wrong reference; John wants midpoint between the two TEAM
TOTALS in the panel headers). Each pass nudged N (6 → 51 → 51 again);
each hardware glass showed the delta still misaligned because the
anchor was theory-derived and didn't match real device rendering.

This pass replaces the magic literal with a MEASURED anchor. The
delta's vertical center is computed at runtime from the rendered
positions of the two corner ScoreCells (the actual targets the user
sees), then applied. Device-independent, font-independent,
theory-independent.

FIX 1 — Measured delta anchor

Mechanism (lives in H2HRevealScreen.tsx alongside the float wrapper):
- `floatRef = useRef<HTMLDivElement>(null)` on the
  `data-h2h-mid-rail-float` wrapper.
- `useState<number | null>(null)` for the measured `top` value in px.
- `useLayoutEffect`:
    1. Query DOM for `[data-h2h-team-score-position="opponent"]` (the
       Mike total in the top panel) and
       `[data-h2h-team-score-position="user"]` (YOU total in the
       bottom panel). Both are emitted by the shared ScoreCell on the
       reveal surface.
    2. Read each cell's `getBoundingClientRect()` → viewport-Y of
       each cell's vertical center.
    3. Midpoint = (opponentCenterY + userCenterY) / 2 in viewport
       coordinates.
    4. Convert to the float's offsetParent coordinate system: subtract
       the offsetParent's viewport-top, then subtract half the float's
       own height to get the float's `top` value.
    5. Set state only if the new value differs from current by ≥ 0.5px
       (loop guard).
- Recompute on: mount (effect's initial run), `window.resize` event,
  `document.fonts.ready` resolution (web-font load can shift text
  baselines).
- Render: while `measuredTop === null` (initial frame before
  measurement), fall back to a `top: 50%; translateY(-50%)` default
  so the float isn't off-screen. After the layout effect commits
  (synchronously, before browser paint), switch to `top:
  <measured>px` with no translateY. Net: user only ever sees the
  measured position.

What this replaces:
- `transform: translateY(calc(-50% + 51px))` — DELETED.
- The +51 literal, its comment, and the entire "measured but really
  glassed hand-tune" rationale — DELETED.

What stays:
- All other float wrapper styles: `position: absolute; right: 0;
  width: RIGHT_RAIL_WIDTH_PX; pointerEvents: none`. The horizontal
  anchor is unchanged.
- The `data-h2h-mid-rail-float` and `data-h2h-mid-rail-rolling-value`
  data attrs. Test selectors unaffected.

Anti-regression guard: if a future contributor reintroduces a
hardcoded translateY offset on this float, they MUST explain why the
measured-anchor approach is insufficient. Theory math repeatedly drifts
from device rendering; this is the lesson encoded.

FIX 2 — Results verdict block full-width centering

`H2HResultsOverlay.tsx` verdict commentary block at gridRow 1: change
`gridColumn: "1 / span 2"` → `gridColumn: "1 / -1"`. The block now
spans all three grid columns (left rail + center + right rail) and
centers on the board's true horizontal center via the children's
existing `textAlign: center`. Pre-fix the block was centered within
just the left + center columns, leaving its visual center ~40px LEFT
of the board's true center (= RIGHT_RAIL_WIDTH_PX / 2 = 40).

Other text-block audit (report-only, NOT fixed this pass):
- "Tap a card to see the game logs we pulled" hint
  (`data-h2h-overlay-hero-hint`): rendered as `position: absolute;
  bottom: calc(100% + 6px)` relative to the user HeroCell, with
  `textAlign: center; left: 0; right: 0`. Its horizontal center
  equals the HeroCell's horizontal center.
- Dashed empty card slot (`HeroCell` with `showEmptyBorder`,
  data-occupied="false"): renders at the HeroCell's position.
- Both inherit the HeroCell's column position: `gridRow: 2,
  gridColumn: 2` (the center 1fr column). Math: at 358px board,
  cols are [100][1fr=178][80]. Center column center-X = 100 +
  178/2 = 189. Board center = 179. The center column is **~10px
  RIGHT of true center** (= RIGHT_RAIL_WIDTH_PX/2 - LEFT_RAIL_WIDTH_PX/2
  + asymmetry = (80-100)/2 + offset = ~10).
- The hint + dashed slot are therefore ~10px right of true center —
  small, less severe than the verdict block's ~40px left-of-center.
  Flagged for John's call on whether to true-center them too.

FIX 3 — Need-line clip audit

The gap layer's need-line ("Need: +X.X") can render values like
"+60.6 FP" in normal play. At fontSize 20 weight 800 tabular-nums
the text is ~95-100px wide, exceeding the 80px slot width.
- Float wrapper is `position: absolute; right: 0; width: 80px`. The
  need-line has no `overflow: hidden`.
- Text overflows naturally to the LEFT (since right is locked at the
  wrapper's right edge by the absolute positioning). The overflow
  extends into the right-rail area which is empty on the reveal
  surface (RIGHT_RAIL_WIDTH_PX = 80 of right rail with no other
  content after RD6.1 right-rail-ScoreCell deletion).
- Renders clean per John's glass. NO clip guard added.

────────────────────────────────────────────────────────────────────
C-rev3 ROOT-CAUSE FIX rev2 (2026-06-13, post-hardware-glass-4):
text-vs-box correction + ?debug=center instrumentation harness
────────────────────────────────────────────────────────────────────

CONTEXT. The rev1 measured anchor (`railFloatTopPx`, useLayoutEffect at
H2HRevealScreen.tsx ~1716) reads the two corner ScoreCells' rendered
rects, computes their center-Y midpoint, and sets the FLOAT WRAPPER's
`top` so the WRAPPER's center lands on the midpoint:

    newTop = midpointViewportY − parentRect.top − floatRect.height / 2

On John's hardware the delta is STILL off after this fix — the fourth
failed position pass. STOP GUESSING; this pass MEASURES and fixes the
single most-likely remaining cause, and ships a debug harness that makes
the failure visible if the suspected cause is wrong.

SUSPECTED CAUSE — text center ≠ box center. `floatRect` is the float
wrapper, whose height ≈ RAIL_SLOT_HEIGHT_PX (80). The wrapper is sized
for the (taller) gap layer; the visible 1-line delta glyph is
flex-centered INSIDE the 80px slot. Centering the 80px BOX on the
midpoint is only equal to centering the GLYPH if the glyph's rendered
center coincides with the box center — which depends on line-box
metrics, the flex chain, and device font rendering. The thing the user
sees is the GLYPH ("Lost 12.3 FP"), not the box.

FIX (reveal side only) — anchor the GLYPH, not the wrapper. The
measurement now:
  1. Measures the two corner ScoreCells' center-Y → midpointViewportY
     (unchanged).
  2. Queries the actual delta glyph element
     (`[data-h2h-mid-rail-flash]`, inside MidRailContent) and reads ITS
     rendered rect → glyphCenterY.
  3. Computes the rigid translation that moves the glyph onto the
     midpoint:  Δ = midpointViewportY − glyphCenterY, and sets the
     wrapper's new top = (floatRect.top + Δ) − parentRect.top.
     Because the glyph is rigidly offset from the wrapper, shifting the
     wrapper by Δ shifts the glyph by Δ → glyph center lands on the
     midpoint regardless of any internal box/text offset.
  4. Fallback: if the glyph isn't mounted yet (idle/entering, cards
     null → MidRailContent renders an empty aria-hidden div with no
     `data-h2h-mid-rail-flash`), fall back to the wrapper-center method
     so the initial frame is still reasonable; re-measures once the
     glyph appears.
  5. Deps gain `reveal.phase` + `reveal.matchupIndex` so the measure
     re-runs when the glyph first appears and on each set boundary. The
     existing ≥0.5px loop-guard prevents thrash (corner-total positions
     are stable; only the first glyph-present measure moves the value).

This is device/font/structure independent — it reads the glyph the user
actually sees and lands ITS center on the measured midpoint. No literal,
no theory math.

INSTRUMENTATION — `?debug=center` (TEMPORARY; remove before merge).
Gated entirely behind the `?debug=center` query param so it NEVER ships.
When present:
  - Four 1px full-width `position: fixed` horizontal lines at the
    measured viewport-Y of:
      (1) opponent total center  — color A (#00E5FF cyan)
      (2) user total center      — color B (#FFEA00 yellow)
      (3) computed midpoint      — color C (#FF00E5 magenta)
      (4) delta glyph center     — color D (#00FF66 green)
  - `console.log` of those four Y values + the float `top` applied.
Lines 1&2 should sit on the two corner totals; line 3 halfway between;
line 4 (the delta) should land ON line 3. If line 4 is off line 3,
the readout shows by how much and in which direction; if lines 1&2 or 3
are wrong, the breakdown is in the totals measurement / midpoint instead.
Markers are OFF and zero-cost without the param.

Anti-regression: the glyph-anchor + debug harness supersede the
wrapper-center formula. Do not revert to `floatRect.height / 2`
centering — it centers the box, not the glyph.

────────────────────────────────────────────────────────────────────
FIX 2b — Results "tap a card" hint: copy + board-center
(supersedes the FIX 2 "report-only" audit above — John's call made)
────────────────────────────────────────────────────────────────────

`H2HResultsOverlay.tsx`, empty user HeroCell (`showEmptyBorder`,
data-occupied="false"):

COPY. The empty-state hint changes to EXACTLY:
    "Tap a card to see the game logs"
(dropping the trailing "we pulled"). Occupied/front-side hint
("Tap again — game logs are on the back") is unchanged.

CENTERING. The hint + the dashed empty card slot move to the BOARD's
true horizontal center (same goal as the verdict block's FIX 2), NOT
the middle grid column (~10px right). The verdict used a full-column
span; the hero cell can't span columns because the OCCUPIED hero card's
X is LOCKED byte-identical to the arc (no-snap geometry parity — the
results occupied hero must sit in the center column exactly where the
arc's hero card sits). So the board-centering is applied to the
EMPTY-state inner box ONLY, via a DERIVED horizontal shift:

    translateX( (RIGHT_RAIL_WIDTH_PX − LEFT_RAIL_WIDTH_PX) / 2 )
    = (80 − 100) / 2 = −10px  →  center column center − 10 = board center

Not a magic literal: it is exactly the center-column-vs-board-center
offset implied by the asymmetric rails (`[100px 1fr 80px]`). The shift
is applied to the dashed box, which carries the absolutely-positioned
hint (left:0/right:0) — so the hint and the slot move together and both
land on board center, aligned with the centered verdict above. The
occupied-card path (card present → no translate) is untouched, so the
LOCKED occupied X/Y is byte-identical.

Net empty-state column: verdict (board center) / hint (board center) /
dashed slot (board center) — vertically aligned. Reveal side unaffected;
this is overlay-only and touches no ScoreCell, so the no-snap gates are
unaffected.

────────────────────────────────────────────────────────────────────
C-rev3 ROOT-CAUSE FIX rev3 (2026-06-13, post-debug-glass): ENDPOINT
correction — measure the totals' GLYPHS, not their cell boxes
────────────────────────────────────────────────────────────────────

WHAT THE ?debug=center GLASS SHOWED (John's phone). The GREEN delta
glyph line sat EXACTLY on the MAGENTA midpoint — the delta-glyph anchor
(rev2) works. But the CYAN line (opponent endpoint) landed BELOW Mike's
178.4 and the YELLOW line (user endpoint) landed ABOVE the YOU total:
both ENDPOINT measurements hit the ScoreCell *box* center, not the
rendered NUMBER's center. The midpoint was therefore computed between
two wrong points, and the delta glyph faithfully centered on a wrong
midpoint → read high. Fixing the glyph again can't help; the ENDPOINTS
are mis-measured.

WHY box-center ≠ glyph-center for the totals. The measured endpoint is
`[data-h2h-team-score-position="opponent"|"user"]` — the ScoreCell
OUTER flex div. On the opponent side it sits next to the "Target:"
label inside the absolute `[data-h2h-board-corner-score]` wrapper in the
ZoneHeader band; the row/band layout makes the outer box's vertical
center diverge from the digit's rendered center. (The delta float
avoided this by measuring its INNER glyph `[data-h2h-mid-rail-flash]`,
not its slot box — rev2.) The totals need the same treatment.

FIX (reveal side only). Apply the rev2 lesson to the ENDPOINTS:
  1. Tag the ScoreCell's inner number div (the element that holds
     `{shownStr}`, in H2HScoreRail.ScoreCell) with
     `data-h2h-team-score-glyph="true"`. This is the same tight-glyph
     element kind the delta already anchors on; present on both
     surfaces but only the reveal measurement reads it.
  2. In the measure(), for each total, query the glyph WITHIN the
     positioned cell (`cell.querySelector('[data-h2h-team-score-glyph]')`)
     and take ITS rect center; fall back to the cell box only if the
     glyph node is absent. Recompute midpoint from the two GLYPH
     centers.
  3. The delta glyph anchor logic is UNCHANGED (rev2 — it works). Only
     the two endpoints it targets change.
No magic literal: every Y is read from a rendered glyph rect.

VERIFY (existing harness). The cyan/yellow debug lines must now land ON
the two totals' rendered numbers (Mike's 178.4, YOU's total), not inside
the panel chrome; magenta halfway between them; green delta on magenta.
?debug=center stays gated / remove-before-merge.

CAVEAT — desktop cannot reproduce the divergence; phone glass is the
verdict. On the desktop reveal-mock (Playwright/Chromium, 390×844) the
ScoreCell OUTER box center and the inner glyph center COINCIDE (Δ = 0.0
on both totals) — structurally expected, because the corner-score
wrapper (`[data-h2h-board-corner-score]`, top:0/bottom:0, flex
alignItems:center) centers the ScoreCell, which itself flex-centers its
glyph, so box-center == glyph-center == band-center. So on desktop this
endpoint change is a provable NO-OP (delta residual stays −0.01px); it
can only help where box≠glyph, which is the device John observed. The
asymmetry he reported (opponent endpoint LOW / user endpoint HIGH) is
NOT consistent with a uniform font-metric offset, so the on-device cause
is still not fully pinned.

DIAGNOSTIC added to ?debug=center: the console.log now prints, per
total, BOTH the box-center Y and the glyph-center Y (opponentBoxY vs
opponentGlyphY, userBoxY vs userGlyphY). On John's phone this shows
DEFINITIVELY whether box≠glyph on-device:
  - If boxY and glyphY DIVERGE on the phone → the glyph measurement is
    the fix; cyan/yellow should now sit on the numbers.
  - If boxY ≈ glyphY on the phone too (as on desktop) → the endpoint
    cause is elsewhere; the cyan/yellow lines vs the visible numbers
    localize the residual and we measure the next layer (e.g. line-box
    vs visible-digit baseline, or a per-box band asymmetry).

────────────────────────────────────────────────────────────────────
C-rev3 ROOT-CAUSE FIX rev4 (2026-06-13, post-phone-crop): the APPLY
coordinate-conversion was wrong on iOS — go coordinate-INDEPENDENT
────────────────────────────────────────────────────────────────────

WHAT THE PHONE CROP SHOWED. ?debug=center on John's phone: the GREEN
delta line sits NEAR the CYAN (top/opponent) line with a large empty gap
down to the YELLOW (bottom/user) line — biased HARD toward the top, NOT
at the midpoint. The desktop "delta == midpoint, residual −0.01px"
result was measured where the bug does not reproduce. Trust the phone.

ROOT CAUSE (apply, not measure). The endpoint glyph rects + midpoint can
be perfectly correct, yet the float lands biased, because the APPLY step
converted the viewport-space midpoint into a CSS `top` using
`floatEl.offsetParent`'s rect:
    newTop = floatRect.top + (midpoint − glyphCenter) − offsetParentRect.top
But a CSS `top` on an absolutely-positioned element resolves against its
CONTAINING BLOCK — the nearest ancestor that is positioned OR has a
`transform`/`filter`/`perspective`. `offsetParent` only tracks the
nearest POSITIONED ancestor and ignores a transformed-but-static one. If
some ancestor in the real app/iOS layout has a transform (crossfade,
board scale, momentum-scroll container, -webkit stacking), the
containing block ≠ offsetParent, and the conversion is off by the gap
between them → the float is placed in the wrong coord origin → biased.
Desktop Chromium on the lean mock route has no such ancestor, so it
looked perfect.

FIX — coordinate-INDEPENDENT relative apply. Stop converting viewport→
top through offsetParent. A 1px change in the float's CSS `top` moves the
float (and its glyph) 1px in the viewport, as long as no SCALING
transform is in the chain (pure translate + scroll preserve 1:1). So:
    newTop = currentAppliedTop + (midpoint − glyphCenterNow)
reading currentAppliedTop from a ref mirror of the applied state. This
needs NO offsetParent, NO parentRect — it is immune to a transformed/
≠-offsetParent containing block and to scroll. offsetParent is used ONCE
for the very first bootstrap placement (before any applied top exists),
then every correction is relative.

CONVERGENCE. Because the static mock end-state never changes phase, the
correction must self-trigger: measure() runs in a BOUNDED rAF settle
loop (≤6 frames) that re-measures after each apply and stops when the
residual |midpoint − glyphCenter| < 0.5px. This makes the relative
correction land even with no external re-trigger, and converges in 1–2
frames when already close.

INSTRUMENTATION (phone self-diagnosing — no desktop assumptions). On
?debug=center the console.log now prints, all in viewport-Y:
  - opponentGlyph top/center/bottom, userGlyph top/center/bottom
  - midpoint
  - float offsetParent top; float rect top/center/bottom AS RENDERED
  - the FINAL applied `top`
  - transformChain: any ancestor with a non-none transform/filter/
    perspective (prints "residual transform" entries) — the prime
    suspect for the containing-block mismatch
  - postApplyResidual = midpoint − floatGlyphCenter measured on the
    settled frame; MUST be ~0 ON THE PHONE.
From one phone dump we can now see whether (a) glyph rects are wrong on
iOS, (b) midpoint math is wrong, (c) a leftover transform shifts the
float, or (d) applied top ≠ measured center (offsetParent mismatch).

NOTE: this still cannot be reproduced on desktop (Chromium mock lands at
residual ~0 either way), so the relative apply is harmless-equivalent on
desktop and corrective on iOS. John's phone postApplyResidual is the
verdict.

