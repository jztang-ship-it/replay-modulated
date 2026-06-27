# Boss reveal/play — mobile-fit spec

**Status:** SPEC (doc-before-code gate). No code until this is pushed + confirmed.
**Surface:** the boss reveal/play surface on the cold-link path (`/challenge/{uuid}`), shared shell `H2HBoardShell` driving `H2HRecipientPlay` (play) and `H2HRecipientReveal` → `H2HResultsOverlay` (result).
**Goal:** the whole reveal flow fits one mobile viewport with no scroll on first paint, at 390 **and** 430 width, across intro / active round / loss result / win result.
**Acceptance:** John's mobile glass on the real cold link — not green tests, not a mock.

---

## Why this exists

Glass (John's phone, live boss, prod) showed the boss result truncating top and bottom — you scroll to see the boss strip OR your lineup, never both. Recon + two real-rect Playwright passes (390×844, 430×932) confirmed the surface is **built to scroll** (`innerScrollable` + sticky CTA on in every non-arc state; `H2HBoardShell.tsx:523,640`, passed `!arcComposite` at `H2HRecipientPlay.tsx:1682-1683`, unconditional on the overlay `:1244`). It survives overflow by scrolling rather than fitting. We want it to fit.

Playwright resolves `env(safe-area-inset-*)=0`, so its content box is **larger** than a real device — every measured overflow below is **optimistic**. Build to the targets with margin; if real-device 430 glass still scrolls, trim strips / CTA reserve further before touching anything structural.

---

## Measured budget (real rects)

Usable content height: **~650px** first paint (Safari toolbars showing) / **~745px** once they collapse. Target is first-paint fit (~650), 430 being the heavier case because the duel cards are viewport-width-driven.

| State | @390 | @430 | Driver |
|---|---|---|---|
| Play (intro = active, byte-identical) | 762 (+112) | 795 (+145) | 2-row hero (331/364) + two 122px strips + 60 banner |
| Result LOSS (prod, w/ banner) | ~696 | ~700 | single 46px CTA — lightest case (John's screenshots) |
| Result WIN — registered | ~836 | ~853 | BossOutwardEnding alone (~126) |
| Result WIN — **anonymous** | **977 (+327)** | **994 (+344)** | **277px CTA tower** — binding worst case |

Per-band (390/430): global-header 60 · top strip 122 · hero 331/364 (play), 343/376 (result) · bottom strip 122 · round-signage 18 · play CTA reserve 77/btn 52.

**Key severity reframe:** the 977 catastrophe is **anonymous winners only**. `BossClaimPrompt` is anonymous-gated, so registered winners carry only `BossOutwardEnding` (~126) and are fixed by Track 1 alone. The loss result and both play states are also Track-1-only. **Track 2 (CTA) touches exactly one state: the anonymous win.**

---

## Decisions locked (with John)

1. **Target:** true no-scroll on first paint, both widths.
2. **Banner:** reclaim by **dropping it on this surface at the 3 call sites only** — `GlobalChallengeHeader` internals stay **locked** (DO-NOT-TOUCH honored).
3. **Duel cards:** full at ≤390; **~10% smaller at 430+ only**, via the card-width cap (breakpoint-free — the surface has no media queries, keep it that way).
4. **Anon-win CTA tower:** **merge the two cards into one shared scaffold** — both actions kept, no net-new state.

---

## Track 1 — shell tightening

Applies to the shared shell + play/result. All values are **targets**; confirm final px at glass (optimistic Playwright caveat).

**1.1 Banner — drop on this surface (−60).**
Omit the `globalHeader={<GlobalChallengeHeader/>}` prop at the 3 mount sites: `H2HRecipientPlay.tsx:1618`, `H2HRecipientReveal.tsx:358`, `:375`. It is opt-in and mounted nowhere else, so this removes it from the whole play/reveal surface with no global blast radius. **Do not edit `GlobalChallengeHeader.tsx`.**
*Caveat for John to veto at review:* this removes brand presence during play/reveal (the wordmark moment then lives only on the landing). If you want it retained, the alternative is a shrunk variant — but that's a component touch, i.e. it breaks the lock. Default = drop.

**1.2 Strip cells + headers — trim (−~52, both strips).**
`HAND_STRIP_HEIGHT_PX` 80 → **60** (`H2HRecipientPlay.tsx:198`), `ZONE_HEADER_HEIGHT_PX` 24 → **18** (`:35`). Recon confirmed the trim pays off **linearly** — the cell narrows on the locked 329/478 aspect, the container-query scale (`scale(100cqw/150px)`) keeps card content un-clipped, no scale clawback eats the saving. 60px chips remain legible; glass confirms.

**1.3 Play CTA reserve — trim (−17).**
`RESERVED_MIN_HEIGHT_PX` 77 → **60** (`H2HRecipientPlay.tsx:221`). Button itself is ~52, so 60 is a safe floor.

**1.4 Result hero — content-size Row 1 (−~115–145, verdict-length-dependent). [CORRECTED — original mechanism was wrong.]**
The result hero is the overlay's **own** CSS grid (`H2HResultsOverlay.tsx:1290`), `gridTemplateRows: minmax(HERO_ROW_HEIGHT_CSS, auto) HERO_ROW_HEIGHT_CSS` (`:1319`). **Row 1** = the verdict line sitting on a full `HERO_ROW_HEIGHT` floor (~159/175px) while the text is only ~40px. **Row 2** = the user hero card (`HeroCell`, `:1439`). The over-reservation is Row 1's floor — **not** a droppable empty row.
- **Lever (in-place, no fork — allowed):** at `H2HResultsOverlay.tsx:1319`, change Row 1's track from `minmax(HERO_ROW_HEIGHT_CSS, auto)` → `auto` (content-size the verdict). Keep Row 2 = `HERO_ROW_HEIGHT_CSS` (user hero card untouched). Reclaims ~115–145px.
- This does **not** use `heroMinHeight` — a parent `minHeight` can't shrink below the grid's intrinsic 331px (saves only ~14px). The unused shell props stay unused.
- `minmax(...,auto)` does not grow on the live 2-line verdict; the floor is the whole cost, so content-sizing Row 1 removes it cleanly.
- **Watch — NOT this pass:** on states with no played card (the loss result John glassed), Row 2's `HeroCell` is the empty battlefield slot. Reclaiming that is a further ~159px but it's state-dependent (Row 2 holds a real card on win states) — parked as a follow-up, out of scope here.

**1.5 Active round keeps the full 2-row hero.** Duel cards stay full-size (decision 3). Do **not** apply 1.4 to the active round.

**1.6 Intro hero — SKIP this pass.** CC confirmed intro→active **is** action-gated: `hold_select` → `redraw_running` fires only on the "Next" tap (`H2HRecipientPlay.tsx:1837` derives the CTA, `:1550` fires `handleDraw`). So content-sizing intro would be permitted (the reflow lands on a screen change). But it only helps the intro state — which already fits at ~603/628 — and does **nothing** for the binding 430 case, the active round, which keeps the full 2-row hero for the duel. Out of scope: leave intro at the 2-row hero. (If ever revisited, it needs the slot-c height mechanism, not `heroMinHeight`.)

**1.7 Duel-card 430 shrink (−~26 on the hero @430).**
Lower the battlefield card-width cap so it bites only on wide screens: `min(125px, 28vw)` → **`min(~110px, 28vw)`** (tune exact cap at glass). At 390, 28vw≈109 < cap → unchanged. At 430, 28vw≈120 → clamped to ~110 (~8–10% smaller). This is the **shell's card-slot width var, not `CardFront`** — `CardFront` stays untouched (lock honored). Breakpoint-free.

---

## Track 2 — anonymous-win CTA merge (−~80)

Only the anonymous-win result carries both cards. Today (`H2HRecipientReveal.tsx:395-419`, boss branch `:396`):
```
ctaSlot = senderKind==="boss"
  ? <><BossOutwardEnding variant="cta-only" …/>   // :398  (~126)
       <BossClaimPrompt …/></>                     // :412  (~141, +10 margin)
  : undefined   // → human default ~38px button (H2HResultsOverlay.tsx:1521)
```

**Merge** the two near-identical scaffolds (`BossClaimPrompt` already "mirrors `BossOutwardEnding`", `BossClaimPrompt.tsx:17`) into **one shared card**:
- **Drop** one border + padding set (~30px) and the claim's heading/body — `"{team} down." / "Want it on the record?"` — which duplicate the on-board verdict (~51px). Net ~−80.
- **Keep both actions, both primary** (no hierarchy demotion this pass): the `[Challenge Someone] / [Copy Link]` share row, `[Play Again]`, **and** `[Put it on the record] / [Maybe later]`.
- **Preserve the claim gate exactly:** `won && bossId && anonymous && !baseline.has(bossId) && lastPrompted!==bossId` (`bossClaimPrompt.ts:73-84`, `BossClaimPrompt.tsx:51-56`) + the parent's `claimBreatheElapsed`. When the claim doesn't render (registered / already-claimed), the merged card is just `BossOutwardEnding` — **no empty merged scaffold**.
- **Prefer composition over forking.** Don't fork either component's internals if a shared-scaffold wrapper / threading the claim's buttons into the ending's footer achieves it. Reuse-not-invent.

Tower 277 → ~197. Combined with Track 1 on the anon-win result: 977 → **~614 @390 / ~630 @430**.

---

## Expected post-fix (optimistic — glass confirms; result hero saving is now ~130, not ~159)

| State | @390 after | @430 after | Note |
|---|---|---|---|
| Intro / active | ~603 | ~628 | unchanged by §1.4 |
| Loss result | ~480 | ~490 | comfortable |
| Registered win | ~595 | ~615 | fits |
| Anonymous win | ~655 | ~670 | **TIGHT / at the optimistic edge — the binding case** |

**Anon-win @430 is the watch case.** With Row 1 saving ~130 (not 159), it sits at the edge of the optimistic budget, so a real device may scroll. **Glass-contingent fallback (CC may apply in the same build if self-measure shows anon-win > ~640 @430):** tighten strip cells 60→56 and the merged-card vertical padding. **Do NOT** drop actions (John kept both) or shrink duel cards to get there — those are locked.

---

## Constraints / DO-NOT-TOUCH

- **No fork** of `H2HRecipientPlay`, `H2HBoardShell`, `H2HRecipientReveal`, `H2HResultsOverlay`, `BossOutwardEnding`, `BossClaimPrompt` — in-place layout + composition only.
- **`GlobalChallengeHeader` internals locked** — reclaim only by omitting the prop at the 3 call sites.
- **`CardFront` untouched** — the 430 shrink is the shell card-slot width var, not `CardFront`.
- **Duel cards full at ≤390**; ~10% smaller at 430+ via one cap value; surface stays breakpoint-free.
- **Human path byte-identical** (friend suspended). Changes are shared-shell and apply to the human path when it relaunches — that's an improvement, but add **no** human-specific branch.
- **`END_OF_ARC_HOLD_MS=700` untouched.**
- **Boss-target invariant untouched** — pure layout/CSS + CTA composition; no data/scoring change. Five cards still **shown** summing to target.
- **`senderKind` branching untouched** — we change *what the boss branch renders*, not the branch condition (`H2HRecipientReveal.tsx:396`).
- **Self-match does not reach this surface** (diverges earlier → `SelfMatchView`; boss row `created_by=null`). No self-match regression risk, no self-match glass needed.

---

## Glass / acceptance plan

John, mobile, real cold link (today's live boss UUID via hub resolver). **Both widths** (a 390-class and a 430-class device). States:
- intro, active round (mid-resolve duel), loss result, **registered** win, **anonymous** win.
- **To see the anon-win merged card** (the 277-tower case): use an **incognito / logged-out** session or `?claim=force` — a registered/dev session won't render `BossClaimPrompt`.

**Pass =** no scroll at first paint (toolbars showing) every state, both widths · lineup chips legible at 60px · duel cards intact (full ≤390, ~10% smaller 430) · merged win card shows both actions · intro→active reflow is clean.

**Build / merge discipline:** tri-sport build is the merge gate (basketball-only sufficient for hold-glass) · glass the held worktree branch BEFORE merge (live UX, no graceful rollback from broken doorways/squashed cards) · record rollback rev before merging · merge `--no-ff` · poll Vercel to **READY** (not "pushed"/"queued") · confirm deployed commit · branch `-d` (never `-D`) + release worktree · John real-prod smoke closes it.

---

## Parked follow-ups (→ open-followups.md)

- **Product (not this pass):** two competing orange primaries on the anon-win card (share/growth vs auth/retention funnel), and whether *"put it on the record"* is the right ask under basketball's muted economy (no ledger). Copy/funnel call, adjacent to the "sounds non-human" arc.
- Throwaway recon scripts (`scripts/_recon-h2h-fit.mjs`, `_recon-claim.mjs`, `_recon-bosswin-overflow.mjs`) are untracked — leave or clean per John.
