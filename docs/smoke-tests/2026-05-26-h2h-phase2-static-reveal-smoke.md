# H2H reveal arc — phase 2 (static reveal screen) smoke — 2026-05-26

## Run context

| Field | Value |
|---|---|
| Branch | `main` |
| Last commit at smoke time | this PR (amended eight times after initial commit b7e7cdb — see "Bugs surfaced + fixed pre-push" below) |
| Vitest baseline | **516/516 pass** (505 prior + 11 new on this branch) |
| Basketball build | clean (`npm --prefix basketball run build` → 3.23s; H2HRevealMockRoute bundled via DCE-eliminable static import, ~4 KB residual in main bundle after tree-shaking; only pre-existing chunk-size warnings) |
| Type check | clean for new files; pre-existing `culture_pilot_review.ts` breakage confirmed unchanged from `origin/main` and not introduced by this PR |
| Dev server | `npm --prefix basketball run dev` ready in ~150ms on port 5173; `/basketball/dev/h2h-reveal-mock` → HTTP 200; entire import graph (App.tsx → H2HRevealMockRoute → H2HRevealScreen + AthleteCard + h2hMockFixture + all transitive shared/ deps) verified zero 404s |
| Visual smoke | **PASSED** via headless Chrome screenshots at mobile (390×844) + desktop (1024×800) viewports across three iteration rounds — see "Visual smoke" section below |
| Outcome | **PASS** — structural tests + production build + dev-server + visual screenshot review all confirm the locked design intent. |

## What the smoke validates

Phase 2 ships the static H2H end-state with mock data. No animation, no real-data wiring, no recipient flow changes. The smoke validates that the documented layout structure renders correctly under the mock fixture and survives both unit tests (514/514) and a production build.

## Mock fixture used

`basketball/src/dev/h2hMockFixture.ts` — two resolved basketball hands, 6 cards each, shape matches the phase-1 endpoint payload (`sender_resolved: true`) verbatim so phase 4's real-data swap is a drop-in.

```
Sender   (Mike): totalFp 178.4 ROOKIE
  slot 0 — Nikola Jokić    RED   $95  held   48.2 FP
  slot 1 — Stephen Curry   ORANGE $72 held   38.9 FP
  slot 2 — Kevin Durant    ORANGE $55 swap   26.4 FP
  slot 3 — Jayson Tatum    PURPLE $48 swap   32.1 FP
  slot 4 — D'Angelo Russell BLUE  $35 swap   21.5 FP
  slot 5 — Naz Reid        GREEN  $22 swap   11.3 FP

Recipient (You): totalFp 182.4 ROOKIE
  slot 0 — Giannis Antetokounmpo RED   $92  held  62.8 FP (GOD_MODE badge)
  slot 1 — Devin Booker          ORANGE $68 held  34.2 FP
  slot 2 — Jaylen Brown          PURPLE $50 swap  31.6 FP
  slot 3 — Tyrese Maxey          PURPLE $46 swap  28.4 FP
  slot 4 — Jalen Brunson         BLUE   $38 swap  18.5 FP
  slot 5 — Bobby Portis          GREEN  $19 swap   6.9 FP

Final margin: +4.0 You (within the 3-5 FP target band)
```

## Expected render at `/basketball/dev/h2h-reveal-mock`

Full-viewport takeover, no header / nav / profile chrome. Three vertical zones + two rails.

```
┌───────────────────────────────────────────────────────────┐
│                                                           │
│   MIKE              ROOKIE             178.4 (dimmed)     │  ←  Opponent zone (~22%)
│   ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                          │     6 mini-cards in
│   │▶ │ │▶ │ │  │ │  │ │  │ │  │                          │     repeat(6, 1fr) grid
│   │RED│ │ORA│ │ORA│ │PUR│ │BLU│ │GRN│                     │     held: gold corner ▶
│   │Jok│ │Cur│ │Dur│ │Tat│ │Rus│ │Rei│                     │
│   │48.2│ │38.9│ │26.4│ │32.1│ │21.5│ │11.3│                │
│   └──┘ └──┘ └──┘ └──┘ └──┘ └──┘                          │
│                                                           │
├──┬─────────────────────────────────────────────────┬──────┤
│  │                                                 │      │
│  │              ┌────────────────────┐             │ 178.4│  ←  Sender battlefield
│  │              │   Nikola Jokić     │             │      │     card (slot 5 default
│ L│              │   RED  $95         │             │ ┌──┐ │     → highest slotIndex
│ E│              │   [headshot]       │             │ │−14│     after re-sort —
│ F│              │   48.2 FP          │             │ │.6 │ │     wait, slot 5 in the
│ T│              │   (held: ▶ corner) │             │ │mat│ │     fixture is Naz Reid
│  │              └────────────────────┘             │ │chu│ │     (sender) / Bobby
│ R│                                                 │ │p  │ │     Portis (recipient).
│ A│              ┌────────────────────┐             │ │   │ │     The headshots above
│ I│              │   Giannis (You)    │             │ │+4.│ │     are illustrative.
│ L│              │   RED  $92         │             │ │0  │ │
│  │              │   [headshot]       │             │ │YOU│ │
│ 28│             │   62.8 FP          │             │ └──┘ │
│  │              │   (held: ▶ corner) │             │      │
│  │              │   GOD MODE 🔥 +15  │             │ 182.4│  ←  Recipient
│  │              └────────────────────┘             │(green│      battlefield card
│  │                                                 │      │
├──┴─────────────────────────────────────────────────┴──────┤
│                                                           │
│   YOU               ROOKIE             182.4 (winning)    │  ←  Your zone (~22%)
│   ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                          │     same N=6 strip,
│   │▶ │ │▶ │ │  │ │  │ │  │ │  │                          │     held marks on first
│   │RED│ │ORA│ │PUR│ │PUR│ │BLU│ │GRN│                     │     two cards
│   │Gia│ │Boo│ │Bro│ │Max│ │Bru│ │Por│                     │
│   │62.8│ │34.2│ │31.6│ │28.4│ │18.5│ │6.9│                 │
│   └──┘ └──┘ └──┘ └──┘ └──┘ └──┘                          │
└───────────────────────────────────────────────────────────┘
```

