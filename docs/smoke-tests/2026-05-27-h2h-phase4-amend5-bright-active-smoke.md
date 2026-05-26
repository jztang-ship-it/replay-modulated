# H2H phase 4 amend5 — hero visible while deck depleted + invert mini-card brightness (smoke)

Date: 2026-05-27
Branch: `main` (fifth amend of `80254c6` — phase 4 commit)
Screenshots: `~/Desktop/replaymod-handoff/2026-05-27-h2h-phase4-amend5-bright-active/`

## Scope

### Fix 1 — Eliminate visible empty-middle between deck depletion and matchup 0

Even after amend4 anchored `activeMatchup` on `matchups[0]` during the `anticipating` phase, there was still a visible empty-middle window during the last ~750ms of the **`entering`** phase: between the moment the last card left the deck (deck visual returns null because no `pre`-stage cards remain) and the moment the last card finished its in-flight animation to its strip slot. During that window the hero zone showed nothing.

Root cause: the conditional that selected EntranceDeck vs CardCenterCell was tied to `phase === "entering"` only — once the deck was empty but phase was still `"entering"`, EntranceDeck rendered as null and CardCenterCell rendered an invisible placeholder (because `activeMatchup` returned `{null, null}` for the entering phase).

Fix:
- `useH2HReveal.activeMatchup`: during `entering`, return `matchups[0]` as soon as `entranceStages` has no `"pre"`-stage entries (deck empty). Eliminates the activeMatchup gap.
- `H2HRevealScreen`: switch from `isEntering` to `showEntranceDeck = isEntering && deckHasPreCards`. The deck renders ONLY while at least one card is still in `pre`. Once the deck depletes, CardCenterCell renders with matchups[0] hero cards.

Net effect: at every instant of the arc, the hero zone is occupied by either the EntranceDeck (cards remaining) or the matchup-0 hero cards (deck empty). The hero zone is never empty during normal flow.

### Fix 2 — Invert mini-card brightness

Active mini-card is now **bright** (opacity 1); other cards on the same strip are **dimmed** (opacity 0.35). When no card is active on a strip (overlay default state, no flip), all 6 cards on that strip render bright.

- **Arc**: the two active-matchup mini-cards (one per strip) are bright. The other 10 are dimmed.
- **Overlay**: independent per-strip selection. Tapping a card flips it into the matching hero slot and brightens that strip cell; the OTHER 5 cells on that strip dim. The other strip is unaffected. When BOTH strips have a selection, 2 mini-cards bright + 10 dimmed. When NEITHER has a selection, all 12 bright.

`shared/components/H2HRevealScreen.tsx` — `HandStrip` settled case:

```ts
const stripHasActive = !!activeCardId;
const settledCardOpacity = !stripHasActive
  ? 1
  : isActiveInBattlefield
    ? 1
    : 0.35;
```

`shared/components/H2HResultsOverlay.tsx` — `ResultsStrip` cell:

```ts
const stripHasSelection = selectedCardId != null;
const cellOpacity = !stripHasSelection
  ? 1
  : isSelected
    ? 1
    : 0.35;
```

## Screenshots — entrance-to-arc sequence (Fix 1 verification)

Each capture below is a different virtual-time-budget along the same `?autoplay=1` URL. Together they trace the full entrance → anticipating → revealing transition. NO frame shows the empty-middle state from the user's reference screenshot.

### 01-mid-entrance-dealing-mobile.png (vt=2200ms — `entering · 2/6 dealt`)

Mid-dealing:
- Top strip: 3 cards landed (NR, DR, JT) + 3 dashed slots.
- Bottom strip: 3 cards landed (BP, JB, TM) + 3 dashed slots.
- Hero zone: top deck showing Kevin Durant (next-to-deal sender), bottom deck showing Jaylen Brown (next-to-deal recipient). Decks face-up.

### 02-deck-empty-pre-anticipate-mobile.png (vt=5000ms — `entering · 5/6 dealt`)

Deck just emptied (last card mid-flight to strip):
- Top strip: 6 cards visible (5 settled + 1 in travel).
- Bottom strip: 6 cards visible.
- **Hero zone: Naz Reid (sender matchup 0) + Bobby Portis (recipient matchup 0) are ALREADY VISIBLE** — Fix 1 in effect. Without this fix, the hero zone would be empty here.
- Mini-cards: NR + BP (active) bright; other 10 dimmed.

### 03-anticipating-mid-pulse-mobile.png (vt=5800ms — `anticipating · still`)

Pre-reveal beat:
- Hero zone: Naz Reid + Bobby Portis (matchup 0) still visible.
- Mini-cards: NR + BP bright; other 10 dimmed.
- Pulse window — cards may be in the middle of a tier-color glow keyframe (peaks at 350ms into the 700ms pulse).

### 04-anticipating-post-settle-mobile.png (vt=6800ms — `anticipating · still`)

End of anticipating (just before matchup 0 starts):
- Hero zone: NR + BP visible.
- Mini-cards: NR + BP bright; others dimmed.

### 05-arc-matchup-3-active-mobile.png (vt=13800ms — `revealing · 2/6`)

Mid-arc with a later matchup active:
- Hero zone: D'Angelo Russell (sender slot 1) + Jalen Brunson (recipient slot 1) — matchup index 1 active.
- Top strip mini-cards: DR (slot 1) bright; NR/JT/KD/SC/NJ dimmed (5 cards).
- Bottom strip mini-cards: JB (slot 1) bright; BP/TM/JB(slot3)/DB/GA dimmed (5 cards).
- 2 bright + 10 dimmed.

