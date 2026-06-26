# Boss Surface Consolidation — Spec (source of truth)

**Status:** Spec written 2026-06-26, **pending John's confirm** before Phase 1 coding. Prod clean at `350ba77d` (rollback `c168f0fe`).

**Scope of this doc:** consolidating the TWO boss SURFACES (the in-app hub + the URL interstitial) into one page. This is the **Boss Surface Consolidation** arc — DISTINCT from the **Boss Delivery Consumer** arc (`docs/cc-brief-boss-delivery-consumer.md`, which owns Phase 2/2.5/3/5 = delivery/comparison/belts/virality, mostly shipped). To avoid phase-number collision, always qualify: "Consolidation Phase N" vs "Delivery Phase N". Numbers here are **Consolidation** phases.

---

## The core decision (locked)

**Consolidate TOWARD `BossLandingView`** (the URL-routed interstitial in `ChallengeLandingScreen.tsx`), NOT toward the `BossScreen` hub.

**Why:** BossLandingView owns all the load-bearing behavior — the accept→deal flow, the BossOutwardEnding revisit + share loop, the `/challenge/{bossId}` routing contract, and Play Again re-deal. `BossScreen` (the hub) is **display + a single navigation** (`<a href=/sport/challenge/{id}>`). Moving display onto the behavior-owner is cheap and safe; moving behavior onto the display-only hub is where orphans happen.

**Invariant:** we move only DISPLAY onto BossLandingView. **We never move behavior (deal/share/routing/replay) onto the hub.** The hub is retired, not promoted.

**Interim reality:** the `BossScreen` hub win-state shipped at `350ba77d` (verdict line + Play-Again CTA label) is **interim / slated-for-retirement in Consolidation Phase 3 — NO further polish on it.**

---

## Recon 14 findings this builds on (measure-only, already done)

Reuse verdicts (card-level reveal mechanics):
- **A — per-card blast/glow/shake = REUSE-AS-IS.** Plain props on `AthleteCard`→`PlayerCardShell` (`glowActive`/`glowTier`/`glowDurationMs`/`shakeType`/`cardShakeType`/`visibleFp`/`staticEndState`, `PlayerCardShell.tsx:283-299`). `h2hOverlayRenderer` (`basketball/src/views/GameView.tsx:152-165`) already drives them **HOOK-FREE** on a static end-state card. No `useH2HReveal` / `H2HRevealScreen` / `useEmotionalReveal` needed.
- **B — boss five as real cards = REUSE-WITH-EXTRACTION (front-only).** `revealedFive {basePlayerId,name,pos,salary,tier,fp}` → `AthleteCard` front needs `position` (=`pos`), `actualFp`/`projectedFp` (=`fp`), a synthetic `cardId`, `team` (=`boss_identity_id.split("-")[0]`). The adapter **already exists** at `H2HRecipientReveal.tsx:180-190`. The flip BACK (`statLine`/`gameInfo`/`achievements`) needs a game-log fetch → render with **`canFlip={false}`** (`CardBackGeneric`, no stat data).
- **C — FP→target aggregate count-up.** Per-card roll-up = REUSE-AS-IS (`CardFront.tsx:378-423` RAF, cubic-out `1-(1-p)^3`, `fpCountUpMs` clamp 300–2200, `onRollComplete`). The aggregate 0→target counter is matchup-welded in `useH2HReveal.ts:787-821` → **lift ~15 lines**: one RAF, matched easing+duration, **snap to the baked target on the 5th `onRollComplete`**.

Orphan audit (what a naive merge DROPS) — the **4 red risks**, quarantined out of Phase 1 and 2, owned by Phase 3:
1. **accept→deal flow** — `dealFreshRoster(season, EXCLUDE the boss five)` → `acceptProceed` → `H2HRecipientPlay`, async with degrade-to-inherited-five fallback (`App.tsx:673-705`). Today only the URL route triggers it; the hub CTA merely navigates.
2. **BossOutwardEnding revisit + share loop** — Challenge Someone / Copy Link (win-only, `boss_outward_share`/`boss_outward_copy` telemetry, generates the `/challenge/{bossId}` share URL); loss "Run it back"; Play Again. The hub win-state is a SLIM verdict with NO share.
3. **`/challenge/{bossId}` routing contract** — that URL is BOTH the hub's nav target AND the external share-link target; must stay reachable cold.
4. **Play Again re-deal** — `BossOutwardEnding.onPlayAgain` + `App.onTryAgain → replayBossFreshDraft` (`App.tsx:248`, fresh five excl. boss). Must re-deal, not replay/dead-end.

