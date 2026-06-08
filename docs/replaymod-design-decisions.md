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

R1 surface (recipient landing). After RD1 locked the universal challenge hierarchy
**Score → Outcome → Decision** on the results page, the **landing** must lead with **Score** —
there is no outcome to lead with yet, and the challenger's total IS the challenge. Today's
landing leads with a stakes-WORD (`UNBEATEN` / `BUSTED` / etc.) and hides the FP figure. RD5
reverses that: render the target score as the deterministic hero, keep names + HOLD treatment
intact, ask the dare directly. Closes the comprehension gap GATE-A is for.

**Geography.** Hero / supporting line / CTA in `shared/components/ChallengeTakeCardLanding.tsx`
(hero render ~`426`; `usp-subheadline` ~`471`; `evidence-line` ~`510`/`522`). Take-engine
copy at `shared/challengeTakeCard/generateChallengeTakeCard.ts` (`buildPlainStakes` ~`223`,
`evidenceLine` composition ~`348`) and `shared/challengeTakeCard/templates.ts` (the dormant
target-forward template `"{targetScore.toFixed(1)} FP to beat"` already exists at ~`374`).

**Lock amendment (companion in commit 1).** `docs/challenge-landing-v2-phase2d-plain-stakes-anchor-takes-lock.md`
splits the FP-spoiler rule. Per-card FP / outcome / reveal spoiler bans STAY. The "no FP
number ever appears" style is REVERSED for the **challenger's total only** — that total IS
the challenge, not a spoiler.

### Decisions locked this session (John)
- Hero on the landing is **deterministic, templated, and number-forward** — replaces the
  authored-narrative hero (`data.authored_headline || takeCard.take`) so the landing cannot
  inherit a stale or pre-RD0 leak.
- Per-card FP / recipient outcome / reveal spoiler bans remain absolute.
- Stakes words (`STAKES_BUSTED` / `STAKES_UNBEATEN` / `STAKES_MISS_*` / etc.) may stay as
  flavor; they may NOT serve as the number substitute on the landing lead.
- Level-4 ("because he held Curry") still deferred — RD5 ships Score + Held names + Dare.

### Copy (locked)
- **Hero:**
  - Named: `{challengerName} SCORED {targetScore.toFixed(1)} FP`
  - No name: `THE SCORE TO BEAT — {targetScore.toFixed(1)} FP`
  - Templated FP string — by construction it CANNOT emit "points." Hard contract.
- **Supporting line:** `Held: {heldNames}` (names only; NO per-card FP, NO outcome word).
- **CTA / dare:** `Can you beat him?` (no name → `Can you beat it?`). Replaces the
  `PROVE YOUR LINE` / `finish the job` family.

### Implementation
- **Hero** (`ChallengeTakeCardLanding.tsx`): replace the `data.authored_headline ||
  takeCard.take || "THIS IS THE LINE."` render with the templated string above.
- **Supporting line:** new element that lists held-card names (the existing
  `wasHeld === true` filter at ~`360` already produces them); NO per-card FP chips.
- **Delete:** the `usp-subheadline` element ("Same starting hand. Different decisions."); the
  stakes-word number-hiding lead path (`evidenceLine` rendering of `buildPlainStakes` output
  on the landing); the authored-narrative hero path on the landing.
- **CTA:** replace the `PROVE YOUR LINE` family with the dare CTA.
- **Take-engine:** promote the `"{targetScore.toFixed(1)} FP to beat"` template in
  `templates.ts` (~`374`) as the primary `evidenceLine` path; stakes words may remain as
  flavor downstream but never as the number substitute.

### Do NOT touch
- Spoiler guards: NO per-card FP chip on the landing; NO recipient-outcome / reveal spoiler.
- HOLD badges + bright/dim card treatment stay.
- `api/headline.ts` is RD0's engine — NOT edited here. If a fresh authored output still leaks
  `"points"` for an FP gap, surface as an RD0 follow-up; do not patch from inside RD5.
- `authored_headline` is stored at create time, so a running dev server may show a stale
  pre-RD0 seed — verification MUST use a FRESH challenge.

### Tests
- `ChallengeTakeCardLanding.test.tsx`: the `usp-subheadline` assertions (~`151`/`160`/`813`/
  `1096`) and `evidence-line` stakes assertions (~`325`/`334`) move to the score-forward
  structure.
- ADD: hero = `{name} SCORED {N} FP`; held-names render; CTA is the dare; NO per-card FP
  anywhere; NO `"points"` string for an FP figure.
- Take-engine: targetScore-forward output path is exercised at the generator level.

### Verification
Shared touch → `bash scripts/build-vercel.sh` (tri-sport) + **full root `npm test`**.
**Glass MANDATORY**: open a **FRESH** challenge (do not reuse the stale dev-server seed).
Confirm (a) hero shows `{name} SCORED {N} FP`, (b) `Held: …` names with no per-card FP,
(c) dare CTA, (d) NO `"points"` anywhere for an FP figure, (e) HOLD badges intact, (f) no
reveal spoiler. If fresh authored output still says `"points"` for an FP gap, that is the RD0
follow-up — surface it, do not patch the engine inside RD5.

### Done =
Number-forward hero live; held-names supporting line; dare CTA; subline + stakes-word lead
deleted; spoiler guards intact; HOLD badges intact; fresh-challenge glass clean of
`"points"`; lock amended; full suite green; tri-sport build clean; branch committed; push
held. **Then GATE-A.**
