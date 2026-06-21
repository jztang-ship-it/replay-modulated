# ReplayMod — Design Decisions & Session State

**Last updated:** 2026-06-21
**Status:** **5-card basketball + recalibrated win-tier balance shipped to `origin/main` at `f2f06f7` (2026-06-18; rollback `ebe20b2`)** — Slice A (UI + deal) and Slice B (threshold recalibration at 5 slots) merged together; watched prod deploy succeeded. Prior: #7 (results hero-slot flip) shipped to `origin/main` at `8d3d7d9` (fast-forward from `08b95c8`); challenge-redesign roadmap **RD0–RD5** sequenced for the investor build (objective + non-goals locked below; build sequence revised 2026-06-08 supersedes the 2026-05-23 sender/stamps sequence, which is deferred behind the investor build). Prior: stamps feature shipped 2026-05-22 (merge `ce9c277`); position-data fix shipped 2026-05-22 (`87742bb`).
**Purpose:** home-base document for the ReplayMod project. Every chat in this project should start with this in context. Update at the end of each session — *and during the session, whenever a decision is locked.*

---

## Pending doc update — session 2026-06-08

**H2H recipient play screen: dynamic per-draw commentary DISABLED for the investor demo.**

The two random picks on `shared/components/H2HRecipientPlay.tsx` — `selectRecipientIntro` (stage 1, no holds) and `selectRecipientDealNudge` (stage 2, after first hold) — are removed from this surface. Replaced with two static `Line`s:

- **Stage 1** (`hold_select`, 0 holds, `!introDismissed`): instructional directive — `"Tap the players you'd keep. Draw the rest."`
- **Stage 2** (`hold_select`, ≥1 hold): stable directive — `"Draw to beat <targetScore>."` (target formatted to match the landing's #3 number format).

Generator and banks are unchanged: `shared/commentary/chadChallenge.ts` and its bank exports are NOT touched. The `#4b` voice-engine repair remains out of scope for this change. The intent is **subtraction, not repair** — kill the dynamic call on the play surface; leave the generator intact so the engine work can resume later without re-litigating this decision.

The PartsLine ref/sig scaffolding stays (gives stable identity to PartsLine's reset effect); only the picked `line` value changes. `introTypography` / WebkitLineClamp triad, render sites, and `showStage1`/`showStage2` gating are not touched.

**Continuation — number-to-beat persistence in the redraw beat (same session, same lock):**

The H2H recipient redraw beat (`redraw_running` / `your_redraw_flip`): the top intro region — previously an empty layout spacer (`BUG-1 FIX`) — now renders the static number line `"<targetScore.toFixed(1)> to beat."` so the number-to-beat persists continuously through deal → hold → draw. Hero-region `"Drawing…"` copy is unchanged. `deriveHeadline` unchanged. Layout height budget (`INTRO_3LINE_BUDGET_CSS`) preserved — single line, well within the 3-line clamp. The `introTypography` wrapper is mandatory on the new line (it owns the WebkitLineClamp:3 + height budget that prevents the BUG-1 strip Y-shift regression).

**Lock:** `docs/h2h-recipient-static-commentary-lock.md` (narrow — H2HRecipientPlay.tsx only; refreshed in place with the redraw-beat continuation note).

---

## How to use this doc

This is the source of truth for:
- Locked vocabulary (use these words, not synonyms)
- Design decisions that have been made (don't re-litigate)
- Open design questions (work them through, then move them into "locked")
- Session-by-session state (what shipped, what's pending, what's deferred)

**A decision is not locked until it lives in this doc.** Discussing it in chat and saying "yes" is not enough; chat history does not load into Code's context. If we discuss-and-confirm something in conversation, the next step is updating this doc *before* implementation work begins.

When something gets decided, move it from "open" to "locked." When something ships, move it from "pending" to "shipped." Keep the doc evergreen.

---

## Locked vocabulary

Use these terms consistently. Don't substitute.

### Git / deployment

- **Edit** — change a file in working directory, nothing saved to git yet
- **Commit** — local snapshot in git history, not visible to anyone else
- **Push** / **shipped** — uploaded to origin remote, visible everywhere
- **Pushed to origin** = "live on production" only if the deployment pipeline picks it up; otherwise "shipped to origin, not yet deployed"
- **Applied** — file changed on disk, not necessarily committed
- **Local main** — main branch on the developer's laptop
- **Origin** / **remote** — the GitHub copy
- **Push held** — commits exist locally, deliberately not pushed yet (not the default; only when explicitly stated)
- **Worktree** — additional working directory on a different branch. Multiple exist under `.claude/worktrees/`. The achievements worktree is unrelated to main work. Stamps work runs in dedicated `feat-team-stamps` worktree.

### Game vocabulary

- **Stamps** — visual markers for *moments worth sharing*. Five variants, two contexts:
  - Team-level: `BAD BEAT`, `[TIER] MISS` — appear in win-tier panel as overlay on settled tier indicator, and inline in TOP-slot commentary (DEAL/DRAW token style)
  - Player-level: `CAREER HI`, `RECORD`, `SEASON HI` — appear on player cards (already in production)
- **MISS** (formerly `NEAR MISS`) — locked vocabulary change in the **challenge-trigger system only**. See "MISS rename scope" below for the strict file boundary. Stamp label is `[TIER] MISS` where TIER = `nearMissNextTier` (the tier the user fell short of promoting into). Reads as "you missed ALL STAR" → `ALL STAR MISS`.
- **Badges** — the 19 special bonus-inducing stat markers. Unchanged by recent work. NOT a synonym for stamps.
- **Tiers** — BUST, ROOKIE, STARTER, ALL STAR, MVP, LEGEND. Tier indicators have their own animation language; they are NOT stamps. When referenced inline, they use existing tier animation downsized (DEAL/DRAW pattern from FTUE).
- **Triggers** — the four conditions that fire a challenge surface: `bad_beat`, `miss` (formerly `near_miss`), `big_score` (ALL STAR+ wins), `rare_pull` (record/career/season). Plus `default` fallback. Rename `near_miss` → `miss` in challenge-trigger files only — see "MISS rename scope."
- **Slate** — NOT a synonym for the daily player pool. The player pool stays constant for a daily slate; "slate" should not be used in copy when describing a roster swap (it's misleading). In code/internal vocabulary, slate refers to the day's available player set.
- **Hand** — a single play of the game. The user gets a hand, plays it, hand resolves.

### Surfaces (full funnel)

Sender side:
- **S1** — Sender post-reveal screen (challenge-eligible state). Two slots: TOP (post-reveal commentary), BOTTOM (challenge prompt + CTA). See "S1 slot rules — LOCKED" below.
- **S2** — Name capture modal at "Challenge a Friend" tap. Built in WS3-A.
- **S3** — Share moment (what gets sent — share-sheet text body, clipboard payload).
- **S4** — Post-acceptance notification (sender sees their challenge was answered). NOT YET DESIGNED.

Recipient side:
- **R1** — Accept Challenge screen (landing page from share link).
- **R2** — Challenge play screen (first commentary teaches game).
- **R3** — Results page (win or lose, with retry timer).
- **R4** — First landing in normal game (post-challenge).
- **R5** — Persistent challenge floating icon (if lost, hangs over normal-game play).

---

## Recently shipped — 5-card basketball + recalibrated balance (2026-06-18)

- **5-card basketball — Slice A + B** (shipped 2026-06-18, merge commit `f2f06f7`; rollback `ebe20b2`) — basketball flipped 6→5 cards and win-tier thresholds recalibrated at 5 slots, merged together so prod never ran 5-card hands on 6-card tiers.
  - **Slice A (UI + deal):** `basketballConfig` maxPlayers/minPlayers/rosterSlots 6→5; roster grid 2-top/3-bottom via the `bb-dice5` `rosterGridLayout` scaffold mirror (`bball-23`); `H2HRecipientPlay` roster size now from `initialRoster.length` (not literal 6).
  - **Slice B (balance):** thresholds regenerated for all 29 seasons via `slateAwareThresholds.ts` (production-parity generator). RTP restored to target — **79.25% (5-card hands on stale 6-card tiers) → 89.02% (on new 5-card tiers)**; streak schedule holds; **cap held at $250** (reconciles on target; no scaling). Player salaries untouched.
  - **Premise correction:** the FP drop at 5 cards is only **~2–3 FP, not ~25–40** — the $250 cap binds and redistributes across 5 pricier cards (sim mean 185.4→183.4). The harshness was threshold-vs-distribution leverage (dense clustering at tier boundaries × high multipliers), not an FP collapse.
  - **Tier balance is good-enough, NOT final** — line placement is deliberately deferred until after build-phase mechanics land (they change the outcome distribution the tiers sit on). Do NOT re-tune tiers before then. BUST currently unreached (0% sim, 0/10 glass) — parked to that same pass, not a bug.

## Recently shipped — stamps + position fix + worktree registry (2026-05-22 → 2026-05-23)

- **Stamps feature** (shipped 2026-05-22, merge commit `ce9c277`) — team-level stamps in win-tier panel: BAD BEAT and [TIER] MISS render visually; `big_score` and `rare_pull` correctly suppress panel stamps. `near_miss` → `miss` rename throughout the trigger-evaluation system. Smoke-tested on 1718-season slate. Full record at `docs/smoke-tests/2026-05-22-stamps-smoke.md`.
- **Position-data fix** (shipped 2026-05-22, commit `87742bb`) — POS_MAP simplification rule flipped: C-F → C (was PF, 81 players incl. Embiid/KAT/Duncan), G-F → SF (was SG, 114 players incl. Carter/McGrady/Tatum). F-C → PF and F-G → SG unchanged. Residual errors captured as path-2 override-map followup.
- **Cross-worktree-scan ritual** (added 2026-05-22, commit `4c09b00`; superseded today 2026-05-23) — session-start ritual item 5 now points at `docs/worktree-registry.md` per today's housekeeping pass.

---

## Recently shipped — calibration overhaul (2026-05-21)

Landed *after* session 2's snapshot above. Full workstream record in `docs/calibration-overhaul-log.md`.

**Now in production:**

- Uniform log sampling — tier-windowed biased sampler removed
- Basketball deal is position-agnostic (`positionAware: false`); football and baseball retain positional logic
- Tier-aware resolve filter — RED/ORANGE/PURPLE cards include sub-10-min games; lower tiers keep the `min ≥ 10` floor
- Multiplier schedule rebalanced — LEGEND `50× → 20×`; streak schedule `1.3 / 1.7 / 2.5 → 1.2 / 1.5 / 2.0`
- Aggregate RTP measured at ~89.4% (inside the 88–95% slot-machine band)
- Per-sport `STREAK_TIERS` moved to `shared/utils/payoutLogic.ts`; basketball rebalanced, baseball/football preserved
- `winThresholds.json` recalibrated for all 29 seasons; current (2425) thresholds: ROOKIE 173 / STARTER 203 / ALL_STAR 233 / MVP 248 / LEGEND 277

**Methodology principles encoded** (see `CLAUDE.md`):

- Calibration derives from measured production distributions, never from re-derivation against a parallel implementation
- Sim-production parity via shared engines (FP, badges, career FP, daily bonus, log filter live in shared helpers both sides import)
- Verify-before-building — open files, quote code, don't trust prior-session summaries alone
- Positional requirements rule — a sport has positional roster slots iff its positions accumulate different stats
- Cross-sport `SportAdapter` framework remains the canonical extension point

---

## Design decisions — LOCKED

### Challenge redesign — objective & non-goals (investor build) — LOCKED

**Objective (the lens for every redesign ticket):** make the challenge **easier to
understand and easier to care about.** This is the single bar. It is *not* "improve H2H,"
"improve onboarding," or "improve the reveal." Every ticket answers one question:

> Does this make the challenge more **understandable**, or more **emotionally competitive**?

If a change does neither, it is **deferred past the investor build.** No exceptions inside
this roadmap.

**Litmus test (apply to every screen, current and future):** *Replay currently explains the
game before selling the challenge; 82-0 sells the challenge before explaining the game.*
("82-0" = 82-0.com, the viral product we're studying as the stickiness exemplar — we are not
82-0, but we copy what makes its hook land before the click.) A screen passes if a cold viewer
grasps the dare before they're taught the mechanics. This is the behavior to hunt across the
whole flow, not just the redesign tickets.

**Non-goals (settled — do not reopen for this build):**
- No new challenge mechanics.
- No one-tap reveal; the hold decision stays.
- No redesign of the decision system.
- No challenge-vs-fantasy identity debate.

**Ticket-namespace note (locked-vocabulary hazard):** the redesign tickets are labeled
**RD0–RD5** ("redesign"), *not* R0–R5. `R1–R5` are already locked **recipient-surface**
names (R1 = Accept Challenge, R2 = play, R3 = Results, R4 = first normal-game landing,
R5 = persistent icon). Each RD ticket below names the surface it targets explicitly to keep
the two namespaces from colliding — note the handover's old "R1=results / R5=landing"
shorthand actually inverts against the locked surfaces (results is **R3**, landing is **R1**).

### Challenge hierarchy — LOCKED

Every challenge surface prioritizes, in this order:

1. **Outcome** — did you win or lose
2. **Score** — the number to beat / the gap
3. **Rival** — who you're playing (the named friend)
4. **Decision** — what they held / drew
5. **Fantasy detail** — individual player stat lines

Reason: Replay drifts toward **fantasy-first** thinking by default (stat lines before stakes).
This hierarchy is the guardrail that keeps the challenge from getting buried under fantasy detail.

**Bad ordering (fantasy-first):** Curry 58 FP · Booker 42 FP · Held 2 stars · Lost by 11.
**Good ordering (challenge-first):** You lost · by 11 · to John · because he held Curry.

**Applied per surface — the hierarchy is gated by what exists yet:**
- **R1 (landing, pre-play):** no outcome exists, so the hierarchy *starts at Score.* Lead with
  the number-to-beat (rival fused in), decision as supporting detail. This is why the landing
  is a **direct score challenge, not an accusation** — accusation asks the recipient to judge
  the sender's *decision* (level 4) before they have any context. See **RD5**.
- **R3 (results, post-play):** outcome exists, so it leads — "good ordering" above is the R3
  spec verbatim. See **RD1**.

Same hierarchy, different top rung depending on whether the hand has been played.

### Voice register

- Norman Chad + 25% spicier
- Two-clause, opinionated, hedge-free
- No personal life material (spouses, family, criminal records unless league penalty, substance, mental health)
- Trademark via nominative fair use; prefer city framings
- Tier-gated culture lookup (RED always, ORANGE conditionally, lower tiers no)
- Spec is the bar — don't judge against "less bad than X"
- MVP stage: voice register matters; individual line perfection does not. Don't micro-litigate borderline calls.

### Challenge system

- Four triggers cover challenge-eligible states: `bad_beat`, `miss`, `big_score` (ALL_STAR+), `rare_pull`
- `bad_beat` requires 2+ RED/ORANGE held cards
- First-share invitation fires on the user's 3rd hand (handCount >= 3) given prior engagement; one-shot per identity
- Name capture fires at "Challenge a Friend" tap (not before). Cancel = anonymous fallback, never blocks send.
- Returning user with stored real name: confirm modal "That's you, right?" with [That's me] / [Edit]. Enter fires [That's me].

### MISS trigger mechanic — LOCKED

- **Window mechanic (target state):** percentage of *tier band* (the FP gap between current tier floor and next tier floor). NOT fixed FP. NOT percentage of next-tier threshold.
- **Current implementation:** fixed 5 FP (`NEAR_MISS_WINDOW = 5` → `MISS_WINDOW = 5` after rename). Stays at 5 fixed FP for this stamps build. Mechanic change to tier-band % is queued behind firing-rate analysis.
- **Specific tier-band percentage:** TBD pending firing-rate analysis. Claude Code task: run analysis on recent hand outcomes for candidate thresholds (3%, 5%, 7%, 10%) and report firing rate by tier promotion. After data is in, lock the number here.
- **Tiers eligible (target state):** all tier promotions — ROOKIE→STARTER, STARTER→ALL STAR, ALL STAR→MVP, MVP→LEGEND. Locked: "any chance we can get a challenge initiated."
- **Current implementation reality:** trigger fires only when `current tier ≥ STARTER`. Today's behavior produces `ALL STAR MISS`, `MVP MISS`, `LEGEND MISS`. Does NOT produce `STARTER MISS` (would require firing for ROOKIE band). **This is a doc/code contradiction** — flagged in "Open design questions → MISS firing-condition reconciliation."
- **Tier prefix interpretation — LOCKED:** TIER = `nearMissNextTier` (the tier the user fell short of promoting into). Reading: "ALL STAR MISS" = "you missed ALL STAR." Matches existing UX language ("You missed ALL-STAR by X FP"). The trigger result already carries `nearMissNextTier` — no math change required.
- **BUST suppression:** despite "all tier promotions eligible" target state, when the *outcome itself* is BUST, MISS does NOT fire. A BUST is not shareable just because the user almost cleared ROOKIE. This rule wins on contradiction with "all promotions fire MISS."

### MISS rename scope — LOCKED (strict file boundary)

The codebase contains TWO distinct systems using `near_miss`. They mean different things. The rename targets the FIRST only.

**IN SCOPE — challenge-trigger system (rename `near_miss` → `miss`):**

| File | Change |
|---|---|
| `shared/utils/triggerEvaluation.ts` | `TriggerResult.trigger` union: `"near_miss"` → `"miss"`. `NEAR_MISS_WINDOW` → `MISS_WINDOW`. Comments. **Keep field names `nearMissGap` / `nearMissNextTier`** (DB column constraint — see below). |
| `shared/utils/__tests__/triggerEvaluation.test.ts` | Update `"near_miss"` literal expectations. |
| `shared/components/TeamStamp.tsx` | Type union, label dict, class dict, render guard. Add `missTier` prop for tier-prefix. |
| `shared/components/__tests__/TeamStamp.test.tsx` | Rewrite for new vocabulary + tier-prefix + graceful degradation. |
| `shared/components/ChallengeSharePrompt.tsx:147-150` | `TRIGGER_LABEL`: `near_miss` key → `miss`, value `"😤 NEAR MISS"` → tier-prefixed `"😤 [TIER] MISS"`. Comment on line 185 also updated. |
| `shared/commentary/chadChallenge.ts:933` | Bank dispatch: `trigger === "near_miss"` → `trigger === "miss"`. |
| `shared/views/GameView.tsx:2338-2339` | Stamp-kind dispatch: `"near_miss"` → `"miss"`. |

**OUT OF SCOPE — commentary-archetype system and gauge-visual system (leave alone):**

These use `near_miss` for unrelated concepts (a commentary story archetype meaning "user lost the hand by a small margin"; a gauge-visual proximity threshold). Renaming these would create churn for zero benefit and risks regressions in unrelated systems.

- `shared/commentary/classifyArchetype.ts` — archetype `"near_miss"`, field `nearMiss: boolean`
- `shared/commentary/archetypes.ts`, `priorities.ts` — archetype/story IDs
- `shared/commentary/types.ts:107-108, 246, 264, 292` — story IDs `near_miss_win`, `near_miss_loss`, `painful_near_miss`, archetype `"near_miss"`, field `nearMiss`
- `shared/commentary/templateResolver.ts`, `storySelector.ts`, `selectCommentary.ts` — story handlers
- `shared/components/PostHandSheet.tsx` — `nearMissGap` / `nearMissNextTier` props sourced from `gaugeSnap` (TierGauge state), NOT from `TriggerResult`
- `shared/components/TierGauge.tsx` — `NEAR_MISS_PTS = 8` (gauge-visual concept, distinct threshold from trigger's 5)
- `shared/components/GameBar.tsx` — `nearMissPulse` keyframe (gauge-bar visual)
- `shared/components/PostGameScreen.tsx` — `NEAR_MISS_COPY`
- `shared/components/CoachLayer.tsx`, `baseball/src/views/GameView.tsx:144`, `football/src/adapters/ftueRoster.ts:49` — `nearMissText` (FTUE coach text)
- `shared/utils/soundManager.ts:674` — sound effect comment

**Verification implication:** the "no remaining `near_miss` references" check applies ONLY to challenge-trigger files listed above. Commentary-archetype and gauge-visual `near_miss` references must be retained.

### DB column constraint — LOCKED

`shared/hooks/useChallengeShare.ts:67` writes `result.nearMissGap` to DB column `near_miss_gap`. The TypeScript field names (`nearMissGap`, `nearMissNextTier`) on `TriggerResult` are retained as part of this rename to avoid a DB migration. Migration of the DB column itself is deferred indefinitely; surface as a future tech-debt cleanup if/when other migrations are batched.

Cosmetically the field name will look like a leftover after the trigger value rename. This is intentional and documented here so it doesn't get "cleaned up" in a future session.

### Stamps system — LOCKED (build in progress)

**Two contexts, one visual family.**

**Stamps panel location — CORRECTED:** the win-tier panel is NOT in `@shared/components/WinCelebration.tsx` (that file is a dormant full-screen modal; flagged for separate-session cleanup). The actual panel is **inline in `shared/views/GameView.tsx` lines ~2300-2400**, per the Phase 2 cutover described in `CLAUDE.md`. `GameView.tsx` IS the canonical shared component; sport wrappers pass a `GameAdapter`. The "sport-agnostic prop interface" requirement is automatically satisfied because `challengeTrigger` is computed inside shared `GameView` via `evaluateTrigger()` — no changes needed to sport wrappers.

**Team-level stamps in win-tier panel:**
- Stamps: `BAD BEAT`, `[TIER] MISS` (tier prefix = `nearMissNextTier`)
- Slanted angle, matching existing player-card stamp treatment (`TopGameOverlay.tsx` TopGameStamp `.tg-stamp` class as reference)
- "Thud" landing animation, lands on top of the settled tier indicator (after the tier animation completes its big→small settle motion in `tierResultPhase` state)
- Stamp keyframes `tsTeamStampThud` 480ms match player-card stamp timing
- Larger than player-card stamp (13px font vs 10px) — appropriate for the panel
- Omits the halo pulse (player-card stamps have it for record/career/season; team stamps do not)
- Does NOT create a new layout zone. Does NOT displace the team FP/%/coins row.
- Panel layout is the existing two-row structure: Row 1 = tier indicator, Row 2 = team FP/%/coins. Stamps overlay Row 1 after settle.

**Inline commentary stamps (TOP slot of S1) — SEPARATE BUILD:**
- NOT slanted — flat, DEAL/DRAW token style from FTUE
- Color/format inherited from source surface
- Render inline within TOP-slot post-reveal commentary text when challenge-eligible
- Example pattern: "Hell of a hand — [ALL STAR MISS] — that's the kind that stings" with the bracketed stamp rendered as a DEAL/DRAW token visual
- This part is queued for a separate build after stamps panel ships. Not part of current build.

**When stamps appear:**
- Panel: ONLY for `bad_beat` and `miss` triggers
- Inline commentary (separate build): ONLY when a challenge surface is firing
- No stamps on regular STARTER wins, ROOKIE wins, or non-trigger BUSTs
- Stamps mark *shareable moments*, not every outcome

**Tier exception (no team-level stamp for these in panel):**
- ALL STAR / MVP / LEGEND wins do NOT get a team-level stamp overlay in the panel — the tier animation alone carries them
- (Caveat: ALL STAR / MVP / LEGEND wins may still receive a `MISS` stamp if the user *missed* the tier above. That's a different trigger condition. The "no stamp" rule applies to the *win* itself, not to a miss against the next tier up.)

**Attention-grab:**
- The thud-landing animation IS the attention-grab for panel stamps
- No additional background-glow / shake / pulse needed

### S1 slot rules — LOCKED (refined session 2)

The post-reveal screen has two slots when challenge-eligible. Each owns a specific job. **Today's code violates this — see "WS2 regression" below. Restoration queued behind stamps panel build.**

**TOP slot — subject = user's hand and the trigger event that made it shareable.**
- Celebrates the hand outcome
- When challenge-eligible, surfaces the trigger via inline stamp (DEAL/DRAW token style)
- Names what made it challenge-worthy ("Hell of a beat there — [BAD BEAT]") but never references the friend or the send action
- Never says "challenge a friend"
- Non-challenge hand resolutions: TOP slot still celebrates the hand, just without the trigger reference / inline stamp

**BOTTOM slot — subject = the friend and the send action.**
- Actively, persuasively nudges the user to challenge a friend
- Never recaps the hand outcome (TOP slot did that)
- Never recaps the trigger event (the inline stamp on TOP did that)
- Pure push to send

**Why the split matters:** if both slots talk about the hand, the screen reads as celebration with no call to action. If both slots push to send, the screen reads as nag with no recognition of what just happened. The split makes TOP earn the moment and BOTTOM cash it in.

### WS2 regression — LOCKED FINDING (session 2)

Commit `5f4ae5e` ("post-reveal trigger override delegates to selectChallengeInitiation") was correct as a *routing change* (made TOP slot trigger-aware) but wrong as a *slot-content change* (replaced TOP slot's previous source with `selectChallengeInitiation`, which is a push-bank). Result: both TOP and BOTTOM slots now pull push-to-send copy. The S1 slot split is collapsed.

The previous TOP-slot source was a function called `chadTriggerFraming` (removed by `5f4ae5e`). Restoration work needs to:
1. Identify what `chadTriggerFraming` was doing before WS2 — was it hand-celebration content, or was it also pushing? (`git show 5f4ae5e^:<path>` to recover.)
2. Restore (or create new) hand-celebration source for TOP slot
3. Then draft the bank rewrite with stamp tokens woven in

This is **reversion + rewrite**, not a pure additive copy task. The slot-split restoration is code; the bank rewrite is copy.

### Bucket 2 (S1 slot-split restoration) — LOCKED (open questions resolved 2026-05-23; bank-shape refinements 2026-05-24)

Four open questions from session 2 were resolved in a chat-Claude session today. Locking them here as authoritative before the implementation session.

- **Q1 — TOP-slot bank shape:** locked. `type StampToken = { stamp: "bad_beat" | "miss" | "big_score" | "rare_pull"; tier?: WinTier }; type LinePart = string | StampToken; type Line = LinePart[]`. Five sub-banks: `TOP_BAD_BEAT`, `TOP_MISS`, `TOP_BIG_SCORE`, `TOP_RARE_PULL`, `TOP_DEFAULT`. ~10 lines per sub-bank. Selector `selectTopSlotFraming(args)` parallels `selectChallengeInitiation`. Anti-repeat: reuse `pickWithAntiRepeat`.
- **Q2 — First-share preempt:** locked as fold-in. First-share invitation routes to BOTTOM slot only; TOP retains trigger-aware celebration on that hand. The L1326-1332 first-share preempt in `shared/views/GameView.tsx` changes to write BOTTOM, not the whole reveal copy.
- **Q3 — DEAL/DRAW token rendering:** locked as option B (pre-segment at bank level). `postRevealCopy.primary` grows from string to parts array matching the FTUE override pattern at `TierGauge.tsx` L714-768. New render branch under L769 walks parts: strings go through Typewriter, stamp tokens render as inline DEAL/DRAW-style styled blocks. Typewriter itself unchanged.
- **Q4 — Copy-drafting venue:** locked as split. Code work (pieces A, C, D, E, F in the `open-followups.md` bucket-2 section) happens in the Code session. Copy drafting (piece B — ~50 lines across 5 sub-banks) happens in a separate chat session.

#### Refinements locked 2026-05-24 (real-copy session)

Surfaced during piece B real-copy drafting. Each grows scope of the bank shape beyond the 2026-05-23 Q1 lock; resolutions below supersede Q1 where stated.

- **Q1.1 — TOP_BAD_BEAT split:** locked. TOP_BAD_BEAT splits into `TOP_BAD_BEAT_HELD` (user held ≥1 card on the hand) and `TOP_BAD_BEAT_NO_HOLDS` (user held nothing; anchor still cratered). Emotional texture differs sharply — held-card disappointment ("you backed the right horse") vs. no-hold anchor-failure ("the call was right, the call called in sick"). Selector inspects `roster.some(c => c.wasHeld === true)` to route. Net sub-bank count grows from 5 to 6.
- **Q1.2 — TOP_RARE_PULL split:** locked. TOP_RARE_PULL splits into `TOP_RARE_PULL_RECORD`, `TOP_RARE_PULL_CAREER`, `TOP_RARE_PULL_SEASON`. Routed via `starAchievementType` (= `challengeTrigger.topGameTier`, value `"record" | "career" | "season"`). Texture differs by tier: record = all-time league framing ("the league will be talking about for decades"); career = personal-arc framing ("best game of his entire career"); season = league-comparative single-stat framing ("one of the best {statLabel} performances of the season"). Net sub-bank count after Q1.1+Q1.2: 8 (HELD, NO_HOLDS, MISS, BIG_SCORE, RARE_PULL_RECORD, RARE_PULL_CAREER, RARE_PULL_SEASON, DEFAULT).
- **Q1.3 — TOP_DEFAULT unreachable (finding, not structural change):** confirmed. `GameView.tsx` trigger-override gate (`challengeTrigger.trigger !== "default"`) filters default-trigger hands out before the TOP-slot framing call. TOP_DEFAULT is never selected at runtime. Bank retained for shape consistency with the type union; placeholder copy from `4bd0c89` stays in place — real copy not drafted. Reachable-by-construction comment lives at the bank def in `chadChallenge.ts`. Future routing change that sends default-trigger hands to the TOP slot would require drafting real copy here.
- **Q3.1 — `{statLabel}` substitution for RARE_PULL_SEASON:** locked. Season-tier lines reference the stat that drove the rare_pull (e.g. *"best `{statLabel}` performances of the season"* with `{statLabel}` ∈ `"scoring" | "rebounding" | "passing" | ...`). Implementation:
  - `evaluateTrigger` rare_pull branch propagates `TopGameReason` data through `TriggerResult` as two fields: `topGamePrimaryReason: TopGameReason | null` and `topGameAllReasons: TopGameReason[] | null` (mirrors upstream `topGame.primaryReason` / `topGame.allReasons` shape).
  - `selectTopSlotFraming` receives a combined `topGame: { primaryReason: TopGameReason | null; allReasons: TopGameReason[] | null } | null` arg (mirrors `TopGameResult` exactly; caller passes `triggerResult` fields wrapped). Selector extracts `statLabel` by walking `allReasons` and **preferring stat-typed reasons** (where `rank` is defined) over composite/flag reasons. Reason: `detectTopGame` returns the first reason as primary, which for high-scoring games is often a composite like `fifty_plus_game` — the stat-typed sibling (`pts`) maps to a cleaner label.
  - `STAT_LABEL_MAP` lives in `chadChallenge.ts` (next to the bank). Keys are the authoritative category values from `basketball/public/data/topGames.json` + careerCategories + NBA_SINGLE_GAME_RECORDS:
    - **Stat-typed:** `pts→"scoring"`, `reb→"rebounding"`, `ast→"passing"`, `stl→"steals"`, `blk→"blocks"`, `threes→"3-point shooting"`, `turnovers→"turnovers"` (turnovers reads ironically; left intentional pending feature-polish review).
    - **Composite fallbacks** (used only when no stat-typed reason exists in allReasons): `fifty_plus_game→"scoring"`, `five_by_five→"all-around"`, `td_30_20_20→"triple-double"`, `td_60_10_10→"scoring"`.
  - `{statLabel}` is a bare token (no leading article/preposition); bank lines provide surrounding grammar. Same substitution discipline as `{starName}` elsewhere.
  - Fallback when `statLabel` is null (`allReasons` empty or all categories unmapped): log warn, route to `TOP_RARE_PULL_RECORD` bank (closest texturally), surface as smoke-test anomaly. Do not silently skip or use placeholder copy.
- **Q4 (tier substitution model refinement):** the 2026-05-23 code session landed pure model-(b) for tier substitution (renderer reads tier from props; bank lines carry no tier values). Real-copy bank lines for `TOP_MISS` write `{ stamp: "miss", tier: "{missTier}" }` — a literal sentinel that mirrors the `{starName}` / `{statLabel}` substitution discipline. **Hybrid model now locked:** `StampToken.tier` widens to `WinTier | string` to permit the sentinel. Selector substitutes `"{missTier}"` with the actual `missTier` value at selection time (model-(a) for these lines). Renderer's existing escape hatch — `token.tier` overrides `missTier` prop — handles substituted values. When `token.tier` is absent (unset, or post-strip), renderer falls back to the `missTier` prop (model-(b) preserved). Doc note at the `StampToken` type def updates to: *"Selector substitutes tier when bank line specifies a sentinel; renderer falls back to context lookup when token.tier is absent."*

#### Selector signature after refinements

`selectTopSlotFraming` takes:
- `trigger: "bad_beat" | "miss" | "big_score" | "rare_pull" | "default"` — bank-family selector
- `roster: Array<{ tier?: string; wasHeld?: boolean }>` — for Q1.1 HELD/NO_HOLDS routing
- `starAchievementType: "record" | "career" | "season" | null` — for Q1.2 RARE_PULL routing
- `starName: string | null` — `{starName}` substitution into bank lines
- `missTier: string | null` — sentinel substitution for `{ tier: "{missTier}" }` in MISS bank
- `topGame: { primaryReason: TopGameReason | null; allReasons: TopGameReason[] | null } | null` — for `{statLabel}` extraction in SEASON bank (selector internally walks `allReasons` preferring stat-typed)

### Win-tier panel multiplier legibility — LOCKED (folds with stamps build)

- Currently the multiplier chain is buried in the +$X line
- Render the multiplier chain prominently inside the existing coins row (Row 2 of the panel): `[tier_mult]× → coins` (no streak) or `[tier_mult]× × [streak_mult]× → coins` (streak active)
- Today: exactly 2 factors possible (tier × streak). Data shape should accept a future 3rd factor cleanly; do not implement speculative N-factor logic.
- Coins total is the largest type on the line; chain is the justification, not the headline
- No row added, no spacing changed — render change only
- **ROOKIE behavior — LOCKED:** show multiplier chain on all wins (ROOKIE through LEGEND). ROOKIE wins have a real multiplier and showing it is consistent. Suppress on BUST (BUST is a loss; no positive multiplier to chain). The BUST exception in the pre-existing GameView edit is correct.

### Recipient experience funnel

Four touchpoints, each with one job:

**R1 (Accept Challenge):** trash-talk + minimal product framing. Recipient learns this is a [sport] fantasy game with real players. They leave with curiosity + competitive itch.

**R2 (First commentary on landing into challenge play):** teaches the rules without breaking trash-talk register. "Edgar built this and put up X. Pick who to hold, swap the rest. Beat his score." Rule injection woven into trash-talk, not a tooltip.

**R3 (Results page):** trash-talk the outcome + ensure there's a next move. No dead-ends. Loss = egg-on framing ("challenge him back, get even"). Win = victory lap with implicit next move. Don't repeat the FP gap that's already on screen.

**R4 (First landing in normal game):** lightweight context that the challenge is over, this is the daily game, learn-by-doing starts here. Standard FTUE does NOT apply.

### Persistent challenge UI (R5)

- Triggered when: user loses a challenge AND enters normal game
- Small floating icon, unobtrusive
- Expands to current retry-sheet content (the modal already shown post-loss)
- Self-evicts when challenge timer expires

### Counter semantics (closure-bug fix shipped)

- `handCount` represents "this hand's number, 1-indexed, FTUE-excluded"
- Increments at hand-resolution (start of WIN_CELEBRATION lifecycle), not after celebration ends
- 15 readers across the codebase; all see post-increment value on hand N
- Side effect of fix: Chad nudges (>= 3, >= 5, >= 12, >= 15 thresholds) and other "after N hands" gates fire one hand earlier than before for users sitting just below thresholds. This is a one-time invisible UX shift on returning users — not a bug, the new semantic is more correct.
- Shipped in commit `61ea208`.

### Process rules — LOCKED (expanded session 2)

Process rules now live in `/Users/john/Desktop/ReplayMod/CLAUDE.md` at the repo root, auto-loaded by Claude Code on session start. See that file for the full set. Summary of the session-2 additions:

1. Decisions land in the doc before code, not after
2. Every Code build prompt ends with a verification checklist drawn from this doc's LOCKED sections
3. Every session starts with `git log origin/main..main` and `git status`
4. Every session ends with a deliberate doc diff
5. Confirm `pwd` and `git branch --show-current` at the start of every Claude Code session
6. Process rules belong in CLAUDE.md; design state belongs in this doc
7. (Added session 2, post-investigation) If investigation reveals the build prompt's architectural assumptions are wrong (e.g., wrong file path, wrong component location), STOP and surface — do not silently work around. This rule comes from the WinCelebration.tsx mismap finding.
8. (Added 2026-05-23) Worktree state lives in `docs/worktree-registry.md`. See CLAUDE.md ritual item 5.

---

## Doc structure

- **`/Users/john/Desktop/ReplayMod/CLAUDE.md`** — process rules only. Loaded automatically by Claude Code on session start. Vocabulary cheat sheet, session rituals, scope rules, verification approach. Stable across features.
- **`/Users/john/Desktop/ReplayMod/docs/replaymod-design-decisions.md`** — feature design + state. This document. Updated mid-session whenever a decision is locked; consolidated at session end. Passed explicitly into each Code session.
- **`/Users/john/Desktop/ReplayMod/docs/jargon-cheat-sheet.md`** — git/dev vocabulary reference for the human collaborator. Not for Code.

---

## Open design questions (next sessions)

### MISS firing-condition reconciliation (raised session 2, post-investigation)

- The doc says all tier promotions are eligible for MISS (ROOKIE→STARTER, STARTER→ALL STAR, ALL STAR→MVP, MVP→LEGEND)
- The current code (`triggerEvaluation.ts`) fires `miss` only when `current tier ≥ STARTER` — meaning ROOKIE→STARTER and BUST→ROOKIE near-misses do NOT fire today
- This produces only 3 of 4 listed labels under current code: `ALL STAR MISS`, `MVP MISS`, `LEGEND MISS`. `STARTER MISS` would require firing for ROOKIE-band users; would never produce `LEGEND MISS` for a hypothetical tier above LEGEND
- Resolve: change firing conditions to match doc, or revise doc to match current code?
- Out of scope for current stamps build (no firing-condition changes this build); resolution queued

### MISS firing-rate analysis (blocks MISS % lock)

- Run analysis on recent hand outcomes
- For candidate thresholds (3%, 5%, 7%, 10% of tier band): report what fraction of hands would have fired MISS, broken down by tier promotion
- Then lock the number in "MISS trigger mechanic" above
- Mechanic-change from fixed 5 FP to tier-band percentage is queued behind this analysis

### ROOKIE MISS / BUST contradiction (raised session 2)

- "All promotions fire MISS" target state vs "BUST suppression" rule overlap on the BUST→ROOKIE case
- Default: BUST suppression wins, no `ROOKIE MISS` stamp fires when outcome is BUST
- Confirm or adjust in firing-condition-reconciliation session

### S1 bank rewrite (queued after stamps panel build + slot-split restoration)

- TOP slot bank: hand-celebration copy with stamp-token placeholders for challenge-eligible cases
- BOTTOM slot bank: pure push-to-send, friend as subject, no recap
- 4 trigger variants per slot × ~10 lines per variant (revisit density if drafts feel sparse)
- Same voice register as existing chadShareTrashTalk and firstShareInvitation banks

### S3 share moment

- What does the share-sheet text body / clipboard payload actually say?
- Currently uses chadShareTrashTalk bank output
- Needs audit: is the share text appropriate for the *audience that will receive it* (not the sender who just played)?

### S4 sender post-acceptance notification

- Not designed at all
- When the recipient accepts and plays, sender should be notified somehow
- Question: in-app surface only, or push notifications? Closure of the loop has UX implications

### R1-R5 recipient experience design

- **Now being executed** via the challenge-redesign roadmap (RD0–RD5) — see "Build sequence —
  revised 2026-06-08." The investor build sequences the high-priority surfaces: **R3** results
  (RD1), **R1** landing (RD5), **R2** play/reveal (RD2/RD3), onboarding (RD4). The engine
  prerequisite (RD0, points→FP) is not a surface but gates RD1/RD5.
- Still open beyond the investor build: **R4** transition copy and **R5** persistence are not
  in the RD sequence; design when the investor build lands.

### Win path

- We never designed what happens when the recipient WINS the challenge they were sent
- Loss path has retry timer + floating icon
- Win path needs: victory framing, optional challenge-back, sender notification (S4)

---

## Build sequence — revised 2026-06-08 (challenge redesign, investor build)

Active investor-build sequence. Order is by dependency + lock-risk, **locked**. Each ticket:
own worktree off the latest landed `main`; **doc-before-code**; own narrow lock; any shared
touch → `scripts/build-vercel.sh` **+ full root `npm test`** (never scoped); CSS-transform /
animation → real-browser bbox **+ glass mandatory**; **push held per item**; content verified
by `grep`, not filename. Guardrail per ticket = the objective question above.

**RD0 — Generator-level points→FP fix** *(must land first — dependency for RD1 + RD5)*.
Root cause is one voice-path guardrail gap: `voiceContract.ts` enforces FP-vs-points for FP
*totals*, but the generator still emits "points" for turnover / other counts ("8 turnovers,"
"11 points," "34 points" originate here). Fix at the generator, not per-surface, or we chase
ghosts across consumers. Fold in the "8 turnovers" team-vs-player attribution ambiguity.
Surface: engine — `shared/commentary/` (`voiceContract.ts` + generator `chadChallenge.ts` /
`selectCommentary.ts` / `templateResolver.ts` + facts/salience). Guardrail: understandability.
Heaviest test surface of any ticket — expect the most test rewrite here.

**RD1 — Rivalry results** *(highest ROI; demo centerpiece)*. `YOU LOST TO JOHN` huge +
centered, `-20.1 FP` as the hero number, supporting line small, rivalry CTA. Absorbs the
queued results items (centered red headline + white subline, points→FP sourced correct from
RD0, delete redundant lines). Surface: **R3** (Results page) — `H2HResultsOverlay.tsx` only,
no locked geometry. Guardrail: emotional competitiveness. Ordering follows the challenge
hierarchy R3 application (You lost · by 11 · to John · because he held Curry). **Spec against
the post-#7 file** (now on `main @ 8d3d7d9`).

**RD5 — Landing copy** *(after RD1 for one consistent voice; isolated surface)*. **Direct
score challenge, not accusation or narrative.** Lead with the number to beat; decision as a
supporting line; the dare last:

```
JOHN SCORED 184.9 FP
Held: Curry  LaVine
Can you beat him?
```

The user's brain wants only three things here — *what happened, why care, can I beat it* — and
the answer to all three is the score, not an evaluation of John's decision quality (that's
level 4 of the hierarchy and they have no context for it pre-play). Keep it brutally direct;
do not drift narrative/clever ("CURRY LET HIM DOWN" is out). Delete the top "Same starting
hand…" line and "HELD THE STARS. BARELY SURVIVED." **Structure untouched per strategy doc —
copy only.** Surface: **R1** (Accept Challenge) — `ChallengeLandingScreen.tsx` /
recipient-intro path. Guardrail: emotional competitiveness, via clarity (see Challenge
hierarchy → R1 application).

**GATE-A — Comprehension test** *(after RD1 + RD5 land, before RD2/RD3/RD4)*. The roadmap rests
on one **unproven assumption: that understanding the challenge better makes recipients care more.**
Most likely true, but the open risk is whether the challenge creates curiosity *before* play —
i.e. does `JOHN SCORED 184.9 FP / Can you beat him?` make a cold recipient want to click, or do
they only care once they're playing? Test it the moment the two top-of-funnel surfaces (R1
landing, R3 results) are live. Protocol — show ~10 sports fans the challenge cold and **watch**;
ask only: (1) what happened? (2) what do you think happens if you click? (3) would you click?
Do **not** ask whether they like it; do **not** explain the game. Treat answers 1–2 as the real
signal (comprehension); answer 3 spoken aloud carries yes-bias, so weight observed lean-in over
the verbal yes. **This is a go/no-go, not feedback:** if the challenge doesn't communicate on its
own, the problem is the hook, not the reveal — pause/reorder RD2/RD3/RD4 rather than polish a
flow whose top of funnel doesn't land.

**RD2 — Shrink reveal tracker ~50%** *(smallest play/reveal change; prereq read for RD3)*.
The tracker is a supporting visual, not the hero — the matchup/score race is. One reveal-layout
lock release. Surface: **R2** (play) — `H2HRecipientReveal.tsx` (locked geometry). Guardrail:
understandability.

**RD3 — Kill "Drawing…" + add running score** *(P2 + P4 as one surgery)*. Remove the dead
intermediary state; reveal immediately. Add a live YOU / JOHN / difference readout during the
reveal — every flip moves the number, turning the reveal into a sporting event:
`YOU +18 → +7 → -4 → +22 → +3 → YOU LOSE`. Touches locked geometry + `PRE_REVEAL_HOLD_MS` +
settle-pause + single-canvas (Fix C2) pinning tests — deliberate lock release with matching
test rewrite. Surface: **R2** (play) — `H2HRecipientPlay.tsx` + `H2HRecipientReveal.tsx`.
Guardrail: both. **Priority flag:** kept at this position for *dependency* reasons (RD2 read
first; geometry/test risk), but this is likely the **highest-emotion lever in the roadmap** —
the running score race may produce more investor reaction than RD1's static results. Treat as a
marquee ticket, not a cleanup; do not under-resource it because of its sequence position.

**RD4 — Merge onboarding 2/3/4 → one** *(last; biggest blast radius)*. "JOHN SCORED 184.9 /
Can you beat him? / Tap to HOLD / DRAW" → immediate reveal. Built **after** reveal cadence
settles (RD2/RD3) so onboarding isn't redesigned twice. Surface: onboarding / play flow
(R2 area). Guardrail: understandability.

Sequencing rationale: RD0 is a hard dependency (RD1 + RD5 read its output); RD1→RD5 settles
results voice before landing copy is written against it; **GATE-A** validates the top-of-funnel
hook before any reveal-polish spend; RD2→RD3 does the small reveal change
and required read before the larger reveal surgery; RD4 last because it depends on the RD2/RD3
reveal cadence.

---

## Build sequence — revised 2026-05-23 (sender/stamps — DEFERRED behind investor build)

> **Deferred 2026-06-08:** superseded as the *active* sequence by the challenge-redesign
> sequence above. Per the investor-build objective, anything that isn't "more understandable
> or more emotionally competitive" defers past the investor build — these sender/stamps items
> qualify. Retained here, not deleted; resume after RD0–RD5.


1. **S1 slot-split restoration (bucket 2)** — *active workstream, next code session*. Reverts WS2's TOP-slot collapse and rebuilds TOP-slot copy against the stricter S1 slot rules. Open questions resolved 2026-05-23 (see "Bucket 2 (S1 slot-split restoration) — LOCKED" above). Pieces A, C, D, E, F are code; piece B (~50 lines of bank copy) is a separate chat-drafting session.

2. **MISS firing-rate analysis** — parallelizable with #1 (separate session). Code-driven data analysis on recent hand outcomes. Output is a recommended percentage for the MISS window. After analysis, lock the number in this doc.

3. **MISS firing-condition reconciliation** — design call. Quick chat session. Resolves doc-vs-code contradiction on which tier promotions fire MISS.

4. **S1 bank rewrite (piece B of bucket 2)** — copy work. Draft TOP-slot hand-celebration banks with stamp tokens, BOTTOM-slot push-to-send banks. Depends on #1's bank shape being in place.

5. **WinCelebration.tsx cleanup** — investigation + decision in separate session: delete the dormant modal, repurpose, or document as intentionally retained.

---

## Current state — end of session 2 (May 19 2026)

### Shipped to origin

`main` is synced with `origin/main` at `132bf4a`. Top of log:

- `132bf4a` docs(notes): handleButtonClick DRY tech-debt captured for next session
- `61ea208` fix(gameview): closure-bug fix — handCount increment at hand resolution
- `b7d0fe3` WS4 — basketball.json post-reveal spice pass (227 templates, 18 archetypes)
- `800aa34` WS3-B — first-share invitation bank, early-discovery one-shot
- `e2b56c1` WS3-A — name capture modal at Challenge-a-Friend tap
- `5f4ae5e` WS2 — post-reveal trigger override delegates to selectChallengeInitiation **(introduced S1 slot-split regression — see lock above)**
- `699ff1d` WS1 — recipient trash-talk wired through 4 trigger-keyed banks

### Pre-existing work in `feat-team-stamps` worktree (adopted by current build)

Three files have uncommitted changes from a prior session, found during investigation. Code's assessment: solid starter, matches spec well. Being adopted and finished as part of current build.

- `shared/components/TeamStamp.tsx` (new, untracked) — slanted via `tsTeamStampThud` keyframes, gradient + bordered like TopGameOverlay, omits halo pulse. Needs vocabulary rename + tier-prefix support.
- `shared/components/__tests__/TeamStamp.test.tsx` (new, untracked) — needs rewriting for new vocabulary + tier-prefix + graceful degradation.
- `shared/views/GameView.tsx` (modified, lines 2330-2398) — implements TeamStamp absolute-centered over the settled tier image, plus multiplier chain in Row 2 with BUST exception. Wired off `challengeTrigger?.trigger`. Still uses `"near_miss"` and lacks tier-prefix.

### Build in progress

- Stamps build in dedicated worktree `feat-team-stamps` (branch `feat/team-stamps` off main at `132bf4a`)
- Investigation complete, plan approved
- Implementation: 8 edits across 3 atomic commits (A: vocab rename; B: TeamStamp component update; C: panel wiring update)
- Pending: implementation, full `npm test`, manual smoke, push

### Designed, not built

- Inline commentary stamps in TOP slot (separate build after panel stamps ship)
- S1 slot-split restoration + bank rewrite
- Persistent challenge floating icon (R5)

### Identified, not designed

- S3 share moment copy audit
- S4 post-acceptance notification
- R1-R5 recipient experience touchpoints
- Win path for recipient
- FTUE bypass for challenge-arrived users

### Tech debt surfaced session 2

- `shared/components/WinCelebration.tsx` — dormant full-screen modal, unused as the post-reveal panel. Investigate + delete or repurpose in separate session. Initial handoff docs incorrectly identified this as the post-reveal panel location.
- `NEAR_MISS_PTS = 8` (TierGauge) vs `MISS_WINDOW = 5` (trigger evaluator) — two thresholds with similar names for unrelated purposes. Gauge layer could rename to disambiguate (e.g. `GAUGE_PROXIMITY_PTS`); separate-session cleanup.
- DB column `near_miss_gap` retained after TS rename — TS field stays `nearMissGap`. Cosmetic mismatch; document and defer migration.

### Handover observations from WS4 (not actioned)

- `bk_0249` has archetype-fit issue (lacks `{topStat}`/`{badge}` in badge_explosion)
- Some templates marked `tone: punch` in historic archetypes — tone classification audit candidate
- The diagnosis doc's "526 templates unspiced" framing overstated actual scope (some prior voice work had landed in commits 4d1e7fa, 9156b3f)
- Re-enablement candidates from WS4: `bk_0086`, `bk_0074`, `bk_0075`, `bk_0050`, `bk_0054`, plus the seasonbest_0006 tone reclassification candidate

### Worktree state

- `main` synced with `origin/main` at `132bf4a`
- `feat-team-stamps` worktree created off main at `132bf4a`. Has 3 files of uncommitted pre-existing work being adopted.
- `worktree-feat+achievements-and-challenges` is 20 commits ahead of its own origin. UNRELATED to stamps work; keep separate.
- Empty `basketball 2/` Finder duplicate found in achievements worktree and deleted (session 2)
- Dev server should be started from `/Users/john/Desktop/ReplayMod/basketball/` for main's working tree

### Smoke test scope (stamps build)

1. Play a hand that triggers BAD BEAT → panel: tier animation completes settle, BAD BEAT stamp thuds in on top of settled tier, multiplier chain reads as `[tier]× → coins` (or with streak factor if active)
2. Play a hand that triggers MISS → same flow with `[TIER] MISS` stamp where TIER = the tier the user fell short of (e.g., a STARTER hand close to ALL STAR threshold renders `ALL STAR MISS`)
3. Play an ALL STAR / MVP / LEGEND win → no team-level stamp from the *win itself* (tier animation alone), multiplier chain still reads correctly. If the win is also a MISS against the next tier up, the MISS stamp does still fire.
4. Play a STARTER win, ROOKIE win, BUST → no stamp from the win itself. ROOKIE win shows multiplier chain in Row 2. BUST does NOT show multiplier chain (suppressed; loss).
5. Verify football and baseball wrappers still render correctly (no changes required to them — `challengeTrigger` is computed in shared GameView; graceful degradation: `challengeTrigger === null` → no stamp)
6. Trigger an active streak win → multiplier chain reads `[tier]× × [streak]× → coins`
7. Verify trigger chip at `ChallengeSharePrompt.tsx:147-150` is updated — `NEAR MISS` text gone, replaced with tier-prefixed `[TIER] MISS`

---

## Tech debt / known issues (not in scope unless noted)

- True-tie (δ=0) renders in LOSS layout — pre-existing state machine bug, rare
- Vite warnings on `/public/data/` imports (careerHighs.json, topGames.json) — real prod-build risk, files should be in `/src/data/` or fetched as URLs
- Daily tasks localStorage-only — must fix before money phase
- `payoutLogic.ts` forked between basketball and shared
- Football SportAdapter undersized vs basketball/baseball
- Last-name disambiguation absent in commentary (Curry, Williams, Hardaway — bare last names regardless of ambiguity)
- Init `?? "1"` vs increment `?? "0"` inconsistency in handCount — cosmetic, no behavior change
- `handleButtonClick` DRY cleanup — captured in notes at commit `132bf4a`, not yet code
- `shared/components/WinCelebration.tsx` dormant full-screen modal (raised session 2) — delete or repurpose
- `NEAR_MISS_PTS` / `MISS_WINDOW` naming-collision risk in gauge layer (raised session 2) — disambiguation rename candidate
- DB column `near_miss_gap` retained after TS rename (raised session 2) — defer migration

---

## Session-by-session changelog

### May 19 2026 — Session 1: WS1-4 + stamps design + closure-bug investigation

**Shipped (committed locally at end of session 1, pushed before session 2):**
- WS1 recipient trash-talk wiring (4 trigger-keyed banks)
- WS2 post-reveal challenge-aware routing **(introduced S1 slot-split regression — identified session 2)**
- WS3-A name capture modal
- WS3-B first-share invitation
- WS4 basketball.json spice pass (227 templates)

**Designed:**
- Stamps system (full design captured above)
- Recipient experience funnel structure (R1-R5)
- Sender funnel structure (S1-S4)
- Persistent challenge floating icon

**Process learnings:**
- Long sessions accumulate bookkeeping noise; over-indexing on process precision required
- "Shipped" vs "committed" must be distinguished consistently
- Worktree confusion can derail a session mid-flight — name the working directory explicitly
- Pre-merge `npm test` (not scoped vitest) is non-negotiable
- "Calibrating against worse options" is a real failure mode (leniency drift) — judge against spec, not against alternatives
- For polish work at MVP stage, accept "good enough across the floor" over "perfect on individual lines"

### May 19 2026 — Session 2: state verification + stamps spec + WS2 regression + process overhaul + investigation lock-ins

**Verified (no code written in chat; investigation run via Claude Code):**
- All 5 WS commits + closure-bug fix shipped to origin between session 1 and session 2 (doc was stale on this)
- `handleButtonClick` DRY treatment captured as notes in commit `132bf4a`, not code (acceptable)
- Empty `basketball 2/` Finder duplicate found in achievements worktree, deleted
- WS2 (`5f4ae5e`) collapsed S1 slot split — both TOP and BOTTOM now pull push-to-send copy. Regression, not pending work.
- Trigger chip at `ChallengeSharePrompt.tsx:147-150` exists, uses emoji + ALL CAPS, will be replaced by stamps
- Stamps panel is in `shared/views/GameView.tsx` (lines ~2300-2400), NOT `WinCelebration.tsx` (which is dormant)
- Pre-existing TeamStamp work in feat-team-stamps worktree (3 files) — adopted

**Locked:**
- Vocabulary: `NEAR MISS` → `MISS`, tier-prefixed
- MISS tier prefix interpretation: `nearMissNextTier` (the tier the user fell short of)
- MISS rename scope: challenge-trigger system only (7 files). Commentary-archetype and gauge-visual `near_miss` retained.
- DB column `near_miss_gap` constraint: keep TS field names `nearMissGap` / `nearMissNextTier`; defer migration
- MISS mechanic target: tier-band percentage (specific % TBD pending firing-rate data). Current implementation stays at fixed 5 FP for this build.
- All tier promotions eligible for MISS (target); current code fires only for `current tier ≥ STARTER` — contradiction flagged for separate resolution session
- BUST suppression: no MISS stamp when outcome is BUST
- S1 slot rules refined: TOP = hand + trigger event (with inline stamp), BOTTOM = friend + push to send
- Stamps panel layout: overlay settled tier indicator in `GameView.tsx`, no new layout zone, no row added
- Stamps inline commentary: DEAL/DRAW token style, flat (not slanted), TOP slot only, challenge-eligible only — separate build queued
- Multiplier legibility: render chain prominently in existing coins row, 2-factor extensible. Show on ROOKIE wins. Suppress on BUST.
- Build sequence revised: 6 sequenced workstreams (stamps build → MISS analysis → firing-condition reconciliation → slot-split restoration → bank rewrite → WinCelebration cleanup)
- Process rules expanded (7 total session-2 additions); two-doc split locked: CLAUDE.md for process, this doc for state
- Stamps build implementation plan: 8 edits in 3 atomic commits (vocab rename, TeamStamp component update, panel wiring update)

**Pending:** none. Stamps build shipped 2026-05-22 (`ce9c277`); session 2's pending items are all resolved. CLAUDE.md process-discipline section landed.

**Process learnings (session 2):**
- The design doc and the code can disagree, and the code wins by default unless someone checks. WS2 regression confirms this.
- Build prompts can have wrong architectural assumptions. WinCelebration.tsx mismap → investigation caught it before code was written. Investigation-first works.
- Designs that live in chat history do not load into Code's context. They must be transcribed into doc form *before* implementation, not after.
- A more capable model running a flawed process makes the same mistakes faster. Superpowers/SuperClaude is useful for *exploration* but does not substitute for verification structure.
- Verify git state at session start. The doc had "5 unpushed + closure fix pending" — git showed everything shipped.
- When in doubt about layout/UI, ASK before sketching. Session 2 lost time to inventing a four-zone layout when the actual panel is two rows.
- Worktree confusion struck again — Claude Code session was initially launched from the achievements worktree. Dedicated worktree per feature avoids this.
- Pre-existing uncommitted work in a worktree from a prior session is a real scenario. Investigation must check for it and decide adopt vs revert before implementing.
- Token-efficiency tradeoff confirmed: chat for design + design-doc maintenance, Claude Code for actual implementation. Spec written in chat → handed to Code → Code investigates → plan back to chat for sanity check → approval → Code implements.
- Code paraphrased the doc's old "5 commits ahead" state instead of running `git log` — exact failure mode rule #3 (git-state-first) is meant to prevent. Confirms the rule is necessary.
- When investigation reveals a build prompt's architectural assumption is wrong (e.g., WinCelebration vs GameView), STOP and surface — do not silently work around. Added as session-2 process rule #7.
## #7 — results-page hero-slot flip: preview-then-flip + visible empty slot (2026-06-08)

Surface: `shared/components/H2HResultsOverlay.tsx` (user/bottom hero only — the
opponent/top hero was removed in the Step-3 results-page lock). Base: `main @
08b95c8` (= `2592555` + one docs-only `chore(registry)` commit; no code in the
delta).

**Recon verdict (broken-vs-absent):** NEITHER absent nor regressed — the flip was
built and wired end-to-end (overlay state → `HeroCell` → basketball
`h2hOverlayRenderer` → `PlayerCardShell` `rotateY(180deg)`), but the *behavior*
was wrong vs intent. Reclassified from "build the flip" to "change the
interaction model + make the empty slot visible."

**Verified (static recon, anchor strings):**
- `H2HResultsOverlay.tsx` header `Tap-to-flip mechanic (phase 4 fix 3, 2026-05-27)`; state `const [bottomSelectedCardId, …]` is plain `useState`, not flag-gated.
- The `dockedScoreSettled` / `glideHandoff` "dormant until C4" flags gate the SCORE-GLYPH glide, not the flip (red herring cleared).
- Live mount chain (not dev-route-only): `GameView.tsx` `renderOverlayCard={adapter.h2hOverlayRenderer}` → `H2HRecipientPlay` → `H2HRecipientReveal` (`<H2HResultsOverlay … renderCard={renderOverlayCard}`) → overlay.
- Basketball `h2hOverlayRenderer` (`basketball/src/views/GameView.tsx`) forwards `isFlipped={options?.flipped ?? false}`, `canFlip={true}` — back face honored.
- Old behavior: `HeroCell` rendered `renderCard(card, { flipped: true })` hardcoded → card dropped in already on the BACK (`BackBStats`). Hero-card tap was a dead no-op (`onToggleFlip` never wired in this surface; `PlayerCardShell`/`CardFront` have no `stopPropagation`). Empty `HeroCell` was an invisible spacer.

**Locked (confirmed with John this session):**
- Req 1 — the user/bottom hero box shows a dashed border whenever empty, regardless of whether any mini card has been tapped. Empty state reserves the same Y span as before (no layout jump).
- Req 2 — preview-then-flip, mirroring the hold-decision preview feel:
  - Tap a mini card that isn't selected → it appears in the hero FRONT-up (not back).
  - Re-tap the active mini card, OR tap the hero card itself → flip front↔back in place.
  - Tap a different mini card → switch + reset to front. Never jump card-back→card-back across selections.
  - No deselect: the hero keeps showing the last-tapped card; the empty bordered state only exists before the first tap.
- Ownership: the overlay owns the flip at the `HeroCell` wrapper (`onClick`), since the card's own `onToggleFlip` is intentionally not wired here. Relies on there being no `stopPropagation` in the card render path (verified).
- Scope: bottom/user side only. The top/opponent strip keeps its existing (cosmetic, hero-less) tap state untouched — flagged below, not actioned.

**Implementation (3 edits, `H2HResultsOverlay.tsx` only; tests updated alongside):**
1. `HeroCell` gains `flipped` / `onTap` / `showEmptyBorder` props; renders `flipped` instead of hardcoded `true`; paints a dashed border + `borderRadius` when empty; `onClick={card ? onTap : undefined}`; adds `data-h2h-overlay-hero-flipped` ("true"/"false"/absent) as a deterministic bbox/test hook.
2. New `bottomHeroFlipped` state (default `false`); `handleBottomCardTap` rewritten to select-front / re-tap-flip / switch-reset; new `handleBottomHeroTap`; visibility-reset effect also clears `bottomHeroFlipped`.
3. Live bottom `<HeroCell … flipped={bottomHeroFlipped} onTap={handleBottomHeroTap} showEmptyBorder />`.

No adapter / `PlayerCardShell` / `CardFront` changes.

**Tests:** replaced the prior `flipped: true on mount` test (it encoded the
removed back-first behavior) with four: seeded hero previews front; hero-tap
flips front→back→front; re-tap-flips + switch-resets-to-front; empty cell shows
dashed border.

**Verification status:** code + tests syntax-checked (esbuild parse, clean).
NOT yet run through the gate. This is a CSS-transform flip → JSDOM is blind to
the animation (`getBoundingClientRect` zeros) — real-browser bbox check
(Playwright vs `H2HRevealMockRoute` / `H2HPlayMockRoute`, which accept
`?bottomFlipped=` seeds) is mandatory, not optional. Push held until glass.

**Pending:**
- Run `bash scripts/build-vercel.sh` + full root `npm test` (shared touch — never scoped vitest).
- Real-browser bbox: tap mini → hero front; tap again → flips to back; switch card → front; empty slot shows border. Confirm on glass (Cmd-Shift-R after the standing port-kill ritual).

**Flagged, not actioned (separate item):** the top/opponent (`MIKE`) strip still
sets `topSelectedCardId` and dims cells on tap, but there is no top `HeroCell`
to display into (removed in Step-3) — so opponent-card taps are a dead/cosmetic
interaction. Out of scope for #7; surfaced for triage.

## RD0 — points→FP voice fix: spec (2026-06-08)

Dependency gate for RD1 + RD5. Recon done against `main @ 8d3d7d9`. Engine ticket
(no surface render of its own) — its user-visible proof lands when RD1 consumes corrected
output.

**Architecture finding (reframes the handover):** the commentary engine is **LLM-driven**,
not templated. `voiceContract.ts` exports `buildVoiceContract(facts)→{system}` +
`buildUserPrompt(facts)`; a model writes the line from typed facts. The FP-vs-points and
attribution **rules already exist** in the contract (lines 218 / 220 / 222). RD0 is **not**
writing rules — it makes the *data* match them so the prose workarounds can be deleted. The
tell is `voiceContract.ts:222`: *"TOTAL_FP is untyped in CommentaryFacts today, so default it
to FP."* A contract papering over an untyped fact is the ghost we stop chasing.

**Geography correction:** the salience builder is `shared/utils/computeSalience.ts`, NOT
`shared/commentary/`. The handover's `salience.ts` / `computeSalience.ts in commentary/` was
wrong. RD0 touches `shared/commentary/` **and** `shared/utils/`.

**Do NOT touch (already correct — verified):** `computeSalience.ts` and
`shared/utils/extremeGames.ts` build "42 points" / "8 turnovers" from **raw game-stat
counts**, with the FP contribution carried separately in `SalienceFact.value`. The
"38 FP from 38 pts" analyst-shorthand bug was already fixed in Phase 4 Pass 1. Most "points"
in the engine are correct game-stat labels — blanket "fix every points" would corrupt them.
Also off-limits: the stat-word regexes at `selectCommentary.ts:1088` (number→category
extraction) and `:1587` (`secondaryRepeatsStat` anti-repeat) — machinery, not guardrails;
they must keep passing.

### Fix layers (curated — confirmed with John this session)

**L1 — Authored delta-banks: FP gap mislabeled as "points" (the real leak; live on RD1).**
`H2HResultsOverlay.tsx` imports `chadChallenge`; `chadTrashTalk(bucket, name, delta)` and the
delta-banks (`chadChallenge.ts` ~1264–1401; e.g. `"by a sneeze ({delta} points)"`,
`"{delta} extra points"`) render the **FP gap** as "points." Fix = render `{delta}` (and any
FP gap/total token) as **"FP."** **Curated, not blanket** — preserve idioms ("a few points
short," "no style points") and real game-stat citations. Build the exact site list at
implement time by grep, not from this list:
`grep -nE "\{delta\}[^.]*point|points|pts" shared/commentary/chadChallenge.ts shared/commentary/selectCommentary.ts`
then hand-classify each hit as FP-token (fix) vs idiom/game-stat (keep). Est. ~10–15 sites.

**L2 — Type `totalFp` (delete the contract workaround).** `commentaryFactsTypes.ts` types
`totalFp?: number` (bare); thread an FP category so it's self-describing
(`commentaryFacts.ts` already passes it through at line ~176). Then **delete** the
"TOTAL_FP is untyped… default it to FP" carve-out in `voiceContract.ts:222` — the rule
becomes category-driven, not a default.

**L3 — Scope the salience aggregate label to the HELD lineup (the "8 turnovers" ambiguity).**
`computeSalience.ts` `magnitudeLabel` builds held-lineup-aggregate labels with no scope marker;
`rankPerStat` sums **held cards only** (`if (c.wasHeld !== true) continue;`), so "8 turnovers"
= the user's held lineup combined — NOT one player, NOT drawn/cut cards. Make the label
self-describing as held-lineup-wide (e.g. `"8 turnovers from your held lineup"`); do **not**
use "across the hand" (reads as all cards). The named player-level signal `primaryDragPlayer`
(carries `name: worst.card.name`) stays player-attributed (e.g. "Curry's 5 turnovers"). Update
contract rule 220 to lean on the now-scoped aggregate label instead of policing attribution in
prose.

### Tests (heaviest rewrite of any ticket — localized)
Rewrite assertions that pin specific label strings: `voiceContract.test.ts` (workaround
removal + scoped aggregate), `commentaryFacts.test.ts` (totalFp typing), `salience.test.ts`
(held-lineup-scoped label), `templateFill.test.ts`, `api/__tests__/headline.test.ts`. Add a
test asserting an FP-delta bank line renders "FP" not "points," and one asserting the
aggregate label names the held-lineup scope. Extraction/dedup regex specs must remain green.

### Verification
Shared touch → `bash scripts/build-vercel.sh` + **full root `npm test`** (never scoped). RD0
is engine-only (no CSS/animation) → no glass for RD0 itself; user-visible proof is RD1
rendering "-20.1 FP" (not "points") on the results overlay. Push held per item.

### Decisions locked this session
- Scope the aggregate label as held-lineup-wide (not "across the hand"); keep `primaryDragPlayer` named.
- L1 is a curated FP-token pass with idiom + game-stat carve-outs, not a blanket replace.

## RD1 — rivalry results: spec (2026-06-08)

Demo centerpiece. **Branch off `fix/rd0-points-fp`** (not main) — see dependency below.
Surface: R3 (Results page), `H2HResultsOverlay.tsx` + `selectChallengeResolution` in
`chadChallenge.ts`. Goal: make the result **impossible to miss without reopening layout.**

**Recon corrections to the build-sequence bullet (verified against post-#7 tree):**
- **RD0 IS a prerequisite (the bullet's "sourced correct from RD0" is real).** The overlay
  renders TWO lines — `headline` (`selectHeadline`, local) AND `resolutionLine`
  (`selectChallengeResolution`, `chadChallenge.ts:1467`). The resolution generator interpolates
  `{delta}` and picks from `RESOLUTION_BANKS` = the **1261–1401 banks RD0 fixed**. So the
  resolution line consumes RD0's relabel, and both tickets edit `chadChallenge.ts` → branch off
  RD0. (The "trash-talk no longer rendered" comment at :781 refers to `chadTrashTalk`, a
  *different* generator — not the resolution line.)
- **"No locked geometry" is FALSE.** The overlay's strips + hero rows mirror the arc's Y
  positions exactly; the commentary lives in a locked grid cell (`gridRow 1`,
  `gridColumn "1 / span 2"`); the right rail is held by a **dormant, unbuilt** Step-4 score
  glide. Strips/rows/rail-widths/`HERO_ROW_HEIGHT` may NOT move. **However** the row-1 cell is
  `HERO_ROW_HEIGHT` tall (≈1.45× a card) and holds only ~50px of centered text today — ample
  vertical slack. RD1 fills that slack; it does not release geometry.
- **"Overlay only" is incomplete** — also `chadChallenge.ts` (`selectChallengeResolution`).

### Decisions locked this session (John)
- **Option A+ in-cell. Do NOT release arc geometry. No Step-4 glide. No held-player plumbing.**
- Headline = pure outcome + rival; the margin moves into the hero number ONLY; no duplicate
  delta in `selectHeadline`.
- Level-4 (Decision, "because he held Curry") is DEFERRED to a fast-follow — needs the poster's
  held-star plumbed into `selectChallengeResolution` (today it gets scores + name only). RD1
  ships **Outcome + Score + Rival**.
- Keep `selectChallengeResolution` as the small supporting why-line, RD0-clean, untouched.

### Copy (locked)
`delta = recipient.totalFp − sender.totalFp` (recipient = user, sender = opponent;
`challengerName = sender.displayName`). Outcome is by **sign of delta**, color by outcome:

| Outcome (sign)        | Headline (big)        | FP hero  | color |
|-----------------------|-----------------------|----------|-------|
| win  (delta > 0)      | `YOU BEAT {NAME}`     | `+20.1 FP` | green (`WINNING_COLOR`) |
| loss (delta < 0)      | `YOU LOST TO {NAME}`  | `−20.1 FP` | red (`#EF4444`) |
| tie  (\|delta\| < 0.05) | `YOU TIED {NAME}`     | `0.0 FP`   | amber (`#FFB14A`) |

No-name fallback: `YOU WON` / `YOU LOST` / `YOU TIED` (hero unchanged). Hero magnitude =
`Math.abs(delta).toFixed(1)`; sign prefix per outcome; tie renders literal `0.0 FP`.

**Flag (falls out of pure-outcome copy):** the `photo_finish` bucket no longer produces a
special "Photo finish — X FP" headline — a sub-1-FP loss is still `YOU LOST TO {NAME}` (the
soft-pedal buries the outcome, counter to "impossible to miss"). Only the strict tie
(`overlayTied`, <0.05) is "tie." `bucket`/`trashTalkBucket` stays for any other use but no
longer drives headline copy or color.

### Implementation
- **`selectHeadline` (overlay ~248):** rewrite to the table above — outcome + rival only,
  **delta removed from the string.** Delete the clever placeholder variants and the
  "Window's open / closed" wording (redundant — state is already carried by the countdown pill
  + CTA label). Drive outcome by sign (+ tie threshold), not by `bucket`.
- **FP hero (new element in the commentary cell):** render the signed hero number as its own
  stacked element between the headline and the why-line — large `fontSize`/`fontWeight`,
  outcome-colored. This is where the margin lives now.
- **`headlineColor` (790):** map to outcome (win green / loss red / tie amber), not `bucket`.
- **Cell layout:** within `gridRow 1 / gridColumn "1 / span 2"`, fill the existing vertical
  slack — outcome biggest (wraps to 2 lines OK at ~278px), FP hero large, why-line small,
  `justifyContent: center`. Do NOT touch the grid template, row heights, rail widths, strip
  layout, or the per-child `marginBottom` tuning.
- **`selectChallengeResolution`:** unchanged (RD0-clean why-line).

### Do NOT touch
Arc-mirroring geometry (grid template, `HERO_ROW_HEIGHT`, `LEFT/RIGHT_RAIL_WIDTH_PX`, strip
layout, marginBottom tuning); the dormant Step-4 flags (`dockedScoreSettled`, `glideHandoff`,
`railSuppressed`) — leave dormant; the right-rail `ScoreCell` absolute totals; the #7 hero-flip;
held-player data (out of scope).

### Known minor redundancy (glass-watch, not a blocker)
The why-line may restate the FP magnitude (resolution banks interpolate `{delta}`). The hero is
the dominant number; the why-line's mention is contextual. If glass reads it as duplicative,
tighten the resolution banks in a fast-follow — NOT in RD1 (John: keep resolution as-is).

### Tests
- Rewrite `selectHeadline` assertions (they pin the old clever copy): win → `YOU BEAT {NAME}` +
  `+X FP`; loss → `YOU LOST TO {NAME}` + `−X FP`; tie → `YOU TIED {NAME}` + `0.0 FP`; no-name
  fallbacks; assert NO numeric in the headline string (delta lives only in the hero).
- Assert `headlineColor` maps by outcome.
- Assert sub-1-FP loss renders as a loss, not "photo finish."

### Verification
Shared touch → `bash scripts/build-vercel.sh` (tri-sport) + **full root `npm test`** (never
scoped). **Glass MANDATORY** — typography change inside locked geometry: real-browser bbox to
confirm the bigger outcome + hero fit the row-1 cell with NO clip/overflow on tight viewports
(390×664 mid-scroll, 360×590, 320×520, in-app webviews — the cell's own overflow comments list
these). Confirm win / loss / tie each on glass. Push held. RD1's glass IS also RD0's deferred
output proof (the "−20.1 FP" hero proves the engine + surface together).

## RD5 — landing: direct score challenge (number-forward): spec (2026-06-08)

**Branch off `fix/rd1-rivalry-results`** (carries RD0's engine + RD1; RD5's surface is disjoint
from both — landing take-engine, not results overlay or `chadChallenge.ts`). Surface: **R1**
(Accept Challenge) — `ChallengeTakeCardLanding.tsx` + `shared/challengeTakeCard/` take-engine +
a lock-doc amendment. **NOT copy-only** (John) — a small take-engine + lock update.

**Decision (John): number-forward. Reverse the Phase-2d style bet; keep the spoiler guards.**
The locked FP-spoiler rule bundled two things; RD5 splits them:
- **KEEP (real spoiler protection):** no per-card FP chip; no recipient-outcome reference; no
  reveal-result spoiler.
- **REVERSE (Phase-2d style bet):** the "NO FP number ever appears" ban (templates.ts:221) — the
  **challenger's total is not a spoiler, it is the challenge.** Hiding it hides the reason to
  play. Show it as the hero.

### Target copy (locked)
Deterministic, not LLM-narrative — which also moots the headline points-leak (a templated
`FP` string cannot say "points"). Data: `challengerName = data.challenger_name`,
`targetScore = data.target_score`, held names from the `wasHeld === true` filter.

```
JOHN SCORED 184.9 FP        ← hero: {challengerName} SCORED {targetScore.toFixed(1)} FP
Held: Beal, LaVine          ← supporting: "Held: {heldNames}"  (names only, NO per-card FP)
Can you beat him?           ← dare / CTA
```
No-name fallback: hero `THE SCORE TO BEAT — {targetScore} FP`; dare `Can you beat it?`.

**Delete:** the USP subline "Same starting hand. Different decisions." (`usp-subheadline`); the
stakes-word-only lead ("A NUMBER ON THE BOARD. BEAT IT." / "CAME UP SHORT" as the number-hiding
framing); the authored LLM narrative as the hero ("NINE POINTS SHORT…"). **Keep:** HOLD badges +
bright/dim card treatment; no per-card FP chip; no outcome/reveal spoilers.

### Points-leak = RD0 verification spillover (fold the fix-verification into RD5)
Image-1's "NINE POINTS SHORT… SEVENTY-FIVE ON THE BOARD" headline is `authored_headline` from
`api/headline.ts` — **RD0's engine** (`buildVoiceContract` consumer), a landing consumer RD0
never glassed. RD5 replaces the hero with the deterministic FP template, so the leak can't
appear in the landing hero. **But the bug class is RD0's:** fresh challenge headlines from
`api/headline.ts` must say **FP** (not "points") for fantasy score/gap language. RD5 verifies
this visually on a freshly-created challenge (the stored headline in the dev server may be a
stale pre-RD0 seed — create a new one to disambiguate). If fresh output still leaks "points,"
that's a small **RD0 follow-up** in the engine (contract/typing), surfaced from here — not an
RD5 code change.

### Lock-doc amendment (doc-before-code)
Amend `docs/challenge-landing-v2-phase2d-plain-stakes-anchor-takes-lock.md`: split the
FP-spoiler rule into (a) spoiler protection — RETAINED (per-card FP + outcome/reveal), and
(b) the "no FP number" style — REVERSED for the challenger's total. Record the rationale: the
total-to-beat is the challenge, not a spoiler; the hierarchy (Score leads on R1) governs.

### Implementation surface
- `shared/challengeTakeCard/templates.ts` + `generateChallengeTakeCard.ts`: promote the
  targetScore-forward output (the dormant `"{targetScore} FP to beat"` templates already exist);
  retire stakes-word-only as the number-hiding lead. Stakes words may survive as flavor, never
  as the substitute for the number.
- `ChallengeTakeCardLanding.tsx`: hero = score block, supporting = held names, CTA = dare;
  delete `usp-subheadline`; demote/remove the authored-narrative hero.
- `api/headline.ts`: verification only (RD0 spillover); fix only if fresh output still leaks.

### Tests
Update `ChallengeTakeCardLanding.test.tsx` (it pins the deletions): the `usp-subheadline`
"Same starting hand" assertions (151/160/813/1096) and the `evidence-line` stakes assertions
(325/334) change to the score-forward structure. ADD: hero renders `{name} SCORED {N} FP`;
held names render; CTA is the dare; assert NO per-card FP present; assert NO "points" in the
headline for FP. Take-engine tests for the targetScore-forward path.

### Acceptance criteria (John)
1. Fresh landing shows target score as **FP**, not hidden behind stakes words.
2. No per-card FP appears.
3. No recipient reveal spoiler appears.
4. Authored headline (fresh) has no "points" leak for fantasy score/gap language.
5. Existing HOLD badges remain.
6. GATE-A tests number-forward vs stakes-word comprehension after this ships.

### Verification
`bash scripts/build-vercel.sh` (tri-sport) + **full root `npm test`**. **Glass MANDATORY** —
copy + layout change on a live surface; **create a fresh challenge** to verify both the new
score-forward hero and the authored-headline FP-cleanliness (criterion 4). Push held.

### RD5 follow-up (deferred) — decision-led landing (GATE-A to settle)

RD5 shipped number-forward (`{name} SCORED {N} FP` hero); glass 2026-06-08 confirmed it's
**clear but not compelling** — answers what/who/what-to-do, underserves "why should I care."
Diagnosis (John): the bug isn't "narrative was removed," it's **"consequence was removed."**
The score is the scorecard; the **held decision is the reason**, and the decision is Replay's
unique asset (cf. 82-0 — the roster is the story). DEFERRED: do NOT rebuild RD5 now; finish the
build sequence, settle here at the end via GATE-A.

Proposed revision (element reorder of what already renders, not new narrative):
- Hero → the **decision**, factual: `JOHN HELD HARDEN AND BEAL.` (promoted above the score)
- Subhead → score: `170.9 FP` · Challenge → `Can you do better?` · CTA → `Accept Challenge`

**Revises two locked items — reconcile, don't silently override:**
- Challenge-hierarchy R1 application ("Score leads on R1") → "**Decision leads on R1**, Score is
  subhead." R3 still leads with Outcome (unchanged) — R1/R3 heroes differ by design (pre-play =
  sender's decision is the provocation; post-play = outcome is the payload).
- RD5 "direct score, not accusation" → partially walked back. NOTE the landed hero
  (`JOHN HELD HARDEN AND BEAL`) is a factual decision-*statement*, not an evaluation, so the
  "don't make them judge the sender's decision without context" principle still holds. Open
  dial: **charge level** — neutral ("held Harden and Beal") vs loaded ("Harden cost John the
  win" / illustrative A/B/C).

**GATE-A settles it (now an A/B):** test shipped number-forward baseline vs decision-led variant
(+ charge level) for **motivation**, not just comprehension. Per the project's own principle —
the builder is the least reliable judge of stranger motivation — the current conviction is a
hypothesis, decided by the 10-fan test, not a second gut call. Build the winner as RD5.1.

#### Update 2026-06-08 (post-stimulus review) — B adopted as direction

**Decision (John): adopt B (decision-led) as the landing direction.** Supersedes number-forward
(A) as the target; A stays the *shipped* baseline until the end-of-sequence headline refinement
(RD5.1). Stronger rationale than the original spec: decision-first is **on-moat** — Replay's moat
is "same roster, different decisions," and B is the only version that puts the *decision* (the
unique asset) in the hero. A reports the outcome; B makes the recipient run the decision in their
own head ("would I have held Harden?") before clicking — the challenge starts pre-click.

**Target refinement (the ceiling, not the floor):** decision **+ consequence verb**, e.g.
`JOHN TRUSTED / BET ON / RODE WITH HARDEN AND BEAL. / 170.9 FP`. First line must trigger
"would I have made that call?" Factual "HELD" (current B) is better than A but is still
*reporting*; the verb adds conviction/stakes.

**CHOKE-badge contradiction (new sub-item, resolve in RD5.1):** "HELD … + CHOKE + 170.9" reads
incoherent to a stranger (choke or not?). A masked it; B surfaces it. Same fix as the refinement
— a consequence verb makes the badge *the story* ("…THEY CHOKED.") instead of contradicting it.
Do not ship the decision-led headline with a bare trigger badge that the copy doesn't explain.

**GATE-A — repointed (recommendation, pending John's nod; NOT yet locked):** B is chosen, so
GATE-A is no longer A-vs-B. Its still-open jobs: (1) does decision-led actually make cold fans
lean in (the motivation gate on the *expensive* reveal tickets), (2) consequence-verb charge
level (bare "HELD" vs "TRUSTED…"). The build-gut chose the direction; the gate still owes the
stranger-motivation proof.

**Process flag:** proceeding to build before running the gate trades hook-validation for
momentum. Mitigation on the table: let RD2 proceed (single-constant strip shrink, correct on its
own merits) while **RD3/RD4 wait for GATE-A**, run in parallel against B.

## RD2 — shrink reveal hand strips ~50%: spec (2026-06-08)

Smallest reveal ticket. **RD2 proceeds now; RD3/RD4 wait for GATE-A** (per the split — RD2 is
correct on its own merits regardless of the hook). Branch off the latest landed tip. Surface:
**R2** (reveal) — `H2HRevealScreen.tsx` (+ `H2HRecipientPlay.tsx`, see cross-surface) + a
reveal-arc lock amendment. Guardrail: understandability (de-emphasize the supporting visual so
the score race is the unambiguous hero).

**Decision (John):** "the tracker" = the **top/bottom small-card hand strips** during the
reveal — NOT the battlefield, NOT the score rail. Shrink ~80px → ~half so they become supporting
context, not a visual co-hero. **Preserve their job:** show which five-card hand is being revealed;
show reveal progress (dim-as-revealed); don't compete with the central card/running-score race.

### Recon
- `HAND_STRIP_HEIGHT_PX = 80` — local const in `H2HRevealScreen.tsx:217`; cascades to the strip
  card scale (`STRIP_CARD_DISPLAY_WIDTH_PX` :239) and the cell height (:403). Halving it
  auto-rescales the mini-cards.
- **Results overlay strips are a SEPARATE implementation (own constant) — RD1's shipped surface
  is NOT affected.** Confirmed.
- **`H2HRecipientPlay.tsx:156` hand-syncs its mini-cells to "80 (matches HAND_STRIP_HEIGHT_PX)"**
  via comment, not import — a magic-number twin. If only the reveal changes, play drifts.

### Implementation
- `H2HRevealScreen.tsx`: `HAND_STRIP_HEIGHT_PX` 80 → **~40** (start at 40; **glass-confirm the
  mini-cards still read as the five cards + show dim-progress**; if 40 clips the card content,
  floor at ~48 — "roughly half" with a legibility floor). Derived scale follows automatically.
- **Export `HAND_STRIP_HEIGHT_PX`; `H2HRecipientPlay` imports it** (remove the hand-synced magic
  80) so play strips shrink in lockstep and the two surfaces can't drift again. (Minimal-scope
  alternative: update both numbers by hand — but the export is the drift-proof fix.)

### Lock amendment (doc-before-code)
Amend `docs/h2h-reveal-arc-design.md` "Phase 2 integration anchors": the strip-height anchor
moves from ~80/90 to **~half**; reinforce the hierarchy rule (strips subordinate to the
battlefield) and record that the strips' *job* (which-cards + reveal progress) is preserved at
the smaller size.

### Do NOT touch
Battlefield card max-width (the hero); the score rail (rail widths, `ScoreCell`, delta readout);
**RD3 running-score behavior** (`useH2HReveal` beats, running totals, settle-pause) — RD2 is
geometry-of-strips only; the live YOU/JOHN/diff race is RD3; the results overlay strips.

### Tests
`H2HRevealScreen.test.tsx` (asserts strip geometry ~:126 via `HAND_STRIP_HEIGHT_PX`);
`H2HRecipientPlay` mini-cell dimension test. Assert: strips still render 5 cells; dim-as-revealed
behavior intact; the new height is ~half the old.

### Verify
`bash scripts/build-vercel.sh` (tri-sport) + **full root `npm test`**. **Glass MANDATORY** —
animated surface: watch a FULL reveal and confirm (a) strips still legibly show the five cards,
(b) dim-progress still reads, (c) the battlefield/score-race now visually dominates, (d) no
overflow; **also check the play screen** (shares the constant). Push held.

---

### GATE-A — repointed to 3-arm copy-motivation test (John, 2026-06-08)

No longer A-vs-B. Question: **does decision-led + consequence copy make strangers want to click?**
Three arms (one screen per person; same challenge; copy is the only variable):
- **(1) Factual decision-led:** `JOHN HELD HARDEN AND BEAL.`
- **(2) Decision + consequence:** `JOHN TRUSTED HARDEN AND BEAL. THEY CHOKED.` — resolves the
  CHOKE badge by making it the story. **John's bet to win.**
- **(3) Number-forward (control, = shipped):** `JOHN SCORED 170.9 FP.`

(Note: these (1)/(2)/(3) are NOT the earlier stimulus A/B labels.) Gate function preserved: if
NONE motivate → CONCERN/FAIL → pause RD3/RD4. With 3 arms, run **~15 fans (5/arm)** to keep each
cell at 5; still a directional read, not powered. Winner → built as RD5.1 (end of sequence).

#### Update 2026-06-08 — RD2 superseded: unify mini-slot geometry (results-referenced, 80px)

Glass of RD2 (reveal/play 40 / results 80) confirmed the cross-state size shift is obvious and
violates the "single coherent surface" lock (one visual board from first Deal tap through reveal).
**Decision (John): do NOT animate the jump — eliminate it.** Lock ONE mini-slot geometry across
hold/draw → play → reveal → results, **results-referenced at 80px** (results proportions read best
on glass; results strips are #7 tap targets at the ~44px floor, so 80 is the tap-valid choice too
— this is why RD2's 40 could never be the unified value).

**Net effect (honest):** this REVERTS RD2's reveal/play shrink (40 → 80, i.e. back to the pre-RD2
size). RD2's original "shrink the tracker for battlefield dominance" objective is **retired** —
glass showed the hero cards dominate at 80 regardless, so the shrink bought incoherence, not
dominance. RD2-revised's deliverable is **a lock, not a shrink**: one shared mini-slot constant
across all states so they cannot drift apart again — the single-coherent-surface principle
enforced in code, not in three hand-synced numbers.

Implementation: `HAND_STRIP_HEIGHT_PX` → 80, stays exported; `H2HRecipientPlay` imports it (kept
from RD2); **`H2HResultsOverlay` imports it too** (its separate `STRIP_HEIGHT_PX = 80` → the shared
constant; value-preserving, no results visual change). Consequences: crossfade byte-identity on Y
is **restored** (revert the RD2 crossfade-delta note — at 80=80 there is no delta); the **RD3
strip-grow animation scope is killed**; the 40-target/~48-floor reasoning is moot. RD2-revised
intentionally spans the results surface as the canonical reference.

## RD2.1 — strip-cell overflow (scale/flex divorce): spec (2026-06-08)

Pre-existing defect surfaced by RD2 glass (NOT introduced by RD2 — geometry is byte-identical to
pre-RD2; CC live-DOM probe confirmed). Un-gated (a bug on already-built surfaces, correct
regardless of GATE-A). **Sequenced before RD3** (RD3 builds on these reveal surfaces; don't stack
the running-score race on a known overflow). Branch off RD2's tip (`fix/rd2-strip-shrink`).

> ⚠️ **DOC-INTEGRITY WARNING (2026-06-18 — STALE AT 5 CARDS, do not trust the conclusion below).**
> This derivation assumes a **6-card** strip. Basketball shipped 5 cards (main `f2f06f7`).
> **Surface = the H2H reveal/play hand STRIP**, a single horizontal flex row of cells
> (`H2HRecipientPlay` bottom strip is `display:flex; justify-content:center` — one row), so the
> **1-row sum is the correct model for this surface.** (This is NOT the in-game `bball-23` roster
> grid — that's a separate 2-row 2-top/3-bottom layout; do not conflate them.) Numbers verified:
> 6-cell 1-row = `6×55.06 + 5×4 ≈ 350px > 332` (overflow, as written); 5-cell 1-row =
> `5×55.06 + 4×4 ≈ 291px < 332`, which **INVERTS the conclusion** — at 5 the cells no longer
> overflow / squeeze. **The shipped 5-card strip glassed clean** (H2HRecipientPlay rendered 5
> cards, no broken/empty/overlapping strip) — so this warning flags the **stale derivation, NOT
> the working layout.** Left un-rewritten to preserve the historical RD2 reasoning; do NOT use the
> "squeeze each cell to ~52px" result for the current 5-card strip — re-derive if you touch it.

### Root cause (verified against code, 2026-06-08)
The strip cell (`H2HRevealScreen.tsx:522–525`) is `height:"100%" / aspectRatio:"329/478" /
flexShrink:1 / minWidth:0`. The strip wrapper renders ~332px (BoardShell 16+16 + ZonePanel 12+12
chrome). Six cells need 6×55.06 + 5×4(gap) ≈ 350px > 332 → flex **squeezes each cell to ~52px**.
But the inner card is drawn via a **fixed** `STRIP_CARD_SCALE` (line 240 =
`STRIP_CARD_DISPLAY_WIDTH_PX(55.06)/150 = 0.367`), derived from the 80px height, **not** from the
actual cell box → inner card stays **55.06px inside a 52px cell**. The 3.06px overhang per cell
eats the 4px gap (reads as overlap) and, on the card-back/log view, pushes the right-edge FP figure
past an `overflow:hidden` ancestor (the clip). Same scaffold on reveal + results + play (unified
post-RD2), so it's one fix for all three.

### The fix (principle locked; mechanism is CC's call, report before building)
**Make the inner card track the ACTUAL (flex-resolved) cell width** so inner == cell at every
viewport — the card lands at ~52px in tight space and fills its cell, no overhang. Contained to the
strip scaffold. Acceptable mechanisms: a measured scale (ResizeObserver/container query driving the
transform), or a CSS-fill mini-mode (inner `width:100%/height:100%` of the cell). CC investigates
and reports the cleanest contained approach for sign-off.

### Do NOT
- **Do NOT** force `flexShrink:0` + fixed 55px width — that trades overlap for *overflow* (six 55px
  cells still don't fit 332px); it moves the bug, doesn't fix it.
- **Do NOT** do CC's "Fix C" (shrink ZonePanel/chrome padding) — blast radius across every H2H
  surface (battlefield, rail), needs full re-glass.
- **Do NOT** do CC's "Fix D" (gap → 0/1) — kills the "six discrete cards" read.
- **Do NOT** do a full `AthleteCard` refactor if a contained strip-scaffold fix works.
- Card SIZE is settled (unified 80px height / results-referenced) — this is a width-tracking fix,
  not a resize.

### Tests
Add a gate that the inner card's rendered width equals its cell's rendered width (no overhang) —
the property that was divorced. Existing coupling tests (height === shared constant) stay green.

### Verify
`bash scripts/build-vercel.sh` + **full root `npm test`**. **Glass**: at 390/360/320 confirm no
overlap and no FP clip on **all three** surfaces (reveal, results, play), and #7 tap-to-flip still
works on the results strips. Push held.

### RD3 input (captured here so it's not lost)
During RD2 glass John flagged the reveal **score rail** (the gray box holding both FP totals + the
delta) as oversized / crowding the hero slots — "downsize that distracting gray box." The score
rail is **RD3's element** (RD3 rebuilds it for the running-score race), so this is logged as an
**RD3 requirement**, not RD2/RD2.1 scope: RD3 downsizes the rail box + lands the live
YOU/JOHN/diff race. Do not touch the rail in RD2.1.

## § RD5.1 — Decision-frame challenge landing + CTA copy system

**Thesis.** The landing makes an argument, not a stat readout: the headline starts the
argument, the stamp is the evidence, the CTA answers it. Replaced the number-forward
"JOHN SCORED 126.2 FP." Copy/frame only — no new mechanics.

**Surface.** Headlines are decision-framed and mechanic-native (HELD-verb vocabulary).
Stamp mirrors the in-game TierGauge vocabulary (no invented BIG SCORE / NEW RECORD). Hand
renders the real yellow-H hold glyph (lifted from CardFront). Target-to-beat line present.
CTAs are frame-aware.

**The four CTA emotions.** Every CTA is classified into exactly one:
- **Call-your-shot** — the decision-bias emotion (dares the same call).
- **Doubt-me** — challenges the result's validity.
- **Show-me** — demands proof.
- **Bring-it** — straight competitive throwdown.

**Decision-bias rule (per pool):**
- CHOKE (failure) — heavily decision-biased; Call-your-shot dominant.
- MISS (regret) — heavily decision-biased; Call-your-shot dominant.
- RESPECT (threat) — must AVOID decision-bias; **Call-your-shot count = 0 (hard invariant)**.
- DEFAULT (fallback) — minimal; Bring-it.

**Paired, never pooled.** Each headline carries its own tuned CTA — the headline→CTA
dialogue is the mechanism. No two headlines share a CTA string within a pool (swept
pairwise; RESPECT verified 0 duplicates at bc35e6a). CTAs are not drawn from a shared
pool at render.

**Emotion is DERIVED, not coded.** BankVariant carries voice / weight / named / stance /
key — there is no emotion column. CTA-emotion classification lives in THIS § (+ the
bank-export artifact), not in TS. Re-classifying a CTA's emotion is a doc edit, not code.

**Wiring invariants:**
- Named-line cap: NAMED_CAP_PROBABILITY = 0.20 (named lines ≤20% of selections).
- Voice prior (CHOKE + MISS): Sports Bar 70 / Analyst 25 / Copywriter 5.
- Stance prior (RESPECT): 70 respectful / 30 disrespectful.
- DEFAULT: flat weighted.
- Selection RNG: mulberry32 seeded off FNV-1a hash of challenge_id → deterministic
  per challenge.
- Each emitted variant logs an analytics key.
- Per-line integer weights (e.g. resp_r_scoreboard = w3).
- Pool sizes (lines): CHOKE 15 / MISS 10 / RESPECT 14 / DEFAULT 4.

**Cultural-copy lockout.** Player-cultural copy is LOCKED OUT of cold-recipient screens:
playerCulture.controversySafe ships empty; showCultureLine defaults false and the landing
shell never passes true. Applies uniformly to recipient AND replay views.

**Owner / replay paths.**
- True self-match (signed-in creator on own challenge): isSelfMatch
  (currentUserId === created_by) routes FIRST to SelfMatchView — share/leaderboard screen,
  no Accept flow, no bank copy.
- Replay (alreadyAttempted, browser-local localStorage flag, any viewer): take-card landing
  with CTA relabeled "Play Again"; all other elements identical to recipient.
- "N attempts" social-proof string: REMOVED in the v3 rewrite (attribution footer deleted).
  statsLine is computed by the shell but unread — retain/remove pending the social-proof
  follow-up.

**Open follow-ups (not RD5.1 scope):**
- Replay copy reads recipient-provocation at signed-out creators replaying their own hand
  (signed-in owners route to SelfMatchView). Auth-gap edge.
- Attempts social proof ("Unbeaten · 3 attempts", "67% failed") dropped with the footer —
  decide whether it returns (resolves the dead statsLine prop).

**Doc home.** This § is canonical for copy-system rules + invariants. The exhaustive
line-by-line bank lives in the dated bank-export artifact
(~/Desktop/replaymod-handoff/.../rd5-1-bank.md), regenerated on bank changes.
docs/challenge-copy-system-canonical.md is retired to a one-line pointer to this §.

## § RD3 — Kill the "Drawing…" beat, arm the rail (2026-06-11)

**Problem.** The ~2.4s window after the recipient taps Draw (a keep-and-draw = redraw in
code) was dead air. Three sites in `shared/components/H2HRecipientPlay.tsx` rendered the
literal string "Drawing…" — the top-zone headline (`:1534`), the disabled CTA label
(`:1567`), and the hero-region headline div (`:1342–1356`) — while the bottom strip ran
its column-by-column flip cascade. The reveal area showed empty space; the disabled
"Drawing…" button read as broken; the rail wasn't visible yet (rail mounts on `state.kind
=== "arc"` only, AFTER handoff_resolving completes).

**Treatment.** Three coordinated edits, composition-only.

1. **Kill the strings.** `deriveHeadline` returns `""` for `redraw_running`/
   `your_redraw_flip`; `deriveCta` folds those states into the existing
   `ab_transition | handoff_resolving | arc` hidden-CTA branch (`{ label: "", disabled:
   true, onClick: null }`). The reserved-bottom spacer stays (no layout jump); the button
   doesn't mount via the existing `ctaVisible = cta.label !== ""` gate.
2. **Mount an armed rail.** A slim YOU/JOHN/delta composition is overlaid on the right
   column of the playing hero region — `<ArmedRail/>`, defined inline in
   `H2HRecipientPlay.tsx` above `deriveHeadline`. Two `ScoreCell` instances (imported
   from `H2HScoreRail`) plus a MidRail-style delta float. ScoreCell internals are NOT
   modified; only composition around them.
3. **One continuous mount across the full pre-arc window.** The armed rail mounts on
   entry to `redraw_running` and stays mounted through `your_redraw_flip` →
   `ab_transition` (300ms) → `handoff_resolving` (1000ms). At `state.kind === "arc"`,
   `H2HRecipientReveal` mounts (`H2HRecipientPlay.tsx:1443`) and the arc surface owns
   the rail from there. One mount, one handoff, no appear→vanish→reappear.

**Armed values (the Option-B reconciliation).** Both cells render `displayTotal: 0`,
`state: "trailing"`, `sizeProgress: 0`, `surface: "reveal"`, `teamPosition: "opponent"`
(JOHN) or `"user"` (YOU). Delta floats at `0.0` with `DELTA_NEUTRAL` color and "MATCHUP"
eyebrow. **No leader-glow on either side** — green/leading on JOHN before any card is
revealed would misread as "John already won." JOHN's target is communicated by the
existing `"{X.X} to beat."` intro line above the hero, unchanged. The rail reads as a
scoreboard at 0-0 before tip-off.

**HARDENING 1 — redraw→arc no-snap (named test gate).** Armed last frame ===
arc revealing-first-frame ScoreCell state. Test: `H2HRecipientPlay.test.tsx` →
`"redraw→arc no-snap: armed ScoreCell DOM matches arc revealing-first-frame ScoreCell
DOM (HARDENING 1, named gate)"`. Compares load-bearing data attributes
(`data-h2h-team-score-display`, `data-h2h-score-state`, `data-h2h-score-size-progress`,
`data-h2h-score-rest-scale`, `data-h2h-score-pop-*`, `data-h2h-score-suppressed`) between
the armed rail's ScoreCells inside a real `H2HRecipientPlay` render at `redraw_running`
and a directly-mounted ScoreCell with the props H2HRevealScreen passes at
revealing-first-frame. ScoreCell is the SAME component on both surfaces — the no-snap is
structural, not coincidence.

**Note on phase=idle wording.** The first written-spec hardening said "armed last frame
=== arc IDLE first frame." Implementation note: `useH2HReveal.ts:1062` returns
`activeMatchup = { sender: null, recipient: null }` at idle, so
`H2HRevealScreen.tsx:1778` renders empty `<div />` placeholders for the ScoreCell slots
(not visible ScoreCells). The first frame at which the arc paints visible ScoreCells is
the first `revealing` tick (`skipEntrance: true` → play() goes idle → revealing directly
via `H2HRecipientReveal.tsx:172`). The named gate compares against that frame.

**HARDENING 2 — continuous mount (named test gate).** Same React DOM node throughout the
four pre-arc states (reference equality across `your_redraw_flip` →
`ab_transition` → `handoff_resolving`). Test: same file →
`"armed rail persists continuously across redraw_running → your_redraw_flip →
ab_transition → handoff_resolving (HARDENING 2)"`.

**Hero render before/after RD3.**
| State | Before RD3 | After RD3 |
| -- | -- | -- |
| `redraw_running` | Hero headline div: "Drawing…" at opacity 0.7. CTA: disabled, label "Drawing…". | Empty hero headline (`""`). CTA hidden via existing `ctaVisible = ""` gate. **Armed rail visible in right column.** |
| `your_redraw_flip` | Same as above (Drawing… everywhere) | Same as above. **Armed rail still visible (continuous mount).** |
| `ab_transition` | Two stacked empty hero slots (`data-h2h-play-settle-hero`), CTA hidden | Two stacked empty hero slots, CTA hidden. **Armed rail visible (continuous mount).** |
| `handoff_resolving` | Same as ab_transition (settle-pause) | Same as ab_transition. **Armed rail visible (continuous mount).** |
| `arc` | H2HRecipientReveal mounts, owns rail | H2HRecipientReveal mounts, owns rail. **Armed rail unmounts.** |

**Geometry.** `RIGHT_RAIL_WIDTH_PX = 80` UNCHANGED. `LEFT_RAIL_WIDTH_PX = 100` UNCHANGED.
RD3.1 (battlefield-backing panel downsize) decoupled from RD3 per the directive: armed
rail uses the existing 80px column constant via composition (`import { RIGHT_RAIL_WIDTH_PX,
ScoreCell, DELTA_NEUTRAL } from "./H2HScoreRail"`), so RD3.1's panel work can move
independently. `BATTLEFIELD_ROW_GAP_PX = 14` exported from `H2HRevealScreen.tsx` (one-line
surface widening, NOT a value change) so the armed rail's 2-row grid matches the arc
battlefield's row geometry — ScoreCells land at identical Y positions across the handoff.

**Fences (all upheld).**
- RD3.1 battlefield-backing panel (`data-h2h-reveal-score-panel`,
  `H2HRevealScreen.tsx:1733–1752`) — UNTOUCHED at RD3 ship time.
  **SUBSUMED by § RD6 (2026-06-12): the gray panel is deleted entirely;
  the score it backed lives in the box-corner ZoneHeader slot.**
- RD2 lock (`HAND_STRIP_HEIGHT_PX = 80` at `H2HRevealScreen.tsx:238`) — UNTOUCHED.
- Single-player `DRAWING_DWELL_MS` (`shared/hooks/useEmotionalReveal.ts:84`) — UNTOUCHED.
- FTUE coach bubble (`isFTUE && gameState === "DRAWING"`) — UNTOUCHED.
- `CardFront.tsx`, copy bank, `TierGauge.tsx`, RD5.1 landing — UNTOUCHED.
- Strip-grow animation — STAYS CANCELLED.

**ScoreCell internals.** UNTOUCHED. Composition only; the reveal→results no-snap chain
(`H2HScoreRail.tsx:151–156`, the locked invariant) is structurally intact — same
ScoreCell component renders on reveal, in the armed rail, and on the results overlay.

**Parked follow-up (Option C from the H1 reconciliation).** The user's mental model
("JOHN's fixed bar") doesn't match current arc behavior — JOHN's side rolls up
card-by-card via `senderRunningTotal` during revealing. RD3 chose Option B (armed at 0.0)
to avoid the snap; Option C (genuinely fix JOHN at target throughout reveal) would
require modifying `useH2HReveal`'s sender-side rollup, breaking the
`senderRunningTotal`-keyed leader-glow / Phase-2 pop / Phase-3 anchor frame contracts.
Out of RD3 scope; captured as a separate parked ticket.

**Glass URL.** `/basketball/dev/h2h-play-mock` — deal cascade auto-runs on mount; tap any
bottom-strip cell twice to hold, then tap Draw to drive into the redraw window. The
armed rail appears at the right edge of the hero region; persists through the column
flip, settle-pause, and into the arc handoff.

## § RD3-C — Fixed JOHN bar through reveal (shipped 2026-06-11)

**Status:** SHIPPED. Supersedes § RD3-C (PARKED). Commit `d53c951` on `feat/rd3-c-fixed-bar`.

### INTENT
JOHN's ScoreCell shows his final total (sender.totalFp) from idle through done — it does
NOT roll up from 0. YOU climbs per tap and chases a fixed mountain. This is the "doormat"
cure: the flat 0-0 armed beat from RD3 gains a visible target ("258.3 to beat") and the
reveal's drama relocates entirely to YOUR climb and the leader-glow flip as you cross JOHN.
No new mechanics. Scores on the emotional-competitive axis.

### CORE EDIT — JOHN stops moving (useH2HReveal.ts)
- `:616` init — seed senderRunningTotal at sender.totalFp (not 0), regardless of startIdle.
- `:784` rollup tick (was :777 pre-edit) — skip the sender setter. Recipient rolls; JOHN holds.
- `:803` rollup lock (was :793 pre-edit) — skip the sender setter. JOHN already at target.
- `:965` play() reset (was :939 pre-edit) — reset sender to sender.totalFp; recipient still → 0.
- `:617` recipient init / `:1050` skipToEnd — UNCHANGED.

### CONTRACT 1 — LEADER-GLOW (H2HRevealScreen.tsx:1468-1477) — NO CHANGE
The trigger is a pure value comparison (senderDisplayTotal > recipientDisplayTotal), not a
climb/delta. With the seed above, JOHN computes "leading" from the first idle frame; the
comparison fires each tick; when recipientRunningTotal crosses sender.totalFp, JOHN→trailing
and YOU→leading live. The idle tied-guard (both sides >0) is not met at idle (recipient=0),
so JOHN leads via the bare `>`. The crossing tied-window (|diff|<0.05) is a correct one-tick
transient. The hook seed is the ONLY edit; the glow-trigger logic is untouched.

### CONTRACT 2 — PHASE-2 POP (H2HRevealScreen.tsx:1524-1596) — DEFAULTS SHIPPED
(a) Scaled pop — keyed off the card's shakeType, NOT running-total deltas. JOHN's pop FIRES
    per matchup, sized by his per-card emotion; co-occurs with JOHN's card flipping face-up,
    so it punctuates "JOHN's leg landed," not a number tick. **Default: keep.** Kill is a
    one-line gate of `senderScaled→null` at `:1560` — reserved for glass if it reads as a twitch.
(b) Lead-change override — starting leader is JOHN, so the only reachable flip is
    sender→recipient: YOU gets the 1.20×300ms boost + "TAKES THE LEAD" tag when you cross.
    JOHN's regain-branch is unreachable (correct — he cannot move). First-flip null-guard
    suppresses a spurious set-1 flip. No change.

### CONTRACT 3 — PHASE-3 ANCHOR FRAME (H2HRevealScreen.tsx:1905-1928) — FIXED VIA CALL-SITE ADAPTER
`isFinalSetDecisive` (useH2HReveal.ts:215-247) computes `finalSetSwing` assuming BOTH sides
swing on the final card. Under C only recipient swings, so the predicate would mis-predict.
**Fix:** at the call site (`:1914`) pass `finalSenderActualFp: 0`, making
`finalGap = enteringGap + finalRecipientActualFp` — the true gap under a fixed JOHN. An
inline comment at `:1914` documents WHY it is 0. The matching adapter is also applied to the
internal anchor-hold-extension call site at `useH2HReveal.ts:~872` so both sites agree on the
C-mode interpretation. The helper body stays pure / sport-agnostic. A new C-mode test gate
covers the 9 `isFinalSetDecisive` cases in
`__tests__/useH2HReveal.test.tsx` (`describe "isFinalSetDecisive — RD3-C C-mode"`); the
default-mode 9-case block stays intact and passing.

### NO-SNAP A — REDRAW→ARC (H2HRecipientPlay.tsx:1567-1574) — COUPLED EDIT
Arc's first revealing frame puts JOHN at `displayTotal=sender.totalFp / leading / size=1`.
RD3's armed JOHN (`displayTotal=0 / trailing / size=0`) would snap at the handoff. Armed JOHN
now matches arc: `displayTotal=targetScore, state="leading", sizeProgress=1`. YOU's armed cell
UNCHANGED (`0 / trailing / 0`). "Neutrally" in the parked text resolved to "no flashy
animation," NOT grey-trailing — grey-trailing reintroduced a snap and is therefore disallowed
by the invariant. The RD3 redraw→arc no-snap gate's `arcHarness` expected values on the JOHN
side update accordingly.

### NO-SNAP B — REVEAL→RESULTS — structurally intact, gate added
Results overlay reads `sender.totalFp` directly (no `displayTotal`, no hook state); reveal's
done-frame `senderRunningTotal = sender.totalFp`. Same value, same state computation, both
surfaces share `ScoreCell`. New gate
(`H2HResultsOverlay.test.tsx` → `describe "RD3-C — reveal→results no-snap"`) asserts
reveal-done-frame ScoreCell data-attrs == overlay-mount-frame attrs under C, mirroring the
RD3 redraw→arc no-snap discipline.

### BAR SIZE — DEFAULT α (shipped)
`sizeProgress` uses `referenceTotal = max(sender.totalFp, recipient.totalFp)`.
- **α (DEFAULT, shipped, zero code):** JOHN's size = 1.0 while recipient < him; shrinks only
  once recipient exceeds him → clean scissors at the cross (YOU grow, JOHN yields). Honors
  "fixed bar" — the NUMBER never ticks; size is a separate relative-standing channel.
- **β (additive override, NOT shipped):** lock JOHN's `sizeProgress` to MAX regardless.
  "Immovable threat," but both cells near-max at the crossing — crowded. Reserved for glass.

### NET EMOTIONAL SHAPE
"Can YOU reach 258.3?" The threat is visible from the Draw tap and never ticks up to meet you
— a fixed high-water mark. Standard high-score / leaderboard mental model. Strictly more
tense than the RD3 0-0 doormat.

### GLASS DEFAULTS SHIPPED (John adjudicates on the live build)
1. Armed JOHN green-leading from entry — shipped (forced by no-snap).
2. Phase-2 scaled pop on JOHN — kept (default).
3. Bar size — α (default).

### ACCEPTANCE (verified at ship)
- JOHN's glyph shows target from first armed frame through results, never rolling from 0.
- YOU climbs per tap; delta closes toward the fixed bar; leader-glow flips live as YOU cross JOHN.
- redraw→arc no-snap holds (JOHN=target on both sides of the cut — RD3 gate updated).
- reveal→results no-snap holds (new gate in H2HResultsOverlay.test.tsx).
- Single-player reveal + FTUE untouched. RD3.1 panel + RD2 80px lock untouched.
- Full suite 1185/1185 + tri-sport build clean.

## § RD6 — Layout collapse: totals into box corners, glide deleted (shipped 2026-06-12)

**Status.** Spec-of-record. RD3.1 (battlefield-backing panel downsize) is SUBSUMED — the
gray panel is gone entirely; the score it backed now lives in the box-corner ZoneHeader
slot, not the right rail.

**Problem.** The H2H surfaces (reveal arc + recipient play + results overlay) carried a
separate right rail (`RIGHT_RAIL_WIDTH_PX = 80`) housing team-total ScoreCells, plus a
gray backing panel (`data-h2h-reveal-score-panel`), plus an `H2HScoreGlide` animation
that hand-offed the totals from rail → docked position on results mount. Three problems
piled up: (1) the rail consumed horizontal real estate that the box-corner area already
had idle; (2) the glide added a sub-second motion artifact at reveal→results that the
new "no-snap" gate exposed as redundant once both surfaces shared geometry; (3) the
"Target: X" copy was duplicated across surfaces with slight wording drift.

**The collapse.** Totals re-parented to the box corners via a new `ZoneHeader.score` slot
on `H2HBoardShell`. The right-rail ScoreCells, gray backing panel, and the entire
`H2HScoreGlide` component (mount + plumbing + dev mock route reference) DELETED. The
`suppressed` prop on `ScoreCell` retired (no surface needs to "hide" the cell now that
they live in stable corner slots). The user-hero/opponent-hero center grid is unchanged —
the no-snap geometry across reveal→results comes from corner-score parity, not the rail.

**Inner-edge ZoneHeader (RD6.1-b).** ZoneHeader rendered at the INNER box edges to put
the name+total band closest to the action: top box has the strip ABOVE the header (header
sits at the box's bottom inner edge), bottom box has the header ABOVE the strip (header
at the box's top inner edge). Applied to both the shell (reveal) and the overlay. Zero
vertical growth.

**Unified Target copy (RD6.1-c, RD6.1-c FIX-2).** A shared `TargetCornerScore({ scoreCell
})` helper renders "Target:" + the score in Mike's (top) box corner across reveal, play,
AND results — single source of copy truth. `CORNER_SCORE_MIN_WIDTH_PX` bumped 68 → 110 to
fit the label + score on tight viewports. Body-text target lines retired (Stage 2 "Draw
to beat X." → "Draw the rest when you're ready."; redraw-target line deleted entirely).
The target shows on `hold_select` / `loading` / `deal_in` / redraw states (the initial
RD6.1-c gated it through `showArmedRail`, which was over-restrictive — FIX-2 drops that
gate so Target: X is visible from pre-pick through the redraw window).

**Mike all-together fade-up (RD6.1-e).** Post-decision, Mike's top lineup fades up as a
SINGLE unit during the bottom cascade — no per-card stagger, no flip, no back face. New
`topStripVisible` gate; two separate transitions on the strip wrapper: `height 300ms`
expansion and `opacity + transform 2400ms ease-out` (chosen so the fade spans roughly the
bottom cascade's `6 × (250+150) = 2400ms` window). The opponent flip is permanently
killed per design-lock §1/§3.

**Mike's box height matches YOU's (RD6.1-f FIX 1).** RD6.1-c retired the redraw-target
body-text line but the stage-text wrapper still mounted at `INTRO_3LINE_BUDGET_CSS`
(~70px) during `your_redraw_flip`, leaving Mike's box ~74px taller than YOU's. A new
`stageTextHasContent` gate (covers `deal_in | hold_select | redraw_running`, NOT
`your_redraw_flip`) collapses the wrapper: `height` animates to 0 AND `marginBottom`
animates to `-ZONE_GAP_PX` to CANCEL the parent flex gap so the collapsed wrapper
contributes ZERO vertical space (gap + −gap = 0). Synchronized with RD6.1-e's 300ms top
strip expansion.

**Results overlay overflow trim (RD6.1-g).** The results-only verdict block + CTA + flavor
copy combined with the unchanged box-corner anchored elements made the overlay tall enough
to overflow common-phone viewports, engaging the `overflow-y: auto` scrollbar on the inner
column. Trimmed 88px from the column via priority 2 alone (verdict text middle is locked
inside hero row 1 which is locked to match the arc's user-hero Y; section margins above the
bottom strip are locked by the reveal→results no-snap):
- `RESERVED_BOTTOM_CLEARANCE_PX: 100 → 30` (saved 70px) — the 100 was sized for a stale
  layout where the LOSS_OPEN countdown was a SEPARATE pill above the CTA. #7 merged the
  countdown INSIDE the CTA button (absolute span); the reserved-bottom content is now just
  a single ~50px button, so 100px of reserve was obsolete.
- Reserved-bottom `paddingTop: 8 → 0` (saved 8px).
- Primary CTA button `padding: "15px" → "10px"` (saved 10px) — stays thumb-comfortable
  with 16px bold text.

Post-trim column content: ~716px (down from ~804px). Fits common-phone class (iPhone 14,
Pixel 6/7/8, Galaxy S22/S23) with address bar showing. The fringe-phone scrollbar (inner
column's `overflow-y: auto`) remains as fallback for iPhone SE / iPhone 13 mini and other
sub-700px usable viewports — deliberate, NOT a bug. Hero cards (`HERO_CARD_MAX_WIDTH`,
`HERO_ROW_HEIGHT_CSS`, `HERO_ROW_GAP_PX`) UNTOUCHED — the trim closed the overflow without
invoking step 4 (hero shrink), so reveal and results hero geometry is byte-identical.

**Contracts held.**
- Reveal→results no-snap (RD3-C invariant): ScoreCell DOM parity at the cross-surface
  handoff via `data-h2h-board-corner-score=top|bottom` + inner
  `data-h2h-team-score-position` — both surfaces share the corner wrapper.
  Test in `H2HResultsOverlay.test.tsx` extended with structural assertions that no
  ScoreCells exist OUTSIDE the box corners.
- Redraw→arc no-snap (RD3 HARDENING 1 + 2): preserved — RD6 changes do not touch the
  armed→arc handoff or the continuous mount across pre-arc states.
- Hero card geometry: identical on both surfaces (no step 4 invoked).

**Files.**
- `shared/components/H2HBoardShell.tsx` — added `ZoneHeader.score` slot, `topScore` /
  `bottomScore` shell props, exported `TargetCornerScore` helper, exported `ZONE_GAP_PX`,
  bumped `CORNER_SCORE_MIN_WIDTH_PX` 68 → 110, reordered ZoneHeader to inner edges.
- `shared/components/H2HRecipientPlay.tsx` — armed rail retired; `buildArmedTopScore` /
  `buildArmedBottomScore` helpers, `TargetCornerScore` wrap on top, `topStripVisible`
  gate + height/opacity transitions, `stageTextHasContent` gate + negative marginBottom.
- `shared/components/H2HRevealScreen.tsx` — gray panel + row-1/row-2 ScoreCells deleted;
  `TargetCornerScore` wrap on top.
- `shared/components/H2HRecipientReveal.tsx` — H2HScoreGlide import + mount + state
  deleted.
- `shared/components/H2HResultsOverlay.tsx` — right-rail ScoreCells deleted, docked-score
  re-parented to corner, `TargetCornerScore` wrap on top, RD6.1-g trims.
- `shared/components/H2HScoreRail.tsx` — `suppressed` prop + `data-h2h-score-suppressed`
  attr removed.
- `shared/components/H2HScoreGlide.tsx` — DELETED.
- `basketball/src/dev/H2HRevealMockRoute.tsx` — H2HScoreGlide import + state mirror +
  mount removed.
- `shared/components/__tests__/H2HRecipientPlay.test.tsx` — selectors re-pointed to
  box-corner attrs; redraw-target tests target-free; RD6.1-e test inverted to assert
  visible-and-fading.
- `shared/components/__tests__/H2HResultsOverlay.test.tsx` — reveal→results no-snap gate
  strengthened with structural assertions.

**Gate.** vitest 1185/1185 + tri-sport build (basketball + baseball + football) all green.

## § RD6-polish — corner-FP/header/results-fit/hero-gap pass (shipped 2026-06-12)

**Status.** Spec-of-record, sits on top of § RD6. One stacked branch
(`feat/rd6-polish-a`) carried five iterative changes that John glassed
on hardware between each. Tri-sport green at merge.

**What shipped (A → E).**

- **A — corner-FP constant size + left-aligned names.** The grow-with-score
  Z1 ramp on the box-corner ScoreCell was retired; the ScoreCell now renders
  at a fixed scale (`CONSTANT_REST_SCALE = 1.0`) and `fontSize: 20` on both
  surfaces. Leader-glow (green color + drop-shadow), tie-pulse, and the
  per-set scale POP (WAAPI transient) all preserved — the size grew was the
  only thing killed. ZoneHeader name labels flip from centered to LEFT-aligned
  with the score absolute-anchored to the right; long names ellipsis-truncate
  before the right reservation. Files: `H2HScoreRail.tsx`, `H2HBoardShell.tsx`,
  `H2HResultsOverlay.tsx`, `__tests__/H2HRecipientPlay.test.tsx` (rest-scale
  literal `"1.200"` → `"1.000"`), plus the challenge-landing CTA breathing
  room in `ChallengeTakeCardLanding.tsx`.

- **A2 — header content inset to mini-card-strip width.** The header band
  (name + corner FP) used to span the full ZonePanel content box, which at
  viewports above ~390 was wider than the centered mini-card strip below
  (the strip's cards have a natural 350.376px span). Header outer edges
  re-anchored to the card-strip span via `maxWidth:
  HAND_STRIP_CARD_CONTENT_WIDTH_PX` + `marginLeft/Right: auto` + `padding: 0`
  on the ZoneHeader, plus the corner-score wrapper's `right: 6 → 0`. New
  constant exported from `H2HRevealScreen.tsx`, consumed by both
  `H2HBoardShell.ZoneHeader` and `H2HResultsOverlay.ZoneHeader`.

- **C — results-fit hero shrink.** RD6.1-g claimed mainstream phones fit
  but John's actual iPhone still scrolled with the address bar visible.
  Step-1 contract-free trims (outer pad 20 → 8 on both surfaces; top-zone
  margin 18 → 10; hero margin 4 → 0; RESERVED_BOTTOM_CLEARANCE_PX 30 → 20)
  closed half the gap. The hero card geometry shrunk
  `min(145px, 32vw) → min(125px, 28vw)` in lockstep across FIVE sites
  (see PADDING MAP below). Hero card width drops ~14%, hero row height
  drops proportionally via the 478/329 aspect ratio.

- **D — symmetric hero gaps.** Top hero gap (panel pad-bot 8 + margin 10
  after C = 18) was visibly larger than bottom (margin 0 + panel pad-top
  8 = 8). The 10px asymmetry sat entirely on `TOP_ZONE_MARGIN_BOTTOM_PX`;
  dropped 10 → 0 to make both gaps an 8/8 symmetric pair from the
  ZonePanel paddings alone. Net results page reclaimed an additional 10px
  of headroom — strictly an improvement, no regression. Shared rule: the
  shell constant and the H2HResultsOverlay literal mirror both touched.

- **E — both gaps opened to 20/20, bottom panel relocated down.** D's 8/8
  read as "touching" on real hardware. Both hero gaps opened to 20px each
  (panel pad 8 + margin 12) by setting `TOP_ZONE_MARGIN_BOTTOM_PX` and
  `HERO_MARGIN_BOTTOM_PX` to 12 each. Paid for by trimming away-from-hero
  chrome: outer safe-area pad 8 → 4 (both surfaces), top panel `paddingTop`
  8 → 4 (per-instance override), bottom panel `paddingBottom` 8 → 4
  (per-instance override). Net +12px on the results stack, eats 8 of the
  12 auto-margin slack at 430-viewport, preserves min CTA clearance ≥ 24.
  The bottom-panel-of-the-stack ZonePanel relocates down naturally into
  what was auto-margin space — TOP panel stays anchored.

Also folded in: the **operator glass procedure** appended to `CLAUDE.md`
under `## Glassing locally (operator / John side)` — a small lesson learned
when a session glassed the wrong worktree because Vite from a different
`cwd` was holding port 5173. Port is not proof of branch; cwd is.

**FRAGILITY — record before someone breaks it.** Hero-size parity across
reveal↔results is guarded ONLY by:
1. The reveal→results no-snap gate (`H2HResultsOverlay.test.tsx:908`)
   — which checks ScoreCell DOM data-attrs, NOT hero card dimensions.
2. Five literally-identical `"min(125px, 28vw)"` strings across the
   codebase (see PADDING MAP).

There is **NO dedicated hero-parity test**. Editing any one of the five
strings without the others will silently desync hero card size across the
reveal→results crossfade, producing a visible snap that NEITHER the
no-snap gate nor the build will catch. If you touch hero geometry, treat
the five sites as a single atomic edit.

**KNOWN CEILINGS — accepted soft spots.**
- **430px viewport (iPhone 14/15 Pro Max).** Results content totals
  exactly 700px at 0px headroom. Shipping accepted as a known soft spot.
  If a real device reports a real scroll (e.g. iOS 26+ tab-bar mode where
  usable height dips below 700), reactive fix path is the bottom-side
  reclaim levers — drop `RESERVED_BOTTOM_CLEARANCE_PX` (currently 20) or
  outer pad (currently 4) by a couple px. Don't grow the hero gap budget
  to "fix" 430; the 20/20 hero rhythm is the contract.
- **480px viewport (inner-column maxWidth cap).** Results is ~13px over
  the 700 target. NOT a mainstream phone — tablet portrait / foldable
  unfolded / desktop emulator territory. Documented as a non-goal.

**PADDING MAP — which knobs do what, so the next person doesn't guess.**

Hero-gap CONTRIBUTORS (these are the gap; do NOT touch without intent):
- `ZonePanel.padding-bottom` (top panel, hero-side edge): default 8px.
  Contributes to TOP hero gap.
- `ZonePanel.padding-top` (bottom panel, hero-side edge): default 8px.
  Contributes to BOTTOM hero gap.
- `TOP_ZONE_MARGIN_BOTTOM_PX = 12` in `H2HBoardShell.tsx`.
  Mirrored as `marginBottom: 12` LITERAL in `H2HResultsOverlay.tsx`
  on the opponent ZonePanel. Any change MUST touch both.
- `HERO_MARGIN_BOTTOM_PX = 12` in `H2HBoardShell.tsx`.
  Mirrored as `marginBottom: 12` LITERAL in `H2HResultsOverlay.tsx`
  on the hero region div. Any change MUST touch both.
- Effective hero gap = panel-pad (8) + margin (12) = **20px on both sides**.

Strip-side / chrome paddings (NOT hero-gap; safe to tune within reason):
- Top panel `paddingTop: 4` (per-instance override) — between viewport top
  and the opponent strip's first card.
- Bottom panel `paddingBottom: 4` (per-instance override) — between user
  strip's last card and the bottom panel edge.
- Outer shell `paddingTop` / `paddingBottom`: `env(safe-area-inset-*) + 4`
  on BOTH `H2HBoardShell` and `H2HResultsOverlay`.

CTA-clearance contributors:
- `RESERVED_BOTTOM_CLEARANCE_PX = 20` in `H2HResultsOverlay.tsx`
  (overlay-only; the floor for gap-above-CTA when slack runs out).
- Reserved-bottom wrapper auto-margin (variable; eats remaining slack).

Hero CARD-WIDTH (THE FIVE LOCKSTEP STRINGS — see FRAGILITY):
1. `HERO_MIN_HEIGHT_CSS` in `H2HBoardShell.tsx`
2. `HERO_MIN_HEIGHT_HOLD_SELECT_CSS` in `H2HBoardShell.tsx`
3. `BATTLEFIELD_CARD_MAX_WIDTH` in `H2HRevealScreen.tsx`
4. `HERO_CARD_MAX_WIDTH` in `H2HResultsOverlay.tsx`
5. `previewCardWidthCss` in `H2HRecipientPlay.tsx`

All five hold `"min(125px, 28vw)"` post-RD6-polish. Edit as a single atomic
change or hero parity breaks silently.

**Files.**
- `shared/components/H2HScoreRail.tsx` — `CONSTANT_REST_SCALE = 1.0`,
  fontSize 22 → 20, `state` prop doc updated.
- `shared/components/H2HBoardShell.tsx` — `HAND_STRIP_CARD_CONTENT_WIDTH_PX`
  imported, ZoneHeader inset to card-strip span, `TOP_ZONE_MARGIN_BOTTOM_PX`
  / `HERO_MARGIN_BOTTOM_PX` to 12, hero size shrink, outer pad 8 → 4,
  per-instance panel padding overrides.
- `shared/components/H2HResultsOverlay.tsx` — same ZoneHeader inset,
  `HERO_CARD_MAX_WIDTH` shrunk, `RESERVED_BOTTOM_CLEARANCE_PX: 30 → 20`,
  outer pad 8 → 4, hardcoded margin literals matched to constants,
  per-instance panel padding overrides.
- `shared/components/H2HRevealScreen.tsx` — `HAND_STRIP_CARD_CONTENT_WIDTH_PX`
  exported, `BATTLEFIELD_CARD_MAX_WIDTH` shrunk.
- `shared/components/H2HRecipientPlay.tsx` — `previewCardWidthCss` shrunk.
- `shared/components/ChallengeTakeCardLanding.tsx` — CTA `marginTop: 12`.
- `shared/components/__tests__/H2HRecipientPlay.test.tsx` — rest-scale
  literal `"1.200"` → `"1.000"`.
- `CLAUDE.md` — `## Glassing locally (operator / John side)`.

**Gate.** vitest 1185/1185 + tri-sport build (basketball + baseball +
football) all green at merge.

## § RD6.2 — H2H connection moment (shipped 2026-06-13)

The per-set "connection moment": as each matchup resolves, the delta
reacts, both totals blink in sync, and a right-column rail narrates
reaction-then-stakes. Full per-decision spec lives in
`docs/rd6.2-connection-spec.md`; this is the canonical fold.

### Delta beef-up (`MidRailContent` in H2HRevealScreen.tsx)
- Per-set: `Gained X.X FP` (green `WINNING_COLOR`) / `Lost X.X FP` (red
  `LOSING_COLOR` `#EF4444`) / `Even` (neutral `DELTA_NEUTRAL`), rendered
  at the team-total FP size (`SCORE_CELL_FONT_SIZE_PX`, single source of
  truth in H2HScoreRail).
- FINAL verdict inherits the per-set treatment but with terminal copy:
  `Won X.X FP` / `Lost X.X FP` / `Even`, held ~1.5s. The per-set "flash"
  is suppressed on FINAL (reuses `flashKey: "final"` → no remount).

### Right-column narrative rail (`RightColumnRail`)
- Reaction-then-stakes, sequenced: every set shows the per-set DELTA;
  ONCE before the final card the slot crossfades to the GAP layer
  `LAST CARD / Need: +X.X` (overtake→Need green, hold→Hold amber,
  tie→TIED). Fires on EVERY game incl. blowouts (consistent closing
  beat; absence previously leaked that the arc was decided). The need
  value is the literal final-set framing even when unreachable.
- The legacy Phase-3 AnchorFrame center overlay (covered the
  battlefield) is RETIRED — its "next opponent + need" data moved into
  this rail's gap layer. `isFinalSetDecisive` stays exported (sealed/
  blowout detector) but no longer gates any UI. Test guard added:
  "does NOT render the legacy AnchorFrame center overlay."

### Synchronized dual-blink (`ScoreCell.blink` in H2HScoreRail.tsx)
- Both corner totals opacity-blink (1.0 → `BLINK_FLOOR` 0.35 → 1.0) in
  sync on each set resolution, keyed to `popState.deltaLandedKey` so
  blink+blink+delta land on one render commit / one frame. Blink on the
  FINAL set is intentional (kept).
- **DON'T-BREAK:** keyed to `deltaLandedKey`; **OPACITY ONLY** (scale
  would collide with the existing per-set scale-pop on the inner glyph);
  must REST at opacity 1.0 (`fill: "none"`) — that resting-1.0 invariant
  is the reveal→results no-snap guard for the shared ScoreCell.

### Delta vertical anchor — MEASURED, glyph-to-glyph, relative apply
(`useLayoutEffect` in H2HRevealScreen.tsx)
- The delta GLYPH (`[data-h2h-mid-rail-flash]`) is centered on the
  midpoint of the two team-total GLYPHS' rendered centers. Totals are
  measured at their tight number element (`data-h2h-team-score-glyph`,
  on the ScoreCell inner div), NOT the ScoreCell box (inflated by the
  ZoneHeader band / "Target:" label chrome).
- Apply is RELATIVE and coordinate-independent:
  `newTop = currentAppliedTop + (midpoint − glyphCenterNow)`, run in a
  bounded rAF settle loop (≤6 frames, stop <0.5px). `offsetParent` is
  used only to bootstrap the first placement.
- **DON'T-BREAK:** never reintroduce a magic px translateY literal
  (six failed nudge rounds: +6 → +51 → …); never convert viewport→top
  via `offsetParent` — a transformed-but-static iOS ancestor becomes the
  CSS containing block while `offsetParent` ignores it, skewing the
  applied top (that was the multi-round "delta reads high on phone"
  bug). The relative apply sidesteps it entirely.

### KNOWN EDGES (documented, accepted — NOT bugs)
- **Desktop/wide layout:** delta centering can read slightly off on
  desktop (no transformed ancestor there to exercise the relative path's
  benefit, and desktop is not the product target). Phone is the product.
  Revisit only if a desktop layout ever ships.
- **Need-line horizontal overflow:** need values >~50 (e.g. `Need: +60.6`)
  exceed the 80px right-rail slot and overflow LEFTWARD into empty rail
  space — renders clean, no clip guard. Add a guard only if a future
  layout actually clips it.

### Touched (shared — affects all three sports)
- `H2HRevealScreen.tsx` — delta beef-up, right-column rail, AnchorFrame
  retirement, measured glyph-anchored delta centering.
- `H2HScoreRail.tsx` — dual-blink primitive, `data-h2h-team-score-glyph`,
  constant rest-scale, `SCORE_CELL_FONT_SIZE_PX` source of truth.
- `H2HResultsOverlay.tsx` — "Tap a card to see the game logs" hint copy
  + board-center for the empty hint/dashed slot; delta beef-up parity.
- `H2HRecipientReveal.tsx`, `useH2HReveal.ts` — `deltaRunning` rollup +
  `deltaLandedKey` wiring.

**Gate.** vitest (incl. both no-snap gates) + tri-sport build
(basketball + baseball + football) all green at merge.

## § RD7.1 — Global Challenge Header (shipped 2026-06-13)

A brand band that frames the challenge on entry. Full spec:
`docs/rd7.1-header-spec.md`; this is the canonical fold.

### What it is
An in-flow REPLAY IFS brand lockup at the top of the 5 RECIPIENT challenge
screens — Hold, Challenge intro, Draw, Reveal, Results. Single horizontal
row, left-aligned, premium-but-quiet (must not out-shout the Hold
instruction card or the Results connection moment).
- Logo: `REPLAY` white `#EAF0FF` + `IFS` brand orange `#FFB14A`, both 24px,
  baseline-aligned (canonical inline treatment from `AppHeader.tsx:90-91`;
  there is no shared `<Logo>` component — `#FFB14A` is the established
  inline brand-orange token, reused, no new hex).
- Tagline (two rows, UNIFORM all-caps, color-ONLY emphasis): `THE STARS
  PLAYED` / `YOUR TURN`, every word 13.5px / 700 / 0.14em; `STARS` & `TURN`
  orange, the rest soft grey. No periods. (The words are the canon line;
  only presentation differs — do not "correct" to sentence form.)
- Faint gold hairline divider beneath (~1px, peak opacity 0.18).
- Shared left rail: header `paddingLeft 13px` (= ZonePanel border 1 +
  paddingLeft 12) so its text aligns to the card/strip left edge.
- Header height 61px.

### Mounting — recipient flow only (3 surfaces), opt-in prop
The 5 screens span THREE surfaces, all under `H2HRecipientPlay` (landing,
`ChallengeLandingScreen`, is a sibling that shares none of them):
- `H2HRecipientPlay` → its `H2HBoardShell` (Hold / intro / Draw)
- `H2HRecipientReveal` → `H2HRevealScreen` → its own `H2HBoardShell` (Reveal)
- `H2HRecipientReveal` → `H2HResultsOverlay` (own fixed container 9100; NOT
  an H2HBoardShell consumer) (Results)
One shared `GlobalChallengeHeader` component, threaded via an opt-in
`globalHeader?: ReactNode` prop on `H2HBoardShell` / `H2HRevealScreen` /
`H2HResultsOverlay`, set ONLY by `H2HRecipientPlay` + `H2HRecipientReveal`.
Sender reveal and dev mock routes omit the prop → no leak.

### DON'T-BREAK (binding)
1. Shift via NORMAL FLOW — never a transform on any ancestor of the delta
   glyph / score cells (a transformed iOS containing block reintroduces the
   RD6.2 delta-centering bug). The header is a plain in-flow element.
   Verified: delta still centers −0.01px on phone with the header present.
2. Framework frozen — header is the only added element + the optional prop;
   mini-slots / reveal / battle / results structure unchanged.
3. No landing leak — recipient-flow-only mounting; `ChallengeLandingScreen`
   never renders it.
4. No-snap invariant — the header height is IDENTICAL on Reveal and Results
   (61px == 61px), so the equal downward shift preserves the reveal→results
   no-snap.

### KNOWN EDGE (documented, accepted)
Load-bearing: the 61px header is the most likely lever to push Results past
the Pro Max fold. If it scrolls, the parked lever is RESERVED 24→20 or a
hero-gap trim — do not chase elsewhere.

### Touched (shared)
- NEW `GlobalChallengeHeader.tsx`.
- `H2HBoardShell.tsx`, `H2HRevealScreen.tsx`, `H2HResultsOverlay.tsx` —
  `globalHeader` prop + render as first child of the inner column.
- `H2HRecipientPlay.tsx`, `H2HRecipientReveal.tsx` — pass the header.

**Gate.** vitest (incl. both no-snap gates) + tri-sport build
(basketball + baseball + football) all green at merge.

---

## § RD7.5 — Challenge header banner + results-screen declutter (ITERATION — held for phone glass 2026-06-14)

**Status:** built on the INTEGRATED RD7.2 (Resolution Engine wiring) + RD7.3
(false-read-retire copy) + RD7.4 (verdict-fit minmax grid) work — none of
which is on main yet (all were held-for-glass; assembled uncommitted into the
`feat/rd7-5-results-declutter` worktree per John's 2026-06-14 base decision).
RD7.5 is therefore NOT independently mergeable; it lands as/after the RD7.2–7.4
stack. Commit boundaries tracked per-ticket (see worktree-registry entry).

**Problem.** The results screen was overloaded and still scrolled at phone
width (header rode off-screen, confirmed on device) — the inner column
(`overflowY:auto`, height = the `position:fixed; inset:0` container ≈ the
LARGE viewport) overflows the small viewport when the URL bar is showing.

### Four coordinated moves (LOCKED for this iteration; visual tuning glass-pending)

**Move 1 — header banner (all 5 challenge screens).** `GlobalChallengeHeader`
gets a show-package background fill so it reads as its own zone, distinct from
the body. One component → all 5 screens (Hold / intro / Draw / Reveal /
Results). Treatment: a subtle top-down wash — faint brand-orange hint blending
into a neutral elevation, fading to transparent before the existing gold
hairline.
- INVARIANT (RD7.1): BACKGROUND FILL ONLY. No transform, no box-model change →
  ZERO added height. Verified: header measured 61px (unchanged); the edit adds
  only `background:` (no padding/border/margin touched). No-snap + RD6.2
  delta-centering intact (reveal delta residual 0px @390/430).

**Move 2 — verdict consolidates to ONE line.** The big RED outcome headline
(`data-h2h-overlay-headline`, "YOU LOST TO {full name}") AND the signed FP-hero
number (`data-h2h-overlay-fphero`) are REMOVED. The single surviving verdict is
the RD7.2 engine explanation line (`data-h2h-overlay-resolution`), which already
LEADS WITH THE MARGIN ("Down 10.9 — …" / "Up 14.2 — …" / "A 28-pt beatdown …").
- Kills the double-name (the opponent was named in a giant headline AND shown
  as a hero card) and the source of the verdict-over-cards overflow.
- `selectHeadline` / `formatFpHero` / `selectOutcomeColor` stay exported +
  unit-tested; only their RENDER is retired.
- Win/loss color cue kept cheaply: the single line is tinted with
  `headlineColor` (= `selectOutcomeColor(delta)`: loss red `#EF4444`, win green,
  tie amber `#FFB14A`). Engine lines read win/loss legibly without the headline
  (directional lead + the tint); no ambiguous case found.
- Fallback intact: `{explanation ?? resolutionLine}` — non-explanation
  consumers (e.g. baseball, no pool-stats provider) fall back to the legacy
  `selectChallengeResolution` flavor line. (That fallback does not lead with
  the margin — acceptable graceful degradation; basketball is wired.)
- GLASS-PENDING tuning: tint intensity (full outcome-color vs softened) and the
  line's size/weight (currently 16px / 600).

**Move 3 — log-inspection prompt moves INTO the dotted box.** The empty-state
prompt (was "Tap a card to see the game logs", floating ABOVE the empty hero
box) now renders INSIDE the dashed card-outline box (centered), shortened to
"tap a card to see game logs" — making the box self-explanatory. Absolute
inset-0 inside the (relative) box → no effect on the locked hero/strip
geometry; shares the box's existing empty-only translateX centering (no NEW
transform). The occupied-front flip hint ("Tap again — game logs are on the
back") is unchanged.

**Move 4 — reclaim space → fix the scroll.** The verdict-row (grid row 1) floor
drops from `HERO_ROW_HEIGHT_CSS` (~158px, a holdover from when row 1 held the
opponent hero) to `VERDICT_ROW_MIN_PX = 72` — `minmax(72px, auto)`. The
one-line verdict (Move 2) no longer needs a hero-card-height band; the reclaimed
~86px pulls the hero / strip / CTA UP so the screen fits with the URL bar
showing. `minmax(…, auto)` keeps RD7.4's anti-overflow growth (a worst-case
2–3-line engine line grows the row, never spills). ROW 2 (user hero card) stays
a full `HERO_ROW_HEIGHT_CSS` track; no-jump hero X/Y preserved.
- Measured min-content (the scroll threshold — below this the inner column
  scrolls): worst-case **654px @390, 670px @430** — both comfortably under the
  URL-bar-showing small-viewport budgets (~745 / ~815), 90–145px margin. Header
  visible, no scroll, no verdict↔hero / verdict↔TARGET overlap at every height
  tested (390×745, 430×815, 390×844).
- The parked lever (RESERVED 24→20 / hero-gap trim) was NOT needed — RESERVED
  stays 20. GLASS-PENDING tuning: `VERDICT_ROW_MIN_PX` (72) is the band height.

### INVARIANTS FENCED (no transforms introduced anywhere in RD7.5)
- RD6.2 delta centering — reveal delta residual 0px @390/430 (Move 1 is
  background-only; nothing touches the delta-glyph / score-cell ancestry).
- RD7.1 header — constant 61px height across all 5 screens (background-only).
- RD7.4 — `minmax(floor, auto)` growth retained; only the floor value changed.

### Touched (per-ticket commit boundaries for the eventual split)
- RD7.5: `GlobalChallengeHeader.tsx` (banner fill); `H2HResultsOverlay.tsx`
  (verdict → one tinted line, `VERDICT_ROW_MIN_PX`, empty-hint into the box);
  `__tests__/H2HResultsOverlay.test.tsx` (one-line-verdict assertions);
  this doc.
- (carried, NOT RD7.5: RD7.2 `shared/explanation/*` + pool-stats + wiring;
  RD7.3 `chadChallenge.ts` + `selectCommentary.ts`; RD7.4 the `minmax` line.)

**Gate (this iteration).** Full vitest (1199 passed) + `npm --prefix basketball
run build` green. Tri-sport build deferred to merge authorization (held).

---

## § RD7.6 — Results outcome dopamine moment (win/loss asymmetric) + header separation (ITERATION — held for phone glass 2026-06-14)

**Status:** continues on the integrated `feat/rd7-5-results-declutter` tree;
tracked as RD7.6 for commit-splitting at merge (same files as RD7.5, additive).

**Problem.** Post-RD7.5 the results screen was honest + legible but emotionally
DEAD — a single 350ms overlay crossfade, a static score. No "I won / I lost"
beat. The recon (RD7.6-recon) found ScoreCell already carries count-up
(`displayTotal`) + scale-`pop` primitives gated behind props the overlay never
passed.

**The beat — fire existing animation, win/loss ASYMMETRIC, ZERO height.**
- **Anticipation (identical win & loss):** the user's score counts up 0→final
  over `RD76_COUNT_UP_MS = 1200`, cubic ease-out (decelerating into the number).
  Driven by an isolated `AnimatedUserScore` component (RAF → `ScoreCell
  displayTotal`); re-render stays off the big overlay tree. Mike's target is
  static (the known bar).
- **Resolution fork:** WIN (`recipientState==="leading"`) → ScoreCell scale-pop
  (`pop` magnitude 1.18 / 520ms, the existing WAAPI) + a contained `OutcomeBurst`
  (ignite ring + 10 sparks in the win color, adapted from GameBar CoinBurst —
  absolute, `pointerEvents:none`, zero layout height). LOSS (`"trailing"`) → NO
  pop / NO burst / NO ignite; a small transient downward sag (WAAPI translateY,
  `fill:"none"`) — the OPPOSITE vector, the absence of celebration IS the
  feeling. TIE → neutral land.
- **Stagger:** the honest explanation line (`data-h2h-overlay-resolution`) fades
  + rises in `RD76_COUNT_UP_MS + 200ms` after entrance (opacity/transform on the
  leaf line — no reflow), so the OUTCOME owns the eye first, then the "why".
  Cards stay as static reference (the score's motion creates the hierarchy
  without dimming anything).

**HONESTY (fenced).** The win erupts on the NUMBER / the win only — no skill,
tier, genius, or braggy copy. The words stay the engine's honest line. The
burst over a variance win is fine (the win is real); no "MVP/genius" framing.

**ZERO HEIGHT (verified).** min-content worst-case unchanged at 654px @390 /
670px @430 (= RD7.5 baseline). During a live WIN burst at URL-bar-showing
heights (390×745, 430×815) the inner column does NOT scroll (737/737, 807/807)
and the header stays visible — the burst's absolute particles don't expand the
scroll area.

**NO-SNAP (RD3-C) preserved.** The count-up does NOT synchronously paint 0: the
overlay MOUNT frame shows the final total (matching the reveal's landed score
behind the crossfade); the RAF's first frame drops to ~0 and climbs, hidden
under the low crossfade opacity. The RD3-C cross-surface parity test stays
green. GLASS-WATCH: if the climb ghosts against the reveal's final number during
the 350ms crossfade on a real phone, the mitigation is to delay the count-up
start past the crossfade (noted, not applied).

**Reduced motion.** `prefers-reduced-motion` → no count-up / pop / burst /
stagger; final number + explanation shown immediately.

**Header separation (parallel, all 5 screens).** RD7.5's banner wash was too
soft (read as the same surface as the instruction card). RD7.6 strengthens it:
a firmer warm top + a faint DARK FOOT in the fill that recesses the band edge,
and a firmer gold divider (~34% peak, was ~18%) with a 1px dark under-shadow for
a crisp bottom edge. Background/divider only — ZERO added height (min-content
unchanged), no transform.

### Touched (RD7.6 additions, same files as RD7.5)
- `H2HResultsOverlay.tsx` — `AnimatedUserScore` + `OutcomeBurst` components,
  beat constants, `useRef` import, explanation stagger, user ScoreCell now
  count-up-wired.
- `GlobalChallengeHeader.tsx` — stronger banner fill + firmer divider.

**Gate.** Full vitest (1199 passed) + basketball build green. Tri-sport held.
Glass-pending tuning: count-up duration (1200ms), pop magnitude, burst density/
color, sag depth, banner contrast.

---

## § RD7.7 — Results resolution celebration: full-screen win eruption + loss sting (ITERATION — held for phone glass 2026-06-15)

**Status:** continues on the integrated `feat/rd7-5-results-declutter` tree;
tracked as RD7.7 for commit-split. REPLACES the RD7.6 in-place burst (tested too
subtle) with a full-screen transient celebration.

**Philosophy.** The resolution moment is the ONE place the app abandons
restraint — everywhere else stays quiet/honest. At win/loss: GO LOUD (full-
screen, transient), then clear to the clean honest screen. Honesty binds the
WORDS only (no skill/genius/MVP/tier framing — there are NO words in the
celebration; the engine line stays the only text); VOLUME / MOTION / screen
takeover are GOALS. Model: a slot machine — maximally exciting, claims zero
skill.

**Architecture (fenced).** The celebration is a TRUE OVERLAY: `position:fixed`,
its own top stacking layer (`zIndex` ~2.1e9), `pointer-events:none`, painted
OVER the whole results screen. It animates ITSELF and self-clears after
`RD77_CELEBRATION_MS` (1400ms), revealing the untouched results screen. It
NEVER wraps/scales/transforms the results content (a transformed ancestor of
the delta glyph / score cells would reintroduce RD6.2 + RD7.1) — being OUT OF
FLOW is how it goes big AND stays fit-safe. Rendered as a child of the overlay
root (sibling of the inner column), gated by `{celebration && …}`; the parent
fires it at the count-up's end (`RD76_COUNT_UP_MS`).

**WIN = RELEASE (expand / bright / loud).** Full-screen bright radial flash
(`screen` blend) + an expanding ignite ring (44vmin → 3.6×) + 22 sparks
radiating to the edges (vmin units, re-randomized per fire). The score SLAMS
(ScoreCell `pop` magnitude 1.42 — a transient WAAPI on the cell itself, allowed)
and lands in the win color. Fast attack, brief linger, clears. Bigger/brighter
than the solo tier-slam.

**LOSS = COLLAPSE (contract / cold / heavy) — opposite in KIND.** A desaturate +
darken backdrop sweep over the whole screen (`backdrop-filter: grayscale(.9)
brightness(.5)` + a cold dark tint) ramped in then out, plus a downward heavy
vignette settle. The score sags cold (heavier downward WAAPI). Slow, still — the
absence of celebration is the feeling. Structurally opposite to the win, not a
dimmer win.

**TIE = nothing.** prefers-reduced-motion → no celebration (settle straight to
the clean resolved screen). The count-up anticipation + explanation stagger
(RD7.6) are retained.

**Verified (real browser):** celebration fires `data-h2h-resolution-celebration
="win"|"loss"` as `position:fixed`; results inner column `transform: none`
DURING and AFTER (never transformed); celebration `none` after ~3.2s; resting
min-content unchanged at 654/670 (no scroll before/during/after — zero height).
Win @430 + loss @390 both captured.

**Header — now a genuinely different surface (all 5 screens).** RD7.5/7.6 only
tweaked the same translucent wash's contrast (read as "a light orange hue", not
separated). RD7.7 makes the header its own PLANE: a near-opaque, distinctly
LIGHTER slate band (body ≈ #070A12; band ≈ rgb(20–28,24–33,36–48) @0.94) with a
faint warm top sheen, a real bottom EDGE (firmer gold divider), and a DROP
SHADOW cast onto the body (`0 8px 16px -6px rgba(0,0,0,0.66)`). Background +
shadow only — ZERO added height (min-content unchanged), no transform.

**BUG FIX — clipped "need" reminder.** `H2HRevealScreen.tsx:1337` rendered the
penultimate-card stake line ("Need: +X.X") at `SCORE_CELL_FONT_SIZE_PX` (=20px)
inside the `RIGHT_RAIL_WIDTH_PX` (80px) float — so it overflowed the rail and
was cut off. The RD6.2-C-rev3 comment intended 12px (it mis-stated the
constant's value). Fixed to `fontSize: 12` + `letterSpacing: 0` → "Need: +X.X"
(~60px) fits the ~72px content width. (The bare per-set delta "+X.X" fit at 20px;
the "Need: " prefix is what overflowed.)

### Touched (RD7.7)
- `H2HResultsOverlay.tsx` — `ResolutionCelebration` (full-screen overlay) +
  keyframes replace `OutcomeBurst`; bigger win slam / heavier loss sag in
  `AnimatedUserScore`; parent `outcomeKind` + `celebration` state fires it.
- `GlobalChallengeHeader.tsx` — header as a separate slate plane + drop shadow.
- `H2HRevealScreen.tsx` — need-line clip fix (20→12px).

**Gate.** Full vitest (1199 passed; RD3-C no-snap + verdict green) + basketball
build green. Tri-sport held. Glass-pending tuning: celebration intensity/
duration, slate-band darkness, spark count.

---

## § RD7.8 — Suspense before the reveal (the missing dopamine mechanic) (ITERATION — held for phone glass 2026-06-15)

**Status:** continues on the integrated `feat/rd7-5-results-declutter` tree;
tracked as RD7.8.

**Diagnosis / reframe.** The RD7.7 celebration wasn't too weak — the RESULT WAS
KNOWN BEFORE IT FIRED, so it decorated a foregone conclusion. The RD7.6 decision
"count up to your OWN total independently (Mike's target static)" removed the
only suspense — you could watch your climb cross the static bar. Dopamine lives
in the ~1s of UNCERTAINTY before the reveal, not in the celebration. This ticket
adds the HELD BREATH (no new particles/flashes/intensity — the celebration is
already good; it just needed a brain that didn't know yet).

**THE ONE MECHANIC — margin-resolving suspense window.** Replace "score appears
→ celebration" with UNCERTAINTY → REVEAL → (unchanged RD7.7) celebration:
1. **Suspense (`RD78_SUSPENSE_MS` = 1000ms):** on entrance the result is NOT
   legible. BOTH score cells "reel" — `displayTotal` churns around a shared
   centre (refreshed every `RD78_REEL_TICK_MS` = 55ms so it reads as digits, not
   a blur) — and both are held in a NEUTRAL `state="tied"` so no leading/trailing
   colour leaks the winner. The `MarginHero` (a fixed, centred, pointer-events:
   none overlay — zero layout) shows the MARGIN rolling with its SIGN HIDDEN
   (verified: a win shows "−3.4 / −6.8" mid-suspense). The brain runs the
   comparison and genuinely doesn't know.
2. **The reveal (lock at ~1s):** the reel clears (cells snap to finals + their
   real leading/trailing colour), the margin hero LOCKS to its final signed value
   (the SIGN locking IS the reveal), and the EXISTING RD7.7 fork fires
   (`revealNonce` → the score slam/sag; `celebration` → the full-screen
   eruption/sting — UNCHANGED). The margin hero plays its reveal beat (WIN:
   emphatic scale-up; LOSS: cold drop) then fades. Explanation line staggers in
   after.
3. The MARGIN is the visual hero (humans feel "+3.2 / −1.8 / +40", not "212" —
   apt for a head-to-head comparison).

**Invariants (held).** No transform/reflow of the results content — the reel is
just `displayTotal` text on the existing cells; the margin hero + celebration are
fixed overlays. Verified real-browser: `innerTransform=none` during suspense,
reveal, and after; resting min-content unchanged at 654/670 (zero height, no
scroll). RD3-C no-snap intact — the reel NEVER paints on the mount frame (it
starts inside the RAF, after the crossfade; JSDOM sees finals → test green).
prefers-reduced-motion / non-visible → settle straight to the resolved screen,
no suspense. Honesty: NO added rivalry/skill copy (opponent-rivalry framing is a
separate later ticket); the engine's honest line still renders post-reveal.

**Verified (real browser, both outcomes):** during suspense cells `state=tied`
(neutral) + churning values + `data-h2h-margin-hero="resolving"` with a hidden/
misleading sign + `celebration=none`; at ~1.4s the cells go `leading`/`trailing`,
the hero `revealed` locks the signed margin (+4.5 / −46.4), and `celebration=
win`/`loss` fires; by ~3.3s hero + celebration cleared, clean resting screen.

### Touched (RD7.8) — `H2HResultsOverlay.tsx` only
`MarginHero` + `formatMargin`; `AnimatedUserScore` rewired (parent-driven
`displayTotal` reel + `revealNonce` → slam/sag, count-up removed); parent
SUSPENSE→REVEAL timeline (reel RAF + lock → existing celebration fork); both
score cells fed the reel + neutral state during suspense; `RD78_*` constants +
margin-hero keyframes. `OutcomeBurst`→`ResolutionCelebration` (RD7.7) unchanged.

**Open flag (not scoped here):** the upstream REVEAL screen already shows the
final delta (`MidRailContent finalGapOverride`), so a sharp user may have seen
the result before the results overlay — if the held breath doesn't land on
glass because of that, deferring the reveal-screen delta is the follow-up.

**Gate.** Full vitest (1199 passed; RD3-C + verdict green) + basketball build
green. Tri-sport held. Glass-pending tuning: suspense duration, reel cadence/
range, margin-hero size/position.

---

## § RD7.9 — Reveal-screen fixes + header platinum + kill the result spoiler (ITERATION — held for phone glass 2026-06-15)

**Status:** continues on the integrated `feat/rd7-5-results-declutter` tree;
tracked as RD7.9.

**Root cause this fixes.** The result was KNOWN before the results overlay
because the REVEAL screen resolved/announced it — the last-card double sequence
(per-set delta → then the FINAL match score in the same slot) + "TAKES THE
LEAD". That's why RD7.6/7.7/7.8 celebrations felt flat. These fixes move the
moment-of-truth to the full-screen animation by stopping the reveal from
spoiling it.

1. **Header — solid platinum bar (all 5 screens).** Replaced the translucent
   band (never separated from the near-black body) with a SOLID metallic
   platinum fill (`#D4DAE2`→`#C7CDD6`→`#B8BFC9` sheen). A light bar on a dark
   body = hard separation by construction. Gold divider REMOVED (the bar IS the
   separation). Text INVERTED for legibility: REPLAY `#12151E`, IFS keeps brand
   orange (+ a faint shadow to crisp it), tagline soft words `#5A626F` / emphasis
   STARS·TURN `#1B2030` (color-only emphasis via value). Background + text-colour
   only; −1px height (divider removed, uniform across all 5 → no-snap equal); no
   transform. Verified legible.
2. **Play-screen copy + hold.** (2a) the transient "Here's the same starting
   hand as {challenger}" deal-in line is DROPPED (`deriveHeadline` deal_in → "").
   (2b) initial instruction → "Same hand to start — tap the cards you want to
   hold"; previewed-fallback → "Tap once to preview, tap again to hold"; "Draw
   the rest when you're ready" kept. (2c) the BIG center card now toggles HOLD/
   UNHOLD on a single tap once previewed (reuses `onTap(previewedSlotIndex)`,
   which flips the held bit) — unified with the mini-slot; the preview-then-hold
   two-step still applies only to a not-yet-previewed mini tap.
3. **SPOILER FIX — last-card double sequence removed.** `finalGapOverride`
   removed from the `MidRailContent` caller (`H2HRevealScreen`). The delta slot
   now shows ONLY the per-set delta (`deltaRunning`: "Gained/Lost/Even"), never
   the FINAL match result ("Won X.X FP"). The final result is revealed by the
   full-screen RD7.7 celebration. FENCE held: set-delta render, measured anchor,
   dual-blink, RD3-C no-snap (score cells) untouched — delta centering residual
   0px re-confirmed.
4. **Need-line lingers.** `ANCHOR_HOLD_MS` 2000 → 2900 — the penultimate "Need:
   +X.X" gap line is visible ~1750ms (was ~850ms) so the stakes register going
   into the last card.
5. **"TAKES THE LEAD" killed.** `momentumTag` always undefined; its render block
   deleted.
6. **Tighten last-delta → celebration.** `END_OF_ARC_HOLD_MS` 1700 → 700 (just
   enough to register the last set delta) + `FINAL_HOLD_MS` 1500 → 150 (the
   reveal no longer holds a verdict, so that hold was dead). Last set delta →
   straight into the overlay (RD7.8 suspense → celebration) as one beat.

**Verified (real browser):** header platinum (bg `rgb(212,218,226)…`), REPLAY
`rgb(18,21,30)`, tagline `rgb(90,98,111)`/`rgb(27,32,48)`, divider gone, height
60 (uniform). Reveal across the arc shows the per-set delta (Gained/Lost/Even),
NEVER the final "Won" verdict (spoiler gone), NO "TAKES THE LEAD"; delta
centering residual 0. Big-card hold toggles. Results min-content fits (no
scroll; −1px from the divider helps). 1199 tests + build green.

**Open flag (not scoped here):** the reveal's two TOTALS (score cells) remain
visible (RD3-C no-snap REQUIRES the reveal-done totals to match the overlay-
mount totals) — a user who reads the totals can still infer the result. The
ticket scoped the spoiler to the explicit delta-slot announcement; if the totals
still spoil on glass, obscuring/deferring them is a follow-up (would need a
no-snap rethink).

### Touched (RD7.9)
`GlobalChallengeHeader.tsx` (platinum + inverted text, divider removed);
`H2HRecipientPlay.tsx` (copy 2a/2b + big-card hold 2c); `H2HRevealScreen.tsx`
(finalGapOverride removed; momentumTag render deleted + always undefined);
`useH2HReveal.ts` (`ANCHOR_HOLD_MS` 2900, `END_OF_ARC_HOLD_MS` 700);
`H2HRecipientReveal.tsx` (`FINAL_HOLD_MS` 150); `__tests__/useH2HReveal.test.tsx`
(end-of-arc-hold range updated to 400–900); docs.

**Gate.** Full vitest (1199 passed; RD3-C + verdict green) + basketball build
green. Tri-sport held. Glass-pending tuning: platinum shade + IFS-on-platinum
contrast, need-line linger, end-of-arc/final-hold timing.

---

## § RD7.10 — results/reveal tuning-three (ITERATION — held for phone glass 2026-06-15)

Three independent COSMETIC fixes off the post-canon RD7.x arc, surfaced by the
prod glass. NO change to the resolution engine, explanation copy, sign
semantics, or color logic. Weight/size/alignment only. Branch
`feat/rd7-10-tuning` off `main` @ `c056766`.

### FIX 1 — reveal NEED numeral: size up + drop the sign
- WHERE: `H2HRevealScreen.tsx` need-line (`data-h2h-rail-gap-need-line`), string
  built from `gapStatLine` (`Need: +X.X`).
- **Size: 12 → 16px.** NOT the delta token (`SCORE_CELL_FONT_SIZE_PX` = 20).
  Parity-with-delta was specced off a screenshot before it was known that 20px is
  the exact size RD7.7 pulled this line DOWN from (20px clips inside the 80px
  `RIGHT_RAIL_WIDTH_PX` float, worse at 3-digit needs). 16px closes the perceived
  size gap while staying inside the RD7.7-safe envelope. **16px is the deliberate
  ceiling under `RIGHT_RAIL_WIDTH_PX`** — fall to 15 only if a 3-digit need clips
  on glass. The `:1338` comment records 12px=RD7.7 clip-fix / 16px=RD7.10 ceiling
  so a future "the NEED looks small" ticket doesn't re-open the clip.
- **Drop the leading "+":** `Need: +X.X` → `Need: X.X`.
- **Edge case (RESOLVED, safe):** `"Need:"` renders ONLY in the `overtake`
  branch (`useH2HReveal.ts`), which requires `enteringSign < 0` ⟹
  `needPoints = |enteringGap| ≥ FINAL_GAP_TIE_TOLERANCE (0.05) > 0` (min rendered
  "0.1"). A lead → `"Hold:"`, a tie → `"TIED"`. Dropping the sign can never emit
  `-0.0`, `0`, or negative. Locked by a hook unit case (`overtake ⟹ needPoints ≥
  0.05`).

### FIX 2 — "game logs" hint: RELOCATED to footer (RD7.10-c supersedes RD7.10-b)
- **FINAL (RD7.10-c, 2026-06-15): the hint moved OUT of the hero zone to a
  permanent footer row.** Centering an in-hero hint was a dead end — the hero
  column is locked ~10px off true board center (card arc-parity), so any in-hero
  position is either off-card or off-board. The fix is to MOVE it to where there
  is no rail asymmetry.
  - **New location:** `data-h2h-overlay-logs-hint`, first child of
    `data-h2h-overlay-reserved` (the sticky footer band) — BELOW the YOU
    mini-slot row, ABOVE the CTA. Full-width, normal flow, `textAlign:center` →
    centers cleanly (offset 0px, measured).
  - **DECISION 1 (copy):** position-neutral **"Tap any card for game logs"** —
    it's global now, renders in every state.
  - **DECISION 2 (dedupe):** footer hint is **always present**; the empty in-box
    prompt ("tap a card to see game logs") is **STRIPPED** → **RD7.5 Move 3 is
    retired**, the dashed box is now a clean placeholder. Single persistent
    instruction, no redundancy.
  - **Both former in-hero leaves removed:** the occupied-front caption AND the
    empty in-box prompt are gone. Removing the absolute hero caption frees the
    visual gap above the card (RD7.11 substance-line runway).
- **Superseded attempts (history):** RD7.10 Fix 2 added a `translateX` to the
  front hint leaf to pull it to board center → OVERSHOT (double-shift off the
  card). RD7.10-b reverted that to center-over-card and accepted a ~10px
  empty↔occupied delta. RD7.10-c abandons in-place centering entirely and
  relocates instead.
- **Budget — MEASURED in real browser (resting overlay, win + loss):** the
  footer row adds ~21px of flow height; removing the absolute hero caption frees
  none. Min-content height **592px @ 390w / 608px @ 430w**. At the tight
  address-bar viewports → **390×664 fits with 72px headroom, 430×745 fits with
  137px headroom** before any scroll; CTA fully visible at all tested viewports.
  No scroll introduced.
- **Invariant:** RD6.2 FIX 2b wrapper translate (`:634`) is UNTOUCHED and still
  present; the new footer row is in normal flow; no transform added to any
  protected ancestor. Net transforms: the RD7.10-b/Fix-2 front-hint translate is
  gone with the leaf; zero added.

### FIX 3 — resolution line weight
- WHERE: `H2HResultsOverlay.tsx` `data-h2h-overlay-resolution`.
- `fontWeight: 600 → 700`. WEIGHT ONLY. Copy, `headlineColor` tint
  (`selectOutcomeColor` red/green/amber), and the RD7.4 `minmax` grid track all
  untouched. The SUBSTANCE half of the img-4 feedback (commentary-grade flavor)
  is RD7.11, a separate engine ticket — not touched here.

### INVARIANTS FENCED (RD7.10 introduces no new ancestor transform)
- No transform on the header or any results ancestor (RD6.2 centering) — FIX 2's
  transform is on the hint leaf only.
- No box-model change to `GlobalChallengeHeader` (RD7.1 zero-added-height).
- No spoiler reintroduced — FIX 1 changes NEED size/sign only; the final score
  never enters the delta slot.

### Touched (RD7.10)
`shared/components/H2HRevealScreen.tsx` (FIX 1 size+sign+comment);
`shared/components/H2HResultsOverlay.tsx` (FIX 2 → RD7.10-c: both in-hero hint
leaves removed, new `data-h2h-overlay-logs-hint` footer row above the CTA,
RD7.5 Move 3 retired; FIX 3 weight 600→700);
`shared/components/__tests__/H2HResultsOverlay.test.tsx` (#7 test rewritten for
the footer hint); `shared/components/__tests__/useH2HReveal.test.tsx` (overtake needPoints
≥ 0.05 case); docs; worktree registry.

### Gate
ITERATION — full vitest + basketball-only build. Held for John's phone glass
(serve from this worktree). Commit held until glass. **MERGE = full tri-sport
gate (`build-vercel.sh`)** — H2HResultsOverlay/reveal are cross-sport; a
basketball-only pass does NOT clear baseball/football.

**Glass checklist:** NEED reads larger (16px) + no "+" sign + no clip at
max-digit need + still no-scroll; **(RD7.10-c)** "Tap any card for game logs"
hint sits centered in the footer band (above CTA), hero-zone hint gone, dashed
box is a clean placeholder, and the new row does NOT introduce scroll — CTA
fully visible with the address bar showing (measured: 72px headroom @ 390w, 137px
@ 430w); resolution line reads at proper weight (700), tint intact, long verdict
still grows-not-spills (RD7.4). Run a WIN and a LOSS.

---

## § RD7.11 — Resolution Engine Flavor: box-line substance (ITERATION — held for phone glass 2026-06-15)

The FLAVOR HALF of the img-4 feedback (the weight half shipped as RD7.10 FIX 3).
Executes RD7-CANON HONESTY+EXCITEMENT: *"Humility governs CAUSALITY, not
DESCRIPTION. The Cause clause stays humble; the FLAVOR slot carries
commentary-grade specificity drawn from the actual logs."* This ticket touches
**Flavor only** — not Recognition, not Cause, not classification. Branch
`feat/rd7-11-substance` off pushed main (`8b78519`).

### PART A — data port (projection widening, not plumbing)
Per RD7.11-investigate the log data is already on `H2HCard` (`statLine`,
`gameInfo`, `achievements`); `toFact` simply projected it away.
- `resolutionEngine.ts` — `YourCardFact` gains optional `statLine?`,
  `gameInfo?`, `achievements?`.
- `explainH2HResult.ts` — `toFact` populates them from `c.statLine` /
  `c.gameInfo` / `c.achievements` (already in scope at the call site).
- NO changes to resolveEngine, H2HCard, reveal flow, serialization, data load.

### PART B — box-line-aware Flavor templates (deterministic)
- The decisive/hero card's stat token in the agency clauses becomes the REAL
  **box line** ("went for 41-12-9") instead of the bland FP scalar ("dropped
  41"). FP scalar is the graceful fallback (see degrade rules).
- Variance gets an optional **descriptive top-scorer ranking** clause (pure
  scoreboard: "Garnett's 47 led your slate") — color WITHOUT a cause.
- Benchmark = the in-game commentary VOICE (`shared/commentary/`), matched in
  TEXTURE + VARIETY within deterministic templates (not LLM-fluid). Enough
  variants that repeats don't read identical.

### LOCKED design decisions
- **D1 — box line REPLACES the FP scalar** in agency clauses (ticket example
  "went for 41-7-5"); FP scalar is the fallback only.
- **D2 — box-line formatter is basketball-shaped** (pts-reb-ast core + at most
  ONE accent: a standout threes/blk/stl). For sparse/absent **or non-basketball**
  statLine (no recognized keys) it returns `null` → Flavor degrades to the
  existing FP-based line. **This graceful-degrade IS the cross-sport safety:**
  baseball/football (different stat keys, and they share this engine via
  `H2HRecipientReveal`) keep exactly today's behavior — zero regression.
  Per-sport box-line formatting (a SportAdapter hook fed through `YourCardFact`)
  is a documented FOLLOW-UP, not this ticket.
- **D3 — variance top-line ranking is optional + ranking-only**; degrades to the
  existing variance line when there's no clear top box line.
- **D4 — generation order Recognition → Cause → Flavor → cultural-tag preserved.**
  Cause clause TEXT unchanged; classification untouched; cultural tag (nickname)
  stays the trailing WRAPPER, after Flavor.
- **D5 — honesty guard is a unit test**: a forbidden-causation blocklist
  (`came through`, `delivered`, `showed up`, `when it mattered`, `when you
  needed`, `rose to`, `answered the call`, `clutch`) asserted to NEVER appear
  across a large generated-output sweep. Deterministic templates make this
  provable — that's the whole reason we're not using an LLM.
- **D6 — `MAX_CHARS=200` still enforced**; Flavor degrades to fit in order:
  drop accent → drop box line (FP fallback) → drop cultural tag.

### HONESTY INVARIANTS (load-bearing)
- Recognition + Cause UNCHANGED (humility-default, variance-default,
  agency-must-win-out). This ticket does NOT make Cause less humble, fire agency
  more often, or change classification.
- **Flavor is DESCRIPTION, never CAUSATION.** ✅ "Iverson went for 41-7-5" /
  "Garnett's 47 led your slate". ❌ "delivered when it mattered" / "came through
  for you" / anything implying the user predicted/read/called it (RD7.3
  false-ownership, retired).
- **YOUR-SIDE-ONLY.** Flavor describes YOUR cards' box lines. Mike stays
  scoreboard — no pull-divergence, no Mike decision-comparand. Bad-beat
  absolution stays gated exactly as canon; Flavor does not widen it (the
  bad-beat line is left as-is, no box-line Flavor added to Mike).

### DATA SAFETY
- No dependence on `injured`/`ejected` (RawLog flags ingestion never populates)
  or `RawLog.events` (empty under current ingestion). Use only `statLine` stat
  keys, `gameInfo`, `achievements`.
- Missing/sparse statLine degrades to recognition-only / FP-fallback — never
  errors, never a half-line, never a stat that isn't there.
- `controversy[]` UNTOUCHED (radioactive; culture path, not statLine/gameInfo).
- Commentary bank stays SEPARATE — we extend the engine's own Flavor slot with
  data it already reaches; the engine does NOT call selectCommentary/chadChallenge.

### Touched (RD7.11)
`shared/explanation/resolutionEngine.ts` (YourCardFact fields + box-line
formatter + Flavor template rewrite); `shared/explanation/explainH2HResult.ts`
(toFact populates log fields); `shared/explanation/__tests__/resolutionEngine.test.ts`
(box-line + adversarial honesty + sparse/degrade cases); docs; registry.

### Gate
ITERATION — full vitest + basketball build. Held for phone glass (serve from
worktree). Commit held until glass. **MERGE = full tri-sport gate
(`build-vercel.sh`)** — shared/explanation feeds all three sports.

**Glass checklist:** resolution line reads with commentary-grade SUBSTANCE
(win AND loss); side-by-side voice check vs an in-game commentary line; long
line still grows-not-spills (RD7.4 minmax track); no-scroll holds with the
richer line + the RD7.10 footer row (CTA visible); Cause clause still reads as
humble (no agency-creep smuggled in via substance).

---

## § RD7.12 — LLM-authored Flavor clause (constrained hybrid) — DESIGN (doc-before-code; build NOT started; awaiting John's review at this fork)

Supersedes RD7.11's deterministic Flavor as the *primary* line. RD7.11 (engine
commit `815ca40`) is the **fallback floor**, never shipped alone. RD7.12 layers
an LLM-authored Flavor clause on top, behind a never-block + honesty-validated
hybrid. Branch `feat/rd7-12-llm-flavor` stacked on `feat/rd7-11-substance`;
RD7.11 + RD7.12 land together at ONE tri-sport merge.

**STATUS: design only. No code, no API wiring yet. John reviews this section
before any build.**

### 1. The three non-negotiables

**(A) Engine owns Recognition + Cause — deterministic, byte-unchanged.** The LLM
authors the **FLAVOR clause only** (the descriptive closer). It never authors,
sees-as-editable, or influences Recognition or Cause. `classify()` and the
Recognition/Cause render in `resolutionEngine.ts` are RD7.2-frozen. The
honesty-critical surface never touches the model. Concretely: the engine emits
`{ recognitionCause: string, deterministicFlavor: string }`; the LLM may replace
ONLY the flavor segment.

**(B) Never block the screen.** Result-screen render is instant + deterministic:
celebration fires, Recognition + Cause + the RD7.11 deterministic Flavor paint
immediately. The LLM line, *if already cached*, is what renders; if not, the
deterministic line renders and the LLM line **swaps in only if it arrives**
(it normally won't need to — see precompute). Slow / fail / timeout /
unreachable → deterministic line stands, no gap, no error, no spinner. **Worst
case === today's honest RD7.11 line.**

**(C) Precompute primary; two fallbacks.** Generation fires when the resolved
hand exists, *before* the result screen:
- **Precompute (primary):** a mount-effect in `H2HRecipientReveal` (resolved
  `sender`/`recipient` present at mount, `:177`) fires the fetch; the ~20s+
  reveal arc is the window; result cached on a ref/result object keyed by a hand
  signature. Haiku ~600ms vs ~20s → effectively always ready.
- **Live-on-mount (fallback 1):** if precompute didn't finish, the overlay may
  read an in-flight promise; it still never blocks — deterministic shows until
  resolve.
- **Deterministic (fallback 2, final):** RD7.11 line. Always present.

### 2. LLM input scope (the agency firewall — it can't claim a call it's never told about)
GIVEN to the model:
- The notable card(s)' **box line(s)** — stats only (reuse RD7.11 `formatBoxLine`
  data; pass the raw triple + accents).
- **Nickname / cultural anchor** — from the existing cultural bank (wrapper data;
  same source `explainH2HResult` already uses via `lookupCulture`).
- **Outcome + margin bucket** — `win` / `close-loss` / `beatdown` only (so wit is
  outcome-appropriate). NOT the raw margin-as-decision, NOT totals.

NEVER given (structurally — not in the payload at all):
- The user's decision, what they held/faded, any "you" framing, any prediction
  framing, the Cause classification, the leaf, Mike's cards/decisions. The model
  cannot reference a call because it is never told one was made.

### 3. Endpoint + model (cost flag SIGNED OFF by John)
- **Model:** `claude-haiku-4-5` via the existing `routeCommentary`
  (`api/_lib/router/`). Cheap + fast; the Flavor is one clause. ~$0.001–0.002 per
  resolution, **precomputed once + cached** (re-views never re-call).
- **Endpoint:** ~~new surface `api/flavor.ts`~~ → **FOLDED into `api/headline.ts`
  behind a `{ kind: "flavor" }` body discriminator (2026-06-15).** The
  "separate endpoint" decision was SUPERSEDED by a hard infra limit found at the
  first preview deploy: the project is on **Vercel Hobby (12 serverless functions
  per deployment)** and `api/flavor.ts` was the 13th → the build completed but
  **"Deploying outputs" failed**. Folding keeps the count at 12. ONLY the HTTP
  route consolidates — the Flavor path keeps its own prompt
  (`flavorPrompt.ts`), its own fail-closed validator (`validateFlavor`), and a
  distinct response shape (`{ flavor }` vs the headline path's `{ headline }`),
  so the two voices stay fully separate in substance. Client wrapper
  (`fetchAuthoredFlavor.ts`) POSTs `{ kind:"flavor", facts }` to `/api/headline`;
  always-resolves, never-throws, returns string|null, re-validates client-side.
  *(If the plan is later upgraded, splitting back out to `api/flavor.ts` is a
  trivial revert.)*
- **Prompt:** new Flavor system prompt (NOT the headline VOICE_CONTRACT) encoding
  §4 honesty rules + §5 calibration. User prompt = the §2 scoped facts only.

### 4. Honesty gate (constrained, not proven — FAILS CLOSED)

**GOVERNING PRINCIPLE — the validator FAILS CLOSED (tightening #1).** Model output
displays ONLY if it clears EVERY guard. Any failure mode — a guard trips, the
validator itself errors, the call times out, OR the output is ambiguous/uncertain
— resolves to the deterministic fallback. **Default on any doubt = the safe
deterministic line.** The blocklist cannot enumerate every false-agency framing;
fail-closed is what covers the ones it misses. There is no "display on partial
pass" path.

- **System prompt** encodes RD7.2/7.3 rules: description only; never
  causation/prediction/agency; never "you read/called/knew"; never
  pull-divergence; Mike stays scoreboard.
- **Router `bannedPhrases`** — inject the forbidden-causation blocklist at the
  router (pre-generation steer).
- **Runtime validator (the gate), ALL must pass:**
  - the **RD7.11 adversarial blocklist** (forbidden-causation set), promoted from
    test-time to runtime;
  - the **numeric-grounding guard** — reject any number in the output not present
    in the facts (blocks invented stats);
  - a **personal-life/legal denylist** (port `api/headline.ts`'s `PHRASE_DENYLIST`);
  - **apology-sentinel** detection (all-models-failed string → fallback);
  - **length cap**;
  - an **ambiguity check** — empty/degenerate/non-string/over-length/control-char
    output → reject. Anything the validator can't positively clear → reject.
  - On ANY of the above, OR a thrown error in the validator → return the
    deterministic line. Never display unvalidated or partially-validated output.

**Beatdown-loss = SUPPRESS THE MODEL ENTIRELY (tightening #2).** The margin
buckets:
- `win`   = `margin > TIE_EPS`
- `close-loss` = loss with `|margin| < BLOWOUT_MARGIN`
- `beatdown` = loss with `|margin| >= BLOWOUT_MARGIN`
- (tie / tiny-margin → treated as their variance line; no LLM call needed there
  either — the LLM is only invoked when there's a notable box line to describe.)

`BLOWOUT_MARGIN = 25` — **reused from the existing locked engine TUNING constant**
(it already defines "beatdown" in `renderVariance`); not a new number.
**CONFIRMED by John 2026-06-15.**

On a **beatdown bucket the LLM is NOT called at all** — render the deterministic
variance-humility line. No model attempt, no "constrained wit." This replaces the
un-testable "restrained" rule with a testable one: **beatdown bucket → zero model
call → deterministic line.** (Closes the img-2 "upbeat on a loss" risk by
construction — there is no model output to be upbeat.)

Wit is permitted on `win`; `close-loss` may carry restrained cultural color (still
fail-closed validated). Only `beatdown` is hard-suppressed.

### 4a. RD7.12-b — bucket+classification gate (eval-driven, 2026-06-16)
The RD7.12-eval 200-hand run found the LLM voice is strong on wins/star lines but
**FLAT on unremarkable close-losses** — and there the deterministic line is
*better* (it carries the humble cause the LLM firewall strips), and ALL the
staleness clustered in that bucket. So the model is called only where it earns
its keep (`shouldAuthorFlavor(margin, register)` in resolutionEngine.ts, reusing
the EXISTING RD7.2 agency/variance register — no new heuristic):

| Bucket | Classification | Flavor source |
|---|---|---|
| WIN | any | **LLM** |
| CLOSE-LOSS | agency (a card/decision drove it) | **LLM** (real event to narrate) |
| CLOSE-LOSS | variance (slate fell, no single call) | **deterministic** (humble cause, honest + better) |
| BEATDOWN / TIE / non-basketball | — | deterministic (already suppressed) |

Gate: model-call iff `win` OR (`close-loss` AND `register === "agency"`). Locked
by unit tests (variance close-loss → no call; agency close-loss → call). Nothing
else changes — fail-closed validator, firewall, frozen Cause, never-block, the
2-rejection behavior all preserved; this only NARROWS when the model is called.

### 4b. RD7.12-c — diversify the deterministic variance closer + gate beatdown consolation (2026-06-16)
RD7.12-investigate-2 found the literal "[name]'s [stat] was your high mark /
topped your slate" repetition is **deterministic** (`VARIANCE_RANK`, 4 variants
of ONE shape, on **100% of variance hands, incl. all beatdowns**; the LLM is
already varied — 78 distinct closers, "high mark" ~absent). Two fixes, **deterministic
path only** (LLM untouched):
- **CHANGE 1 — diversify (`WIN_CLOSERS`/`LOSS_CLOSERS` replace `VARIANCE_RANK`):**
  mixed STRUCTURES per polarity — some card-naming ("X led the box score"), some
  margin-focused naming no card ("Decided by 14.0, spread across the board"),
  some slate ("the board just ran cold"). Breaks the rhythmic sameness, not just
  adds synonyms. All honest (description/variance-humility, no agency, Mike stays
  scoreboard). Closer still only appends when a top card has a real box line
  (fill/non-basketball → bare base line, preserving variance-voice variety).
- **CHANGE 2 — gate the card-naming consolation tail OFF on big losses:** for a
  **loss with `|margin| >= BLOWOUT_MARGIN` (25, = the beatdown bucket; CONFIRM-
  by-alignment, flagged)** the variance line ends on the humble base ("Mike's
  whole board went off. Not your night.") with NO "but X's stat was your high
  mark" tail — that undercut the humility and read as a consolation prize.
  Blowout WINS keep the (diversified) closer; below-threshold variance keeps it.
- Locked by tests: beatdown variance → no card tail; closers emit >1 structural
  shape; frozen-Cause still green (agency + fill-beatdown lines byte-unchanged).
  Preserved: frozen Cause/Recognition, fail-closed validator, firewall,
  never-block, the RD7.12-b bucket gate, the LLM path.

### 4c. KNOWN FOLLOW-UPS (NOT fixed — recorded ceilings)
- **Lever 2 — LLM mild uniformity:** the eval found the LLM opens 99% name-first
  and ~28% of close-loss-bucket passed lines tail on "…in the loss / narrow
  defeat". Milder + more varied than the deterministic shape; a prompt-variety
  nudge (vary the opening; vary the loss closer) is available if a later glass
  wants it. Not done this pass.
- **CADENCE ROOT — the name-and-cite ceiling:** both paths share a
  name→stat→tag rhythm because both were *designed* to "name the notable card +
  cite its line." The deepest fix to "structure too static" is questioning
  whether every line must name-and-cite — some could lead with the margin/slate
  or name no one. That's a bigger rewrite of the Flavor contract (and would
  touch the LLM prompt + the deterministic templates together), deferred. This
  is the known ceiling of the current Flavor design; RD7.12-c widens within it,
  does not remove it.

### 5. Calibration examples (for the prompt)
- ✅ "The Big Ticket went for 23-8-3" (nickname = wrapper, stats = description)
- ✅ win: "Iverson cooked — 41-7-5, vintage AI" (about the game, not your call)
- ✅ beatdown: "Garnett's 23-8-3, the lone bright spot on a cold night" (restrained)
- ❌ "you called The Big Ticket and he delivered" (agency — REJECT)
- ❌ "you knew AI would cook" (prediction — REJECT)
- ❌ beatdown: "at least you got Garnett going!" (false consolation — REJECT)

### 6. Tests
- **Validator FAILS CLOSED (tightening #1):** assert output displays only on a
  full pass; assert each guard's failure → deterministic fallback; assert a
  validator-internal throw → deterministic fallback; assert empty/ambiguous/
  over-length/non-string → reject. Default-on-doubt is the asserted property.
- **Beatdown suppression (tightening #2):** assert a beatdown-bucket input
  (`loss`, `|margin| >= 25`) makes **zero model calls** (spy/mock the fetch) and
  renders the deterministic variance line. Buckets computed correctly at the
  boundary (24.9 → close-loss; 25.0 → beatdown).
- **Cause/Recognition FROZEN-OUTPUT (tightening #3):** assert RD7.12's engine
  `explainResolution().text` is byte-identical to RD7.11's for a fixed input
  table (the engine is untouched; this LOCKS against any shared-codepath
  perturbation introduced by the RD7.12 plumbing). The honesty-critical clause
  gets a regression lock.
- **Never-block:** deterministic line renders without the model; swap-in is
  non-blocking; failure/timeout/unreachable → deterministic line, no error, no
  gap, no spinner.
- **Cross-sport:** non-basketball / no recognized box line → skip the LLM call,
  deterministic stands.
- **Cache/dedupe:** re-opening a result does not re-call.

### 6a. Display composition (resolved interpretation — folded 2026-06-15)
The engine's `explainResolution()` is **FROZEN** (untouched) — it is the
deterministic fallback floor AND the sole producer of causal language; the
frozen-output test (#3 above) is trivially green because no engine render code
changes. The LLM line, when cached + fully validated, **replaces the displayed
resolution text** (`data-h2h-overlay-resolution`); otherwise the engine's RD7.11
line shows. The LLM cannot fabricate a cause because (a) it is never given the
decision/cause inputs (§2 firewall) and (b) the fail-closed validator rejects any
causal/agency leakage — so a displayed LLM line is descriptive-only, and the
humble-cause phrasing is carried by the deterministic floor. "Engine owns
Recognition+Cause" = the engine is the only thing structurally able to express
causation. *(If glass shows we want the engine cause clause ALWAYS visible with
the LLM flavor appended as a closer, that's a fast follow — the engine split
point is clean to add later; this build keeps the engine frozen for #3.)*

### 7. Open implementation questions to resolve DURING build (not blockers)
- Cache key: a stable hand signature (recipient cardIds + statLine hash) so
  precompute and live-on-mount dedupe to the same entry.
- Where to store the cached Flavor: a module-level ref keyed by signature vs on
  the result object. Lean ref (survives overlay remount, no prop-threading).
- Feature-flag gate (`VITE_FEATURE_LLM_FLAVOR`) so it can ship dark and flip in
  Vercel — recommended; confirm with John at build time.

### Flag operation — BUILD-TIME (rollback path, 2026-06-16)
`VITE_FEATURE_LLM_FLAVOR` is a **`VITE_` (build-time) flag** — Vite inlines it
into the SPA bundle at build, so it is NOT an instant dashboard toggle:
- **Turning ON:** set `VITE_FEATURE_LLM_FLAVOR=true` on the target environment,
  THEN redeploy (rebuild) so it inlines. Env-var-set alone does nothing to the
  already-built bundle. (This bit us at ship: the dashboard flip didn't inline
  until a redeploy.)
- **Turning OFF (rollback):** unset (or set `false`) THEN redeploy — ~30–60s, a
  rebuild, NOT instant. The endpoint (`/api/headline {kind:flavor}`) stays live
  regardless; the flag only gates whether the CLIENT calls it.
- **Verify ON for real:** the rebuilt bundle must contain the flavor fetch
  (`kind:"flavor"` / `fetchAuthoredFlavor`); when the flag is false the branch is
  dead-code-eliminated and absent. Env-var-set is NOT proof — the bundle is.

### Touched (planned)
`api/flavor.ts` (new), `shared/utils/fetchAuthoredFlavor.ts` (new, mirrors
fetchAuthoredHeadline), a Flavor prompt/validator module, the precompute hook in
`H2HRecipientReveal.tsx`, the swap-in read in `H2HResultsOverlay.tsx` (reads
cached LLM Flavor or RD7.11 deterministic), tests, docs. `resolutionEngine.ts`
gains a clean Recognition+Cause / Flavor split point but NO logic change.

### Gate
ITERATION — vitest + basketball build. **MERGE = full tri-sport
(`build-vercel.sh`)** — shared/explanation + the new shared client util feed all
sports. API-wiring touches the model/cost surface — flagged + signed off.

**Glass checklist (phone):** voice holds its own vs in-game commentary on WIN,
close LOSS, and BEATDOWN LOSS; beatdown reads restrained (not upbeat); no
perceptible latency at the result screen (precompute working); forced
model-failure → deterministic fallback looks right; no-scroll + grows-not-spills
hold.

---

## RD7.x — Results Experience + Resolution Engine (locked)

### Resolution Engine (RD7.2) — architecture
- Explains WHY a hand resolved as it did, on the results screen. TRUST ENGINE, not copywriter.
- YOUR-SIDE-ONLY causality. Mike = scoreboard, NEVER a decision-comparand. The two hands are independent draws with no shared player/slot identity — "you held him, Mike faded him" is NOT computable, FORBIDDEN copy. Sole exception: bad-beat absolution on a LOSS (Mike's variance, never his decision), gated to close + well-played + a genuine Mike outlier.
- Classify into 3 (card / allocation / variance); NARRATE in 2 (agency "your choice mattered" / variance "that's how the logs fell"). User thinks in stories, not classes.
- DEFAULT POSTURE = humility: under-firing into variance is SAFE and IS the trust strategy. Agency claims must win their way OUT of variance. "No single decision swung this" is a first-class, valued output.
- Agency requires BOTH high contribution to the margin AND a non-ordinary pull. A star scoring his own median = variance, not "he delivered." Selection ranks decision-leverage × pull-extremity, NOT raw FP.
- Skill axis = budget allocation under the salary cap (conviction has a cost — Replay's unique layer). Cap is FELT, never named ($250 / numbers never shown); invisible to first-timers.
- Generation priority Recognition → Cause → Flavor (order mandatory, clause-count not; recognition can stand alone; never force a cause). Cultural tags are WRAPPER, never explanation; cause ALWAYS precedes the tag. Star-tier (RED/ORANGE) only for cultural flavor + named anchor; a non-star may be named ONLY as a hero (redraw/fade that beat a star), NEVER as a goat.
- Acceptance = NOD test (sounds human) AND ARGUE test (the user who was THERE won't rebut it). Plausible-but-wrong fails argue → under-fire to variance.
- Percentile = build-time precompute (playerPoolStats.v1.json), filter PINNED to pickBiasedLog's candidate filter, versioned. A trust engine cannot tolerate draw/percentile drift.

### RESOLVE SEMANTICS (load-bearing — confirmed in code, not assumed)
- Every card resolves with an INDEPENDENT pull (held AND faded), via resolveCards → fresh pickBiasedLog. Two players who both hold the same player get DIFFERENT games (X≠Y). Held cards therefore DO move the H2H margin → A1/A2 (held-won/held-lost) are valid leaves. (Margins are inherently WIDE — difference of two independent 6-pull sums, no compression. The common single hand is luck-dominated.)
- The engine reporting "variance" on most hands is NOT a bug and NOT proof the game is "mostly luck" — it measures ATTRIBUTABILITY (rarely can one decision be proven causal on one noisy hand), like an honest poker explainer. Per-hand humility is correct; skill is a CROSS-HAND signal (win rate, fade success) to be surfaced separately, later.

### OWNERSHIP framework (the project's primary design currency)
- Ownership comes from AUTHORED DECISIONS, not from explanatory copy. Cosmetic ownership can only mirror real ownership — never claim ownership the system didn't give (that's flattery / the slot-machine lie).
- Per-hand explanations optimize for TRUTHFUL OWNERSHIP, not for proving skill. "You held him and he dropped 92" (honest, credits the decision) — never "you read that he'd drop 92" (false, credits predicting the dice).
- People compete over OWNERSHIP, not skill-dominance (cf. brackets, sports betting among friends). A luck game is intensely competitive if every result feels OWNED. The dial is ownership clarity, not skill %.
- Ownership has 3 legs (authorship / legibility / consequence) on 2 fronts (existential = the system creates it; cosmetic = copy recognizes it). PVE is where ownership is born; PVP is where it's transferred (parasitic on PVE).

### HONESTY + EXCITEMENT (the celebration arc lessons)
- The resolution moment is the ONE place restraint is abandoned: go loud, full-screen, transient, then clear. Honesty binds the WORDS (no skill/genius/MVP/tier bragging); VOLUME and motion are goals. Model: a slot machine — maximally exciting, claims zero skill. Loud about the outcome, silent about skill.
- CLARITY CREATES EMOTION — intensity does not. Six iterations proved: if the user doesn't understand what's happening, no particles save it; if they do, a modest animation works. The bar for a viral social game: "Can a first-time user explain what happened after watching it once?"
- Dopamine lives in the UNCERTAINTY before the reveal, not the celebration. A celebration that decorates a KNOWN result feels flat. The result must be hidden until the reveal moment (the spoiler — final score shown on the reveal screen before the celebration — was the root cause of the "flat" celebration across RD7.6-7.8).
- Humility governs CAUSALITY, not DESCRIPTION. The Cause clause stays humble; the FLAVOR slot carries commentary-grade specificity drawn from the actual logs (event-richness is pure scoreboard talk — honest, never an agency claim). A humble cause does NOT license a bland line. Benchmark: the in-game commentary's voice. (Source: RD7.x prod glass, img-4 "too thin / less fun than commentary".)

---

## § Phase 2 — Boss Delivery Consumer (LOCKED — shipped to feat/build-phase 2026-06-21)

Make a daily "boss" playable as a challenge through the EXISTING receive path
(`shared_challenges` → `/api/challenge/[id]` → `ChallengeLandingScreen`) with a
non-human sender. No parallel path, no new endpoint, no FP fork — boss FP comes
only via the bank + `projectSenderFacing`. Brief: `docs/cc-brief-boss-delivery-consumer.md`.
Contract (pre-existing, definition-only): `docs/boss-contract-v1.md`.

### 1. Ownerless boss challenges — nullable owner + re-tightened RLS (commit `4c30d01`)
`shared_challenges.created_by` relaxed to **nullable**; the human insert policy
re-tightened to `WITH CHECK (created_by = auth.uid() AND auth.uid() IS NOT NULL)`
in the **same migration** (`014_boss_sender.sql`). Rationale: a boss has no human
creator and **no house/service auth user exists** in the repo (verified — no seed
migration, no constant); boss writes go through the **service role** (`supabaseAdmin`),
which **bypasses RLS**, so the tightened human policy doesn't touch them; and the
attempt path's existing `&& challenge.created_by` guards make boss rows safe with
**zero added guards** (null owner ⇒ notification + defended-bump skip for free).
The `DROP NOT NULL` is only safe *because* the policy is tightened together — they
are one decision, asserted as a unit.

### 2. `instance_key` shared-uuid model (commit `2af4af7`)
A boss daily instance keys on **`instance_key = "date|slot|identityId"`** (a partial
unique index, `WHERE instance_key IS NOT NULL`, so human rows stay null/exempt). The
**uuid PK auto-generates**; the natural key `instanceId` is **NEVER written into the
PK**. One day ⇒ one shared row ⇒ **one uuid for everyone** (first writer creates it,
later callers resolve the same uuid). Rationale: bosses get an added natural key, not
a new id type — the whole receive path keeps operating on the uuid unchanged, and the
shared row is what makes cross-player comparison (Phase 2.5) possible.

### 3. `sender_kind` marker (commit `bb403be`)
One column: `sender_kind text NOT NULL DEFAULT 'player'`; `'boss'` for house
challenges. It is the **only added discriminator** — the boss name flows through the
existing `challenger_name` column, distinguished solely by `sender_kind`.
**`isRealName` semantics are untouched** — it remains the *player*-name gate; the
boss landing branch bypasses it by presenting the authored identity directly
(`BossLandingView`), never by changing `isRealName`. Normalized once at the read
boundary via `normalizeSenderKind` (same pattern as `normalizeTriggerType`).

### 4. `SCHEDULE_EPOCH = "2026-06-22"` — SINGLE SOURCE OF TRUTH (commit `2af4af7`)
The daily rotation schedule is computed from a fixed epoch so the era anti-repeat
cooldown is deterministic. **The generator (`bossGenerator`) and the consumer
(`ensureDailyInstance`) MUST read the SAME epoch constant.** If they ever diverge,
the schedule rotates differently on each seam and **cross-seam comparison breaks**
(everyone is supposed to face the identical roll for a given day; two epochs ⇒ two
different "today's bosses"). Locked value: `"2026-06-22"`.
**Known divergence to repair (code follow-up, out of scope for this doc):** the
consumer exports `SCHEDULE_EPOCH`, but the generator still **inlines the literal
`"2026-06-22"`** in `bossGenerator.main()` and its tests. They match today but are
two literals, not one shared constant — unify them (generator imports the constant)
before either seam's epoch is ever changed.
**RESOLVED in `5da0be6`:** `SCHEDULE_EPOCH` now has exactly one definition (in
`bossGenerator.ts`, alongside `K`/`COOLDOWN`/`P_LO`/`P_HI`); the generator's
`main()` + its three test sites use the constant, and the consumer imports +
re-exports it. Placed in the generator (not the consumer) because the consumer
already imports from the generator — defining it consumer-side would invert the
layering and create an `api → tools` import cycle. No behavior change (value
identical); divergence closed.

### 5. Synthetic NOT-NULL fills on boss rows (commit `2af4af7`)
`shared_challenges.hand_id` and `slate_seed` are `NOT NULL` with no default
(migration 005) and the contract doesn't emit them. The boss writer fills
**placeholder values it does not semantically use**: `hand_id = instanceId`
(no FK on the column, so a synthetic value is safe) and `slate_seed = ""`
(mirrors `create.ts`). **Flag:** any future join/filter on
`shared_challenges.hand_id` (e.g. against `hand_log.hand_id`) **must exclude or
special-case boss rows** — their `hand_id` is a synthetic key, not a real hand.

### 6. Commit-5 mount deferral — engineering-complete, NOT user-complete (commit `5a25521`)
`getTodaysBossChallengeId` (the today's-boss entry point) is **built and
idempotency-locked** (same `(date, slot)` ⇒ same `challenge_id`), but it is **NOT
wired to any UI or HTTP surface.** Blockers (both verified at Step 0): no
"today's challenge for a returning user" component exists in the tree, and **`api/`
is at the Vercel Hobby 12/12 function cap**, so the HTTP trigger can't be a new
route (it must fold into an existing route or a cron — a follow-on decision; a
parallel daily route is forbidden). **Therefore Phase 2 is engineering-complete,
NOT user-complete: a user cannot reach a boss until the mount lands.**

**Lock:** this section (decisions 1–6). Build brief: `docs/cc-brief-boss-delivery-consumer.md`.
Shipped per-commit to `origin/feat/build-phase` (`4c30d01` … `5a25521`); branch is
hold-for-review (not merged to main). `BossLandingView` device-glass check pending.

---

## § Phase 2-fix — Precompute the boss bank (unblock prod) (LOCKED — feat/build-phase 2026-06-21)

**Problem (recorded):** `getTodaysBossChallengeId` could not run in a deployed
function. `resolveBossForDate` read the bank + the **213 MB seasons dir** via
runtime-computed fs paths (`path.resolve(REPO, …)`, `readdirSync(SEASONS_DIR)`) —
paths `@vercel/nft` cannot trace and that **ENOENT in `/var/task`** (verified
statically: no `includeFiles`, computed paths untraceable, and `REPO` resolves to
the bundle layout not the repo tree). Nothing was broken yet only because no route
imported the boss path.

**Fix:** precompute a small static bank artifact at build/dev time, **commit it**,
and have the request path import it as a static (NFT-traceable) module — no
request-time fs, never touching the seasons dir.

### Decisions locked
1. **Precompute the BANK, not the rolled instance (Q3).** The artifact is
   identities + per-starter `gamePool` distributions + `band`. The date seed still
   drives the pick (`scheduleHeadline`) + roll (`rollGames`) at request time, so
   **daily variance stays live** (same boss-per-day for everyone, different across
   days). A rolled-instance artifact would freeze a day's boss at build time and
   require a build per day — rejected.
2. **Strategy (A): commit the artifact (commit `c64029e`).** `scripts/build-boss-bank.mjs`
   (npm `build:boss-bank`) reuses `loadBankBosses()` + `loadBand()` +
   `loadBankVersion()` verbatim and writes `api/boss/_lib/bossBank.generated.json`.
   The committed file is **byte-pinned by a drift-guard test** (`boss-bank-artifact-drift.test.ts`)
   that re-runs the same builder and asserts equality — edit the bank/seasons/FP
   code without rerunning the script and it goes red (one source of truth, pinned).
   Chosen over **(B) emit-during-`build-vercel.sh`** because (B) depends on Vercel
   tracing functions *after* `buildCommand` writes the file — unverified ordering;
   (A) has zero build-ordering risk (NFT always sees a committed file).
3. **Artifact shape (Q1):** 36 bosses, each `{ key, season, team, era_id, tier,
   display, flavor, starters: [{ name, pos, gamePool: number[] }] }` + `band {lo,hi}`
   + `_meta.version`. `K`/`COOLDOWN`/`SCHEDULE_EPOCH` stay code constants.
   **~84 KB compact** (committed at 83 KB; pretty-printing tripled it to 265 KB for
   no benefit on a generated, drift-guarded blob, so it's serialized compact).
4. **Swap to static import (commit `60f4cd4`).** `resolveBossForDate` now feeds
   `scheduleHeadline` from the imported artifact; dropped `loadBankBosses()` /
   `loadBand()` / `loadBankVersion()` + the `bossData` import.
   `scheduleHeadline` / `rollBoss` / `rollGames` / `projectSenderFacing` /
   `toSharedChallengeRow` are **unchanged** — only the data source swapped. Proven
   observably-identical by `boss-artifact-fs-equivalence.test.ts` (byte-identical
   `projectSenderFacing` + identity + seed vs. the reconstructed fs path across 5
   `(date,slot)` cases); the original byte-identical regen pin (`2af4af7`) stays green.

### Invariant: the seasons dir is BUILD-ONLY
No request-path code may read `SEASONS_DIR` or `REPO`-relative files. Audited
(`ensureDailyInstance.ts` + `todaysBoss.ts`): zero `readdirSync` / `readFileSync` /
`path.resolve(REPO` / `loadBankBosses` / `loadBand` / `buildAll` code hits. The 213 MB
seasons dir is consumed only by `scripts/build-boss-bank.mjs` at build/dev time.

### Bundle-trace verification (Commit 3)
Traced the boss request path with **`esbuild`** (the compiler `@vercel/node` uses;
`@vercel/nft` direct can't follow the NodeNext `.js`→`.ts` specifiers, so Vercel
esbuild-compiles first then traces). Result on `api/boss/_lib/todaysBoss.ts`
(12 reachable inputs):
- ✅ `bossBank.generated.json` **reachable → true** (static import → bundled/traced)
- ✅ seasons data files reachable: **0**
- ✅ repo data files (`docs/boss-bank-v1.json`, `boss_gen/`, `players.json`,
  `gamelogs.json`, `player_band_allfps`): **0**

`bossData`/`bossGenerator` appear as **code** (the request path imports
`scheduleHeadline`), but their fs-reading functions are dead at runtime and the data
they would read is not bundled — the prod-safe state. **Deviation from brief:** used
the esbuild metafile rather than `npx vercel build` + `.func` inspection, because
nft-direct demonstrably can't follow the TS import graph and `vercel build` would run
the full tri-sport build + need auth; the esbuild metafile is `@vercel/node`'s actual
resolver and gives the authoritative static-reachability graph. Result is positive
(artifact in, data dirs out) — no trace surprise.

**Still OUT OF SCOPE / deferred:** the mount (a route folding in
`getTodaysBossChallengeId` + a SPA surface) — see the prior map: the engagement
panel is orphaned, `useEngagement` is localStorage-only, the SPA home
(`DailySeasonReelGate → GameView`) makes no on-mount `api/` call, and `api/` is at
12/12. The resolver now runs safely in prod; wiring a user-reachable entry is the
next phase.

**Lock:** this section. Build brief: `docs/cc-brief-boss-delivery-consumer.md`
(Phase 2-fix). Commits `c64029e` (artifact) · `60f4cd4` (swap) · this doc (verification),
on `origin/feat/build-phase` (hold-for-review).

---

## § Phase 2-mount — Boss Entry Point + Outward Termination (LOCKED — build authorized 2026-06-21)

*Promoted from the standalone draft `docs/phase-2-mount-decision-record.md` (now
removed) at John's review-at-fork; the Phase 2-mount build brief is the greenlight.
Status flipped DESIGN → LOCKED. This section is the source of truth; log any
build-time decision here.*

**Framing (the sentence the rest derives from):** the viral object is the
**shared comparison**, not the link. Layers stack: *shared boss → comparison →
link (transport) → card (packaging) → rivalry (memory).* Everything below is a
consequence of putting the comparison, not the button, at the center.

**Problem (recorded):** Phase 2 left the boss engine engineering-complete but
user-unreachable (no mount). The naïve mount — surface a CTA, fight the boss,
exit to **`Play Again`** — wires the entry but inherits the *solo game's ending*
by default. That ending is a category error: the boss is not a harder hand, it
is a **comparison object** (same boss-per-day for everyone). A comparison object
that terminates inward is a dead loop. The mount is cheap; **the ending is the
product.**

**Decision:** ship the entry CTA now (near-free per the CC trace) AND ship a
boss-result ending that **points outward** from day one — raw, not beautiful.
No rendered card, no friend graph, no image gen. Just an outward invitation +
a copy-link. The viral object is the **shared boss**; the artifact only packages
an object that is already comparable (Wordle shared as pasted text before the
green squares existed).

### Invariant (load-bearing — the rule that outranks everything in this phase)
**Every VIEW of a boss result terminates outward. No boss result exits to a bare
`Play Again`.**

Note the seat of the invariant: it is owned by the **result view**, not by the
completion event. A boss result is a Wordle square — shareable forever — so the
outward orientation is a property of the *artifact*, not a residue of the
transition that produced it. **Build consequence:** the outward ending must
reconstruct whenever the result is viewed (reopened, returned-to tonight,
deep-linked), NOT only in the post-resolution render path. The natural
implementation hangs it off the resolution moment and silently fails the revisit
case — flag explicitly.

It holds across all three symmetries:
- **Win AND loss.** Loss is ~the majority of completions and spreads *better*
  than wins (cf. Wordle `X/6`). A win-only outward ending discards most of the
  viral surface.
- **Sender AND recipient.** A link recipient who lands on today's boss, plays,
  and hits the inward ending leaks the loop at the exact handoff that matters.
- **Fresh AND revisited.** Reopening tonight's result must terminate outward
  again — same as an old Wordle.

The phases are escalating **quality of an ending that exists day one**, never the
arrival of the ending itself:
- **Phase 2 (this):** outward invitation + raw copy-link. Ugly, complete.
- **Phase 2.5:** You/Mike/Bulls comparison card. Outward, beautiful. (Read-only
  GROUP BY over `challenge_attempts`; schema already supports it, no migration.)
- **Phase 3:** rivalry scars/belts. Outward, personal.

### Required vs Upgrade (the architectural firewall)
The invariant must NOT be coupled to breakable plumbing. An invariant that can
fail because a KV read was slow is not an invariant.

**Required (the invariant depends on these):** outward ending · challenge/copy-link ·
the boss link itself · sender/recipient symmetry · win/loss symmetry ·
fresh/revisited symmetry.

**Upgrade (degrade elegance, never kill the phase):**
- participation count (`14,318 players tried`) — **day-one** (KV counter)
- rank (`#1427`) — **Phase 2.5** (needs its own ordered tally)

A missing/stale/slow count degrades the screen; it does NOT violate the rule:

```
YOU LOST TO TODAY'S BULLS

Think you can do better?

[Copy Link]

────────────

Play Again
```

still satisfies the invariant with zero leaderboard data.

### Decisions locked
1. **The comparison is the object; rank/count are its best expression, not its
   prerequisite.** Phase 2 is NOT hostage to them.
2. **Framing: shared-global-daily.** "TODAY'S BULLS — 14,318 players tried — can
   you top them?" The only frame with zero dependency (PvE needs the player to
   care about the opponent; social needs a relationship graph that doesn't exist).
3. **Loss copy is a Phase 2 LOCK, and points at the enemy, not the self.** The
   failure mode is self-referential copy ("I lost" / "beat my score") — socially
   expensive, rarely sent. Enemy-referential copy invites fighting the same thing.
   - **Win:** "I beat today's Bulls."
   - **Loss:** "The Bulls got me. Think you survive them?"
4. **`Play Again` is never alone — never deleted.** Rule is *never leave replay
   alone*, NOT *never show replay*. Challenge-above-the-line, replay-below:
   ```
   Challenge Someone   /  Copy Link
   ────────────
   Play Again
   ```
5. **CTA is conditional, not always-on (banner-blindness).**
   - Boss **unattempted** today → large CTA on the results strip.
   - Boss **attempted** today → progress-memory state
     (`TODAY'S BULLS ✓ — You scored 228 — [View Boss]`; rank line joins in Phase 2.5)
     — NOT a second invitation, and `View Boss` still lands on a result that
     terminates outward.
6. **Home surface deferred.** The natural daily entry already exists: play a
   normal hand → see boss → fight → share. Home boss tile is post-proof spend.

### Host route — A′ (confirmed by CC discovery, 2026-06-21)
Fold an optional `bossChallengeId` into `GET /api/leaderboard`, gated to
`sport === "basketball"`, KV-cached at `boss:basketball:today:{date}` with a lazy
upsert via `getTodaysBossChallengeId` on cache miss.
- **Zero blast radius:** all six GET consumers read only `.entries`/`metric`/
  `scope`; the added field is purely additive. Football's competition-keyed shape
  is untouched (boss logic never touches `validateCompetition`/`lbKeyBase`).
- **Postgres off the hot path:** route is already KV-connected; first basketball
  GET of the day does the upsert + KV write, every later GET is a KV read.
- **No cron, no 13th function.** `api/` is 12/12; `todaysBoss.ts` is `_lib`
  (unrouted). A dedicated boss route is **rejected** (breaches cap, redundant).

### CTA mount (confirmed by CC discovery)
Mount a boss-entry sibling at the existing RESULTS/`WIN_CELEBRATION` challenge-strip
branch (`GameView.tsx:3224`), gated on
`!challengeCtx && sport === "basketball" && bossChallengeId` (drop the
`challengeTrigger` gate). Tap → navigate to `/basketball/challenge/{bossChallengeId}`,
reusing the mapped open path (URL regex → `ChallengeLandingScreen` →
`sender_kind:"boss"` branch). Readiness: `gameState` ∈ {RESULTS, WIN_CELEBRATION}
&& `springSettled`.

### Step 5 surface correction (Gate A/B, 2026-06-21) — boss result routing
**The earlier "a boss target renders through `ChallengeComparisonScreen`
unchanged" line was aspirational, not descriptive.** Map-first (Gate A) found the
real prior routing: `onAccept` set `h2hPlayingMode = true` **unconditionally**
(`App.tsx:439`), and App renders `{h2hPlayingMode && challengeCtx ?
<H2HRecipientPlay> : <GameView>}` with no `resolvedSenderHand` gate. So an
accepted boss ran in **`H2HRecipientPlay`** (which reads
`resolvedSenderHand?.cards ?? []` → an **empty H2H battlefield** for a boss) and
terminated in `H2HResultsOverlay` — `ChallengeComparisonScreen` (GameView-only)
was never reached on the accept path.

**Fix (the senderKind routing gate):** `onAccept` now gates
`h2hPlayingMode = (ctx.senderKind !== "boss")`. A boss skips the meaningless H2H
battlefield and falls to GameView's **live legacy challenge path** — auto-deals
`challengeCtx.initialRoster` (the boss's five), bet forced to ×1, challenge
intro, and at RESULTS `showChallengeComparison` → `ChallengeComparisonScreen`
(gated `!resolvedSenderHand`). This is the comparison surface the design always
intended; the boss plays the same five and races the target, coherently.
- **Human path byte-unchanged:** every human challenge carries
  `senderKind: "player"` (`normalizeSenderKind`), so the gate is `true` and the
  existing accept → H2H path is untouched. `App.tsx:439` is the only accept site
  that sets `h2hPlayingMode(true)`.
- **Scope note:** Step 5 is therefore **not purely presentational** — it includes
  this one-line routing change in `onAccept` (boss-only redirect). Glass: the new
  boss surface is GameView/`ChallengeComparisonScreen` (boss CTA region) + the
  `BossLandingView` revisit; confirm the human comparison + H2H paths are visually
  unchanged.

### Build-time flags (NOT blockers — resolve during build)
1. **Result-view owns the orientation, not the transition.** Ensure the outward
   ending reconstructs on every view of the result (reopen / return / deep-link),
   not only on the resolution render.
2. **Surface `bossChallengeId` into React state.** The leaderboard GETs are
   fire-and-forget into localStorage today; the CTA needs the id in state.
3. **Count + rank split (settled by CC discovery 2026-06-21).**
   - **Count → day-one Upgrade.** Surface via `kv.incr`/`kv.get(
     'boss:basketball:attempts:{date}')` alongside `boss:basketball:today:{date}` —
     KV-only, basketball-gated, no new route. Do NOT read `attempt_count` via the
     leaderboard GET (adds a 1-row Postgres SELECT to the sport-agnostic hot path).
   - **COPY CONSTRAINT (load-bearing):** the count is **players**, not attempts.
     "14,318 players tried" is correct; "14,318 attempts" is wrong AND gameable.
   - **Rank → Phase 2.5.** Player-specific; cannot ride the player-agnostic A′
     leaderboard GET. Needs its own ordered tally. Defer; do NOT write copy that
     depends on "you're #N" until 2.5.
4. **Loss copy (LOCK):** enemy-referential, never self-referential (decision 3).

### Gate
First preview deploy must confirm the bundled bank artifact **physically reads at
runtime** (carried from Phase 2-fix — the metafile proved static reachability; a
deploy proves the last sliver). Then glass `BossLandingView` as a render/layout
check once a device surfaces it via the real mount (a green glass on localhost is
not prod evidence — local still has the fs seasons dir).

### HOTFIX (2026-06-21) — NodeNext runtime + the preview-deploy gate is now REQUIRED
**Root cause.** The A′ fold-in (`c19cc57`) pulled the boss chain into the
`/api/leaderboard` function's runtime graph for the first time. The Vercel
`@vercel/node` runtime resolves per-file under **NodeNext ESM**, which bundlers
(esbuild/vite/vitest) do NOT — so two violation classes that every test + the SPA
build resolved cleanly threw at function load in prod:
1. **Extensionless relative imports** (`./seededRng`, the boss tools' `./bossData`
   etc.) → `ERR_MODULE_NOT_FOUND`. A static top-level import meant this hit at
   MODULE LOAD → **500 on every leaderboard request, all sports** (uncatchable by
   a handler try/catch). Fixed by adding `.js` throughout the chain (`f9bd453`).
2. **JSON import without an attribute** (`bossBank.generated.json`) →
   `ERR_IMPORT_ATTRIBUTE_MISSING`. Fixed with `with { type: "json" }` (`6eab24c`).
   (Fixing class 1 surfaced class 2 — "fixing one surfaces the next hop.")

**Firewall fix (Required-vs-Upgrade enforced at import time).** The boss chain is
now loaded via **dynamic import inside `resolveBoss`'s try/catch** (`a6c5c92`), not
a static top-level import. A boss-chain failure (module load, DB, KV) now degrades
to "no boss field" and the leaderboard stays 200 — a load-time crash can never
take the route down again. This is the only place the firewall can live for an
Upgrade dependency (a static import's load failure is uncatchable).

**The preview-deploy gate is now a REQUIRED step before any boss-touching route is
marked green.** It is the ONLY check that runs the NodeNext runtime resolver — the
test suite (esbuild/vitest) and the SPA build (vite) all mock/bundle it away. A
green suite is necessary but NOT sufficient for a boss-touching route.

**Guard (`npm run check:nodenext`, `scripts/check-nodenext-imports.mjs`).** Scans
the api runtime graph (api/** + the explicit boss-chain non-api files; excludes
SPA-bundled tools + `__tests__`) for both classes — extensionless relative imports
and attribute-less JSON imports — and fails CI. Backstop for the gate.

**OPEN — DB migration not applied (firewall-degraded, not a code bug).** The
preview deploy of all three fixes confirmed: all sports 200, the boss chain loads
+ executes (resolves e.g. `2026-06-21|0|LAL-1920`), but the upsert fails —
`Could not find the 'boss_bank_version' column of 'shared_challenges'`. **Migration
`014_boss_sender.sql` has not been applied to the Supabase database.** Until it is
(apply 014, then reload PostgREST: `NOTIFY pgrst, 'reload schema'`), the firewall
correctly degrades to no-boss-field. A real `bossChallengeId` in the GET response
is gated on this DB action — the last step to user-reachable boss.

### Play model — Interpretation 3 (season-locked from-scratch draft) — DECISION LOCKED; per-season band is the bottleneck (step-1 finding, 2026-06-21)
> **HUMAN SIDE SUPERSEDED (2026-06-21) — see "Challenge model — Score-Is-The-Object + 3-round universal" block immediately below.** The boss side of this block (draft-fresh, 3-round, season-pinned, boss-five excluded) is UNCHANGED. Only the human-shared-start mechanic referenced here is superseded.

**Decision (John, locked):** a boss is a sender; **equivalence holds at the
bookends** (landing → reveal → result → share identical to a human challenge).
What differs is the **starting-roster source**: the recipient does NOT inherit
the boss's five (human shared-start) — instead they **start blank and run the
normal 3-round draft pinned to the boss's locked season, excluding the boss's own
five**. The boss's five is revealed + scored as the opponent. **Core principle:**
a challenge locks a season and *everything* derives from it — draft pool, game
logs, salary/tier constraints, **and the boss's target/band**. No
modern-vs-historical; only "the challenge's season."

**Mapped CHEAP (existing engine, one switch — not yet built):** start-mode as a
parameter on the existing deal-source branch (`GameView.tsx:1767`: inherit vs
`dealInitialRoster()`); season pin via `setActiveSeason`/`bypassSeasonKey`
(covers pool + logs + salary/tier); boss-exclusion as an eval-pool filter
(`!bossBasePlayerIds.has`); pools are deep (≥207 drawable per boss season) and
the manifest covers all 23 boss seasons. Plus the cheap-A enrichment
(basePlayerId retained, salary/tier from meanFp) + a `sender-hand.ts` boss branch
so `resolvedSenderHand` is populated.

**BOTTLENECK (step-1 finding — NOT cheap, blocks the build):** the principle's
"target derives from the season" part is not satisfiable cheaply. The band is a
**single global modern simulation** (`player_band_allfps.json`,
`runSimulator.ts basketball 10000`). **The simulator's data source
(`public/data/players.json` + `game-logs.json`) contains only 2 seasons
(2324, 2425)** — the 23 historical boss seasons live only in the per-season
`public/data/seasons/<season>/` files the sim does not read. So
"run the existing sim pinned per season" (map #6 option a) is **not executable** —
the historical data isn't in the sim's source, and the sim has its own `computeFp`
distinct from the runtime's `computeBasketballFp` and bossData's `canonicalFp`
(three FP impls; the band is only valid computed with the boss/play FP).

Per-season banding therefore requires: a build script sourcing per-season data,
**FP parity** (the rabbit hole), 23 offline Monte-Carlo runs, a committed
per-season band artifact, and `rollBoss`/`build-boss-bank` wiring to each boss's
own-season band. **Cheapest correct path: a NEW build script reusing
`bossData.canonicalFp` + the economy cap to Monte-Carlo per-season lineup bands
(parity-by-construction, reads the per-season files like bossData)** — sidesteps
the modern-only sim + the 3-impl mismatch. Estimate **~1–2 days**, dominated by FP
parity. **It gates the build:** step 3 (beatability launch-set) is defined as
"clears the target rolled against the season's band," uncomputable until the
per-season bands exist; building the engine (step 2) first would ship a
modern-calibrated boss target — the unfair-by-construction state the principle
forbids. **Per the build gate, halted after step 1 — awaiting go on the
per-season-band script scope before steps 2/3.** No difficulty tuning lever
(banned); the fix is season-derived calibration only.

### Challenge model — Score-Is-The-Object + 3-round universal — DECISION LOCKED (John, 2026-06-21)

**Amends:** "Play model — Interpretation 3 ... DECISION LOCKED (2026-06-21)" — that block
locked boss=draft-fresh / human=shared-start(inherit + 1 redraw). This supersedes the
*human* side only. Boss side (draft-fresh, 3-round, season-pinned, boss-five excluded) is
unchanged.

**Decision (John, locked):** The object of a challenge is the SCORE, not the hand. Highest
score wins — sole decider for boss AND friend challenges. A challenge is a **score + a season
pool** ("scored 224 from the '98 pool — beat it"), structurally identical to a boss. 3-round
hold/redraw construction is the single universal grammar across normal / boss / human H2H.
One engine, one grammar.

**Human H2H start-mode — 4a LOCKED:** the recipient INHERITS the sender's five as the
**starting hand**, then runs the full **3 rounds** of hold/redraw on top (maxRounds=3 for the
inherit start-mode, same as normal/boss). Shared-start survives as a *seed*, not a preserved
hand — over 3 rounds the recipient can redraw the inherited five down to nothing, and that is
the ownership mechanic working as intended ("I took their five and built my own team to beat
them"), not a leak.

- **4c (not taken):** inherit + 1 round while normal/boss get 3. Rejected — breaks the
  universal-3 grammar. Reversible: 4a↔4c is a single maxRounds-per-start-mode parameter, so
  4c remains a cheap dial later if the "same hand, light tweak" feel is wanted.
- **4b (struck):** full draft-fresh for human H2H. Reverses the boss-vs-human distinction and
  nullifies the boss's only distinguishing mechanic. Uniformity for its own sake.

**Consequence — starting hand is seed material, not the sent object.** What gets sent and
compared is the score. Accepted, not a regret: collapses boss and friend into one object,
unifies screen + construction + onboarding ("build a team, beat the score" — self-explaining).

**Loop fuel (don't re-litigate):** the old loop's beatable scores (busts/near-misses from
1-redraw imperfection) relocate, not vanish — now from resolution roll-variance (a strong
lineup still busts when the games roll cold; resolution is a random sample over real game
logs), pool spread, and the rematch/rivalry ladder (the loop 3 rounds *improves*).

**Stamps — UNCHANGED.** BAD BEAT / MISS / CAREER HI / RECORD / SEASON HI + all
choke/near-miss/rare/season-high triggers stay. Trigger *contexts* may re-point from
hand-relative to score-relative; the stamp *types* are untouched.

**Commentary consequence (gate for the commentary-cleanup workstream):** inheritance /
hand-as-object framing RETIRED; reactive (score/tier/stamp) + comparison (score-vs-score)
framing canonical. Supersede h2h-relay-tension-design-lock.md; patch
commentary-voice-system.md.

**Build (the contained swap, not money-path surgery):** add a 3-round hold/redraw loop inside
H2HRecipientPlay, driving the loop/lock decision through `commitRound` reused as a BLACK BOX
(entryFee:0, no-op persist/charge/rake). Resolution already shared; the finalRoster →
resolveRoster → arc seam does NOT move. commitRound's contract forces per-round resolveRoster
(construction-timing change, not resolution-logic change). NOT an extract-shared-loop refactor
— that would touch the money choreography + pinned tests and is explicitly out of scope.

**Cross-ref:** boss target calibration (deferred gate) and this loop's health depend on the
strong-draft (3-round optimal) score distribution, which the current simulator does not yet
produce — see the simulator-fidelity correction (faithful-deal phase).

### Challenge model — Missing opponent hand: fail-open floor (corollary of Score-Is-The-Object) — DECISION LOCKED (John, 2026-06-22)
The challenge object is score + season pool (both required, loaded by the blocking GET before
accept). The opponent's resolved hand (`resolvedSenderHand`) is optional, arrives via a separate
non-blocking fetch, and is seed/visual material — not the object. Undefined on legacy challenges
(`sender_resolved:false`) and on transient fetch failures.

**Decision (fail-open / "A"):** a missing opponent hand never blocks or blanks. The recipient
always reaches a visible, faithful outcome against the authoritative `targetScore`.

**Floor invariant (universal, pre- and post-build):** `resolvedSenderHand` undefined must never
produce the silent dead-end (inner opacity 0 + reveal null). Always a visible state showing the
true `targetScore`. Guarded by a test carried into the 3-round build as its regression guard.

**Path-split:** Legacy (hand never stored) → retry futile → fail-open immediately, reveal
replaced by honest "unavailable" treatment. Transient (4xx/5xx/network/race) → retry with
backoff, then degrade to the same fail-open. Ripe-transient-exhausted → fail-open per A;
same-hand feel is seed not object, object fully presentable without it. (Fail-closed rejected:
would block a playable object over a missing visual.)

**Meaning across the build:** pre-build the recipient drafts their own roster, so the floor =
outcome-vs-target with no reveal. Post-build (4a) the opponent hand is the inherited starting
hand, so fail-open = fresh seed, run 3 rounds vs the same target. NOT struck-4b: 4b nullified the
boss distinction as the grammar for all challenges; this is a degraded-seed fallback for one
failure case, object identical — equivalent to the locked "shared-start redrawn to nothing."

**History:** blank dates to the Phase 5b surface migration (2026-05-30), which routed humans onto
`H2HRecipientPlay`→arc without carrying the pre-5b `ChallengeComparisonScreen` backstop that made
the null-gate safe by design. This restores that principle on the current surface. Not a
recent-work regression — boss/build-phase work left the human path byte-unchanged.

### Two-tier bosses + per-season-band GO (2026-06-21, John)
**Two tiers** (both terminate outward; invariant holds for every view):
- **Beatable (daily):** you're meant to win. Loss copy enemy-referential
  ("the Pistons got me, think you survive them?").
- **Marquee/impossible:** brutal by design, the near-miss is the draw. Scope:
  **(a) `tier:'marquee'` flag, (b) a "brutal by design" landing label, (c) a
  margin-based loss-copy branch** ("I came within 9 of the 73-9 Warriors —
  closer than you'll get"). NOTHING ELSE — no separate mode, no near-miss
  leaderboard, no rewards (post-MVP).

**Candidate seasons to band (15 only — do NOT band others):**
- Beatable (13, FILTER to ~10): DET-0304, PHI-0001, SAC-0102, DAL-1011,
  TOR-0001, BOS-0708, SAS-1314, PHX-0607, HOU-9697, DEN-2223, MIL-2021,
  LAL-1920, OKC-2425.
- Marquee (2, CALIBRATE — do not cut for being hard): CHI-9798 (Last Dance),
  GSW-1516 (73-9).

**FP parity — CONFIRMED (the step-1 gate).** The per-season band is computed with
`bossData.canonicalFp` (= `computeBasketballFp(stats,+_position) + Σbadges`).
That **equals** the play-path `resolveEngine` `actualFp` because: `fpScale=1`
(gameAdapter), real gamelogs carry no stored `fp`/`total_points` (so
`extractFpFromStats` computes, not reads), `_position` injected both sides, same
badge functions+config, and `dailyBonus` excluded from the reference (the
`playerPoolStats` calibration convention). Same FP as the boss roll
(`rollGames` → `canonicalFp`). So band + boss target + recipient play are one
scale by construction — a parity test pins it.

**Per-season-band approach (built, NOT the modern simulator):** a new offline
script `scripts/build-boss-bands.mjs` Monte-Carlos random legal lineups (5
undifferentiated players under the $250 cap — basketball has no positional slots —
each scoring a uniformly-random qualifying game via `canonicalFp`) per season,
reading the per-season `seasons/<season>/` files; band = `[P60,P85]`. This mirrors
the boss roll's own method (random qualifying game per starter) → apples-to-apples.
Output committed as a byte-match drift-guarded artifact (same pattern as
`bossBank.generated.json`); `rollBoss`/`build-boss-bank` wire each boss's target to
its own-season band. **STOP after step 1** with the band table (per boss: season,
tier, band, rolled target) for John before steps 2/3.

### Step-3 beatability finding — the band is the wrong DIFFICULTY reference (premise flag, 2026-06-21)
Bands signed off (step 1). Step 3 (`scripts/boss-beatability.mjs`, win-probability
model, boss five excluded, targets averaged over 60 daily rolls) shows the
difficulty model **does not deliver either tier**, because the band measures
**random** lineups while the game is played with **drafting skill + redraws**:
- **Beatable (all 13):** a best legal draft beats the target **92–99.5%** of the
  time (single roll), with expected margins of **+40 to +77 FP** over target. Even
  a RANDOM draft beats it **20–27%** single-roll (→ much higher with redraws + the
  1-hour window). So "you're meant to win" is over-satisfied; the skill gap
  (mediocre-fails) is thin across all 13. Targets sit low because the band is
  P60–P85 of *random* lineups, far below a cap-maxed skilled draft.
- **Marquee (both too soft, NOT brutal):** rolled `raid` (≥band hi) against the
  *season* band, CHI-9798 target 173.5 → best-draft beats **56.9%**; GSW-1516
  168.7 → **75.6%**. They're **reachable — too reachable** (not the broken-
  unreachable failure; the opposite). The season is full of OTHER stars to draft
  (e.g. '15-16: Westbrook/Cousins/AD/Harden/KD/LeBron) so a strong non-boss draft
  clears the raid target easily. NOT "tantalizingly short."
- **PHX-0607 — prime-cut premise CORRECTED:** over 60 days it's the LEAST trivial
  beatable (P_random 20.3%, lowest best-margin +41.8) — the table's one-day
  `tough_day` (109.3) was a stochastic low roll, not its average. Don't cut it for
  being easy; it's relatively harder. (It does carry tough_day variance — some
  days trivially easy — a UX note.)

**Root premise:** targeting the boss at P60–P85 of RANDOM lineups makes beatable
thin-skill-gap and marquee not-brutal. To deliver "mediocre fails / brutal
marquee," the target must calibrate to the **strong-draft distribution** (e.g.
beatable ≈ P50–P70 of best-draft rolls; marquee ≈ P85–P95 of best-draft rolls),
not random lineups. This is season-derived calibration (not per-boss tuning).
**HALTED before step 2** — building the integration would wire these
non-tier-delivering targets into production. Awaiting John's call on the target
model (keep random-band "you always win" daily vs. recalibrate to strong-draft
percentiles), + the marquee fix (higher target).

### Step-2 DATA CORE built (2026-06-21) — opaque-target seam confirmed; glass UI handed off
John's call: build the data core on placeholder targets now; calibration is the
final pre-launch gate. Built green (commits `14cde56` · `7e5ef25` · `96dde1b`):
- **Opaque-target seam (CONFIRMED, both halves).** build-boss-bank BAKES a per-boss
  opaque `target` (a deterministic roll against the boss's season band — raid for
  marquee) + the playable/revealable five into `bossBank.generated.json` (drift-
  guarded). ensureDailyInstance READS `boss.target` verbatim — `projectSenderFacing`
  dropped from the writer; the engine never rolls and is agnostic to derivation.
  **Recalibration later = regenerate the artifact with a different target formula +
  re-commit; ZERO engine change.** Pinned by an opaque-target assertion +
  a real-artifact serveable test.
- **Cheap-A enrichment.** `BossStarter` retains `basePlayerId`; the revealed five
  carries basePlayerId + salary/tier (read from the stored `players.json` —
  runtime parity). `initial_roster` now `{v:1, sport, holdsRecorded:false, cards}`
  → fixes the "Invalid challenge data" landing-load bug for bosses.
- **Serveable = has-a-target / fail-closed.** Targets baked ONLY for the 15 vetted
  candidate keys (a band is per-season, so other bank bosses share banded seasons
  but stay dormant). resolveBossForDate's rotation pool = serveable only; a pick
  without a target THROWS. Shipping an uncalibrated boss is structurally impossible.
- **sender-hand.ts boss branch.** A boss (no hand_log) returns its baked five as
  `resolvedSenderHand` → no empty H2H battlefield.

**HANDED OFF to the GLASS cycle (device-glass required):** Step-5 gate deletion →
H2H routing, outward-ending relocation to `H2HResultsOverlay`, two-tier framing
(`marquee` label "brutal by design" + distinct loss copy — `marquee` flag is baked
in the artifact, ready to consume).

**FINAL PRE-LAUNCH GATE (owned by John, done ONCE on real numbers, last step before
user testing — NOT post-launch backlog):** calibration — recalibrate beatable
targets to ≈P50–P70 and marquee to ≈P85–P95 of the strong-draft distribution
(regenerate the artifact, zero engine change via the seam), + the which-set launch
cut (currently all 15 serveable). Handling rule for any boss that can't be made
beatable/tunable: drop it (none triggers it today — all beatable clear 92–99%).

### Glass-cycle MAP — corrected scope: Interpretation 3 needs a draft-fresh deal mechanic (2026-06-21)
**Premise corrected (lock-protecting):** routing the boss through `H2HRecipientPlay`
"like any sender" via gate deletion alone delivers **inherit-the-boss-five** (the
recipient is dealt `challengeCtx.initialRoster`, which is the baked boss five —
`H2HRecipientPlay.tsx:67,402`), redraws it, and faces the same five — i.e. the
REJECTED Interpretation 1, not the locked Interpretation 3. The recipient
**draft-fresh** mechanic (start blank, draft from the season excluding the boss
five) is unbuilt. So the glass cycle is **FOUR steps**, not three. Gate deletion
alone ≠ Interpretation 3.

**Four-step build plan (next fresh session, device in hand):**
1. **Draft-fresh deal mechanic (the new piece).** Inject the fresh draft at ACCEPT
   (App.tsx onAccept, ~`:425`), keeping `H2HRecipientPlay` byte-identical: for
   `senderKind==='boss'`, set `challengeCtx.startMode='draft-fresh'`; deserialize
   `data.initial_roster` → bossFive (exclusion + opponent source); `setActiveSeason
   (season)` + `ensureLoaded`; build the adapter eval pool MINUS bossFive
   basePlayerIds; `rosterEngine.generateRoster(filteredPool, config, economyConfig,
   rnd)` → fresh draft; set `challengeCtx.initialRoster = fresh draft`. The boss
   five stays the opponent via `resolvedSenderHand` (sender-hand branch, built).
   `startMode` field → `challengeTypes.ts`.
   - **PREMISE TO VERIFY in build:** App must build the adapter eval pool +
     `generateRoster` (App doesn't deal today — GameView's hook does). Confirm App
     can reach `sportAdapter` eval pool + economyConfig, or thread a deal capability.
   - **Collision check:** initialRoster (your fresh draft) MUST be distinct from
     resolvedSenderHand (boss five). Today they're both the boss five — draft-fresh
     separates them. Glass: your dealt hand ≠ the boss five.
2. **Gate deletion → H2H routing.** `App.tsx:439` `h2hPlayingMode = senderKind!==
   'boss'` → `true`. REMOVE the superseded `ChallengeComparisonScreen` boss fork
   (`:284`, Step 5 Gate C) — boss no longer routes to the comparison sheet
   (hide-don't-delete: `BossOutwardEnding` component stays, reused).
3. **Outward-ending relocation.** Render `BossOutwardEnding` in `H2HResultsOverlay`
   (post-play, gated `senderKind==='boss'`); `recordBossResult` fires there (moved
   from the comparison fork). `BossLandingView` revisit (`ChallengeLandingScreen.tsx:400`)
   STAYS. ONE READ: both H2HResultsOverlay (post-play) + BossLandingView (revisit)
   render from `getBossResult` → fresh and revisited byte-identical.
4. **Two-tier framing (consume baked `marquee`).** Surface marquee WITHOUT a
   migration: `toSharedChallengeRow` → `initial_roster = {v:1, sport, marquee:
   boss.marquee, holdsRecorded:false, cards}` (jsonb, GET returns it). Landing
   (BossLandingView): marquee → "brutal by design" label pre-play. Result
   (BossOutwardEnding): marquee → margin-based loss copy ("came within N of the X");
   beatable → enemy-referential; both win copies terminate outward. Flag + label +
   loss-copy branch ONLY (no mode/leaderboard/rewards).

**Glass surfaces (John, device in hand, next cycle):** beatable full play (fresh
draft vs boss five, no empty battlefield); loss/win outward endings; revisit
reconstruct; marquee label + margin copy; NEGATIVE — human (non-boss) H2H/
comparison byte-identical (the `senderKind` branch must not touch them).

### STEP 0 spike result — GO (2026-06-21, glass cycle)
**Question:** can `App.onAccept` build the boss-season eval pool, hold the economy
config, exclude the boss five, and `generateRoster` a valid fresh roster — given
App does NOT deal today (GameView's hook does)? **Answer: YES**, via the map's
explicitly-anticipated "thread a deal capability" branch (NOT inline replication).
- **Singleton season state.** `@shared/engines/dataEngine` is a module-level
  singleton (`activeSeasonKey`/`_players`/`_logsByKey` are module vars;
  `setActiveSeason`+`ensureLoaded` mutate them). An App-side load is visible to
  `gameAdapter.getPlayers()`/`getLogsByKey()` — no prop threading needed.
- **Per-season mode is live.** `basketball/src/engines/dataEngine.ts` runs
  `configurePerSeason()` at module load, so `ensureLoaded` fetches
  `seasons/<bossSeason>/{players,gamelogs}.json` for any of the 23 boss seasons.
- **Premise correction (map anticipated it):** the deal builders
  (`buildEvalPool`/`buildProjections`/`getEconomyConfig`/`mulberry32`/`randomSeed`)
  are **module-private in `gameAdapter.ts`** — App cannot import them to "build the
  eval pool + generateRoster" inline. So Step 1 takes the map's stated alternative:
  add ONE exported `dealFreshRoster(season, excludeBaseIds)` helper in
  `gameAdapter.ts` (recipe single-sourced beside `dealInitialRoster`, per the
  adapter-discipline rule). App.onAccept calls it. Insertion point (App.onAccept)
  unchanged.
- **Exclusion key:** `PlayerEval.basePlayerId` (set by `toPlayerEval`) → filter
  `evalPool.filter(e => !excludeBaseIds.has(e.basePlayerId))`. Boss five captured
  from `ctx.initialRoster` BEFORE it is overwritten with the fresh draft.
- **Two consequences (build-shaping, not blockers):** (1) `onAccept` becomes
  **async** — `await` the season-load+deal before `setChallengeCtx`/`setView`;
  (2) it mutates the app-global active season — **safe/convergent** because App
  already pins GameView to the same season via `bypassSeasonKey={challengeCtx
  .season}` (`App.tsx:377`) and a link recipient is committing to the challenge.
  Deal-failure (network) must degrade gracefully (build concern).

### Step 1 BUILT (2026-06-21, glass cycle) — draft-fresh deal mechanic
Green across all gates (new unit test 4/4, basketball tsc clean, full suite
1392/1392, basketball build). NOT yet device-glassed.
- **New `excludeBossFive(evalPool, excludeBaseIds)` (gameAdapter, pure+exported)**
  — the boss-five exclusion, matched on `basePlayerId`. Unit-locked composed with
  the REAL `generateRoster` over a directly-built `PlayerEval[]` (zero mocks):
  `basketball/src/adapters/__tests__/dealFreshRoster.test.ts`. Asserts the fresh
  draft can never contain a boss-five player (the no-collision invariant).
- **New `dealFreshRoster(season, excludeBaseIds)` (gameAdapter)** — `dealInitialRoster`'s
  recipe + the season pin (`setActiveSeason`+`ensureLoaded`, re-exported via the
  basketball dataEngine wrapper) + `excludeBossFive`. Thin glue beside
  `dealInitialRoster`; the fetch/season-coupled half matches that function's
  glass-verified boundary.
- **`startMode?: "inherit" | "draft-fresh"` added to `ChallengeCtx`** (challengeTypes.ts).
- **App.onAccept**: the accept tail is extracted into a local `acceptProceed(c)`
  closure (`ctx`→`c`; human path behaviorally byte-identical, called synchronously).
  Boss branch: capture `bossFive = ctx.initialRoster`, derive `excludeBaseIds`,
  `await dealFreshRoster(ctx.season, …)`, then `acceptProceed({...ctx, startMode:
  'draft-fresh', initialRoster: freshDraft})`. The boss five stays the opponent via
  the existing sender-hand prefetch → `resolvedSenderHand`. **Collision separated:**
  initialRoster (fresh draft) ≠ resolvedSenderHand (boss five). Deal-failure
  degrades to the inherited five (never blocks the user).
- **NOTE — routing unchanged this step.** `setH2hPlayingMode(c.senderKind !== "boss")`
  still routes boss → GameView legacy path (Step 5 state). Intermediate-but-green:
  the boss now plays a fresh OWN draft vs the target in `ChallengeComparisonScreen`.
  Step 2 flips routing to H2H.

### Step 3 BUILT FIRST (2026-06-21) — outward-ending relocation (additive/dormant)
**Reorder (3-before-2, logged):** Steps 2 and 3 are test- AND behavior-coupled —
flipping routing (Step 2) without the relocated ending leaves the boss terminating
INWARD (invariant violation), and removing the `ChallengeComparisonScreen` boss fork
breaks its test. To keep every commit green, Step 3 lands FIRST as additive/dormant
code (boss doesn't route to H2H yet, so it's unreachable by a real boss but unit-
tested directly), then Step 2 flips routing + removes the superseded fork, activating
it. Same end-state as the map; commit order swapped to preserve green.
- **`bossOutwardEnding?: React.ReactNode` slot on `H2HResultsOverlay`** (shared).
  When supplied it REPLACES the human rivalry board+CTAs wholesale (early return
  AFTER all hooks, mirroring the removed comparison fork). Overlay is agnostic to
  the node — NO boss knowledge leaks into the shared component. Absent for humans
  and all non-basketball sports → human board unchanged. Unit-locked directly
  (H2HResultsOverlay.test.tsx, no reveal-arc timing): slot shows + human CTA absent;
  absent-slot still renders the human board.
- **`H2HRecipientReveal` passes the slot** for `senderKind === "boss"`:
  `<BossOutwardEnding sport bossChallengeId=challengeId freshResult={{score: myScore,
  won: myScore >= targetScore}} onPlayAgain={onTryAgain} />`. Win = racing the baked
  target (matches the removed fork). BossOutwardEnding already records via
  `recordBossResult` + renders from `getBossResult` → fresh === revisited (the single
  read the invariant requires). The boss five is the opponent in the battlefield
  reveal above.
- **GLASS DECISION TO CONFIRM:** "Play Again" → `onTryAgain` (replay the SAME boss,
  reusing the drafted hand — no re-draft on replay). If John wants Play Again to exit
  to a fresh normal game instead, swap to `onPlayOwnHand`.
- Green: H2HResultsOverlay.test +2, full suite 1394/1394, basketball tsc + build.

### Step 2 BUILT (2026-06-21) — gate deletion → H2H routing (activates Step 3)
Green: full suite 1392/1392 (−2 from the deleted obsolete fork test), basketball
tsc + build. One path remains; the dormant Step-3 code is now live.
- **Routing flip (App.acceptProceed):** `setH2hPlayingMode(c.senderKind !== "boss")`
  → `setH2hPlayingMode(true)`. Boss now flows through `H2HRecipientPlay` like any
  sender — fresh draft (Step 1) as the recipient hand, boss five as the opponent
  (`resolvedSenderHand`), BossOutwardEnding at results (Step 3). No empty
  battlefield. Human path unchanged (was already `true`).
- **`ChallengeComparisonScreen` boss fork REMOVED** (the Step-5 early return at
  `:284`). Bosses no longer reach GameView → ChallengeComparisonScreen (h2hPlayingMode
  always true for them), so the fork was dead. Removed the fork block + the now-unused
  `BossOutwardEnding` import + `onPlayAgain` from the destructure (kept optional on
  Props so GameView's call site stays valid). **BossOutwardEnding the component is
  untouched + reused** (hide-don't-delete) — only this render path retired.
- **Obsolete test deleted:** `ChallengeComparisonScreen.boss.test.tsx` covered only
  the removed fork. Its behavioral coverage migrated: the "boss slot replaces the
  human board / no human CTAs" assertion now lives in `H2HResultsOverlay.test.tsx`
  (Step 3); the WIN/LOSS outward copy stays covered by `BossOutwardEnding.test.tsx`.

### Step 4 BUILT (2026-06-21) — two-tier framing (consume the baked marquee flag)
Green: nodenext guard (29 files, boss-chain api touched), basketball tsc, full
suite 1397/1397 (+5 Step-4 tests), basketball build. Flag + label + loss-copy ONLY
— no mode/leaderboard/rewards.
- **Server bake (no migration):** `ensureDailyInstance` threads `marquee` (already
  on `resolveBossForDate`) onto `proj`; `toSharedChallengeRow` writes
  `initial_roster.marquee` (jsonb). The GET returns it. `projectSenderFacing`
  UNTOUCHED (its 4-key contract test stays green; marquee defaults false there).
- **Design realization — marquee/targetScore/bossName are boss-STATIC, not
  result-state.** So they pass as PROPS to `BossOutwardEnding` at BOTH surfaces
  (post-play + revisit) rather than persisting in `BossResult` — `bossResultMemory`
  is UNTOUCHED (the `toEqual({score,won})` exact-equality tests stay green), and the
  result (score/won) stays the single source. Same value at both surfaces → margin
  copy is byte-identical fresh vs revisit.
- **`ChallengeCtx.marquee`** threaded at `ChallengeLandingScreen.handleAccept` from
  `initial_roster.marquee`; App spreads `...ctx` so it survives the boss draft-fresh
  swap.
- **Landing label (BossLandingView):** marquee → a "Brutal by Design" badge pre-play
  (`data.initial_roster.marquee`); beatable → none. Revisit `BossOutwardEnding` now
  gets marquee + `data.target_score` + `data.challenger_name`.
- **Result copy (BossOutwardEnding):** new props `marquee`/`targetScore`/`bossName`.
  marquee LOSS → margin-based ("Came within N of {boss} — closer than most get.",
  N = round(target − score)); beatable LOSS → the locked enemy-referential line.
  Both WIN copies terminate outward unchanged. H2HRecipientReveal passes the three
  from challengeCtx post-play.

**Lock:** this section. Build authorized 2026-06-21 (John's review-at-fork via the
Phase 2-mount build brief). Standing constraints carry: `feat/build-phase`,
per-step commits, green before each, push to origin; one canonical FP path;
hide-don't-delete; don't touch `_roundMachine.ts`, money-path pinned tests,
chad/paused voice, challenge-resolution logic, `isRealName` semantics.
Audience/difficulty lever stays deferred and banned on comparison-bearing daily
instances. Do NOT build rank / the You-Mike-Bulls comparison card / any per-player
ordered tally (all Phase 2.5).
