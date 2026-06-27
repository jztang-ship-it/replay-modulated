# Boss win-screen — CTA hierarchy spec (direction A)

**Status:** SPEC (doc-before-code gate). No code until pushed + confirmed.
**Surface:** boss result CTA in `H2HResultsOverlay` ctaSlot (`H2HRecipientReveal.tsx:392-419`, boss branch `:396`), plus the revisit landing (`ChallengeTakeCardLanding.tsx:614`).
**Goal:** kill the 5-CTA pile / two competing amber primaries. One clear primary per state; the primary is always the highest-value available transition.
**Acceptance:** John's mobile glass — claim state (incognito or `?claim=force`), social state (registered + anon-dismissed), both render sites.
**Sequencing:** this branch **stacks on** the fit branch. Order: (1) the §1.4 both-levers fix lands on `feat/boss-mobile-fit` + re-measures scoped; (2) `feat/boss-winscreen-cta` **rebases onto the fixed fit tip** and applies the lean CLAIM (this **supersedes** the full-vertical composition committed at `33dfbd2e`); (3) re-measure scoped; (4) glass the **combined stack** (fit + winscreen) together; (5) **merge once**. The fit branch does not merge separately.

---

## The rule (single source, no drift)

> **The primary CTA is always the highest-value available state transition.**
> If save/claim is available → save is primary. Else if it's a win → social (challenge) is primary.

Two states only on this surface. Deterministic: identical inputs → identical layout.

---

## State 1 — CLAIM (anonymous, save still available)

**Condition (the real gate — unchanged, do not modify):**
`won && bossId && isAnonymous && !baseline.has(bossId) && lastPrompted !== bossId` + parent `claimBreatheElapsed` (`bossClaimPrompt.ts:73-84`, `BossClaimPrompt.tsx:51-56`).

**Hierarchy (LEAN — the claim moment shows only its true peak):**
- **Primary** (amber, top): `Put it on the record`
- **Secondary** (outline): `Challenge someone`
- **Dismiss** (quiet text): `Maybe later`
- **NOT composed in CLAIM:** `Copy link`, `Play again`, the share-row divider, the rest of the full `BossOutwardEnding` block. They render only in SOCIAL — and SOCIAL is one "Maybe later" tap away, so nothing is lost. The claim moment stays a single clear peak: save / share / out.

