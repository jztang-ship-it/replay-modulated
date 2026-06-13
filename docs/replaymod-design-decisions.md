# ReplayMod — Design Decisions & Session State

**Last updated:** 2026-06-08
**Status:** #7 (results hero-slot flip) shipped to `origin/main` at `8d3d7d9` (fast-forward from `08b95c8`); challenge-redesign roadmap **RD0–RD5** sequenced for the investor build (objective + non-goals locked below; build sequence revised 2026-06-08 supersedes the 2026-05-23 sender/stamps sequence, which is deferred behind the investor build). Prior: stamps feature shipped 2026-05-22 (merge `ce9c277`); position-data fix shipped 2026-05-22 (`87742bb`).
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
context, not a visual co-hero. **Preserve their job:** show which six-card hand is being revealed;
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
  mini-cards still read as the six cards + show dim-progress**; if 40 clips the card content,
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
`H2HRecipientPlay` mini-cell dimension test. Assert: strips still render 6 cells; dim-as-revealed
behavior intact; the new height is ~half the old.

### Verify
`bash scripts/build-vercel.sh` (tri-sport) + **full root `npm test`**. **Glass MANDATORY** —
animated surface: watch a FULL reveal and confirm (a) strips still legibly show the six cards,
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