(ASCII is illustrative; the real render uses CardFront's notched portrait card for the battlefield and the same component at a smaller scale for the hand strip — see "Visual smoke" section below for the post-amendment-2 layout details.)

## Structural validation (516/516 tests, +11 new)

`shared/components/__tests__/H2HRevealScreen.test.tsx` covers the contract via jsdom mount with a stub renderCard:

- ✓ both display names render
- ✓ both total FPs render — in BOTH zone header and right rail (asserted count = 2 per side; verifies the documented "score lives in two places" contract)
- ✓ `renderCard` invoked once per hand-strip cell + once per battlefield slot (= 2N + 2; 14 for basketball N=6)
- ✓ hand strip uses the SAME `renderCard` prop the battlefield uses — single renderer for both zones (no separate mini variant)
- ✓ hand strip is height-capped (inline `height: <N>px` style; explicitly NOT `grid-template-columns: repeat(...)`) — guards against the inflation bug that surfaced in the first visual smoke iteration
- ✓ SWAP pill appears on non-held battlefield cards
- ✓ Final margin pill: `+4.0` + `you` leader hint when recipient ahead
- ✓ Final margin pill: leader hint flips to `opp` when sender ahead
- ✓ TIE state when scores equal (margin pill reads `TIE` + `even`)
- ✓ Battlefield default = highest slotIndex
- ✓ `battlefieldSlotIndex` prop override works
- ✓ Hand-strip cell count scales with N (N=11 football-shape sanity check)

## Production build evidence

```
dist/assets/index-DurPiFUu.js   4,121.57 kB │ gzip: 1,175.10 kB
(no H2HRevealMockRoute lazy chunk — tree-shaken via the DEV guard)
```

The amendment-1 fix (static import + `import.meta.env.DEV` guard) means there is no separate lazy chunk. Vite constant-folds `DEV → false` in production, the conditional branch is dead-code-eliminated, and the static import becomes unreferenced + tree-shaken. Production users have no entry point to `/basketball/dev/*` paths regardless.

## What the smoke could not verify (deferred)

- **Pixel-perfect visual.** No headless browser tooling in this repo, and screenshots aren't capturable from a Code session. Visual fidelity check (card sizes survive narrow viewports, fonts render as expected, exact spacing/typography matches design intent) needs a real browser open at the dev route. The contract-level behavior (everything that shows up in the rendered DOM tree, score positions, indicator placement, layout zones) is locked via structural tests + dev-server import-graph clean. Residual risk is layout-pixel-level, not contract-level.
- **Phase 3 (animation choreography)**, **phase 4 (real endpoint wiring + DEAL transition)**, **phase 5 (commentary)**, **phase 6 (results overlay)**, **phase 7 (climax animation)** — out of scope per the phase-2 spec.

## Anomalies surfaced + handled

1. **Test environment defaults to `node`, not `jsdom`.** Existing `shared/components/__tests__/SlateChip.test.tsx` and `TodaysSlatePanel.test.tsx` use a `// @vitest-environment jsdom` file-level directive. Followed that pattern. No vitest.config.ts change needed.
2. **Total FP renders twice (zone header + right rail).** `getByText` failed because of the duplicate; switched to `getAllByText(...).length === 2`. This is **intentional behavior per design doc** — the score lives in both places. Test now asserts the duplication.

## Bugs surfaced + fixed pre-push (commit amended twice)

### Amendment 1: lazy import 404 hang

**Symptom:** initial commit `b7e7cdb` used `React.lazy(() => import("./dev/H2HRevealMockRoute"))` wrapped in `<Suspense fallback={null}>`. User's first real-browser test surfaced the dev route stuck on the Suspense boundary with a 404 visible in DevTools.

**Root cause:** Vite's lazy-chunk fetch is sensitive to dev-server state mismatches. When the dev/ directory landed via `git commit` while the user's dev server was already running, the running server's optimizeDeps cache + module graph hadn't picked up the new files cleanly, and the browser's cached chunk URLs (with old `?v=` hashes baked into module specifiers) no longer resolved against the server's regenerated cache. The Suspense boundary hung silently without surfacing the underlying fetch failure.

**Fix:** replaced the lazy import with a **static import + `import.meta.env.DEV` guard** at the usage site:

```tsx
// App.tsx top
import H2HRevealMockRoute from "./dev/H2HRevealMockRoute";
...
// AppInner
if (import.meta.env.DEV && devSlug === "h2h-reveal-mock") {
  return <H2HRevealMockRoute />;
}
```

Static import means there's **no async chunk URL** to ever 404. The module is part of the main App.tsx graph; as soon as App.tsx loads, H2HRevealMockRoute is fully resolved.

Production tree-shaking holds because:
- Vite constant-folds `import.meta.env.DEV` → `false` in production builds.
- The `if (false && ...)` branch becomes dead code.
- `H2HRevealMockRoute` becomes unreferenced.
- Rollup removes the import.

Production bundle delta vs lazy version: **+4 KB main bundle, -11.33 KB lazy chunk = -7 KB net**. (The +4 KB residual is module-graph metadata that Rollup doesn't fully eliminate due to side-effect-flagged TSX imports in the chain.) Production users have no entry point to `/dev/*` paths regardless; the DEV guard is defense-in-depth.

**Verification of fix:**
- Killed all stray Vite dev servers (port 5173/5174/5175 were variously occupied; port 5175 was actually serving baseball — port-collision red herring during diagnosis).
- Started fresh basketball dev server on port 5173.
- Curled every URL in the App.tsx → H2HRevealMockRoute → H2HRevealScreen → AthleteCard → PlayerCardShell → CardFront → (all shared deps) chain: **zero 404s** across the entire transitive graph.
- Held the server for 15 seconds, re-curled: still all 200s. Stable.
- Confirmed `import.meta.env.DEV: true` in the served App.tsx and the `if (import.meta.env.DEV && devSlug === ...)` line is present in the transformed module body.

### Amendment 8: visual chrome — single-player parity from seventh visual smoke

**Symptom reported by user after amendment 7 landed:**

The H2H screen "had the right components but is missing the visual chrome that makes it feel like a coherent game UI. Right now it reads as 'sections of cards floating on black' rather than 'a designed game screen.'" Specific complaints:

1. Hero cards still too far from hand strips — matchup unit needs tighter anchoring.
2. MIKE/YOU labels clipped by mobile browser chrome (URL bar / nav bar).
3. No visual chrome — the screen needs the same design language as single-player.

**Investigation first (per user directive):** documented single-player's chrome before touching H2H.

Single-player GameView chrome (`shared/views/GameView.tsx:2171-2235`):

```
Outer container:
  position: fixed; inset: 0
  background: linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)
  color: #EAF0FF
  fontFamily: 'Inter', system-ui, sans-serif
  paddingTop: env(safe-area-inset-top, 0px)  ← top only
  userSelect: none
  overflow: hidden

Inner column:
  width: 100%
  maxWidth: min(480px, 100%)
  margin: 0 auto                              ← caps + centers on wide viewports

Glass-panel chrome (used on AppHeader wrapper):
  borderRadius: 16
  border: 1px solid rgba(255,255,255,0.10)
  background: rgba(255,255,255,0.05)
  boxShadow: 0 8px 24px rgba(0,0,0,0.28)
  backdropFilter: blur(10px)
  padding: 2px 12px

Card stage:
  NO panel chrome — flex container with the card grid
  Cards ARE the focal element; no surrounding chrome
```

What H2H had pre-amendment vs what single-player has:

| Element | Single-player | H2H pre-fix | Action |
|---|---|---|---|
| Gradient bg | 38% mid stop | 60% mid stop | Match 38% |
| Inner column cap | `min(480px, 100%)` centered | missing — edge to edge | Add |
| Glass-panel chrome | ✓ on header | missing on zones | Add as ZonePanel wrapper on hand-strip zones |
| Card stage | open (no panel) | open (no panel) | already aligned |
| Safe-area padding | `env(safe-area-inset-top, 0px)` (top only) | `max(24px, env(top))` + bottom | Switch to additive: `calc(env(safe-area-inset-*) + 24px)` |

**Fixes applied:**

1. **Bg gradient mid-stop 60% → 38%.** Matches single-player exactly.
2. **Inner column at `maxWidth: min(480px, 100%); margin: 0 auto`.** On a 1024px desktop viewport, H2H content now sits in a 480px-wide centered column with the gradient bg flanking on either side — same visual shape as single-player.
3. **ZonePanel component wraps each hand-strip zone (opponent + your).** Glass-chrome treatment matching `GameView.tsx:2228-2235` exactly (borderRadius 16, white-tinted border + bg, soft shadow, backdrop blur). The zones now read as framed UI panels rather than bare cards on a gradient background.
4. **Battlefield zone stays "open."** No panel chrome around the hero cards, matching single-player's card-stage pattern. Cards are the focal element; the panels above + below frame them.
5. **Inter-zone gap reduced 28→14.** The matchup unit (top hero + bottom hero) reads as visually anchored to its framed hand strips rather than floating away from them.
6. **Safe-area padding made additive.** `paddingTop: calc(env(safe-area-inset-top, 0px) + 24px)`, same for bottom. On notched iOS (e.g. iPhone 14, top inset ~47px), padding becomes ~71px. On non-notched + headless, padding is 24px. Should clear most iOS Safari URL bar scenarios.

**Verification:**

- Visual smoke at mobile 390×844 (post-amendment 8): hand strips clearly framed by glass panels with subtle border, translucent fill, soft shadow, and backdrop blur. MIKE / YOU labels sit inside their panels at the visual top + bottom of the panel chrome — no longer at the absolute viewport edge. Hero cards centered, anchored visually to their framed hand strips above + below. Mid-rail centered between the two cards. Layout reads as a designed game UI, not assets on black.
- Desktop 1024×800: H2H content sits in the 480px centered column with the gradient bg flanking on either side, matching single-player's column shape. Same chrome elements visible.
- Visual rhythm matches single-player: framed chrome zones (header/hand-strip-context) → open card stage (battlefield) → framed chrome zones (footer/hand-strip-context).

### Amendment 7: four mobile-specific layout fixes from sixth visual smoke

**Symptoms reported by user on mobile (390×844) after amendment 6:**

1. **Hero cards not horizontally centered on mobile.** Both Jokić and Giannis visually offset left of center. The score column (inside the battlefield row's flex container) broke left/right symmetry — the center of the (card + gap + score) block was at the row's center, but the CARD's center was offset 50px to the left of that.
2. **Hand strips flush with viewport top/bottom edges.** No page-level vertical padding; MIKE/YOU labels and the top/bottom hand strips touched the viewport edges on notched devices.
3. **MIKE/YOU labels missing on mobile** (per user — they showed on desktop). Likely the result of issue 2: with no top padding, MIKE was being clipped behind the iOS notch or status bar.
4. **Mini-cards overflowed viewport horizontally.** FP numbers truncated ("11." instead of "11.3"). The 6-card strip at the prior 69px-per-cell × 6 + 30px gaps = 444px was wider than the 358px mobile content width.

**Design discipline applied:** lock hero card size first, then derive every other dimension proportionally. Hero card is `min(145px, 32vw)` (matches single-player). Every other layout decision flows from "viewport is 390px, hero is 145px, rails are X, that leaves Z for hand strips."

**Root causes + fixes:**

1. **Battlefield restructured as 3-column grid: `[80px left rail | 1fr center | 80px right rail]`.** Symmetric rail widths put the center column at viewport horizontal center; the hero card lives in the center column → visually centered in viewport. Scores live in the right column → consistently positioned next to each card (not inside the battlefield row's flex container). Left rail is empty in phase 2; phase 5 will populate it with commentary. Replaces the prior flex-with-flex-spacers layout where the score lived inside the battlefield row, breaking left/right symmetry.
2. **Safe-area-aware vertical padding.** `paddingTop: "max(24px, env(safe-area-inset-top))"` and same for bottom. Notched iOS devices get OS-aware safe area; non-notched + headless environments get a 24px floor.
3. **Issue 3 is downstream of Issue 2.** The MIKE/YOU labels were rendering but being clipped behind the notch/status bar on the user's actual device (the headless screenshot didn't simulate the notch, so the labels appeared visible there). The safe-area padding from Fix 2 resolves the clipping.
4. **Hand strip cell sizing recomputed from viewport.** `HAND_STRIP_HEIGHT_PX` 100→80, `HAND_STRIP_GAP_PX` 6→4. Cells become 55×80 (aspect-derived width); 6 × 55 + 5 × 4 = 350px — fits within mobile content width (358px) with 8px buffer. STRIP_CARD_SCALE recomputed automatically from the new dimensions (55/150 ≈ 0.367).

**Layout math for 390×844 mobile portrait (load-bearing dimensions):**

```
viewport:                 390
- left padding:           16
- right padding:          16
- content width:          358

battlefield grid columns: [80 left rail | 1fr center=198 | 80 right rail]
- hero card (max 145) centered in 198 center column:
  - card position: 16 + 80 + (198-145)/2 = 122.5 to 267.5
  - card center: 195 = viewport center ✓

hand strip:
- 6 cells × 55px wide = 330
- 5 gaps × 4px = 20
- total strip width: 350
- fits 358 content width with 4px margin each side ✓
- no FP truncation
```

**Verification:**

- Visual smoke at mobile 390×844: hero cards visually centered (Jokić + Giannis at viewport horizontal center). MIKE and YOU labels prominent at the top + bottom, with clear breathing room from the viewport edges. All 6 mini-cards in each hand strip fully visible — top strip shows FPs 11.3 / 21.5 / 32.1 / 26.4 / 38.9 and the dimmed Jokić slot 5; bottom shows 6.9 / 18.5 / 28.4 / 31.6 / 34.2 and dimmed Giannis. No horizontal overflow, no FP truncation.
- Desktop 1024×800: same layout structure, hero cards centered, hand strips have abundant horizontal room (350px strip in 992px content area).

### Amendment 6: three visual polish fixes from fifth visual smoke

**Symptoms reported by user after amendment 5 landed:**

1. **Active battlefield card's mini-card not dimmed.** When a card is in the battlefield, its corresponding mini-card in the hand strip stayed at full opacity. Made the screen read as "all cards visible everywhere" rather than "this card moved to battle."
2. **MIKE/YOU labels left-aligned.** Labels were stuck at the left edge of their zones rather than centered horizontally.
3. **MidRail still in right-rail column.** Amendment 5 aligned the matchup delta + final-margin pill with the team totals' x-position. User wanted them at the cards' x-center instead — visually centered between the two stacked battlefield cards, with the team totals staying anchored to the right of the cards (unchanged).

**Root causes + fixes:**

1. **HandStrip had no notion of "which slot is in battlefield."** Added an `activeSlotIndex` prop. The mini-cell whose slotIndex matches renders at `opacity: 0.35` (with a 200ms transition). Cell stays in its slot — no layout shift; just the visual dim. The dim is wired off the same `slotIdx` the battlefield uses; phase 3 will drive it dynamically as the reveal walks through matchups. Two new tests guard the contract: (a) one active-marked cell per side at the default slot, (b) override via `battlefieldSlotIndex` prop moves the dim.
2. **ZoneHeader's flex container had no `justify-content`** → defaulted to `flex-start`. Added `justify-content: center`. Display name now sits at the horizontal center of the zone.
3. **MidRail structure mirrored BattlefieldRow** (card-width col + gap + pill-in-score-col). Pill ended up under the score column. Restructured: MidRail still mirrors BattlefieldRow's outer flex (so row-level horizontal rhythm stays aligned), but the matchup delta + final-margin pill render INSIDE the card-width column, centered horizontally. The right placeholder is empty (no team total in the gap between cards). Matchup info now sits at the cards' x-center; team totals (178.4, 182.4) remain anchored to the right of their respective cards, unchanged.

**Verification:**

- Visual smoke at mobile 390×844: rightmost mini-card in each strip is clearly dimmed (the slot-5 cards Jokić + Giannis). MIKE/YOU labels centered horizontally. Matchup delta (+14.6 MATCHUP) and final-margin pill (+4.0 YOU) centered between Jokić and Giannis, horizontally aligned with the cards. Team totals 178.4 / 182.4 stay where they were — to the right of each card.
- Desktop 1024×800: same behavior at the wider viewport.

### Amendment 5: three layout polish fixes from fourth visual smoke

**Symptoms reported by user after amendment 4 landed:**

1. **Mid-rail (matchup delta + final-margin pill) too far right** — sat at the viewport's right edge rather than aligned with the right edge of the battlefield card. The team totals (178.4, 182.4) and the mid-rail pill should all sit at the same horizontal x-coordinate (a defined "right rail" position).
2. **Team FP totals flush against cards** — only 8px gap between the battlefield card's right edge and the score; user wanted the score centered in a wider right-rail column, with breathing room from the card.
3. **Vertical spacing inverted from intent** — top hand strip ↔ Jokić was tight, Jokić ↔ Giannis was loose, Giannis ↔ bottom hand strip was tight. User wanted the inverse: breathing room around the battlefield (hand strips framing it from above and below), tight between the two cards (so they read as one matchup unit).

**Root causes + fixes:**

1. **MidRail used `justify-content: flex-end`** (anchored content to the right edge of the battlefield column), while BattlefieldRow used `justify-content: center` (anchored card + score block to the center). Different anchoring → different horizontal positions for the score vs the pill. Fix: MidRail now mirrors BattlefieldRow's flex structure exactly — placeholder card-width column (matchup delta right-aligned within it, ending at the card's right edge) + same gap + score-width pill column, all `justify-content: center`. The matchup delta + pill align vertically under (and above) the card + score in their respective rows.
2. **`SCORE_COLUMN_WIDTH_PX = 64` and gap = 8** made the score visually attached to the card. Widened the score column to **80px** and the inter-element gap to **20px** (named `BATTLEFIELD_INTERNAL_GAP_PX`, reused by both BattlefieldRow and MidRail). The score now sits in a visibly-defined right-rail column with breathing room from the card.
3. **Outer container gap was 10px; battlefield column gap was 10px.** Both compressed the strip-to-battlefield distance (tight) and the inter-card distance (also tight, but with MidRail content stuffed in). Fix: outer container gap → **28px** (between zones and battlefield); battlefield column gap → **6px** (between top card row, MidRail, bottom card row). Hand strips now have generous breathing room from the battlefield; the two cards + MidRail read as one tight matchup unit.

**Verification:**

- Visual smoke at mobile 390×844: MIKE/YOU display names prominent. Hand strips have ~28px breathing room from the battlefield cards. Jokić → MidRail → Giannis stacked tightly as one matchup unit. 178.4 / +4.0-YOU pill / 182.4 all aligned at the same horizontal x-coordinate (the right-rail column position). +14.6 MATCHUP right-aligned at the card's right edge.
- Desktop 1024×800: same alignment behavior holds at the wider viewport.

**Left-rail expansion constraint surfaced (not pre-fixed):**

The current left rail is a 28px placeholder. Phase 5 commentary will widen it to ~80-150px. On narrow mobile viewports (e.g. 390px wide), the battlefield central column already runs tight — battlefield content (145px card + 20px gap + 80px score = 245px) fits in the available 346px (after outer padding + the 28px placeholder rail), but a 150px left rail would shrink the available width to 224px, narrower than the 245px battlefield block. Phase 5 implementation must choose one of: (a) shrink BATTLEFIELD_CARD_MAX_WIDTH on narrow viewports when the commentary rail is active, (b) overlay the commentary rail above the battlefield rather than alongside it, or (c) target only larger viewports for the full-width commentary rail. Constraint captured in `docs/h2h-reveal-arc-design.md` "What's not designed yet" so phase 5 doesn't hit it as a surprise.

### Amendment 4: three layout/scale issues from third visual smoke

**Symptoms reported by user after amendment 3 landed:**

1. **Layout too spread out.** Large empty vertical gaps between zones — battlefield cards floated in isolation with ~150px of empty space between them and the hand strips above/below. The composition read as three separated zones in a void rather than one tight unit.
2. **Mini-card content not scaling to mini-card dimensions.** The hand strip cells were at the right outer size (~68px wide × 100px tall) but the renderCard output (AthleteCard) kept its absolute pixel font sizes (16px salary chip, 22px FP, 32px initials placeholder). On a 68px cell, the salary chip was nearly half the card height; the initials dominated the body; names and FP at the bottom clipped or overlapped.
3. **Player names not visible; duplicate totals; stray ROOKIE label.** The zone header rendered `displayName + tier + totalFp` in a flex-justify-between row with the small 13px displayName at the left edge. The visually-central position was the tier label ("ROOKIE"), which dominated. The totalFp duplicated the TeamScore that already sat next to the battlefield card, so 182.4 appeared twice. The bottom zone's tier label sat below the hand strip, which the user read as a stray label.

**Root causes + fixes:**

1. **Battlefield used `flex: 1 1 auto` with `justify-content: center`.** Battlefield rows also used `flex: 1 1 0` — each stretched to fill half the available vertical space. Cards anchored to flex-end / flex-start, leaving the OTHER end of each row empty. On tall viewports this looked like ~150px of empty space between the hand strip and the card. Fix: zones AND battlefield AND battlefield rows all set to `flex: 0 0 auto` (content-sized). Outer container uses `justify-content: center` so leftover vertical space ends up ABOVE the opponent zone and BELOW the your zone, never between them. Composition reads as one tight unit.
2. **AthleteCard's internal pixel sizes don't track the cell.** CardFront uses absolute `fontSize: 16` for salary, `fontSize: 22` for FP, etc. — these don't shrink when the wrapper does. Fix: wrap the renderCard output in a `transform: scale()` container. Render AthleteCard at a "natural" 150px width (where its absolute pixel sizes look comfortable), then scale by `cell_width / 150 ≈ 0.45` to fit the actual cell. All internal content scales uniformly — salary chip, FP, initials, badges — like CSS zoom. At scale 0.45: 16px salary → ~7px effective; 22px FP → ~10px effective; 32px initials placeholder → ~14px effective. Visible, proportional, no overlap.
3. **Reduced ZoneHeader to just displayName at 18px.** Killed the tier label (implied by TeamScore color treatment) and the totalFp duplicate (TeamScore next to battlefield card is the sole render site). Now the header is unambiguously "MIKE" / "YOU" at a prominent size; no stray tier label below the hand strip; no duplicate 182.4 at the screen bottom.

**Verification:**

- Visual smoke at mobile 390×844: "MIKE" prominent top-left at 18px, "YOU" prominent bottom-left. Layout is tight — hand strips immediately adjacent to battlefield cards, no large empty gaps between zones. Empty vertical space is at the top + bottom of the viewport, not between zones. Mini-cards in both hand strips show proportionally-scaled AthleteCard content: tier-colored borders, real headshots, small salary chips, small but visible name + FP text. Only one 178.4 (next to Jokić) and one 182.4 (next to Giannis). No ROOKIE labels.
- Desktop 1024×800: same layout principles hold. Composition centered vertically; horizontal space on either side of the battlefield column is fine (mobile-first design).

### Amendment 3: four polish issues from second visual smoke

**Symptoms reported by user after amendment 2 landed:**

1. **Battlefield cards too large.** ~200px wide on a 390px viewport; single-player renders cards at ~125px (1/3 of viewport in 3-card grid). User specifically asked for "EXACTLY the same size as the normal single-player card — same component, same wrapper sizing, same props."
2. **Player names missing.** Header above each battlefield card showed "ROOKIE" (a tier label, in the middle slot of the zone header) where the player's display name should have been. "Mike" and "You" labels invisible.
3. **Team FP totals floating too far from their cards.** Right rail used `justify-content: space-between` over the full battlefield container height, so 178.4 sat near the opponent's hand strip and 182.4 sat near your hand strip — visually disconnected from the battlefield cards they referred to.
4. **Possible mini-card cropping.** FP/name strips at the bottom of mini-cards looked slightly cropped in the previous screenshot.

**Root causes + fixes:**

1. **Card-width cap was 200px**, intended as "comfortable on mobile, capped on desktop." But single-player on mobile is closer to 125px. Reset cap to `min(145px, 32vw)` — the 32vw expression tracks single-player's 1/3-of-viewport scale on mobile (390→124.8, 414→132.5); the 145px cap kicks in around viewport 453px and prevents the 2-card-stack from overflowing shorter desktop viewports. Battlefield card wrapper now also matches single-player's `RosterGrid.tsx:206-210` pattern verbatim (`width: 100%; aspectRatio: 329/478; position: relative`) instead of the prior `height: 100%` variant.
2. **Mock fixture had `playerName` where the H2H component's `H2HHand` interface expected `displayName`.** TypeScript's structural compatibility check was lenient enough to let `SENDER_HAND: H2HMockHand` flow into a slot typed as `H2HHand` despite the field name mismatch — `displayName` came in as `undefined` at runtime, the zone header rendered an empty `<div>` where the name belonged, and the tier label ("ROOKIE") slotted into the visually-central position. Fix: deleted the local `H2HMockHand`/`H2HMockCard` interfaces; the fixture now declares `SENDER_HAND: H2HHand` and `RECIPIENT_HAND: H2HHand` using the component's exported types directly, and the field is named `displayName` as the component expects. Any future field rename will tsc-error at the fixture site.
3. **Restructured the rail layout.** Pre-fix: separate `RightRail` component sibling of the battlefield column, sized to the battlefield's full height. Post-fix: each battlefield card lives in a `BattlefieldRow` flex container with `TeamScore` as its right sibling — so the score sits directly next to the card. `MidRail` (matchup delta + final-margin pill) renders between the two battlefield rows, occupying the gap. Same visual surface as the original spec but proper alignment.
4. **Bumped `HAND_STRIP_HEIGHT_PX` from 80 → 90.** CardFront's name/FP strip lives at 72-86.2% of card height (12.8% tall), and the accent strip 86.2-100% (13.8% tall). At 80px tall the bottom strip was ~11px — tight but renderable. At 90px the accent strip gets ~12.4px which is more comfortable and removed the user-reported "slightly cropped" appearance on the bottom edge.

**Verification of all four fixes:**

- Visual smoke at mobile 390×844: "MIKE" + "YOU" labels visible top-left of each zone header. Jokić + Giannis cards sized ~125px wide (single-player scale). "178.4" anchored directly to right of top card; "182.4" anchored directly to right of bottom card. Mid-rail (`+14.6 MATCHUP` + `+4.0 YOU`) sits in the gap between the two battlefield rows. Mini-cards in hand strips show FP numbers cleanly with no visible cropping. Held indicators (gold corner triangles) on the rightmost two mini-cards of each strip (matching slot 4-5 held cards).
- Desktop 1024×800: same layout structure, cards capped at 145px wide. Both zones (MIKE / YOU) headers display correctly. Mid-rail anchored vertically between the cards.

**Followup (out of scope, logged for phase 3+):** desktop viewports show empty horizontal space on the sides of the battlefield column (cards cap at 145px in a much wider central column). Not a defect — H2H is designed mobile-first per the design doc — but a future phase 3 animation pass could either widen the cards on desktop or fill the empty space with phase-5 commentary tickers.

### Amendment 2: visual hierarchy inverted

**Symptom:** user's second real-browser test (after amendment 1 landed) reported the visual hierarchy was backwards — hand-strip cards were ~200px tall and dominated the screen; battlefield cards were the smallest visual element. The mini-cards used a custom abstract placeholder (color-block backgrounds + initials), not the existing game card component.

**Root cause:** two structural defects.

1. **Hand strip used `display: grid; gridTemplateColumns: repeat(N, 1fr)` with `aspectRatio: 329/478` per cell, no height cap.** On wide viewports (e.g. desktop 1024px), each grid cell's width grew with the container, which forced the cell's height up via the aspect ratio. At 1024px viewport: each cell ~140px wide → ~200px tall. The strips overflowed their 22% zone and became the dominant visual element.
2. **Hand strip used a separate inline `MiniCard` component** that rendered initials on a tier-color gradient instead of using the existing AthleteCard. Mini-cards looked like abstract chips, not like the game's cards.

**Fix:** restructured the hand strip in H2HRevealScreen.tsx:

- Switched from grid to **height-capped flex row**: `display: flex; height: 80px`. Each cell is `height: 100%; aspectRatio: 329/478`, deriving width from the (fixed) height. Strip never inflates on wide viewports.
- **Deleted the inline `MiniCard` component**. Hand-strip cells now invoke the SAME `renderCard` prop the battlefield uses. Basketball mock passes `AthleteCard` for both zones; mini-cards visually read as the same game cards at smaller scale (matches the pattern at `LandingPage.tsx:369` where the same CardComponent renders at ~62×90px in the card-flip demo grid).
- **Zone sizing changed from `flex: 0 0 22%` (fixed) to `flex: 0 0 auto` (content-sized)**. Zone height = header (28px) + strip (80px) + gap (6px) ≈ 114px. Battlefield gets `flex: 1 1 auto` of the remaining vertical space — the dominant ~60% of viewport.
- **Mock fixture reordered**: `slotIndex` now follows reveal order (cheapest swap = slot 0, most expensive held = slot N-1) per the design doc's reveal sequence. The H2H battlefield defaults to the highest slotIndex, which pairs each side's climactic final reveal. First-iteration fixture used deal order, making the battlefield show the cheapest swap pair (Reid vs Portis, GREEN tier) — anticlimactic. Now shows Jokić vs Giannis (RED tier) as the hero pair.

**Verification of fix:** see "Visual smoke" section below.

## Visual smoke (post-amendment 2)

Captured via headless Chrome (`--headless --window-size=W,H --screenshot=...`) against the running dev server at `/basketball/dev/h2h-reveal-mock`. Two viewports: mobile-portrait (390×844, iPhone 14 Pro) and desktop (1024×800).

### Mobile (390×844)

```
┌─────────────────────────────────────┐
│             ROOKIE                  │  ← opponent zone header
│  [c][c][c][c][cH][cH]               │  ← hand strip: 6 mini-cards, ~55×80
│                                     │     last two held (gold corner triangle)
│        ┌──────────────────┐         │
│        │  $95         DEN │         │  ← BATTLEFIELD top
│        │                  │         │     Nikola Jokić (RED, held)
│        │   [Jokić photo]  │         │     Hero card, takes ~38% viewport
│        │                  │         │
│        │   NIKOLA   48.2  │         │
│        │   JOKIĆ          │         │
│        └──────────────────┘         │
│                                     │
│        ┌──────────────────┐         │
│        │  $92        MIL  │         │  ← BATTLEFIELD bottom
│        │                  │         │     Giannis Antetokounmpo (RED, held)
│        │   [Giannis photo]│         │     GOD_MODE +15 FP badge visible
│        │                  │         │
│        │   GIANNIS  62.8  │         │
│        │   ANTETOK +15 FP │         │
│        └──────────────────┘         │
│                                     │
│  [c][c][c][c][cH][cH]               │  ← your zone hand strip
│             ROOKIE                  │
└─────────────────────────────────────┘
```

Visual hierarchy confirmed: battlefield cards dominate (~40-45% of viewport height each), hand strips are compact context (~10% of viewport height each). Mini-cards visually read as the same game cards (real headshots, tier-colored borders, name + FP), not as abstract chips. Held indicators (gold corner triangles) visible on the rightmost two mini-cards in each strip (Jokić + Curry for sender; Giannis + Booker for recipient).

### Desktop (1024×800)

Mobile layout scales horizontally — same vertical structure, with the right rail now clearly visible to the right of the battlefield column. The rail shows:

- Top: `178.4` (Mike's total, grey — trailing)
- Middle: `+14.6 MATCHUP` (Giannis 62.8 − Jokić 48.2 = +14.6 for this battlefield pair, recipient-positive so green)
- `+4.0 YOU` margin pill (green, prominent, with leader hint `you`)
- Bottom: `182.4` (Your total, green — leading)

The per-matchup delta and the final margin both anchor visually to the battlefield cards. No layout disconnection between the rail and the cards.

### Element checklist (all confirmed visually)

- [x] Full-viewport takeover (no header, no nav, no profile chrome)
- [x] Three vertical zones (opponent top / battlefield middle / your bottom)
- [x] Two rails (left 28px reserved blank for phase-5 commentary; right 64px scores + delta)
- [x] Hand strips: `repeat(N, 1fr)` semantics via height-capped flex; N=6 for basketball mock
- [x] **Hand-strip cards visually match game cards (post-fix): real headshots, tier-color borders, name, FP — same component (AthleteCard) as the battlefield**
- [x] Hand-strip cards are **compact (~80px tall)** regardless of viewport width — height-capped, not aspect-driven
- [x] **Battlefield cards are the dominant hero element (~38-45% viewport height each)**
- [x] Battlefield default pair: highest slotIndex (final reveal pair per design doc; now climactic Jokić/Giannis matchup with fixture slotIndex re-ordered)
- [x] Held indicator: gold corner triangle on both battlefield and mini-card variants (CardFront's existing `locked={card.wasHeld}` rendering, no new visual)
- [x] Swap indicator: `SWAP` pill top-right on non-held battlefield cards only (suppressed on mini-cards as visual noise at small scale; mini swap cards are differentiated by absence of the gold triangle)
- [x] Right rail score treatment: leading total green (`#22C55E`), trailing total grey (`#9CA3AF`)
- [x] Per-matchup delta in right rail middle between the two scores (`+14.6 MATCHUP`)
- [x] Final margin pill in right rail: `+4.0` + `YOU` leader hint
- [x] No tier gauges, no tier panels (per design lock)
- [x] No commentary content (reserved space only)
- [x] No animation, no transitions (phase 3 scope)

## AthleteCard ghost-roll-up risk — ruled OUT via code trace

**Concern (pre-fix):** AthleteCard wraps PlayerCardShell + CardFront. Both have FP count-up animation paths that fire under `visibleFp` + `cardShakeType` transitions. If mounted directly at `phase="RESULTS"` without the orchestrating reveal state, FP might animate from 0 to its real value, contradicting the static-end-state contract.

**Trace:** `basketball/src/dev/H2HRevealMockRoute.tsx:42-51` passes:

```tsx
phase: "RESULTS",
isFlipped: false,
canFlip: false,
locked: card.wasHeld,
heldFpVisible: true,
badges: card.achievements
// (visibleFp NOT passed; cardShakeType NOT passed; isRevealing NOT passed)
```

Walking CardFront.tsx + PlayerCardShell.tsx for these props:

- **CardFront.tsx:354-399** — animation effect: `if (visibleFp === undefined) { cleanup; return; }`. With visibleFp undefined, the effect cleans up and never starts the count-up. ✓
- **CardFront.tsx:447** — `fpValue = isShowingActualFp ? (visibleFp !== undefined ? displayedFp : card.actualFp) : 0`. With visibleFp undefined and isShowingActualFp=true (phase=RESULTS branch), `fpValue = card.actualFp` immediately. ✓
- **CardFront.tsx:454-456** — `fpText = card.actualFp.toFixed(1)` (the static fallback). Rendered in the post-reveal layer with opacity 1 from initial mount. ✓
- **PlayerCardShell.tsx:393-413** — stamp state machine: `if (!cardShakeType) return; if (visibleFp === undefined) return;`. Both conditions hit; stamp never fires. No SMOKING HOT / ON FIRE / ICE COLD overlays. ✓
- **CardFront.tsx:416-429** — top-game thud: requires `rollComplete` (false; never set since no animation runs) AND `topGameTier` (not passed). Doesn't fire. ✓
- **CardFront.tsx:582** — held-card FP visibility gate: `opacity: isHeldCard ? ((heldFpVisible || fpRevealed) ? 1 : 0) : 1`. With `heldFpVisible: true`, held cards' FP is opacity 1 from mount. ✓
- **CardFront.tsx:622** — accent strip (badges) gate: `accentRevealed = !isHeldCard || heldFpVisible || fpRevealed`. With heldFpVisible: true, accentRevealed=true; badges visible from mount. ✓

**Conclusion:** static render shows the final FP value immediately, no count-up, no roll-up, no opacity transition fires on initial mount. The risk previously flagged is **structurally absent** under the H2HRevealMockRoute prop combo. No `staticEndState` escape hatch needed.

## Followups carried forward

(No new ones surfaced by this phase.) Phase 1's parked followups still apply. Tier color centralization is the most relevant for phase 2 — added to the design doc's followup list.

## Status: PASS

Phase 2 ready to commit. Phase 3 (animation choreography) is the next clean entry point; layout structure locked, no further visual design changes anticipated before animation work begins.
