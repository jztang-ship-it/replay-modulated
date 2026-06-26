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

**Locked surface specifics (from John, prior round):** reveal fires on **first VIEW of a boss only** (once-per-boss `rm_boss_reveal_seen_{id}`, set-once); returning players see static real cards + the kept verdict; `?reveal=force` DEV override. **Resolved from glass:** `?reveal=force` was `DEV`-gated + the mock route reached `/api` (which `vercel dev`/Vite proxies to the deployed preview → stale/404); the glass route is now **self-contained** — `BossHubMockRoute` injects a fixture via `BossScreen`'s `__devBoss`/`__devEntries` props (no `/api`), glassable under plain `npm run dev:basketball` at `/basketball/dev/boss-hub-mock?reveal=force`.

**Parked to polish (NOT iterated live) — see `docs/open-followups.md` (2026-06-26 boss-card cosmetics):** (1) the accent-strip trim must be a proper short/frameless card VARIANT (correct proportion), not a clip-crop of the full card (the clip squashed it; reverted to the natural `329/478` aspect). (2) the clean boss-reveal card format (drop the normal-game special-card shape/tier treatment) isn't achieved. Both need a non-fork CardFront variant. **Phase 1 mechanics are done and held (un-squashed real cards interim); the card visual is polish-stage.**

---

## Consolidation Phase 3 — converge boss onto the unified challenge surface (LOCKED 2026-06-26, recon-confirmed)

**This supersedes the prior provisional Phase 2 ("non-destination") + Phase 3 ("one-screen coherence") sections — they are folded into this one locked Phase 3.** Consolidation namespace — NOT Delivery Phase 3.

### Decision (recon-overturned)
`ChallengeLandingScreen` is a **3-branch shell** (`SelfMatchView` / `BossLandingView` / `ChallengeTakeCardLanding`) serving boss, friend, and self-match — all off the same `/challenge/{id}` route + cold-link contract. **Phase 3 does NOT retire the shell.**

**Core model: a boss challenge IS a friend challenge whose opponent is a boss. Both run on ONE framework.** Human-vs-human challenge UX is **TABLED** — build the framework to support it, but only boss is active now.

Phase 3 =
- **(A)** in-app boss **skips the redundant landing render** (hub routes through deal-flow direct);
- **(B)** boss **converges onto the unified take-card framework**, internally gated boss-vs-human; `BossLandingView` **retired as a render target** (its boss-only elements port + gate in);
- **(C)** **ONE trimmed card** for both surfaces (boss + friend), replacing plain chips AND `HandCard`.

Cold external `/challenge/{bossId}` links **STILL land on a rendered surface** (the unified take-card surface) — NOT retired. Only **IN-APP** traffic stops rendering a landing.

### Orphan ownership (recon-confirmed)
- **accept→deal flow:** App.onAccept boss branch + shell `handleAccept` ctx. **SURVIVES FREE.**
- **in-play share loop / in-play Play-Again:** App/reveal-bound. **SURVIVE FREE.**
- **cold-link `/challenge/{bossId}`:** shell-resolved; convergence only changes which component the shell renders for boss. **SURVIVES FREE.**
- **ONLY landing-render-bound piece:** `priorResult` → `BossOutwardEnding` revisit branch (`ChallengeLandingScreen.tsx:468-484`, carries landing share-loop entry + landing Play-Again). **MUST PORT** into the unified surface (boss-gated).

### Boss-vs-human gating (the merged surface branches internally)
- **name:** boss verbatim (bypass `isRealName`) | human `isRealName` downgrade
- **headline:** boss authored `share_headline` | human `pickHeadlineAndCta` trigger banks
- **card treatment:** boss has NO "held" concept | human held/discard
- **boss-only:** eyebrow ("Daily Boss · Tough Day") + marquee label ("Brutal by Design", gated)
- **revisit branch** (returning winner: share loop + Play Again) — **boss only**
- Downstream readers key on `ctx.senderKind` (Reveal `H2HRecipientReveal:396` / Play `H2HRecipientPlay:1083` / App `App.tsx:254/400/677`), **NOT surface identity** — merge does not change `ctx.senderKind`, so a correctly-gated merge cannot regress friend/self-match.

### Seams to preserve on the in-app hub-direct path (must not drop)
- **telemetry:** `challenge_link_open`, `challenge_accept`, `challenge_attempt_start`
- **`?ref` referral attribution** (`getRefToken` at `acceptProceed`) — load-bearing on cold links
- **`SKIP_LANDING_KEY` / `skipReel`** session side-effects (inherited via `acceptProceed` — confirm)
- **hub-direct path must route the HUB-RESOLVED TODAY id** (`bossEntry.bossChallengeId` from `useBossEntry`) — the GET `/challenge/[id]` has no today-guard, serves baked target verbatim — do NOT route a stale id

### (C) Trimmed card spec — the parked card, now greenlit
- Bespoke, **REUSES CardFront tokens** (`getTier` / TIER colors / headshot / FP). **NO CardFront fork, NO added props, NO refactor.** Precedent: `HandCard` already reuses CardFront tokens (incl. the H-badge glyph) without forking.
- Built at **CORRECT PROPORTION** (a real rectangle). NOT a clip-crop — the prior clip-crop SQUASHED the card and was reverted. Proportioned build is the fix.
- **Remove:** top notch / special-card shape; bottom empty color strip (under the black name strip).
- **Keep:** black name strip (name-left / FP-right).
- **Smaller** than the normal-game card.
- **Content:** headshot, tier-color background, name, FP.
- **ONE component** serves boss + friend (replaces plain chips AND `HandCard`).
- Built **LAST**. Glass-gated. NOT live-iterated in chat — adjust via glass only.

