# H2H score-rail unify — refactor lock

**Type:** refactor lock (not a feature lock).
**Scope:** unify the right-column score rendering across `H2HRevealScreen` and `H2HResultsOverlay` into one shared `ScoreCell` component plus one shared set of rail-width + win/loss-color constants. Structural only. No relay behavior.
**Branch:** `refactor/h2h-score-rail-unify` off main @ `3cb6e99`.

## Why this exists

Today the three right-column numbers (opp total / delta / my total) render through two non-unified code paths:

- Reveal: `ScoreCell` (`H2HRevealScreen.tsx:1174-1186`) accepts `displayTotal`, wraps `TeamScore` (`H2HRevealScreen.tsx:850-877`), 3-div DOM.
- Results: a different `ScoreCell` (`H2HResultsOverlay.tsx:417-442`), no `displayTotal`, no wrap, 2-div DOM.

Rail-width and color constants are duplicated:

- `SCORE_COLUMN_WIDTH_PX = 80` (`H2HRevealScreen.tsx:243`) and `RIGHT_RAIL_WIDTH_PX = 80` (`H2HResultsOverlay.tsx:141`) — same value, different name, same column.
- `LEFT_RAIL_WIDTH_PX = 100` defined in both (`H2HRevealScreen.tsx:254`, `H2HResultsOverlay.tsx:140`).
- `WINNING_COLOR` / `TRAILING_COLOR` / `DELTA_NEUTRAL` defined identically in both (`H2HRevealScreen.tsx:181-183`, `H2HResultsOverlay.tsx:183-185`).

"The three numbers never move between reveal and results" is currently true only by coincidence of two `80`s being typed the same. The relay tension feature about to land needs that invariant to be structural, so behavior added once lands identically on both surfaces.

## Hard constraint — no-visible-change refactor

**Output must be pixel-identical to current main on both surfaces. Any deviation is a bug.** This is not "should look basically the same"; it is "if you can see a difference, that is the bug we shipped."

## What this lock allows

- New file `shared/components/H2HScoreRail.tsx` exporting:
  - `ScoreCell({ total, displayTotal?, isLeading, surface })` — `surface: "reveal" | "overlay"` drives the data-attribute namespace (see "Data attributes" below).
  - `RIGHT_RAIL_WIDTH_PX = 80`
  - `LEFT_RAIL_WIDTH_PX = 100`
  - `WINNING_COLOR`, `TRAILING_COLOR`, `DELTA_NEUTRAL`
- `H2HRevealScreen.tsx`: delete local `ScoreCell` + `TeamScore` + duplicated constants; rename `SCORE_COLUMN_WIDTH_PX` references to `RIGHT_RAIL_WIDTH_PX`; import from the new shared module.
- `H2HResultsOverlay.tsx`: delete local `ScoreCell` + duplicated constants; import from the new shared module.
- 3→2 div collapse on the reveal side (drop the `TeamScore` middle div).
- `textAlign: "center"` lives on the inner styled div in the unified component.
- `lineHeight: 1.05` lives on the inner styled div in the unified component.

## What this lock forbids

- Any change to the rendered number's font, weight, color, tabular-nums, letterSpacing.
- Any change to delta values, delta colors, or the per-set / final-gap formula split.
- Anything that grows or shrinks the number based on per-set magnitude.
- Any leader brightness, leader glow, win/loss color flicker, or other lead-state visual effect beyond the existing leading-vs-trailing color.
- Any change to the per-set running-total climb behavior. `displayTotal` semantics on the reveal call site must keep working exactly as today (load-bearing per-set animation driven by `useH2HReveal`).
- Any change to harness query attribute names. Surface prop preserves both existing namespaces verbatim.

## Reconciliations called explicitly

These are code differences between the two current paths that the unified component has to pick one of. Each is a deliberate decision, not an accident.

| Property | Today on reveal | Today on results | Unified |
|---|---|---|---|
| DOM depth | 3 divs (ScoreCell → TeamScore → inner) | 2 divs (ScoreCell with data-attrs → inner) | 2 divs |
| `lineHeight` | `1.05` on middle div | inherited browser default (`normal`, typically ~1.2) | `1.05` explicit on inner div — **results is the changed side** |
| `textAlign: "center"` | on middle div | on inner div | on inner div |
| Font, weight, tabular-nums, letterSpacing | identical | identical | unchanged |
| Color treatment | `isLeading ? WINNING_COLOR : TRAILING_COLOR` | identical | unchanged |

### lineHeight: results is the changed side — call it out

The reveal surface today already explicitly sets `lineHeight: 1.05`. The results surface inherits the browser default, which is `normal` (font-dependent, typically ~1.2). Reconciling to `1.05` makes line-box height ~3px shorter on the results-side score box than it is today.