### 06-overlay-noflip-all-bright-mobile.png (overlay, no flip)

Default overlay state, no cards tapped:
- Both hero slots empty.
- All 12 mini-cards bright (no strip has a selection).
- Headline + trash-talk on the left of the hero zone.
- Send It Back CTA in the reserved space below the bottom strip.

### 07-overlay-both-flipped-bright-active-mobile.png (overlay, one flipped per strip)

Per-strip flip:
- Top hero slot: Jayson Tatum back face (`Jan 08, 2025 vs TOR`, 32.1 FP).
- Top strip: JT mini-card bright (purple); NR/DR/KD/SC/NJ dimmed (5 cards).
- Bottom hero slot: Tyrese Maxey back face (`Jan 08, 2025 vs BKN`, 28.4 FP).
- Bottom strip: TM mini-card bright (purple); BP/JB/JB(slot3)/DB/GA dimmed (5 cards).
- 2 bright + 10 dimmed across both strips.

## No-empty-middle verification

Walking the captures in order:
- 01 (mid-dealing): decks face-up in hero zone, strips populating. ✓ not empty.
- 02 (deck empty, last card flying): hero zone shows matchup 0 cards. ✓ not empty.
- 03 (anticipating, mid-pulse): hero zone shows matchup 0. ✓ not empty.
- 04 (anticipating, end): hero zone shows matchup 0. ✓ not empty.
- 05 (revealing, matchup 1 active): hero zone shows matchup 1. ✓ not empty.

At NO point in the entrance → arc transition does the hero zone render empty. The user's reference screenshot (populated strips + completely empty middle) is no longer reachable through any normal flow.

The previously-reachable state was specifically the window between `t=4500ms` (deck depleted) and `t=5250ms` (last card settles and phase transitions to anticipating). That window is now covered by `activeMatchup = matchups[0]` whenever the deck is empty, regardless of phase.

## Tests

```
npx vitest run shared/components/__tests__/
 Test Files  7 passed (7)
      Tests  103 passed (103)
```

One test in `H2HRevealScreen.test.tsx` was inverted to match the new brightness invariant — the assertion now confirms active cells render at opacity 1 and inactive cells at 0.\d (0.35).

## Known issues carrying forward to next amend

### Hero-card photo mismatch (player face does not match name/salary/FP)

Observed on the arc: when the active matchup is **Naz Reid** (`$22` swap, MIN, fpDelta -6.7, actualFp 11.3), the hero card frame shows the correct `NAZ REID` name, `$22` salary tag, MIN team chip, and `11.3` FP value, but the HEADSHOT rendered above the name plate is **Luka Doncic** (Lakers jersey, recognizably not Reid). The matching strip cell for the same card renders the correct Naz Reid headshot.

Implication: `photoCode` (or the photo lookup downstream of it) is being read from a different source than `name` / `salary` / `actualFp` when the card mounts at hero size, OR a prior matchup's photo is bleeding into the next matchup. Strip-size renders are unaffected.

The bug is data-path or prop-bleed; the geometry / brightness / state-machine work in this commit is correct. Tracked for the next amend (alongside bug B below).

### Fire / ice tier visual effects regression

Single-player has tier-specific fire / ice visual effects on player cards (likely tied to hot / cold streak indicators or specific badges). These effects are not appearing in the H2H reveal arc or results overlay — neither in the strip cells nor at hero size. This is a regression from somewhere in phase 2 or 3.

Probable causes (to be investigated in the next amend):
- A prop that gates fire / ice rendering isn't being passed from the H2H card invocation.
- The mock fixture is missing fields (hot / cold streak flags, fire / ice achievement badges) that single-player's path would carry from real data.

Out of scope per the original phase 4 task brief; flagged here for the next amend.

## Out of scope (still deferred)

- Right-rail FP totals clipping at 390 wide.
- Right-edge clipping of the 6th strip card at 390 wide.
- Hero card overflow on overlay flip.
- Tier visual effects regression.
- Production dismiss destination.
- Headline / trash-talk copy polish.
- Commentary engine.

## Files touched (amend5 delta on top of amend4)

- `shared/components/useH2HReveal.ts` — `activeMatchup` useMemo: during `entering`, return matchups[0] when `entranceStages` has no `pre`-stage entries; depends on `entranceStages` (added to dep list).
- `shared/components/H2HRevealScreen.tsx`:
  - New derived `showEntranceDeck = isEntering && deckHasPreCards`. Conditional renders gated on this (was `isEntering` alone).
  - `HandStrip` settled case: `cardOpacity = !stripHasActive ? 1 : isActiveInBattlefield ? 1 : 0.35`.
- `shared/components/H2HResultsOverlay.tsx` — `ResultsStrip` cell: `cellOpacity = !stripHasSelection ? 1 : isSelected ? 1 : 0.35`.
- `shared/components/__tests__/H2HRevealScreen.test.tsx` — brightness-inversion assertion updated (active bright, inactive dim).
- `docs/h2h-reveal-arc-design.md` — `Phase 4 amend5` section above amend4.
- `docs/smoke-tests/2026-05-27-h2h-phase4-amend5-bright-active-smoke.md` (this file).