### DO-NOT-TOUCH (this phase)
`CardFront` (no fork/props/refactor). `SelfMatchView` + human take-card behavior (no regression). `ctx.senderKind` downstream branching. The 4 orphans' App/shell-bound parts. Boss-target invariant. Money seam. Canonical boss resolver.

### Build order + glass gates (each step holds for glass before the next)
1. **Routing convergence.** GLASS: in-app boss tap drops straight into the game (no mid-page); cold `/challenge/{bossId}` link still renders a framed surface.
2. **Surface merge** (boss gates into the unified framework; revisit branch ported; `BossLandingView` retired as render target). GLASS: boss cold-link shows name verbatim + authored headline + eyebrow/marquee + target line + NO held treatment; human challenge unchanged; self-match unchanged; returning winner shows share loop + Play Again.
3. **Trimmed card** on both surfaces. GLASS: proportioned (not squashed), no notch, no bottom strip, black name strip kept, headshot+FP+tier color, smaller; verified on boss AND human.

### Step-1 wiring seam (implementation, this build)
In-app, no full-page nav (satisfies "no mid-page"); reuses the data the hub ALREADY fetched (no second fetch / no veil flash):
- **shared `ChallengeLandingScreen`:** extract+export `buildChallengeCtx(data, { deserializeRoster, validateRosterSnapshot })` from `handleAccept`'s ctx-build. `handleAccept` calls it — cold path byte-identical (its `track()` calls stay inline).
- **shared `BossScreen`:** retain the raw GET row (ref) from its existing fetch; add `onTakeBoss?: (raw) => void` prop. CTA renders a `<button onClick={() => onTakeBoss(raw)}>` when `onTakeBoss` is provided, else the existing `<a href>` (cold/other-sports fallback).
- **shared `GameView`:** add `onTakeBoss?` prop; pass to `BossScreen`.
- **basketball `GameView` wrapper:** thread `onTakeBoss` from App to shared `GameView`.
- **basketball `App`:** extract the inline `ChallengeLandingScreen.onAccept` body into a named `handleChallengeAccept(ctx)` (cold path byte-identical); add an `onTakeBoss(raw)` handler that fires the 3 preserved `track()` events + `buildChallengeCtx(raw)` + `handleChallengeAccept(ctx)`; pass `onTakeBoss` to the GameView wrapper. The boss accept reuses the existing `senderKind==="boss"` branch (`dealFreshRoster` exclude five → `acceptProceed`) — no new deal logic.
- Today-id: `onTakeBoss` is fed `bossEntry.bossChallengeId`'s resolved row (the hub's own fetch), never a stale id. **No render of `BossLandingView`/take-card on the in-app path.** Cold link unchanged.

**Step-1 verification checklist (walk at completion):**
- [ ] in-app boss CTA invokes `onTakeBoss` (no `<a href>` nav) → deal-flow direct
- [ ] cold `/challenge/{bossId}` still renders `ChallengeLandingScreen` (BossLandingView this step; unchanged)
- [ ] telemetry on in-app path: `challenge_link_open` + `challenge_accept` + `challenge_attempt_start` all fire
- [ ] `?ref` capture preserved (acceptProceed `getRefToken`) on the in-app path
- [ ] `SKIP_LANDING_KEY` set on accept (inherited via acceptProceed)
- [ ] boss accept routes the hub-resolved TODAY id (not stale)
- [ ] human + self-match cold paths byte-identical (extraction is pure)
- [ ] `npm test` green; basketball build green

---

## Build protocol

Per CLAUDE.md: **Doc → John confirms → surface specifics → build.** Phase 1 now touches `BossScreen` (shared/ by location, basketball-hub-local — boss is basketball-only) + the card renderer; per the isolation finding, **basketball build is the sufficient hold-for-glass gate; tri-sport at merge.** Tests pin the gate/data wiring + the snap invariant, NOT animation pixels (feel = glass; layout needs real-browser verification per CLAUDE.md).

---

## Diagnostic (Phase-1 glass, BossLandingView route) — why `bd4dfb4e…` served 79.3

The direct route serves the row by id **verbatim**: `api/challenge/[id].ts` `.select("*")` + `target_score: Number(data.target_fp)`, **no today-resolution**. The daily boss UUID rotates per day (`instance_key = date|slot|identity`), so `bd4dfb4e…` is a **stale/older daily instance** (a prior day's id, target `79.3` — below every re-anchored target, so likely a pre-re-anchor instance), NOT today's boss. The hub always resolves today's fresh (`board=boss` → `ensureDailyInstance`). **Moot for the re-scope** (the hub resolves 145.2 correctly), but a **latent Phase-2/3 note:** when the boss-door / TAKE THE BOSS routes to `/challenge/{id}`, it must use the **hub-resolved today's id**, never a stale one — and there is no server-side "is this today's boss?" guard on the GET.
