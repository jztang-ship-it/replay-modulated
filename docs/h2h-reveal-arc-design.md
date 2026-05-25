# H2H Reveal Arc — Design Decisions (Session 2026-05-26)

Captures the design locks from a single planning session on the head-to-head reveal experience for the challenge feature. Pairs with `docs/replaymod-design-decisions.md`; can be folded into it or kept standalone.

This is design-only. No code was written. The intent is to preserve the decisions so the next session (Code-Claude or a future planning session) can pick up without re-deriving anything.

## Strategic framing

The MVP bar isn't "people don't hate it." It's "users who play it choose to pull other people in." That means the challenge feature is the **centerpiece of MVP**, and the head-to-head reveal experience is the centerpiece of the challenge feature. Everything in this doc serves that frame.

The reveal arc is also the **foundation for future synchronous PvP**. Designing it as a reveal-only experience for async MVP, while structuring the layout so sync can layer on top later without redesign.

Bucket 3 R-side work (trash-talk bank refinement, comparison-sheet polish) from the prior session is partially **superseded** by this design. The reveal arc moves narrative work into the arc itself, which lightens what the post-arc surface has to carry.

## The format itself

Async challenge model (existing, unchanged):
- Sender plays a single-player hand, hits a trigger condition, opts to share. Their starting roster + final score are captured as the challenge.
- Recipient receives the challenge link, accepts, plays a hand on the **same starting roster**, tries to beat the sender's score.
- Sender never plays again for this challenge. They review results via in-game notifications.
- Multiple recipients can play one challenge (existing data model supports `attempt_count`, `winner_count`).

**Skill-share concern acknowledged and parked.** Current format is "hold cards, get random results, see who got luckier." Skill share is genuinely low. Asymmetric-info variants (hidden final lineup, hidden FP breakdown, sender prediction-lock) were discussed and parked as post-MVP enhancements. For MVP, the format ships as-is; the reveal arc design assumes the current format.

## Recipient flow — async MVP

1. Tap challenge link → land on `ChallengeLandingScreen` (existing, unchanged).
2. Tap Accept → drop into existing single-player hold/swap UI (unchanged).
3. Make decisions, press DEAL.
4. Screen **transforms** into H2H reveal layout (animated reshape, ~500ms). Recipient's cards slide into bottom hand strip; sender's cards appear in top hand strip; battlefield zone appears in middle; rails appear on sides.
5. H2H reveal arc plays.
6. Results overlay (replaces existing comparison sheet).

The H2H reveal screen is **its own independent surface**. No global header, no profile chrome, no nav. It owns the full viewport. Same model as a single-player win celebration.

## Sender flow

Sender never sees a live reveal arc. When a recipient plays their challenge, the sender gets a notification. Tapping the notification routes directly to the results overlay (same screen the recipient lands on after the arc).

Multi-recipient implication: a sender with 3 attempts on one challenge sees 3 notifications, taps each, lands on each per-attempt overlay. A future "challenge history" rolled-up surface is out of scope for MVP.

## Sync PvP flow (future, design forward-compatibility only)

Same H2H screen serves both decision and reveal phases:

**Phase 1 — Decisions (~15s, tunable):**
- Both players drop into H2H layout.
- Bottom hand strip cards render larger and tappable (hold/swap interactive).
- Top hand strip shows opponent's cards face-up, held-state hidden until reveal (Option A — preserves async information parity).
- Battlefield zone unused; middle holds timer prominently.
- Commentary rail empty (no events to react to yet).

**Phase 2 — Reveal:**
- Timer expires or both lock in.
- Bottom strip cards animate down to compact reveal size.
- Battlefield zone appears.
- Reveal arc plays (identical to async).

**Phase 3 — Results overlay:**
- Same as async.

The phase-1-to-phase-2 reshape is itself a designed dramatic beat ("decisions locked, prepare for battle").

**Sync timer:** target 15s for playtest, adjust based on signal. Trade-off: tighter = more pressure-as-game, looser = more skill-as-game. 10s feels too tight, 20s+ loses urgency.

**Sync opponent-presence model (Option A locked, Option C parked):**
- Option A (MVP sync): opponent's cards visible face-up from start, held state hidden until reveal. Parity with async info model.
- Option C (future enhancement): opponent's held confirmations animate in real time during decisions. Adds strategic counter-play layer. Out of scope until Option A ships and validates.

## Layout structure

Vertical battlefield orientation, Clash-Royale-style territories. Top to bottom:

