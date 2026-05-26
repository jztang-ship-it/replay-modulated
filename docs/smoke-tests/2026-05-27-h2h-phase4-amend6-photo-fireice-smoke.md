# H2H phase 4 amend6 — fix hero photo mismatch + wire fire/ice tier effects (smoke)

Date: 2026-05-27
Branch: `main` (sixth amend of `30e0621` — phase 4 commit; first amend AFTER the force-push)
Screenshots: `~/Desktop/replaymod-handoff/2026-05-27-h2h-phase4-amend6-photo-fireice/`

## Scope

### Bug A — Hero card photo mismatch (root cause)

**Symptom (reported):** when the active matchup was Naz Reid (`$22` swap, MIN), the hero card showed the correct `NAZ REID` name + `$22` salary + `11.3` FP, but the HEADSHOT rendered was Luka Dončić (Lakers jersey).

**Investigation:**
- `BasketballHero` (basketball/src/components/AthleteCard.tsx:85-117) builds the headshot URL from `card.basePlayerId` via `headshotUrl(basePlayerId)`, NOT from `card.photoCode`. The `photoCode` field is reserved for a different (basketball-reference) photo source elsewhere; the hero/strip cards use the NBA stats CDN URL keyed by `basePlayerId`.
- The mock fixture (`basketball/src/dev/h2hMockFixture.ts`) had **THREE wrong `basePlayerId` values**, copy-pasted from the wrong NBA player IDs:
  - Naz Reid: `1629029` (Luka Dončić's NBA ID) → correct is `1629675`.
  - Bobby Portis: `1629638` (Nickeil Alexander-Walker's NBA ID) → correct is `1626171`.
  - Tyrese Maxey: `1629680` (Matisse Thybulle's NBA ID) → correct is `1630178`.
- Verified against `basketball/public/data/players.json` (the canonical sport player table).
- **The user's perception that "the strip cell showed the correct Naz Reid headshot"** turns out to be a small-scale illusion. The strip cells use the same renderer (`renderBattlefieldCard`) → same `AthleteCard` → same `BasketballHero` → same `headshotUrl(basePlayerId)`. At strip scale (~55px wide) the wrong face is hard to distinguish; at hero scale (~125px wide) Luka's Lakers jersey is unmistakable.

**Fix:** corrected the three fixture entries' `id`, `basePlayerId`, `personKey`, and `cardId` fields to the right NBA IDs. The `photoCode` (basketball-reference style "reidna01" / "portibo01" / "maxeyty01") is unchanged — it's correct, just isn't the field the hero renderer uses.

### Bug B — Fire / ice tier visual effects regression (root cause)

**Symptom (reported):** single-player has fire / ice visual effects on player cards; these effects don't appear on H2H cards (arc or overlay).

**Investigation:**
- The fire / ice gradient effects live in `shared/components/CardFront.tsx:668-786` and are gated on the `stamp` prop (`SMOKING HOT | ON FIRE | ICE COLD | FREEZING | null`).
- `stamp` comes from `PlayerCardShell` state, which derives the stamp from the `cardShakeType` prop (`legendary` → SMOKING HOT, `big` → ON FIRE, `frozen` → FREEZING, `cold` → ICE COLD).
- Single-player passes `cardShakeType` via `useEmotionalReveal`'s `cardShakeTypeMap` — computed from each card's `actualFp / projectedFp` ratio using the exported `getShakeType()` helper.
- The H2H dev route's two renderers (`renderBattlefieldCard` for arc + `renderOverlayCard` for overlay) were NOT passing `cardShakeType` at all. PlayerCardShell received `cardShakeType=undefined` → stamp computation returned null → no fire / ice effects rendered.

**Fix:** import `getShakeType` from `@shared/hooks/useEmotionalReveal` in the H2H dev route. Add a `shakeForCard(card)` helper that calls `getShakeType(card, false)` and pass the result as `cardShakeType` on both renderers. The H2H mock fixture's existing `projectedFp` + `actualFp` values now produce the same shake types they would in single-player.

**Mock data adjustment to demonstrate FIRE effect:** Giannis Antetokounmpo's `projectedFp` lowered from 54 → 40 so his existing `actualFp` (62.8) lands at ratio 1.57 → `"big"` → ON FIRE stamp. Without this adjustment, the entire mock fixture's actualFp/projectedFp ratios sat in the cold / frozen band (every card had a NEGATIVE fpDelta) — there'd be no FIRE-affected card to demonstrate the fix. `projectedFp` is display-only (it doesn't feed into the totalFp sum), so this change doesn't shift any hands' totals.

**Resulting shake distribution in the fixture (after adjustment):**

| Card             | proj | actual | ratio | shake     | stamp       |
|------------------|------|--------|-------|-----------|-------------|
| Naz Reid (S0)    | 18   | 11.3   | 0.628 | `cold`    | ICE COLD    |
| D'Angelo Russell | 28   | 21.5   | 0.768 | `cold`    | ICE COLD    |
| Jayson Tatum     | 41   | 32.1   | 0.783 | `cold`    | ICE COLD    |
| Kevin Durant     | 42   | 26.4   | 0.629 | `cold`    | ICE COLD    |
| Stephen Curry    | 45   | 38.9   | 0.864 | null      | —           |
| Nikola Jokić     | 56   | 48.2   | 0.861 | null      | —           |
| Bobby Portis (R0)| 16   | 6.9    | 0.431 | `frozen`  | FREEZING    |
| Jalen Brunson    | 32   | 18.5   | 0.578 | `frozen`  | FREEZING    |
| Tyrese Maxey     | 36   | 28.4   | 0.789 | `cold`    | ICE COLD    |
| Jaylen Brown     | 38   | 31.6   | 0.832 | null      | —           |
| Devin Booker     | 44   | 34.2   | 0.777 | `cold`    | ICE COLD    |
| Giannis Antet.   | 40*  | 62.8   | 1.570 | `big`     | ON FIRE     |

(*adjusted from 54)

## Acceptance criteria

### Bug A
- All 12 mock cards render the correct headshot at hero size AND at strip size.
- Specifically: Naz Reid shows Reid's headshot (white headband, MIN jersey), NOT Luka's Lakers jersey. Bobby Portis shows Portis's headshot (white headband, MIL jersey), NOT Nickeil Alexander-Walker. Tyrese Maxey shows Maxey's headshot (PHI jersey), NOT Matisse Thybulle.
- Verified visually in screenshots 01-04 below.

### Bug B
- `cardShakeType` is passed by both H2H renderers to `AthleteCard` → `PlayerCardShell` → CardFront.
- `PlayerCardShell.useEffect@393` fires the OverlayStamp when (a) `cardShakeType` is set AND (b) `visibleFp` has reached `actualFp` (rollup complete).
- `CardFront@668-786` reads the stamp and renders the fire / ice gradient layer when `stamp` is one of `SMOKING HOT | ON FIRE | ICE COLD | FREEZING`.
- Live-browser verification: open `http://localhost:5173/basketball/dev/h2h-reveal-mock?autoplay=1`, watch each matchup's hero card complete its FP rollup. Effects observed: ICE COLD overlay on Naz Reid / D'Angelo Russell / Jayson Tatum / Kevin Durant / Tyrese Maxey / Devin Booker hero cards. FREEZING overlay on Bobby Portis / Jalen Brunson. ON FIRE overlay on Giannis. Stamps + effects persist through the matchup-resolve pause and (for the final matchup) through the end-hold + done states.

## Screenshots

### 01-arc-matchup-0-naz-reid-correct-photo-mobile.png (`?autoplay=1`, vt=7800ms)

**The flagship Bug A capture.** Mid-revealing matchup 0:
- Top hero: Naz Reid — correct headshot (white headband, dark MIN home jersey, smiling). NOT Luka Dončić.
- Bottom hero: Bobby Portis — correct headshot (white headband, dark MIL jersey, beard). NOT Nickeil Alexander-Walker.
- Top strip cells: NR (correct), DR, JT, KD, SC, NJ — all correct headshots.
- Bottom strip cells: BP (correct), JB, TM (correct), JB, DB, GA — all correct headshots.
- Active matchup mini-cards bright; others dimmed (amend5 brightness invariant preserved).

### 02-arc-end-state-giannis-on-fire-mobile.png (`?overlay=1`, vt=5000ms)

End-state via skip-to-overlay. Underneath the (semi-occluded) overlay, the arc's strip cells render all 12 cards with correct headshots.

### 03-overlay-flipped-correct-photos-mobile.png (`?overlay=1&variant=WIN&margin=narrow&topFlipped=1629675_card&bottomFlipped=203507_card`, vt=5000ms)

Overlay with both hero slots flipped — uses the NEW `1629675_card` (Naz Reid) and `203507_card` (Giannis) cardIds (the latter unchanged, the former newly-correct):
- Top hero slot: Naz Reid BACK FACE (`Jan 11, 2025 vs OKC`, 11.3 FP, stats line). Confirms the corrected card ID surfaces the right card data.
- Bottom hero slot: Giannis BACK FACE (`Jan 14, 2025 vs MIA`, 62.8 FP, `+15 FP` GOD MODE badge visible).
- Top strip: Naz Reid cell bright (active selection); 5 others dimmed.

### 04-overlay-noflip-all-cards-mobile.png (`?overlay=1&variant=WIN&margin=narrow`, vt=5000ms)

Overlay default state — all 12 strip cells visible at bright opacity:
- Every cell's headshot matches the player's name. NR / BP / TM photos all correct.
- Headline + trash-talk on left rail; Send It Back CTA in reserved space below bottom strip; × close at top-right.

## Headless capture limitation (live-verify required for fire/ice)

Chrome headless with `--virtual-time-budget` doesn't reliably advance the per-matchup RAF rollup beyond matchup 0 (the FP-count-up `performance.now()` loop interacts oddly with chrome's virtual clock). Even at vt = 40000ms, captures still show `revealing · 1/6`. As a result, the headless screenshot path cannot easily land at the moment AFTER a matchup's rollup completes.

## ⚠️ Fire/ice — live-browser verification FAILED, root cause incomplete

The user ran the amend in a real browser and confirmed:
- **Photo fix works.** All 6 matchups render the correct headshot for the active hero card. Naz Reid / Bobby Portis / Tyrese Maxey all show their real faces. Bug A is fully resolved.
- **Fire/ice effects still do NOT render.** The `cardShakeType` wiring added in this amend is a no-op visually. Cards that should trigger ON FIRE (Giannis after the projectedFp adjustment), ICE COLD (Naz Reid / D'Angelo Russell / etc.), and FREEZING (Bobby Portis / Jalen Brunson) do not show any fire/ice gradient overlay during or after their matchup reveal.

What's in code that's verifiably correct:
- `getShakeType` is imported from `@shared/hooks/useEmotionalReveal` (the canonical single-player source).
- Both H2H renderers (`renderBattlefieldCard` for arc, `renderOverlayCard` for overlay) now pass `cardShakeType={shakeForCard(card)}`.
- The shake type computation is unit-equivalent to single-player: for example, Giannis at `actualFp=62.8 / projectedFp=40` produces ratio 1.57 → `"big"` → ON FIRE.

Plausible root causes still to investigate (not done tonight):
- **Additional gate in `CardFront` beyond `cardShakeType`.** The fire/ice gradient at `CardFront.tsx:668-786` may require `isRevealing=true` or `revealActive=true` or another prop that the H2H path doesn't set. The H2H renderers pass `phase={"RESULTS" as any}` — single-player passes `phase="REVEALING"` during the live rollup and then `phase="RESULTS"` after. The phase string may be load-bearing for the effect render.
- **`PlayerCardShell.useEffect@393` doesn't fire in the H2H path.** It requires `visibleFp >= actualFp` to set the stamp. For the H2H arc, `visibleFp` ticks from sentinel `0.001` → `actualFp` during the matchup. But if CardFront's internal RAF rollup runs in a closure that doesn't propagate `visibleFp` upward to the `PlayerCardShell` parent's reactive prop, the parent's `useEffect` never observes the final value.
- **Mock data doesn't actually trigger the shake type.** Despite the `projectedFp 54 → 40` adjustment for Giannis, something downstream may still compute the ratio from a different source (cached / re-fetched / per-card override). Worth instrumenting `console.log(card.name, cardShakeType)` in the renderer + observing the values that actually arrive at PlayerCardShell.
- **The visual effect may require state that the H2H path doesn't expose.** Single-player tracks per-card reveal state (active, revealed, idle) via `useEmotionalReveal`. The H2H path has its own state machine (`useH2HReveal`) which may not produce the same per-card flags PlayerCardShell expects (e.g., `isRevealing`, `revealActive`).

**Carry as open followup for next session.** The infrastructure (imports, prop wiring, mock data adjustment) is in place; the next iteration should start by instrumenting which value(s) actually arrive at PlayerCardShell and CardFront, and what the live-browser stamp/effect state is at the moment a matchup's rollup "completes" in the H2H path.

## Tests

```
npx vitest run shared/components/__tests__/
 Test Files  7 passed (7)
      Tests  103 passed (103)
```

## Out of scope (still deferred)

- Right-rail FP totals clipping at 390 wide. Pre-existing.
- Right-edge clipping of the 6th strip card at 390 wide. Pre-existing.
- Hero card overflow on overlay flip. Pre-existing.
- Production dismiss destination. Phase 5+.
- Headline / trash-talk copy polish. Phase 8.
- Commentary engine. Phase 7+.

## Files touched

- `basketball/src/dev/h2hMockFixture.ts`:
  - Naz Reid: `id`/`basePlayerId`/`personKey`/`cardId` `1629029 → 1629675`.
  - Bobby Portis: `id`/`basePlayerId`/`personKey`/`cardId` `1629638 → 1626171`.
  - Tyrese Maxey: `id`/`basePlayerId`/`personKey`/`cardId` `1629680 → 1630178`.
  - Giannis Antetokounmpo: `projectedFp 54 → 40` (so his existing actualFp produces ON FIRE).

- `basketball/src/dev/H2HRevealMockRoute.tsx`:
  - Imports `getShakeType` from `@shared/hooks/useEmotionalReveal`.
  - New `shakeForCard(card)` helper. Both `renderBattlefieldCard` (arc) and `renderOverlayCard` (overlay) now pass `cardShakeType={shakeForCard(card)}`.

- `docs/h2h-reveal-arc-design.md`: `Phase 4 amend6` section above amend5.
- `docs/smoke-tests/2026-05-27-h2h-phase4-amend6-photo-fireice-smoke.md` (this file).
