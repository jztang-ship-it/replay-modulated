# HANDOFF — Play-surface locked a–f geometry (Option A)

**Status: WIP CHECKPOINT. NOT complete, NOT verified, NOT glassed.**
Branch: `redesign/result-shell-rehost`
Checkpoint commit: `90dfd95` (`wip: play-surface locked-a-f geometry — CHECKPOINT before context clear`)
Parent (clean): `38c536a` (result→shell re-host already landed here)
Date: 2026-06-24

This file is the source of truth for resuming. Do NOT trust memory; trust git + this file.

---

## Ratified decisions — DO NOT re-litigate

- **Locked a–f framework** (RESULT is the reference geometry; bring PLAY to it):
  - a = header
  - b = opponent mini row
  - c = opponent-hero-OR-text, **LOCKED at one hero card-row height** (card-capable since reveal's opponent card lives here; text-holding for play instructions + result verdict)
  - d = my-hero
  - e = my-mini row, with **x/3 indicator tucked closely below e**
  - f = CTA
- **Option A** chosen for slot-c: locked at **one card-row height** (`min(125px,28vw) × 478/329` ≈ 153px @375 / ≈146px @360). Measured to fill the hero zone's pre-existing ~80px slack, so **no scroll** is introduced (HERO_MIN_HEIGHT_CSS already reserves 2 card-rows). Verified to fit 375×667 (0px overflow) and 360×640 (2px). The old RD7.5 scroll came from the now-removed headline+FP-hero, NOT the slot-c floor.
- **Additive shell constant AUTHORIZED**: a single shared one-card-row height constant in `H2HBoardShell` (constant + export only). **No frame / z / positioning / margin change to the shell.** Any OTHER shell need → STOP and report.
- **deal-in cascade is OFF-LIMITS**: do not touch `deal_in` state, `cardsLanded`, timers, `DEAL_CASCADE_INTERVAL_MS`, or cell face_up/empty logic. Geometry/visibility only, never the animation.
- **Absolute line: NO challenge page scrolls.** Tightest constraint is 360-wide. This gate outranks everything else.

---

## The five build steps — honest per-step status

### STEP 1 — shared shell constant — **DONE**
- `shared/components/H2HBoardShell.tsx` ~:80: added
  `export const HERO_CARD_ROW_HEIGHT_CSS = \`calc(min(125px, 28vw) * ${(478 / 329).toFixed(6)})\`;`
  (= `calc(min(125px,28vw)*1.452888)`, one card-row) + doc comment. **This is the ONLY shell change** — confirmed by `git diff` (additive constant + comment, no frame/z/positioning).
- `shared/components/H2HResultsOverlay.tsx`: import now includes `HERO_CARD_ROW_HEIGHT_CSS`; `HERO_ROW_HEIGHT_CSS` repointed to it (was a local value-identical calc).

### STEP 2 — play hero-zone restructure into result's 2-row form — **DONE**
- `shared/components/H2HRecipientPlay.tsx` (CHANGE B): the `hold_select`/`deal_in` heroSlot branch wrapped in a 2-row flex column `data-h2h-play-hero-2row`:
  - row 1 = `data-h2h-play-slot-c` reserved at `HERO_CARD_ROW_HEIGHT_CSS` (instructional-text zone; **actual copy is a LATER pass — reserved-but-empty now**).
  - row 2 = my-hero (the `hold_select` big preview card when `previewedSlotIndex !== null && previewedCard`, else an empty bordered box).
- Play import updated: added `HERO_CARD_ROW_HEIGHT_CSS`, removed `HERO_MIN_HEIGHT_HOLD_SELECT_CSS`.

### STEP 3 — margin override swap to shell defaults — **DONE**
- `H2HRecipientPlay.tsx` (CHANGE C+D): removed the three `inLayoutA`-gated overrides (`heroMinHeight` / `topZoneMarginBottom` / `heroMarginBottom`) from the `<H2HBoardShell surfaceKind="playing">` call → all states use shell defaults (TOP_ZONE=12, HERO=12).
- Dead-constant cleanup: removed `HOLD_SELECT_TOP_ZONE_MARGIN_CSS`, `HOLD_SELECT_HERO_MARGIN_CSS`, `inLayoutA`, `inLayoutB` const defs (all dead after the override removal).

### STEP 4 — un-collapse opponent strip in slot b — **DONE**
- `H2HRecipientPlay.tsx` (CHANGE E): `topStripVisible` now includes `deal_in || hold_select` (plus `your_redraw_flip || ab_transition || handoff_resolving || arc`).
- **Behavioral change flagged**: this reverses the prior "Mike's box isn't empty during cascade" behavior — opponent strip is now visible during deal_in/hold_select. Opponent cards already wired via `challengeCtx.resolvedSenderHand?.cards[i]` → `TopStripCell`. **Glass must confirm this reads right during the cascade.**

### STEP 5 — x/3 relocation to shell roundSignage slot below e — **PARTIAL (incomplete — double-render present)**
- DONE: added `roundSignage={ state.kind !== "arc" ? <div data-h2h-round-signage …>{roundsUsed}/{maxRounds}</div> : undefined }` to the play `<H2HBoardShell>` call — `H2HRecipientPlay.tsx` ~:1796–1814. This renders in-band, directly below slot e (the locked position; matches the code's own "step (iii)").
- **NOT DONE — the old fixed sibling is STILL PRESENT**: `H2HRecipientPlay.tsx` ~:1825–1838, the `state.kind !== "arc"` fixed `position:"fixed", bottom:"18%"` `data-h2h-round-signage` div. Both are gated `!== "arc"`, so **during non-arc play x/3 DOUBLE-RENDERS** (once below e, once at fixed bottom:18%).
- **NEXT SESSION FIRST ACTION: delete the fixed sibling block (~:1825–1838)** so only the in-band shell-slot signage remains. (Leave the arc path untouched — the reveal renders its own in-band signage at arc, unchanged.)

---

## Verification status

- **vitest**: NOT run this session.
- **verify:visual** (`scripts/verify-h2h-play-layout.mjs`): NOT run this session.
- **basketball build**: NOT run this session.
- Nothing is verified. The checkpoint is purely a recoverable snapshot.

---

## Known traps for the next session

- **verify:visual play-harness has pre-existing enumerated rot (~70 failures)** unrelated to this work: round-machine play-flow (Draw→"Next" CTA rename; `your_redraw_flip`/`ab_transition`/`arc` states unreached), stale reveal baseline (#14). A failure **outside** that enumerated list = a REAL regression from this geometry change. Re-enumerate against clean `38c536a` if unsure.
- **Watch reveal-surface checks**: the shared `HERO_CARD_ROW_HEIGHT_CSS` constant touches a value the **reveal** battlefield card-row resolves to. Result and reveal must change in lockstep — asymmetry = visible snap at the reveal→result crossfade. Re-glass result for the verdict-row growth (CHANGE A grew result row-1 floor from minmax(72) to the locked one-card-row).
- **slot-c is reserved-but-empty** (no instructional copy yet) — that is intentional this build; copy is a later pass. Don't mistake the empty row for a bug.
- **Do not touch the deal-in cascade.** Geometry/visibility only.

---

## What's left to finish the build (in order)

1. **Finish STEP 5**: delete the fixed `bottom:18%` round-signage sibling (~:1825–1838 in `H2HRecipientPlay.tsx`) so x/3 renders only in-band below e (no double-render).
2. Syntax/type sanity (the play file had earlier JSX-comment-between-attributes traps — use `/* */` block comments, never `{/* */}` between JSX attributes).
3. Run **full vitest** (expect ~1418 green). If a test asserts result's `HERO_ROW_HEIGHT_CSS` literal, realign with receipts. If a **pinned / no-snap gate** (e.g. RD6.1) fails, STOP and report — do not silently adjust.
4. Run **verify:visual** with the three-bucket breakdown: (a) known-enumerated play rot — ignore; (b) NEW failures from the geometry change — investigate, especially REVEAL-surface; (c) enumerated checks now FIXED.
5. Confirm `git diff` shows the shell change is the **additive constant only**.
6. Commit (explicit paths: the three `shared/components/*` files; confirm `package-lock.json` NOT staged; no backticks in body; plain provisional message). Push for Vercel preview. Report SHA as **PROVISIONAL until glassed**.
7. **Glass** at ~375×667 and a tight 360-wide phone: no scroll; no-jump slot-c across play/reveal/result; deal-in cascade intact; opponent row visible during deal_in/hold_select; re-glass result for verdict-zone growth.