**Opponent zone (top):** opponent name, running FP total, hand strip showing all N cards (sport-agnostic; basketball N=6, others vary). Mini-cards show tier color, headshot, name (last name), FP (or "live" for current, "—" for queued). Revealed cards dim; active card has amber border/glow.

**Battlefield zone (middle):** two full-size cards stacked vertically with small gap. Sender's card on top, recipient's on bottom. Cards match single-player proportions (portrait, full headshot, tier border, FP, badge space). Per-matchup delta in the score rail (NOT in a middle divider — terminology like "slot" is banned).

**Your zone (bottom):** symmetric with opponent zone. Your name, running FP, hand strip with N cards. Mini-cards same size/structure as opponent's. Bottom strip cards are sized **for future interactivity** (sync decision phase) — slightly larger than reveal-only needs, but works for both modes from day one.

**Right rail (~56px):** anchored to battlefield cards. Opponent's score next to opponent's battlefield card (muted color if behind), your score next to your battlefield card (green if ahead, dimmed if behind). Per-matchup delta lives here, between the scores. Live margin indicator ("+3.7") under the leading score.

**Left rail (~28px MVP, expands for future stakes UI):** Chad commentary lines accumulate vertically. Newest line bright, older lines dim but stay visible. In sync future, this rail holds wager/stake UI; reserved space is preserved in MVP layout.

**Banned terminology:** "slot," anything betting-related (wager, stake, pot, bet) in MVP user-facing surfaces. "Matchup" is the working internal term for a 1-vs-1 card pair.

## Reveal sequence

Six decisions locked.

**1. Reveal order — self-contained per player.** Each player's cards reveal in order:
- Swap cards first, cheapest to most expensive.
- Held cards last, cheapest to most expensive.

Sender's order is independent of recipient's order. Matchup pairings emerge from position in each player's independent reveal sequence. **Pairs may not align by player identity or salary across columns** — this is accepted. Example: sender's most expensive held card lands at sender's position 6; recipient's most expensive held card lands at recipient's position 6; these are paired even if they're different players at different salaries.

**2. Simultaneous within matchup.** Both cards flip together. FP rolls together. Scores update in real time as FP rolls. No stagger between sender and recipient sides.

**3. No tier gauges, no tier panels in H2H.** Tier is irrelevant to the H2H comparison; score is everything. Tier panels remain in single-player flow (different code path). Tier value is still computed server-side and can inform commentary triggers ("you put up MVP-tier and Mike couldn't keep up") without rendering tier UI.

**4. Commentary timing — event-driven, non-blocking.** Commentary fires when a meaningful event occurs (not per matchup). Lines land after the matchup that triggered them resolves, run parallel to the next matchup activating. Don't pause the reveal. Lines stack in the left rail — older lines dim, freshest is brightest. Median hand fires 1-3 lines over the arc, not 5-6.

End-of-arc gets a big summary commentary line that lands in the rail before transition to results overlay. Same engine, different trigger (`hand_resolved` with H2H context).

**5. End-state — results overlay replaces comparison sheet.** When the final matchup resolves and scores lock, the rail's end-of-arc summary lands, then a **win/loss climax animation** plays (design parked — to be designed when we get there), then transition to the results overlay.

**6. No skip anywhere.** First-attempt recipient watches full arc. Replay recipients (same challenge, second attempt) also watch full arc — no skip. Senders never see the arc at all (notifications → overlay direct). If users complain about replay tedium in smoke, revisit. Until then: no skip.

## Results overlay

Replaces the current `ChallengeComparisonScreen.tsx` bottom-sheet. Full-viewport overlay.

**Required content:**
- Big headline differentiating win vs loss (winner sees celebration framing, loser sees a different framing).
- Both lineups displayed, each with team FP total.
- Each card on the overlay is **flippable** — reuses existing single-player card-flip mechanic to reveal back (opponent, date, box score / game log context). Card flip is the existing component; new surface uses it.
- Action CTAs preserved from existing sheet: Send It Back, Try Again (if applicable), Dismiss.
- 1-hour window countdown timer logic preserved from existing sheet.
- Trash-talk line still fires (existing `TRASH_NAMED` / `TRASH_UNNAMED` banks, picked by signed delta bucket).
- Existing state-machine (WIN / LOSS_OPEN / LOSS_CLOSED) preserved; expressed as overlay variants instead of sheet variants.

**The comparison sheet's "resolution line" (substantive recap copy) is now redundant** because the reveal arc's commentary rail already narrated the hand. Compress or remove. Trash-talk line stays as emotional punchline.