**Helper line (above the block):** `This win is yours to keep.`
*(Replaces "It only counts if you save it" — ownership over defensiveness. Assembled helper copy is in the parked "sounds non-human" arc's territory; fine for now, trivially swappable.)*

**Composition:** `BossClaimPrompt` (save, primary) + a single `Challenge someone` affordance + `Maybe later` (dismiss). Do **not** render the full `BossOutwardEnding` share-block here — pull just the one Challenge action via composition/props (additive, like Track 2's embed). **No fork.**
**Height:** this lean stack ≈ ~170px (vs the full vertical's 251 — see height note). With the fit-branch §1.4 fix (−94), brings anon-win ~725 → ~644; fits. Strip cells 60→56 remain an authorized margin fallback.

---

## State 2 — SOCIAL (won, but no save to make)

**Condition:** `won && !claimEligible` — i.e. registered winner, already-claimed, **or** anonymous-but-dismissed ("Maybe later"). No gap: the dismissed-anon case lands here.

**Hierarchy:**
- **Primary** (amber, top): `Challenge someone`
- **Secondary** (outline): `Copy link`
- **Tertiary** (text): `Play again`

**Helper line:** `Share what you just did.`
**No save affordance in SOCIAL — absent, not disabled or hidden.** When `claimEligible === false`, no save/claim UI is composed into the DOM (today `BossClaimPrompt` returns null — keep it that way; do **not** add a demoted `Save your win` link). An unavailable save is a false affordance and couples the two states.

Today's `BossOutwardEnding` cta-only is already close to this (Challenge is primary) — the change is light: make `Challenge someone` the single amber, `Copy link` outline secondary, drop the divider, demote `Play again` to a text link.

---

## Render sites

1. **`H2HResultsOverlay` boss ctaSlot** (`H2HRecipientReveal.tsx:396`) — post-play result. Both states render here.
2. **Revisit landing** (`ChallengeTakeCardLanding.tsx:614`, full `BossOutwardEnding`, no claim) — already-played-today re-entry. **SOCIAL state only.** Resolves through the **same two-state evaluator** — not a new state machine, just the same ranking rules on a second surface.

---

## Visual hierarchy rules (non-negotiable)

- Exactly **one** primary per state — amber, filled, top of the stack.
- Secondary — outline/muted, never amber.
- Tertiary — text links only, never visually compete.
- If two actions feel equally important, the state model is wrong — resolve upstream, never ship dual-primary.

---

## Constraints / fence

- **No change to the claim/auth mechanism.** The `Put it on the record` handler still opens `RegisterModal` as it does today (`BossClaimPrompt.tsx:108`). We change **order, emphasis, and copy** — never a handler, the claim gate, the modal, persistence, or eligibility. (Reject any "emit an intent / decouple the modal" refactor — that's out of scope and touches the fenced surface.)
- **No fork.** Composition inside the `senderKind === "boss"` branch only. The human default (`H2HResultsOverlay.tsx:1521`) stays byte-identical; no human-path branch added.
- **`senderKind` branch condition unchanged** — we change what the boss branch renders, not when it renders.
- **Height [CORRECTED — earlier "lighter" assumption was wrong].** A vertical hierarchy stacks *rows*, so it's **taller** than the old side-by-side card: full-vertical CLAIM measured **251px**, not ≤181. Only the **lean CLAIM** (above, ~170px) fits. Binding case is anon-win, over by ~75px until *both* land: the fit-branch §1.4 both-levers fix (−94) **and** the lean CTA. SOCIAL/registered/loss fit on the §1.4 fix alone. Re-measure scoped + glass — do not trust unscoped Playwright on this surface.
- **Loss result out of scope** — already a single button.

---

## Mapping (why each state's primary)

| State | Meaning of the win | Primary | Goal |
|---|---|---|---|
| Claim | capture identity before it evaporates | Put it on the record | accounts / retention |
| Social | activate the win socially | Challenge someone | reach / growth |

System rationale (John + GPT, recorded): recent effort hardened *persistence/auth/correctness*, so the live risk is **value evaporation**, not distribution — save-first is aligned with that. B (share-first) is the later experiment once identity is stable and distribution is the bottleneck.

---

## Glass / acceptance

Mobile, real cold link (today's live boss UUID via hub resolver — don't assume a stale id), both 390 and 430:
- **Claim state** (incognito or `?claim=force`): one amber primary = `Put it on the record`; `Challenge someone` clearly secondary; no second amber; helper reads "This win is yours to keep."
- **Tap-through still works:** `Put it on the record` → `RegisterModal`; `Copy link` → "Link copied ✓"; `Play again` / `Maybe later` behave as before (presentation-only change must not break wiring).
- **Social state:** registered win **and** anon→"Maybe later"→still-on-screen → `Challenge someone` primary, no save hero, no dead-end.
- **Both render sites** (overlay + revisit landing) consistent.
- **Fit:** no scroll, both widths (regression check on the fit work).

---

## Diff boundaries (CC self-check before handoff)

**May change — presentation / order / copy only:**
- `H2HRecipientReveal.tsx` (ctaSlot boss branch `:392-419`) — re-rank the two states; swap helper copy.
- `BossOutwardEnding.tsx` — button tiering within cta-only **WIN** (Challenge → primary, Copy link → secondary, Play again → tertiary text; drop divider). **LOSS branch untouched.**
- `BossClaimPrompt.tsx` — **button presentation only** (make `Put it on the record` the single amber primary, top of stack).
- `ChallengeTakeCardLanding.tsx:614` — apply SOCIAL tiering via the same evaluator.

**MUST NOT change — even inside files above (the fence):**
- The claim **gate**: `won && bossId && isAnonymous && !baseline.has(bossId) && lastPrompted !== bossId` + `claimBreatheElapsed` (`bossClaimPrompt.ts:73-84`, `BossClaimPrompt.tsx:51-56`) — byte-identical.
- The `RegisterModal` invocation / claim handler (`BossClaimPrompt.tsx:108`) — same call, same context.
- No `onPrimaryCTA(actionType)` indirection, no modal/auth decoupling refactor.

**MUST NOT appear in the diff at all:**
- `RegisterModal.tsx`, `GlobalChallengeHeader.tsx`, `CardFront.tsx`
- the `senderKind` branch condition; money seam; persistence/auth logic.

CC self-check at handoff: confirm the three "must-not-appear" files are absent from the diff, and paste the gate strings + `:108` invocation before/after to show they're unchanged.

---

## Decisions closed

All three open calls locked (John + GPT): SOCIAL primary = `Challenge someone`; save UI **absent** (not demoted) when `claimEligible === false`; revisit landing uses the **same evaluator** (no divergence). Spec is final pending push.
