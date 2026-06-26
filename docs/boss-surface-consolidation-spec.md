# Boss Surface Consolidation — Spec (source of truth)

**Status:** Spec written 2026-06-26; **REVISED 2026-06-26 — core direction REVERSED toward the HUB (`BossScreen`). This supersedes the prior "toward BossLandingView" direction.** Pending John's confirm before the Phase-1 re-aim. Prod clean at `350ba77d` (rollback `c168f0fe`). A first Phase-1 build was made against BossLandingView (branch `feat/boss-target-reveal-p1`, held, unpushed) then superseded by this reversal — its `BossLineupReveal` component + recon-B adapter + count-up are reusable; only the **host surface moves to the hub**.

**Scope of this doc:** the **Boss Surface Consolidation** arc — DISTINCT from the **Boss Delivery Consumer** arc (`docs/cc-brief-boss-delivery-consumer.md`, which owns Phase 2/2.5/3/5 = delivery/comparison/belts/virality, mostly shipped). Always qualify "Consolidation Phase N" vs "Delivery Phase N". Numbers here are **Consolidation** phases.

---

## The core decision (locked — REVISED; reverses the prior direction)

**The reveal DISPLAY goes on the HUB (`BossScreen`)** — the front door the user lands on when they tap the boss (lineup + leaderboard + Target + TAKE THE BOSS). The user sees **ONE screen with the reveal on it.** `BossLandingView` (the `/challenge/{id}` interstitial) **remains the deal-flow / share / routing / Play-Again host reached via TAKE THE BOSS, but is NOT a user-facing destination screen.**