**Win/loss visual differentiation, headline copy structure, lineup display layout** — designed in a future session, not locked here. The overlay is scoped, not designed in detail.

## Wagering / stakes

**Out of scope for MVP.** Async-only, no coin transactions on PvP. Left rail reserves space for future stakes UI but holds commentary in MVP. Three-phase plan:

- MVP: async, no stakes.
- v1.1: optional stakes on async (sender picks stake amount, recipient can match or play free).
- v1.2+: sync PvP with stakes (either mandatory or stake/no-stake lobbies).

Building economy into PvP creates abuse vectors (smurf farming, collusion) that aren't worth solving until the loop validates.

## Data model gap — RESOLVED for phase 1 (2026-05-26)

Investigation findings before locking phase 1:

- Migration `002_server_side_extension.sql:13-14` already added `hand_log.final_roster jsonb` and `hand_log.scores jsonb` columns, scaffolded for a server-side `resolve_hand` RPC. The RPC exists at `002:25-108` but is not called from the client; `shared/views/_useSharedGameState.ts:317-328` does a direct `.insert()` populating only identity + summary fields (`roster_ids, total_fp, tier, payout, streak_at_play, verified, sport, season, hand_id`). Every hand_log row in production today has NULL for `final_roster` and `scores`.
- `shared_challenges.initial_roster jsonb` carries the **starting** roster only (pre-hold/swap), serialized via `SportAdapter.serializeRoster` — identity fields only, no resolved per-card outputs. That field is the right place for the starting roster ("same slate as me"); it is not the right place for resolved per-card data.
- At hand-completion time the client *already has* the full resolved data in memory. `GeneratedCard` (`shared/types/index.ts:178-186`) carries `wasHeld`, `actualFp`, `fpDelta`, `gameInfo: {date, opponent, homeAway?}`, `statLine`, `achievements`, plus the identity base from `PlayerEval`. `_useReveal.ts:384` passes `rosterRef.current` to `logHandToDb` carrying all of this — it's discarded at the insert call.

The gap is one write-path change, not a schema problem.

### Locked decisions

