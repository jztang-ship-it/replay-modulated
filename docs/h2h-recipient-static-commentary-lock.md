# H2H Recipient Play — Static Commentary (Subtraction)

**Branch:** `fix/h2h-commentary`
**Base:** `main @ 6616e16`
**Status:** DRAFT — narrow lock for a subtraction-only change. Build prompt is paired with this lock.
**Scope surface (single file):** `shared/components/H2HRecipientPlay.tsx`

---

## Why this lock exists

The H2H recipient play screen is currently rendering dynamic per-draw commentary chosen by
`selectRecipientIntro` (stage 1, before any holds) and `selectRecipientDealNudge` (stage 2,
after the first hold). Both pick from authored banks in `shared/commentary/chadChallenge.ts`.
The output reads as gibberish in the investor-demo path — the voice engine's repair is its
own workstream (#4b) and is out of scope here.

This lock authorizes one narrow change for the demo: **disable the two random picks on the
recipient play surface** and replace them with two static `Line`s — instructional copy for
stage 1, and a stable target-score directive for stage 2. The generator and the banks remain
untouched so the engine work can resume without re-litigating this decision.

**Subtraction, not repair.** No new commentary mode, no fallback machinery, no flag.

---

## Scope — what changes

In `shared/components/H2HRecipientPlay.tsx` only:

1. **Imports** (block ~119–123 from `"@shared/commentary/chadChallenge"`):
   - REMOVE `selectIntroAnchor`, `selectRecipientIntro`, `selectRecipientDealNudge`.
   - KEEP `type Line` (still used by ref scaffolding and PartsLine).

2. **`introAnchor` memo** (~388–405): DELETE. Its only consumers were the two picks being
   removed.

3. **`stage1Ref` picked line**: replace the `selectRecipientIntro({...})` call with the
   static value
   ```
   line: ["Tap the players you'd keep. Draw the rest."]
   ```
   The ref/sig scaffolding stays — it gives PartsLine a stable identity for its reset
   effect. Only the picked `line` value changes.

4. **`stage2Ref` picked line**: replace the `selectRecipientDealNudge({...})` call with
   ```
   line: [`Draw to beat ${challengeCtx.targetScore}.`]
   ```
   Format the target to match the landing's #3 number format — if the landing shows one
   decimal, format the same here.

5. **`introSig`**: may now reference fields no longer read by any pick. Leave it as the
   ref-gate signature (harmless) or trim to the fields still in use — tsc is the arbiter.

## Scope — what does NOT change

- `shared/commentary/chadChallenge.ts` — generator and banks untouched.
- `introTypography` / WebkitLineClamp triad (~975–990) — untouched **as a definition**;
  the redraw-beat continuation adds one new consumer (see §"Continuation" below).
- PartsLine render sites (~1146 / ~1157) — untouched.
- `showStage1` / `showStage2` gating — untouched.
- The clamp, the commentary surface itself, or any non-H2H consumer — untouched.

---

## Continuation — number-to-beat persistence in the redraw beat (same session, same lock)

Same surface, same lock, follow-on edit.

**Why.** The number-to-beat is the surface's anchor — `"Draw to beat <target>."` in the
stage-2 hold beat, then `<target>` in the results compare. Between those, the redraw beat
(`redraw_running` / `your_redraw_flip`) wipes the top intro region to an empty spacer
(`BUG-1 FIX`). On glass that reads as the number "vanishing" mid-flow — exactly the
moment when the user most needs the target to stay parked. Holding the number in the top
region through the redraw beat keeps the anchor continuous through deal → hold → draw.

**What changes.** In the same intro-region ternary, replace the
`data-h2h-play-intro="redraw-empty-spacer"` body with a single rendered line wrapped in
`introTypography`:

```tsx
<div data-h2h-play-intro="redraw-target" style={{ width: "100%" }}>
  <div data-h2h-play-headline="true" style={introTypography}>
    {`${challengeCtx.targetScore.toFixed(1)} to beat.`}
  </div>
</div>
```

- `introTypography` wrapper is non-negotiable — it owns the WebkitLineClamp:3 + height
  budget. Rendering through it is what prevents the strip Y-shift regression `BUG-1 FIX`
  was originally added to catch. The outer container still owns the
  `INTRO_3LINE_BUDGET_CSS` reserved height; we are now filling it with a real single line
  instead of a layout-only empty spacer, but the height budget is unchanged.
- `challengeCtx.targetScore` is already in scope here (used at the `stage2Ref` line ~403).
- `.toFixed(1)` matches the stage-2 format exactly — the two lines must read the same
  number on glass and in tests.

**What does NOT change.**
- `deriveHeadline` is untouched — the hero-region `"Drawing…"` copy stays.
- Stage-1 (~394) and stage-2 (~403) static lines unchanged.
- `INTRO_3LINE_BUDGET_CSS`, `introTypography`, the container's `height` / `boxSizing` /
  `overflow` triad unchanged.

## Mechanical follow-on (test sentinel)

`shared/components/__tests__/H2HRecipientPlay.test.tsx` — one numeric threshold in §9
moves from `toBeGreaterThan(20)` to `toBeGreaterThan(0)`. The §9 test's real invariant is
byte-stability of the stage-2 line across preview taps (the three `stage2X === stage2A`
equalities below the threshold check, which still pass). The `> 20` was a sanity check
against the OLD bank's typical length; the new static stage-2 line
`Draw to beat <target>.` is ~19 chars for `target=175`. `> 0` still proves a non-placeholder
line painted (placeholder is `[""]`, length 0). No other test threshold or assertion changes.

---

## Verification

Heavy path (shared/ touched, per CLAUDE.md):

- [ ] grep proves no surviving call to `selectRecipientIntro` / `selectRecipientDealNudge`
      / `selectIntroAnchor` in `H2HRecipientPlay.tsx`.
- [ ] grep proves no `bad_beat` literal reintroduced anywhere in the diff.
- [ ] `npx tsc --noEmit` clean (also proves dead imports/memo are fully removed).
- [ ] `bash scripts/build-vercel.sh` (NOT basketball-only — shared/ touched).
- [ ] `npm test` full from repo root (redraw-beat test expectation updated, green for the
      right reason — see "Mechanical follow-on" above and the redraw-target assertion).
- [ ] `grep redraw-empty-spacer` returns nothing in the production file (fully replaced).
- [ ] `grep deriveHeadline` shows it untouched; stage-1 / stage-2 statics untouched.
- [ ] GLASS, choke-challenge recipient hand:
      - Stage 1 (no holds) shows `"Tap the players you'd keep. Draw the rest."` — no
        truncation, no run-on, no dangling em-dash.
      - Stage 2 (≥1 hold) shows `"Draw to beat <target>."` cleanly.
      - Redraw beat (after Draw tap, `redraw_running` / `your_redraw_flip`): top region
        reads `"<target.toFixed(1)> to beat."` AND `"Drawing…"` still shows in the hero
        region mid-screen.
- [ ] Real-browser bounding-box check on stage-1, stage-2, AND the redraw-target line:
      each rendered line's rect sits inside its container (JSDOM presence ≠ visible).
- [ ] BUG-1 regression check: the card strip's Y position does NOT shift between
      `hold_select` and `redraw_running`. This is the whole reason the `introTypography`
      wrapper is mandatory on the new line — a bare text node would not honor the
      container's height budget and the strip would jump.

Push-held by default. No push until John confirms glass.

---

## Net effect

| State | Before | After |
|---|---|---|
| `hold_select`, 0 holds, `!introDismissed` | random pick from `selectRecipientIntro` bank | `"Tap the players you'd keep. Draw the rest."` |
| `hold_select`, ≥1 hold | random pick from `selectRecipientDealNudge` bank | `"Draw to beat <target>."` |
| `redraw_running` / `your_redraw_flip` (top region) | empty layout spacer (`BUG-1 FIX`) | `"<target> to beat."` (same `toFixed(1)` format) |

All three lines are static, single-line, well under the 3-line clamp. No dynamic call
survives on this surface. The redraw beat's hero-region `"Drawing…"` (`deriveHeadline`)
is unchanged.