Amber (reconcile during the phases): leaderboard-in-both-states; marquee "brutal by design" / tough_day framing split; two attempted-signals (`alreadyAttempted` server-memory vs `getBossResult` local — pick `getBossResult`).

---

## Consolidation Phase 1 — display-only first-time reveal (CONFIRMED scope)

**Surface:** the boss first-time entry on **BossLandingView** (the `!priorResult` first-timer branch).
**Display-only. Touches NONE of the 4 red orphans.**

1. Render the boss five as **real `AthleteCard`s** (`canFlip={false}`) via the recon-B front-only adapter (reuse `H2HRecipientReveal.tsx:180-190`). Replaces the bordered chips.
2. **Per-card blast** on each of the 5 cards via the hook-free props (recon A) — driven directly, no reveal engine.
3. **FP→target aggregate count-up**: each card rolls its FP 0→`fp`; a single running "Target to beat" total counts 0→the baked target, **snapping exactly to the baked target on the 5th card's `onRollComplete`** (recon C aggregate lift).

**Phase-1 invariant (load-bearing):** the aggregate count-up must land on the baked `target_score`, and `target_score === Σ (the five revealed cards' FP)` — the **boss-target seam preserved since the re-anchor** (`rollBoss` folded clamp re-rolls to a real lineup; target is always a real lineup sum, never a numeric clamp — see the re-anchor: target = Σ revealed five, 0 mismatches across the serveable 15). The snap-on-5th-card guard ENFORCES this (it locks the running total to the baked target at the last card, absorbing any RAF rounding). **The animation SHOWS the invariant; it does not derive, recompute, or diverge from the target.** If the 5 cards' FP ever fail to sum to `target_score`, that is an upstream bank/seam bug to fix at the generator — the reveal must not paper over it by animating to a different number than the cards sum to.

**Phase 1 explicitly does NOT:** change routing, touch the accept→deal flow, render/alter the share loop, or change Play Again. No new fetch (target + five are already on the GET). No DB/migration.

**Open surface specifics to lock AFTER doc-confirm, BEFORE coding** (John supplies): which state shows the reveal (first-time only vs both), first-time-vs-returning behavior, the once-per-boss flag (`rm_boss_reveal_seen_{id}`, set-once), and the `?reveal=force` DEV override.

---

## Consolidation Phase 2 — leaderboard + rank pin onto the landing (display)

Move the boss **leaderboard (board=boss) + your-rank pin bar** from `BossScreen` onto BossLandingView, rendered in **BOTH states** (first-time + returning), below the reveal/verdict. Still display-only (the `board=boss` read is an existing endpoint). Resolves the "leaderboard-in-both-states" amber. No behavior move.

---

## Consolidation Phase 3 — retire the hub (behavior + routing; HIGHEST risk)

Retire `BossScreen`. The boss-door in `GameView` (`showBoss`, `GameView.tsx:2579`) routes to the **URL** `/sport/challenge/{bossChallengeId}` (same entry as a shared link), landing on the now-complete consolidated BossLandingView. Delete the hub + its interim win-state.

**Phase 3 risk checklist (must each be preserved/verified — the 4 red orphans):**
- [ ] **accept→deal flow** intact: in-app boss-door entry still reaches `dealFreshRoster(exclude five)` → `acceptProceed` → `H2HRecipientPlay` with the degrade fallback + ref-token stamping (`App.tsx:673-705`).
- [ ] **share loop** intact: Challenge Someone / Copy Link (win-only) + their telemetry + the `/challenge/{bossId}` share-URL generation survive on the consolidated returning state (carry BossOutwardEnding, not the slim hub verdict).
- [ ] **`/challenge/{bossId}` external-link contract**: a COLD external shared link still lands on the boss flow; in-app boss-door and external link both resolve to the same page. Exit/`onClose` URL semantics defined.
- [ ] **Play Again re-deal**: re-deals a fresh five (excl. boss) via the accept branch / `replayBossFreshDraft` — not a replay-same-hand or dead-end nav.
- [ ] reconcile the two attempted-signals onto `getBossResult`; preserve marquee/tough_day framing; `skipReel`/ref-token/anon support carried.

---

## Build protocol

Per CLAUDE.md: **Doc → John confirms → surface specifics → build.** No code until John confirms this doc. Phase 1 is display-only basketball-hub-local + shared (BossLandingView is shared/) → hold-for-glass gate = vitest + basketball build; tri-sport at merge. Tests pin the gate/data wiring, not animation pixels (feel = glass).