**Why (this reverses the prior "consolidate toward BossLandingView"):**
- **UX — the hub is the front door (John's call).** Tapping the boss lands on the hub; that is where the reveal belongs. Making the landing a separate destination splits the experience across two screens. The user should see one screen with the reveal; the landing must not be experienced as its own destination.
- **The hub resolves today's boss correctly; the direct route does not re-resolve.** The hub fetches today's instance fresh (`/api/leaderboard?board=boss` → `ensureDailyInstance` → today's, e.g. 145.2). The direct `/challenge/{id}` route serves whatever id is in the URL **verbatim** — `api/challenge/[id].ts` does `.select("*")` by id with **no "today" re-resolution**, so a stale link served an old `79.3` instance during Phase-1 glass (see Diagnostic below). Building on the hub sidesteps stale-id resolution entirely.

**Invariant (unchanged):** we move only DISPLAY onto the hub. **We never move behavior (deal / share / routing / Play-Again) onto the hub** — those stay on the landing as plumbing behind TAKE THE BOSS. The 4 red orphans below stay UNTOUCHED on the landing.

**Interim reality (updated):** the `BossScreen` returning-state shipped at `350ba77d` (win verdict + Play-Again CTA label) is now the **kept returning-state display on the front-door hub** — NOT slated for retirement (that prior framing is void). Phase 1 adds the first-time reveal alongside it on the same hub.

---

## Recon 14 findings this builds on (measure-only, done)

Reuse verdicts (card-level reveal mechanics) — **host-agnostic, so they carry to the hub unchanged:**
- **A — per-card blast/glow/shake = REUSE-AS-IS.** Plain props on `AthleteCard`→`PlayerCardShell` (`glowActive`/`glowTier`/`glowDurationMs`/`shakeType`/`cardShakeType`/`visibleFp`/`staticEndState`, `PlayerCardShell.tsx:283-299`). `h2hOverlayRenderer` (`basketball/src/views/GameView.tsx:152-165`) drives them **HOOK-FREE**. No reveal engine needed.
- **B — boss five as real cards = REUSE-WITH-EXTRACTION (front-only).** `revealedFive {basePlayerId,name,pos,salary,tier,fp}` → `AthleteCard` front needs `position`(=`pos`), `actualFp`/`projectedFp`(=`fp`), a synthetic `cardId`, `team`(=`boss_identity_id.split("-")[0]`). Adapter exists at `H2HRecipientReveal.tsx:180-190`; render `canFlip={false}` (no game-log fetch for the back).
- **C — FP→target aggregate count-up.** Per-card roll-up = REUSE-AS-IS (`CardFront.tsx:378-423` RAF, cubic-out, `fpCountUpMs` clamp 300–2200). Aggregate 0→target = lift ~15 lines, **snap to the baked target at the roll-window end**.

Orphan audit (what a naive merge DROPS) — the **4 red risks. They STAY on the landing; Phase 1 (and 2) do NOT move them:**
1. **accept→deal flow** — `dealFreshRoster(season, EXCLUDE the boss five)` → `acceptProceed` → `H2HRecipientPlay`, async w/ degrade fallback (`App.tsx:673-705`).
2. **BossOutwardEnding revisit + share loop** — Challenge Someone / Copy Link (win-only, `boss_outward_share`/`boss_outward_copy`, generates the `/challenge/{bossId}` share URL); Play Again.
3. **`/challenge/{bossId}` routing contract** — both the hub's TAKE THE BOSS target AND the external share-link target; must stay reachable cold.
4. **Play Again re-deal** — `BossOutwardEnding.onPlayAgain` + `App.onTryAgain → replayBossFreshDraft` (`App.tsx:248`).

Amber: marquee "brutal by design" / tough_day framing; two attempted-signals (`alreadyAttempted` server vs `getBossResult` local — pick `getBossResult`).

---

## Consolidation Phase 1 — display-only first-time reveal on the HUB (CONFIRMED, re-aimed)

**Surface:** the boss **first-time state on `BossScreen`** (the hub) — replace the current `LineupTile` mini-strip with the real-card reveal, wire the count-up to the hub's "Target:" line. Returning state keeps the shipped verdict. **Display-only. Touches NONE of the 4 red orphans.**

1. Render the boss five as **real `AthleteCard`s** (`canFlip={false}`, recon-B adapter) — replaces the hub's `LineupTile` strip.
2. **Per-card blast** via the hook-free props (recon A).
3. **FP→target count-up** wired to the hub's Target line: 0→the baked target, **snapping on the last card** (recon C).

The `BossLineupReveal` + adapter + count-up from `feat/boss-target-reveal-p1` are reusable as-is; only the **host moves to `BossScreen`**, which already resolves today's boss (145.2) and holds the lineup data. (Carry over the layout fix surfaced in glass: the scaled card wrapper needs explicit `height` + `position:absolute`, mirroring the H2H strip's inner wrapper — `STRIP_CARD_NATURAL_HEIGHT_PX`.)

**Phase-1 invariant (load-bearing):** the count-up must land on the baked `target_score`, and `target_score === Σ (the five revealed cards' FP)` — the **boss-target seam preserved since the re-anchor** (`rollBoss` folded clamp re-rolls to a real lineup; target is always a real lineup sum, never a numeric clamp — re-anchor verified 0 mismatches across the serveable 15). The snap-on-last-card guard ENFORCES this (locks the running total to the baked target, absorbing RAF rounding). **The animation SHOWS the invariant; it does not derive, recompute, or diverge from the target.** If the five ever fail to sum to `target_score`, that is an upstream bank/seam bug to fix at the generator — the reveal must not paper over it.

**Phase 1 does NOT:** change routing, touch the accept→deal flow, render/alter the share loop, or change Play Again. No new fetch (the hub already has target + five). No DB/migration.

**Locked surface specifics (from John, prior round):** reveal fires on **first VIEW of a boss only** (once-per-boss `rm_boss_reveal_seen_{id}`, set-once); returning players see static real cards + the kept verdict; `?reveal=force` DEV override. **Open item from glass:** `?reveal=force` is `import.meta.env.DEV`-gated and went **inert under `vercel dev`** (SPA likely served as a prod build, `DEV===false`). The hub re-aim must provide a glass hook that survives `vercel dev` (e.g. not DEV-gate the force read, or a dev-route).

---

## Consolidation Phase 2 — make the landing a non-destination (PROVISIONAL, own confirm)

The hub already owns leaderboard + rank + Target + CTA. The remaining consolidation is making `BossLandingView` **not experienced as a separate screen**: TAKE THE BOSS runs the accept→deal plumbing and lands the user in play, with the landing's now-redundant pre-play framing suppressed. **Behavior unchanged — only the landing's role as a visible destination is removed.** The 4-orphan risk checklist (below) applies here: each must survive the landing becoming non-destination. DETAILS TBD under the doc→confirm protocol.

**Risk checklist (the 4 red orphans — must each survive Phase 2):**
- [ ] **accept→deal flow** intact: TAKE THE BOSS still reaches `dealFreshRoster(exclude five)` → `acceptProceed` → `H2HRecipientPlay` + degrade fallback + ref-token (`App.tsx:673-705`).
- [ ] **share loop** intact: Challenge Someone / Copy Link (win-only) + telemetry + `/challenge/{bossId}` share-URL generation (still in the post-play `BossOutwardEnding`).
- [ ] **`/challenge/{bossId}` external-link contract**: a COLD external shared link still lands on the boss flow.
- [ ] **Play Again re-deal**: re-deals a fresh five (excl. boss), not a replay/dead-end.
- [ ] marquee/tough_day framing carried; attempted-signal reconciled onto `getBossResult`.

---

## Consolidation Phase 3 — one-screen social/post-play coherence (PROVISIONAL, TBD)

With the hub as the front door and the landing as plumbing, Phase 3 ensures the social/post-play surfaces (result + share loop + Play-Again + leaderboard) read as ONE coherent experience rather than scattered. **No hub retirement** (that was the old direction). Definition pending its own doc→confirm.

---

## Build protocol

Per CLAUDE.md: **Doc → John confirms → surface specifics → build.** Phase 1 now touches `BossScreen` (shared/ by location, basketball-hub-local — boss is basketball-only) + the card renderer; per the isolation finding, **basketball build is the sufficient hold-for-glass gate; tri-sport at merge.** Tests pin the gate/data wiring + the snap invariant, NOT animation pixels (feel = glass; layout needs real-browser verification per CLAUDE.md).

---

## Diagnostic (Phase-1 glass, BossLandingView route) — why `bd4dfb4e…` served 79.3

The direct route serves the row by id **verbatim**: `api/challenge/[id].ts` `.select("*")` + `target_score: Number(data.target_fp)`, **no today-resolution**. The daily boss UUID rotates per day (`instance_key = date|slot|identity`), so `bd4dfb4e…` is a **stale/older daily instance** (a prior day's id, target `79.3` — below every re-anchored target, so likely a pre-re-anchor instance), NOT today's boss. The hub always resolves today's fresh (`board=boss` → `ensureDailyInstance`). **Moot for the re-scope** (the hub resolves 145.2 correctly), but a **latent Phase-2/3 note:** when the boss-door / TAKE THE BOSS routes to `/challenge/{id}`, it must use the **hub-resolved today's id**, never a stale one — and there is no server-side "is this today's boss?" guard on the GET.
