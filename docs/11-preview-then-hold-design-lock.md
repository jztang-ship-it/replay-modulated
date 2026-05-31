# Polish #11 — Preview-then-Hold interaction (DESIGN LOCK)

**Status:** PROPOSED — awaiting sign-off. No implementation until committed.
**Surface:** `H2HRecipientPlay` `hold_select` state only (pre-reveal). Reveal arc, redraw, resolve untouched.
**Scope:** interaction + layout re-architecture. Stateful → full interaction tests + real-device pass required.

---

## 1. Goal

In `hold_select`, let the recipient **inspect** each card big before committing, so holds are informed, not blind off 80px mini-cells. Tap a mini-slot → that card shows big in the recipient's hero slot. Tap the previewed card again → hold. Again → unhold. The opponent's big card isn't needed at this stage, so the stage text relocates into that space.

---

## 2. Zone layout (hold_select)

| Zone | Today | After #11 |
|---|---|---|
| Top zone (opponent area) | opponent mini-strip (face-down) + label | **Stage text lives here** — Stage 1 / Stage 2 / instructional, same position all pre-reveal text uses. Opponent face-down strip stays as-is beneath/around it (see Q for impl). |
| Hero region (middle) | single slot holding the intro text | **Preview window.** Before any tap: an **empty box with its border visible** (defined empty slot, not blank space). On preview: the previewed card renders big here via `renderBattlefieldCard`. |
| Bottom zone (recipient) | recipient mini-strip (tap = hold) | recipient mini-strip (tap = preview/hold/unhold per §3) |
| Reserved bottom | Draw CTA | Draw CTA (unchanged; always enabled) |

The stage text moving **out** of the hero region into the top zone is what frees the hero region to be the preview window. This is the load-bearing layout change.

---

## 3. The tap cycle (truth table)

State derives from two facts only: **is this the currently-previewed card?** and **is it held?** No per-card counters, no mid-cycle memory.

| You tap… | Result |
|---|---|
| a card that is **not** currently previewed | **Preview** it (renders big in hero slot). No hold change. Resets cycle to this card. |
| the **currently-previewed** card, **not held** | **Hold** it. |
| the **currently-previewed** card, **already held** | **Unhold** it. |

Consequence (confirmed intent): preview A → preview B → back to A means tap A = preview, tap A again = hold. No resume of a half-finished cycle. Moving away always resets.

---

## 4. Visual state (reuse existing tokens — no new ones)

| Card state | Mini-slot | Big preview (hero slot) |
|---|---|---|
| not previewed, not held | neutral | — |
| previewed, not held | neutral (it's the one shown big) | shown big, **no** held marker |
| held | **existing yellow border** | **existing H mark, upper-left** |

A glance at the strip shows what's locked (yellow borders); the hero slot confirms hold state for the previewed card (H mark).

---

## 5. State model

Extend the discriminated `hold_select` state (cleaner than loose component state — matches the existing carry-through pattern):

```ts
| { kind: "hold_select"; held: Set<number>; previewedSlotIndex: number | null }
```

- `held: Set<number>` — **unchanged semantics, unchanged source of truth.** Downstream (`redraw_running`, `column_flip`, `handoff_resolving`) reads `state.held` and needs zero changes.
- `previewedSlotIndex: number | null` — **new, orthogonal.** Never substitutes for `held`. Initializes `null` on entry to `hold_select`.

Tap handler replaces `toggleHold(i)`:
```
onTap(i):
  if previewedSlotIndex !== i        → set previewedSlotIndex = i        (preview)
  else if !held.has(i)               → held.add(i)                       (hold)
  else                               → held.delete(i)                    (unhold)
```

---

## 6. Triggers (intro dismiss + Stage 1→2 swap)

Today both glue to `held.size`. Re-bind for the preview model:

- **Intro dismiss** (`introDismissed`): fires on **first preview tap** (user is now engaged). Stage 1 leaves as soon as they start inspecting.
- **Stage 1 → Stage 2 swap**: fires on **first confirmed hold** (`held.size > 0`). So the arc is: read Stage 1 intro → start previewing (intro dismisses, instructional text shows) → confirm first hold (Stage 2 nudge appears).
- Both triggers derive purely from local state. **Neither touches `introSig`.**

Instructional headline (the `held.size===0 && introDismissed` fallback) updates copy to describe the new interaction, e.g. *"Tap a card to preview. Tap again to hold."*

---

## 7. Draw CTA

**Always enabled** (unchanged). Holding zero cards = "redraw everything," a legitimate choice. Draw reads `state.held` exactly as today.

---

## 8. Invariants (from investigation — must not break)

1. `held: Set<number>` semantics + downstream consumption (`redraw_running` → `column_flip` → `handoff_resolving`) — **zero changes** to those effects.
2. Only **confirmed-held** cards are in `held` when Draw fires. Preview-only cards must NOT be in `held` (else they'd lock into the redraw payload and defeat the redraw).
3. `initialRoster` stays the slot-indexed card-identity source.
4. `introSig` stays pure-ctx. `previewedSlotIndex` must never enter it (else preview taps re-pick the intro line mid-interaction — the exact S3 bug).
5. `stage1Ref` / `stage2Ref` invalidate only on ctx-key change — preserved.
6. `handoff_resolving` (VS beat) still wins the hero-slot conditional over any preview state.

---

## 9. Test plan (interaction-level, not propagation — standing test-gap rule)

Real-render tests driving the actual handler/state:
- preview-doesn't-hold: tap an unpreviewed card → `held` unchanged, card renders big.
- second-tap-holds: tap previewed card → `held` gains the index; mini shows yellow border; big shows H mark.
- third-tap-unholds: → `held` loses the index; markers clear.
- move-resets-cycle: preview A, preview B, tap A → A previews (not held); tap A again → A holds.
- **held survives Draw**: confirm `state.held` at Draw = only confirmed holds, preview-only excluded → correct `lockedCardIds`.
- intro dismiss on first preview; Stage 2 on first hold.
- `introSig`-pinned lines do NOT change across a sequence of preview taps (S3 regression guard).
- VS beat (`handoff_resolving`) overrides preview rendering.
Plus real-device pass on `replayifs.com` (mobile, the surface this all renders on).

---

## 10. Open impl detail (not a design decision — flagged for the build)

The top zone currently holds the opponent face-down mini-strip. "Stage text lives here" means text + that strip coexist (text above the strip) or text replaces the strip's visual prominence during hold_select. This is a layout-arrangement call for implementation, within the locked decision that **text goes in the top zone**. The deferred Area-G spacing pass measures against this final layout — so the vertical budget set here feeds that later pass.