For a single-line 22px number inside a `alignItems: center` flex cell, the glyph baseline within its line-box does not change; the flex parent re-centers around the box's new height. In practice this should be visually identical. **In theory it could shift the glyph's vertical center by up to ~1.5px** depending on cell stretch dynamics. The visual harness cannot see this — it asserts presence + horizontal position, not sub-pixel vertical drift.

**Device-parity gate (required, calling it as its own check line):**

> The results-surface score number's vertical position must be unchanged. This is a dedicated check, not folded into a general "looks the same" pass.

If the device check reveals a shift, the lock is violated and the fix is either:
(a) push `lineHeight: 1.05` to a wrapper outside the inner styled div on results to recover the original line-box height there (variant prop, ugly), or
(b) keep the inherited default on both sides instead of `1.05` (no explicit lineHeight in the unified component) — the reveal side becomes the changed side instead.

We choose (a)/(b) at the moment of failure; not pre-committing.

## Data attributes (no change to harness queries)

The `surface` prop drives the data-attribute namespace. The component emits the existing per-surface attributes verbatim so the harness queries in `scripts/verify-h2h-play-layout.mjs` (and any consumer tests) continue to work without modification.

- `surface="reveal"` → `data-h2h-team-score="true"` + `data-h2h-team-score-display={shown.toFixed(1)}` (where `shown = displayTotal ?? total`)
- `surface="overlay"` → `data-h2h-overlay-score="true"` + `data-h2h-overlay-score-value={total.toFixed(1)}`

Harness queries preserved:
- `scripts/verify-h2h-play-layout.mjs:735` `[data-h2h-recipient-reveal] [data-h2h-team-score]`
- `scripts/verify-h2h-play-layout.mjs:739` reads `data-h2h-team-score-display`
- `scripts/verify-h2h-play-layout.mjs:1394-1395` `[data-h2h-overlay-score]` (index 0 = opp, index 1 = me)

The single-attribute-pair option (cleaner DOM, requires harness rewrite) is explicitly deferred.

## Forward-intent — relay Z channels

The relay-tension feature will need TWO INDEPENDENT visual channels on the unified score number:

- **Z1: size growth** — number grows by per-set magnitude when a set resolves (number-pop scaling).
- **Z2: leader brightness / glow** — separate from per-set magnitude; tracks running-lead state.

The 2-div collapse approved here MUST leave a clean attachment point for both channels so the relay pass can wire them up **without re-introducing a wrapper div we're deleting now.**

Structure for forward-attach:
- **Outer div** (the data-attribute-carrying flex-centered cell) is the attachment point for **Z2 (leader brightness/glow)**. A future `style.boxShadow` / `filter: brightness(...)` / wrapper-`outline` lands on the outer div without touching the inner glyph. The outer div is *also* the layout anchor (flex centering + grid cell consumer), so Z2's visual treatment hangs off the same node that owns layout — no extra wrapper needed.
- **Inner styled div** (the glyph host) is the attachment point for **Z1 (size growth)**. A future `transform: scale(...)` or `fontSize` ramp lands on the inner div without affecting the outer cell's layout footprint — `transform: scale` does not reflow, and a `fontSize` swap on the inner is contained by the cell's grid-sized bounds.

This is FORWARD INTENT. **Z1 and Z2 are NOT implemented in this refactor.** Do not add unused props, unused attachment slots, or "// TODO: relay" comments. The structure above falls out naturally from the 2-div collapse; that is sufficient.

## Verification

### Harness (automated)

- The existing position / rail-width assertions must continue to exercise BOTH reveal and results surfaces across the viewport sweep.
- A results-surface vertical-position assertion is added (the lineHeight guard's automatable half) — asserts the score cell's vertical center sits at the same Y as the corresponding hero card row, within tolerance.
- For a no-visible-change refactor the suite stays GREEN before and after on both surfaces.

### Device parity (manual, on PROD after merge)

Cannot be verified on a Vercel preview — recipient reveal + results flow uses per-origin anon sessions and the dev mock route is stripped from production builds. Verify on PROD once Production flips to the new merge hash and shows Ready.

Required checks, each its own line:

1. Both totals still animate the per-set climb in reveal (opp ticks alongside me through each matchup, not static).
2. Three numbers in identical right-column positions on BOTH surfaces (opp top, delta middle, me bottom).
3. **Results-surface score number's vertical position is unchanged** (lineHeight reconciliation — see above).
4. Results-side final-score gap value is unchanged (`recipient.totalFp − sender.totalFp`).

## Gates

- `npm test`
- `npx tsc --noEmit`
- Visual harness (`npm run verify:visual`)
- Function count stays 11/12
- `scripts/build-vercel.sh` (shared/ is touched)