**Data path (Option A locked, 2026-05-26).**
- `logHandToDb` (`shared/views/_useSharedGameState.ts:317-328`) is extended to serialize the resolved roster into `hand_log.final_roster` JSONB at insert time.
- No schema migration. Columns already exist.
- `scores` JSONB stays NULL in phase 1. Everything lives in `final_roster`. If a future workstream needs a slimmer score-only blob (or wants to align with the dormant `resolve_hand` RPC's shape), splitting can happen in a separate migration.
- Population is unconditional. Every hand from this PR forward writes `final_roster`. Modest row-size impact (~6 cards × ~1KB JSON per card = ~6KB JSONB per row); flagged as a future watchpoint, not a blocker.

**final_roster blob shape (locked).**
- JSONB array. One element per roster slot, ordered by `slotIndex`.
- Each element mirrors `GeneratedCard` verbatim: `id, basePlayerId, personKey, cardId, name, team, season, position, photoCode, salary, tier, projectedFp, slotIndex, wasHeld, actualFp, fpDelta, gameInfo, statLine, achievements`.
- A small picker helper in the write path enforces the shape so future GeneratedCard additions don't accidentally bloat the blob without an intentional decision.

**Endpoint shape (locked).**
- New endpoint: `GET /api/challenge/{id}/sender-hand`.
- Public read (matches existing `shared_challenges` RLS and `GET /api/challenge/{id}` pattern). No auth required; hand data is no more sensitive than the FP/tier already publicly readable via the existing GET.
- 30s public Cache-Control to match the existing GET endpoint.
- Response (sender_resolved: true):
  ```json
  {
    "challenge_id": "<uuid>",
    "sender_resolved": true,
    "sender": {
      "handId": "<string>",
      "totalFp": <number>,
      "tier": "<BUST|ROOKIE|STARTER|ALL_STAR|MVP|LEGEND>",
      "cards": [ /* GeneratedCard-shaped objects, ordered by slotIndex */ ]
    }
  }
  ```
- Response (sender_resolved: false — legacy challenge or missing hand_log row):
  ```json
  {
    "challenge_id": "<uuid>",
    "sender_resolved": false,
    "reason": "legacy_pre_h2h_capture",
    "sender": null
  }
  ```
- 404 only when `shared_challenges` has no row for the given `challenge_id`. Invalid UUID format → 400. Non-GET → 405.

**Legacy fallback (locked).**
- Cutover state has **two distinct legacy origins plus one shape-defense origin**, all surfacing identically to the endpoint and routed through the same fallback path:
  - **(a)** Pre-2026-05-26 hand_log rows — `final_roster` is NULL because the write-path change hadn't landed yet.
  - **(b)** Pre-fix challenges where `shared_challenges.hand_id` does not match any `hand_log.hand_id` for the sender. This was a pre-existing bug: `ChallengeSharePrompt.tsx:120` generated a fresh `crypto.randomUUID()` at challenge-create time instead of reusing the `handIdForAudit` that `_useReveal.ts:381` had passed to `logHandToDb`. Result: every challenge created before the handId-threading fix points at a hand_id that has no matching hand_log row. Detected during phase 1 smoke (10/10 recent challenges affected); fixed in this PR by threading the audit handId through to ChallengeSharePrompt's createChallenge call.
  - **(c)** Defense-in-depth on shape: 20 pre-existing hand_log rows from id range 38-45 (2026-04-14/15) contain a JSON-encoded *string* in `final_roster` rather than an array of GeneratedCard objects, likely from an experimental write path that double-stringified. The endpoint applies `Array.isArray` before returning sender_resolved:true; non-array shapes route to the same legacy fallback.
- From the client's perspective, (a), (b), and (c) are indistinguishable: all return `sender_resolved: false` with `reason: "legacy_pre_h2h_capture"`. That is the intended UX — recipient client reads the flag and falls back to the existing `ChallengeComparisonScreen.tsx` bottom sheet; no H2H arc on legacy challenges.
- Recipient client (phase 2+) reads `sender_resolved` and routes accordingly: true → drives the H2H reveal arc's sender column from `sender.cards`; false → falls back to the existing comparison sheet.
- No retro-population. PostHog event archive could in principle reconstruct legacy `final_roster` data but is high effort with partial success — out of scope.

**handId threading fix (in scope for phase 1).**
- `ChallengeSharePrompt.tsx:120` previously generated a fresh `crypto.randomUUID()` for the `handId` field in `createChallenge`. That ID landed in `shared_challenges.hand_id` but had no relationship to the `handIdForAudit` used by `_useReveal.ts:381` for the corresponding `hand_log.hand_id`. Every new challenge had a broken link to its hand_log row, making the sender-hand endpoint's premise structurally false.
- Fix: thread `handIdForAudit` from `_useReveal` → `_useSharedGameState` (stored in `currentHandIdRef`) → `GameView` → `ChallengeSharePrompt` as a `handId` prop. ChallengeSharePrompt uses the prop in its `createChallenge` call. Defense-in-depth fallback: if the prop is null at mount time (shouldn't happen under normal flow — RESULTS state only entered after a hand resolves and writes hand_id — but cheap to guard), ChallengeSharePrompt regenerates a UUID; that hand will hit the legacy fallback path correctly.

### Followups parked from this work

- **`hand_log` row-size growth watch.** Every hand from this PR forward adds ~6KB of JSONB to the row. Not a problem now (<<1MB per hand including overhead, table is currently small). Revisit if storage costs or query performance flag it.
- **`resolve_hand` RPC remains dormant.** The RPC at `002:25-108` was scaffolded for server-side hand resolution but never wired. Phase 1 populates `final_roster` via the existing client-side direct insert; whether to move hand resolution server-side (and unify `scores` shape with the RPC's parameters) is a separate, larger workstream.
- **`verified` flag is client-asserted.** `logHandToDb:316` sets `verified = !!session?.access_token` — that's "user was signed in," not "server attested the score." Challenge integrity is no worse than it is today (the sender's score is the same number used for both leaderboard and challenge); flag is clarifying what `verified` means in current code, not changing behavior.
- **`scores` JSONB is intentionally NULL in phase 1.** If a future endpoint or workstream needs a per-card score-only blob, a follow-on migration + write path can populate it without touching `final_roster`.

The H2H reveal arc UI (phase 2+) consumes this endpoint at recipient DEAL time. No UI work in phase 1; phase 1 ships the data path alone.

## Commentary engine — open

The only major design conversation deferred. To be designed in a future session.

**Scope:**
- Trigger taxonomy: what events fire commentary lines (big card score, rare achievement, swap-paid-off, hold-paid-off, lead opened/closed/flipped, race effectively over, comeback alive, both bust, blowout matchup, photo-finish matchup, end-of-arc summary).
- Bank shapes: how triggers map to lines. Reuse existing single-player banks (big-score, rare-pull, bad-beat, cultural flavor) where possible, with H2H context as an added modifier dimension.
- Cultural enrichment integration: existing player-specific / sport-specific cultural banks plug in as line modifiers.
- Silence rules: default to no comment. Most matchups won't trigger lines. Authoring discipline: don't fill silence with filler.
- Voice-polish tool integration: per existing followup, AI-tooling pass for spoken-register rewriting. This is the surface where it matters most. Author a smaller core bank manually; polish-pass lifts register.

The engine is described as **a new system that borrows heavily from existing systems**. Not from-scratch. Trigger taxonomy is the main new construct; existing banks are content sources; existing trigger evaluation infrastructure is the foundation.

## Sport-agnostic design

Hand size varies by sport (basketball N=6, others differ). Layout uses `repeat(N, 1fr)` for hand strips, not hardcoded counts. Battlefield is always 1-vs-1 regardless of N. Commentary rail scales by lines fired, not by matchup count. Total reveal time scales with N.

No "5" or "6" hardcoded anywhere in the H2H reveal arc design.

## Implementation scoping (high-level only)

Real code work, not yet detailed:

1. **Data layer:** new/extended endpoint for sender's full resolved hand.
2. **DEAL transition:** animated reshape from hold/swap UI into H2H layout (~500ms).
3. **H2H reveal screen:** full-viewport component, 3-zone layout (top opponent / battlefield / bottom you), 2 rails (scores / commentary), per-matchup choreography (cards flip, FP rolls, scores update, optional commentary fires).
4. **Commentary engine:** trigger taxonomy + evaluation + bank integration + rail rendering. Reuses existing banks where possible.
5. **Results overlay:** refactor existing `ChallengeComparisonScreen` from bottom-sheet to full-viewport overlay. Add flippable lineup display. Migrate trash-talk + CTAs + state-machine. Compress/remove resolution line.
6. **Single-player code path unchanged.** Tier panels, single-player reveals, etc. stay as-is. H2H is a parallel path branching at DEAL time when in challenge mode.

Effort estimate not produced in this session.

## What's not designed yet (followups)

- Commentary engine: trigger taxonomy, bank shapes, silence rules.
- Win/loss climax animation between end-of-arc and results overlay.
- Results overlay detail: win/loss visual differentiation, headline copy, lineup display layout.
- V4 layout sketch validating locks against pixels. Should include async reveal state, sync decision state, sync reveal state, transition between sync phases, results overlay landing.
- Skill-share enhancements to challenge format (asymmetric info variants, prediction-lock, etc.) — all parked as post-MVP.
- Calibration arc from prior session (three open diagnostic questions) — deferred until it blocks smoke.

## Session reflection

This session locked roughly 25-30 design decisions across the H2H reveal arc, recipient flow (async + sync), layout structure, reveal sequence, and results overlay scope. Captured at a clean stopping point to avoid prior-session "spinning in circles" pattern.

Several "wait, that's wrong, reset" moments worth flagging for future planning sessions:
- Initial layout attempt was horizontal columns — user correctly redirected to vertical Clash-Royale-style battlefield. Horizontal-first was wrong instinct for portrait mobile.
- "Comment per matchup" was locked, then unlocked when user correctly identified it would drag the reveal. Event-driven commentary is the better model and emerged from second-guessing.
- "Slot" terminology was used reflexively several times before user banned it. Betting-related language is also banned in user-facing surfaces.
- Hidden-lineup variant proposed early was killed when user pointed out player identities ARE the content of the game.
- Card-size assumptions overestimated chrome budget — user correctly pointed out single-player fits much more on screen than I was modeling against.

Pattern: user's instincts on what felt right were repeatedly more accurate than my first-pass design proposals. Future sessions should weight user gut earlier rather than orbiting through alternatives first.

## Next session entry points

Pick one based on energy and priority:

- **Commentary engine design.** Last major design-only conversation. Trigger taxonomy, bank shapes, silence rules. ~45 minutes of focused work.
- **V4 layout sketch.** Validates all locks against pixels. Multiple frames (async reveal, sync decision, sync reveal, results overlay). Catches anything that doesn't survive visualization.
- **Results overlay detail.** Win/loss differentiation, headline structure, lineup display layout, state-machine integration.
- **Implementation scoping.** Translate this doc into actionable build plan with effort estimates and ordering.

Recommended order: commentary engine → v4 sketch → results overlay detail → implementation scoping.
