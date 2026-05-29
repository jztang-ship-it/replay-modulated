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

**Locked structure (2026-05-27 phase 4 restructure) — the overlay IS the H2H layout in a "result state," not a separate layout. The middle zone of the H2H layout reorganizes into three columns (text / hero slots / scores). Phase 3 arc layout is also updated to keep the overlay's structure visually consistent with the arc's end-state.**

The reveal arc's three-zone vertical layout (top strip / middle / bottom strip) carries into the overlay. The MIDDLE zone reorganizes into three columns:

- **Top strip:** opponent's lineup — same hand-strip density (~55×80) as the arc's hand strip. All N cards visible, tappable.
- **Middle / Left zone (~120-150px on mobile):** Headline + trash-talk. Text-only, no chrome around them. Headline color tracks variant (green WIN / red LOSS_OPEN / muted LOSS_CLOSED / amber photo_finish). Spans the full hero-zone vertical range.
- **Middle / Center zone (two hero card slots):** Empty by default. Each strip has independent flip state — tapping a top-strip card flips it at the TOP hero slot; tapping a bottom-strip card flips it at the BOTTOM hero slot. Both slots can be filled simultaneously for 1v1 card-back comparison. The strip cell whose card is currently shown dims to ~0.35 opacity. Card backs render at full hero card size via the existing `BackBStats` pipeline.
- **Middle / Right zone (~64px wide):** Two FP totals stacked vertically. Top FP anchored to top hero slot Y; bottom FP anchored to bottom hero slot Y. No matchup-delta pill in the middle of this zone — the arc has already moved the delta into its right rail (see "Arc layout adjustments" above), and removing it from the overlay keeps the rail content focused on the two totals.
- **Bottom strip:** user's lineup, symmetric with the top strip.
- **CTA row (below bottom strip):** Primary CTA only — `Send It Back` (WIN) / `Try Again` (LOSS_OPEN) / `Play your own hand` (LOSS_CLOSED). Full-width orange button. **Dismiss CTA removed** — the × close button in the top-right handles dismiss exclusively. LOSS_OPEN countdown pill sits above the primary CTA.

**Rail widening during arc → overlay transition.** The arc's left rail is 80px (MVP placeholder for commentary). The overlay's left rail is ~100-110px to hold the headline + trash-talk legibly. The transition between arc end-state and overlay can incorporate this widening as part of the crossfade; phase 4 ships fixed widths in each state with the crossfade animating opacity only. Phase 6's climax animation may layer the rail widening on top.

**State machine + CTAs (preserved from `ChallengeComparisonScreen`):**

| Variant       | When                       | Headline tone   | Primary CTA          | Timer |
|---------------|----------------------------|-----------------|----------------------|-------|
| `WIN`         | `delta > 0`                | celebration     | `Send It Back`       | —     |
| `LOSS_OPEN`   | `delta ≤ 0`, window open   | revenge         | `Try Again`          | 1h    |
| `LOSS_CLOSED` | `delta ≤ 0`, window closed | pure practice   | `Play your own hand` | —     |

Margin bucket sub-divides headline copy (`win_blowout` / `win_narrow` / `photo_finish` / `loss_narrow` / `loss_blowout`); buckets reuse `trashTalkBucket(delta)` internal names. Polish in phase 8.

**Removed from the comparison sheet:**
- The substantive "resolution line" two-clause WHY copy. Phase 7's commentary rail carries that load in the arc; the overlay's left rail holds the punchier trash-talk instead.
- Bottom-sheet gestures (swipe-down dismiss, backdrop tap, swipe handle). Full-viewport overlay → dropped. Dismiss is an explicit CTA + an × close button.
- The `POST /api/challenge/{id}/attempt` call. Phase 5 wires this.

**Removed mid-phase-4 (failed iterations now superseded):** two-row lineup display, headline-at-top + lineups-below structure, scale-up-on-tap hack for back-face legibility, multi-flip support. The structured H2H layout above replaces all of them.

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

Real code work, broken into shippable phases. Sequence reordered mid-build (2026-05-26 session) to put the full async loop in front of an end-to-end smoke before late wiring.

1. **Phase 1 — Data layer (shipped, commit d827337):** sender-hand endpoint + write-side population.
2. **Phase 2 — Static H2H reveal screen with mock data (shipped, commit 3de3585):** sport-agnostic component, 3-zone vertical layout, dev-only route mount.
3. **Phase 3 — Animation + per-matchup choreography (shipped, commit 135a90f):** entrance (sequential dealing → middle → travel to strip), pre-reveal anticipation pulse, per-matchup FP rollup + score tick, card-pull motion, end-of-arc hold. Phase 3.5–3.9 amendments documented inline below.
4. **Phase 4 — Results overlay with mock data (this PR):** full-viewport overlay replacing the existing `ChallengeComparisonScreen` bottom-sheet. Flippable lineup display, win/loss state machine, trash-talk punchline, 1-hour countdown timer. Dev-route extended to show the full async loop (reveal arc → overlay) with variant + margin toggles. Mock data only — no `/attempt` POST, no real CTA actions; CTAs render and are clickable but no-op (or console.info) for this phase.
5. **Phase 5 — DEAL transition + real-endpoint wiring:** animated reshape from hold/swap UI into H2H layout (~500ms); recipient client fetches the phase-1 endpoint at DEAL time, drives the sender column from real data, replaces the dev-route mock with the production mount.
6. **Phase 6 — Win/loss climax animation** between end-of-arc and the results overlay. Phase 4 ships with a simple cut/fade placeholder; the real animation lands here.
7. **Phase 7 — Commentary engine:** trigger taxonomy + evaluation + bank integration + rail rendering. Reuses existing banks where possible. The "resolution line" copy that lived on the comparison sheet pre-phase-4 is now this rail's responsibility — the overlay no longer carries expository recap.
8. **Phase 8 — Polish pass:** copy refinement, motion tuning, accessibility audit, visual treatment cleanup across the whole arc + overlay surface. Catch-all for everything deferred during functional builds.

**Single-player code path unchanged** throughout. Tier panels, single-player reveals, etc. stay as-is. H2H is a parallel path branching at DEAL time when in challenge mode.

Effort estimate not produced in this session.

### Phase 2 integration anchors (locked 2026-05-26)

For future phases to extend without re-deriving:

- **Component (sport-agnostic):** `shared/components/H2HRevealScreen.tsx`. Takes resolved sender + recipient data (matching the phase-1 `sender_resolved: true` payload shape) plus a `renderCard` prop for sport-specific battlefield card rendering. No internal state; pure render of an already-resolved hand pair.
- **Mock fixture (basketball-specific):** `basketball/src/dev/h2hMockFixture.ts`. Two resolved hands matching the phase-1 endpoint shape exactly so phase 4's real-data wiring is a drop-in replacement.
- **Dev route mount (basketball):** `basketball/src/dev/H2HRevealMockRoute.tsx`. Wires fixture → `<H2HRevealScreen>` → `<AthleteCard>` as the card renderer. Hosted at pathname `/basketball/dev/h2h-reveal-mock` via regex match in `basketball/src/App.tsx` (matches existing convention for `/basketball/profile/:uuid` and `/basketball/challenge/:uuid`). Production users have no entry point to `/dev/*` paths.
- **Import pattern:** static import + `import.meta.env.DEV` guard at the usage site (`App.tsx` `if (import.meta.env.DEV && devSlug === "h2h-reveal-mock")`). NOT `React.lazy()` — an earlier lazy attempt surfaced a fragility where stale Vite dev-server state (regenerated optimizeDeps with new `?v=` hash, HMR boundary mismatch after the dev/ directory landed mid-session, browser-cached chunk URLs that no longer exist) caused the lazy chunk fetch to 404 with the Suspense boundary hanging silently. Static import sidesteps that entire surface; production builds strip the branch via DCE (Vite constant-folds DEV → `false`, Rollup removes the unreferenced import). Bundle impact in production: ~4 KB residual after tree-shaking (acceptable; the dev-only mock fixture is small).
- **Phase 4 swap-in path:** in real challenge flow, replace the mock fixture with a `fetch('/api/challenge/{id}/sender-hand')` call. The mount component (which becomes the real recipient flow's reveal mount) keeps the same shape: `<H2HRevealScreen sender={...} recipient={...} renderCard={AthleteCardLike} />`.

### Phase 4 integration anchors (locked, this PR)

**Component (sport-agnostic):** `shared/components/H2HResultsOverlay.tsx`. Full-viewport overlay (`position: fixed; inset: 0; z-index: 9000+`). Takes resolved sender + recipient hands (same `H2HHand` shape phase 2/3 already use) plus a `renderCard` prop, plus the result variant + CTA wiring. Same visual chrome as `H2HRevealScreen` — gradient background, inner column `maxWidth: min(480px, 100%)`, glass panel chrome on zone wrappers — so the overlay feels like the same surface as the arc.

**State machine (preserved from `ChallengeComparisonScreen`):**

| Variant       | When                                     | Headline framing | Primary CTA          | Notes                                         |
|---------------|------------------------------------------|------------------|----------------------|-----------------------------------------------|
| `WIN`         | `delta > 0`                              | celebration      | `Send It Back`       | green accent on user total                    |
| `LOSS_OPEN`   | `delta ≤ 0` && window open               | revenge framing  | `Try Again`          | shows 1-hour countdown                        |
| `LOSS_CLOSED` | `delta ≤ 0` && window closed             | pure practice    | `Play your own hand` | no countdown, "doesn't change the score" tag |

Margin nuance further subdivides each variant for the headline copy:

| Margin bucket  | Delta threshold                  | Headline tone                |
|----------------|----------------------------------|------------------------------|
| `photo_finish` | `|delta| ≤ 1`                    | drama, settle-it-on-fresh    |
| `win_narrow`   | `1 < delta < 15`                 | edged-it, keep-the-pressure  |
| `win_blowout`  | `delta ≥ 15`                     | dominant, run-it-back        |
| `loss_narrow`  | `-15 < delta < -1`               | so close, one-more-hand      |
| `loss_blowout` | `delta ≤ -15`                    | rebuild-then-revenge         |

Buckets reuse `trashTalkBucket(delta)` from `shared/commentary/chadChallenge.ts`. Existing internal names use `_big`/`_narrow` rather than the spec's `_blowout` — the overlay maps the existing buckets transparently. The same buckets pick a `chadTrashTalk(bucket, name, delta)` line as the emotional punchline near the headline.

**Headline copy (phase 4 placeholders — polish in phase 8):**

| Variant + bucket           | Headline                                          |
|----------------------------|---------------------------------------------------|
| `WIN` + `win_blowout`      | `Cooked. +{delta} FP over {name}.`                |
| `WIN` + `win_narrow`       | `Got 'em by {delta}.`                             |
| `WIN`/`LOSS` + `photo_finish` | `Photo finish — {delta} FP.`                    |
| `LOSS_OPEN` + `loss_narrow`   | `Off by {delta}. Window's still open.`         |
| `LOSS_OPEN` + `loss_blowout`  | `Off by {delta}. One more swing in the window.` |
| `LOSS_CLOSED` + `loss_narrow` | `Came up {delta} short. Window closed.`        |
| `LOSS_CLOSED` + `loss_blowout`| `Off by {delta}. Window closed.`               |

These are placeholders — locked enough to ship phase 4. Polish pass (phase 8) re-tones them.

**Lineup display:** both hands rendered as horizontal strips of N cards. Same `renderCard` prop pattern as the reveal screen; phase 4 mocks pass an `AthleteCard` renderer with `canFlip={true}` so each card is tap-to-flip. Card back uses the existing `BackBStats` (basketball) / `CardBackGeneric` (sport-agnostic) rendering pipeline — no overlay-specific back layout. The phase 4 mock fixture already includes `gameInfo` + full `statLine` per card, so the back face renders out-of-the-box; **no mock-fixture extensions needed**.

**CTAs preserved from `ChallengeComparisonScreen`:** `Send It Back` (WIN), `Try Again` (LOSS_OPEN), `Play your own hand` (LOSS_CLOSED), plus a `Dismiss` button on every variant. Phase 4 wires these to `console.info` only — real action handlers (clear challengeCtx, navigate, etc.) come in phase 5 when the overlay replaces the production sheet.

**Timer:** 1-hour countdown anchored to a `windowClosesAtMs` prop. Phase 4 mocks supply a 60-minute window from mount. 1Hz interval tick. Urgency styling (red, larger text) at < 5 minutes — same threshold as `ChallengeComparisonScreen.tsx:275`. LOSS_OPEN only.

**Removed from the comparison sheet:**
- The `resolutionLine` substantive two-clause WHY copy is **gone**. Phase 7's commentary rail in the arc carries narrative load; the overlay would duplicate.
- Bottom-sheet gestures (swipe-down dismiss, backdrop tap-to-collapse, swipe handle). Full-viewport overlay → drop. Dismiss stays as an explicit CTA + an × button top-right.
- `POST /api/challenge/{id}/attempt` and the AttemptResult-driven state. Phase 4 mocks the relevant fields (windowClosesAtMs, isWindowOpen) via dev-route controls.

**Simple transition placeholder (phase 4 → phase 6).** Phase 4 ships with a hard cut from arc-end to overlay mount: `phase === "done"` in `useH2HReveal` triggers the dev route to render `<H2HResultsOverlay>` at z-index above the arc. No animation. This is an explicit placeholder for the phase 6 win/loss climax animation.

**Dev-route integration (basketball):** `H2HRevealMockRoute.tsx` extends to host the full loop. New controls:
- `Replay` — restarts arc + overlay from the entrance.
- `Skip to overlay` — bypasses the arc, lands directly on the overlay (for iterating overlay copy/layout without watching the full ~22s arc).
- Variant toggle: `WIN` / `LOSS_OPEN` / `LOSS_CLOSED`.
- Margin toggle: `photo_finish` / `narrow` / `blowout`. (Drives synthetic deltas to exercise headline + trash-talk variants.)
- Overlay reads variant + margin from a small `useResultsVariant` state hook in the route, NOT from the H2H reveal hook (which doesn't know about win/loss). Phase 5 replaces this with derived state from `myScore - challengeCtx.targetScore`.

### Phase 3.10 — entrance revert to slot-direct lay-down

Phase 3.8 introduced "lay at center-stage → travel to slot" choreography. Phase 4 smoke surfaced that the bottom strip's lay-at-middle visual reads as "card appearing at center of screen, then jumping into the strip" rather than "card being placed onto the strip." Reverted to phase 3.7-style slot-direct lay-down: cards lay into their hand-strip slot positions directly with a small fade + slide-from-above (sender) / slide-from-below (recipient) offset (`HAND_STRIP_LAY_OFFSET_PX = 16`).

The TRAVEL stage is now visually a no-op (already at slot from LAY); the stage state machine is preserved in `useH2HReveal` so the pre-reveal anticipation pulse + arc pacing remain stable. `MIDDLE_TRANSLATE_Y_*` constants + `computeMiddleTranslateX` are removed.

### Phase 5b — attempter-roster delivery path (locked 2026-05-28)

Sender-side overlay needs the attempter's resolved roster to render. Locked decision: deliver it through the existing `user_notifications.payload` JSONB column. No new serverless function; no payload bloat beyond the ~6KB roster blob.

**Investigation findings before locking (2026-05-28 session):**
- `challenge_attempts` has `score_breakdown jsonb` column (confirmed via `information_schema`). Plumbed through the write path at `api/challenge/[id]/attempt.ts:36` (destructured from request body) and `attempt.ts:134` (inserted into the row). Currently every row writes `null` — the column is scaffolded but unused.
- `user_notifications` has `payload jsonb` (confirmed via `information_schema`). The notification INSERT lives in the same handler at `attempt.ts:268`, inside the attempt-POST transaction-adjacent flow. The attempter's resolved roster is in scope at this point in the handler.
- No existing API endpoint reads `challenge_attempts` (verified via `grep -rln "challenge_attempts" --include="*.ts" api/ shared/` → only the POST file). Any new read path would require a new serverless function.
- Vercel Hobby function-count cap is 12. Current count is 11 (per `b6e338a` end-state from phase 5a session). One slot of headroom remains; the function-count constraint is binding for any new endpoint.

**Locked write path:**
- The recipient client's attempt-POST is widened to include `score_breakdown: <serialized GeneratedCard[]>` in the request body. Shape mirrors `hand_log.final_roster` exactly (one element per slot, fields per design doc line 170-173). The attempt POST handler requires no code change — `score_breakdown` is already plumbed through.
- The notification INSERT at `attempt.ts:268` is widened to include the attempter's resolved roster inside `user_notifications.payload` JSONB, alongside the existing fields (`challenge_id`, `attempter_score`, `is_winner`).
- Both writes happen in the same handler with the same data in scope. No threading change.

**Locked read path:**
- Sender-side wrapper reads from its own notification row via the existing `GET /api/user/notifications` endpoint (already shipped per the 2026-05-27 audit). No new endpoint.
- The sender's own hand is fetched via the existing `GET /api/challenge/{id}/sender-hand` — the sender retrieves their own resolved roster the same way the recipient retrieves the sender's roster on the recipient overlay.

**Legacy fallback:**
- Notifications written before this cutover have no roster in their payload. Sender tap routes to a text-only fallback summary card (no overlay choreography).
- Parallels the phase 1 `sender_resolved: false` legacy pattern (this doc, "Legacy fallback" subsection of the data-model gap resolution).
- No backfill of historical notifications. Cutover state, like phase 1, is a clean point-forward boundary.

**`challenge_attempts.score_breakdown` is also written** with the same roster blob, even though phase 5b's overlay reads from the notification payload. Rationale: the column already exists, the write path is already plumbed, the cost is zero, and the data lands at its canonical home. Future surfaces (e.g., the parked "challenge history" rollup) can read from `score_breakdown` without needing the notification.

**What this locks out:**
- No new serverless function. Function count stays at 11/12. The remaining slot is reserved for a future challenge-history endpoint or for a real attempt-roster endpoint if a non-notification entry point ever needs one.
- No payload migration on `user_notifications` (column was already `jsonb`).

**Row-size watchpoint:** notification rows grow ~6KB per attempt. Same growth rate the `hand_log.final_roster` watchpoint flags (Phase 1, "Followups parked from this work"). Not blocking; revisit if storage or query performance flags it.

---

### Phase 5b — sender's view of opponent (locked 2026-05-28)

Sender overlay uses the same top/bottom strip semantics as the recipient overlay. **Universal rule across all H2H overlay surfaces: top strip = your opponent in this overlay; bottom strip = you, the viewer.**

On the sender side this means top = attempter, bottom = sender. On the recipient side it means top = sender, bottom = recipient. The rule survives independent of which side is viewing.

**Geometry and invariants inherited unchanged from phase 4 / phase 5a:**
- Pixel-identical Ys on top strip / hero slot row / bottom strip (see phase 4 locked geometry).
- Per-strip flip mechanic. Both hero slots can be filled simultaneously for 1v1 card-back comparison.
- Brightness inversion: active mini-card opacity 1.0, others 0.35. Top and bottom strips drive independently.
- Strip-component sort contract: both strips honor `revealOrder` over `slotIndex`. Sender-side overlay is exactly the kind of "new strip-like surface" the locked invariant section names as bound to this contract from inception.

**Reveal-order symmetry:**
- `buildRevealOrder` (`useH2HReveal.ts:366-371`) is symmetric — it produces a deterministic display order from any resolved roster via `(wasHeld, salary)`.
- Sender wrapper computes `attempterRevealOrder` from the attempter's roster (received via notification payload per Q2 lock above) at mount time. Identical to how the recipient wrapper computes `senderRevealOrder` from the sender's roster.
- No new sort logic. No new sort surface. The contract that landed in amend1 / amend2 covers the sender side by construction.

**FP totals and color binding** (per the layout-structure section's "Right rail" rule):
- Top FP cell = attempter's total, anchored to top hero slot Y.
- Bottom FP cell = sender's total, anchored to bottom hero slot Y.
- "Green if ahead, dimmed if behind" applies to the bottom (sender, the viewer's own row), symmetric to the recipient overlay's binding.

**What this locks out:**
- No inverted layout (option 3B from the 2026-05-28 design session) — top stays opponent, bottom stays "you."
- No "historical" visual treatment on the sender's own strip (option 3C from the same session) — the sender's strip uses the same rendering as the recipient's own strip. Emotional fit of the sender's retrospective view (the sender already played their hand; the overlay is a review of a completed event from their perspective) is addressed in copy register (headline tone, trash-talk wording), not in layout. Deferred to phase 8 copy polish.

**Implementation note:** the sender-side wrapper component is the analog of `H2HRecipientReveal`. It composes the overlay only — no arc, per locked decision E from the 2026-05-26 phase-5 design session (this doc, "Sender flow" section). The arc is recipient-only because the sender already played their hand and doesn't need the reveal choreography; they need the result.

---

### Phase 5b — sender CTA copy parked for phase 8 polish (deferred 2026-05-28)

The sender-side overlay's primary CTA(s) are intentionally deferred to phase 8 copy polish. Phase 5b ships with a placeholder CTA so the surface is functional but the copy/strategy is not yet locked.

**Why deferred:** the CTA decision is the load-bearing social-loop question for the entire H2H feature. It is too important to lock without (a) seeing the surface live and (b) cross-product research into successful async-result-share loops (Wordle, Words with Friends, Strava, BeReal, Snapchat streaks, Pokémon GO raid invites, etc.). The 2026-05-28 design session explicitly identified this as a psychology question, not a mechanical-design question, and called for the social-loop study to inform it rather than designing in the dark.

**Constraint locked for phase 8:**
- Social effectiveness is the load-bearing requirement. Simplicity (single CTA) is secondary.
- Multi-button CTA row is acceptable if effectiveness gains justify it.
- Bringing the user back into the loop (continue playing, initiate another challenge) is the goal, not minimizing chrome.
- The × close in the top-right is preserved (inherited from recipient overlay).

**Candidate framings considered, none locked:**
- **1A — variant-aware single CTA (3 labels by WIN / LOSS_OPEN / LOSS_CLOSED):** mirrors recipient state machine; high familiarity; loses social punch.
- **1B — single CTA, outcome-agnostic:** simplest; minimal social leverage.
- **1C — WIN-only CTA, LOSS no CTA:** matches emotional asymmetry; breaks layout invariant (CTA-present-or-absent geometry not designed).
- **1D — two CTAs, both social, primary + ghost secondary:** `Challenge them back` primary, `Challenge someone else` secondary; leverages warm recipient + captures new-friend intent.
- **1E — three CTAs, full menu:** social + social + inward; decision paralysis risk.
- **1F — two CTAs, both outward-social, no inward option:** structural message of "social is the only action."
- **1G — primary social + secondary inward:** `Challenge them back` primary, `Play another hand` secondary; trades direct "someone else" path for inward-loop retention.

**Phase 5b placeholder CTA:** single button `Play another hand` routing to a fresh single-player deal. Reasoning: lowest-decision option, gives the surface a functional button to validate against, matches today's win-path notification-tap behavior so behavior is not regressed during the cutover.

**Social-loop study (referenced in parallel work):** structured analysis of async-result-share loops in successful and failed products, to inform the phase 8 lock. Out of scope for phase 5b implementation.

---

### Phase 5b — sender-side sign-in nudge revised (locked 2026-05-28, supersedes the same-day "sender-side requires sign-in" lock)

**Revision rationale:** the prior lock ("anonymous users do not see the share surface at all") prioritized clean enforcement but produced a poor discoverability story. Anonymous users had no path to even see the challenge feature exists; they'd encounter it accidentally if at all. The revised approach surfaces the feature to everyone, then gates the *action* rather than the *button*.

**Locked rules:**

**R1 — Anonymous users see the share/challenge surface.** The Challenge a Friend button renders for all users, signed-in or not. The bottom-slot copy area on this surface (the existing slot that sits near the Challenge a Friend button — paired with the top-slot hand-explainer copy) displays placeholder commentary text: "the best part of our game is you can compete with your friends to see who can pull the best games". This is hardcoded for now; wired to the commentary engine when phase 7 ships.

**R2 — Anonymous users gated at button tap, not at button render.** When an anonymous user taps Challenge a Friend, the existing name overlay appears in **anonymous mode**: sign-up/sign-in CTAs are the only path forward. The name input field does NOT appear pre-auth for anonymous users — it appears only AFTER successful sign-up/sign-in, as the existing confirm/edit step. Dismiss at any point returns the user to the game with no challenge created (no anonymous-send path exists).

**R3 — Signed-in users: behavior unchanged.** Tapping the button → name overlay's existing confirm/edit step → challenge POST fires. As before.

**R4 — Server-side enforcement is the source of truth.** The 401 wall at `api/challenge/create.ts:9-10` (the `verifyAuth(req)` call) remains. Client-side gating (R2) is the UX layer; server-side gating is the security/data-integrity layer. Both stay.

**R5 — Anonymous users can still accept challenges as recipients.** This is unchanged from the prior lock. The sender side requires sign-in (server-side enforced); the recipient side does not. An anonymous recipient who completes a challenge exits the H2H surface into the normal game flow (per piece 2 design — see future phase 5b piece 2 sections). Post-challenge sign-up nudging for anonymous recipients is parked for the broader sign-up/sign-in cleanup work, not in scope for this lock.

**R6 — Re-trigger conditions for the sign-up overlay are NOT unified with the new R2 overlay in this commit.** The existing auth-prompt triggers at `GameView.tsx:854-870` (MVP/LEGEND wins, hand-count ≥ 5) remain as a separate code path. Both surfaces exist in parallel for now. Unification + UX smoothing is parked for the broader sign-up/sign-in bulldozing work, which is its own future commit.

**What this locks out:**
- No hiding the share button from anonymous users (reverses the prior lock's render-time gating rule).
- No bypassing the name-overlay sign-up flow for anonymous tappers — they must auth before the challenge POST fires.
- No anonymous-send path: dismiss = abandon challenge.
- No relaxing server-side enforcement.

**Commentary placeholder dependency:** R1's bottom-slot copy is a hardcoded string. Phase 7 (commentary engine) is expected to replace it with engine-driven copy that adapts per-challenge or per-context. Tracked here so the placeholder is not mistaken for a permanent decision.

**Implementation commit (separate, follows this doc lock):**
- Add R1's placeholder copy to the share-CTA surface's bottom-slot area.
- Modify the name overlay to detect `!session` and render in anonymous mode (sign-up/sign-in CTAs only, no name input pre-auth).
- Post-auth: existing confirm/edit name flow runs normally.
- All other auth flows (existing trigger conditions at `GameView.tsx:854-870`) unchanged. Unification is parked per R6.

---

### Phase 5b — sender-side requires sign-in (locked 2026-05-28)

Issuing a challenge requires an authenticated user. Anonymous users do not see the share/challenge surface at all.

**Rationale:**
- Anonymous senders cannot receive notifications. The `user_notifications` table keys on `user_id`; without one, the sender-side reveal flow built in phase 5b commits 1-4 has no delivery target. An anonymous-sender challenge would fire into the void.
- Anonymous identity (`anon_uid` cookies) does not survive device changes, cache clears, or reinstalls. The sender loses access to their own challenges. This breaks the "see who attempted my challenge" loop that is the centerpiece of the feature.
- Anonymous challenges add noise to the challenge graph without contributing to the loop the feature is designed around.

**Server-side state (current, retained):**
- `api/challenge/create.ts:9-10` calls `verifyAuth(req)` and returns 401 if no valid session. `created_by` is set to `user.id` on line 28 — no nullable fallback, no anonymous path. This is correct and aligned with the lock.

**Client-side state (current, requires work):**
- `useChallengeShare.ts:83-86` attempts the POST without an auth header for anonymous users. The 401 surfaces as a generic "Create failed" error via `useChallengeShare.ts:102`.
- The share surface (Challenge a Friend button + surrounding prompt) is not pre-gated on session presence. Anonymous users can land on it (e.g., MVP win on hand 1 if they dismiss the auth-prompt modal at `GameView.tsx:854-870`), tap the button, and see a generic error.

**Required client-side change (separate commit, not phase 5b commit 4):**
- The share/challenge surface must not render for anonymous users. Either hide the Challenge a Friend button entirely or replace it with a sign-in CTA that opens the existing auth-prompt modal.
- The existing auth-prompt triggers at `GameView.tsx:854-870` (MVP/LEGEND wins, hand-count ≥ 5) already convert most anonymous users before they reach the share surface, but the edge case (anonymous user who dismissed the modal) currently produces broken UX.
- Implementation deferred to a focused commit after phase 5b commit 4 ships. Tracked here so it isn't lost.

**What this locks out:**
- No anonymous-sender path is to be added to the challenge feature. If a future product decision wants to revisit this, it requires explicit reversal of this lock (and a redesign of the sender-notification delivery model, since `user_notifications` cannot serve anonymous users without changes).

**Connection to phase 8 (parked Q1 — sender CTA):**
- The phase 8 social-loop study should treat sign-in as a precondition on the sender side. CTA designs that assume an authed sender are correct; CTA designs that try to also serve anonymous senders are not in scope.

**EDIT 2026-05-28 (added same day):** The "no rendering for anonymous users" rule above has been **superseded** by the subsequent "sender-side sign-in nudge revised" lock below. See that section. The rationale (sign-in required to issue challenges) is preserved; the enforcement mechanism shifted from render-time gating to tap-time gating, with the existing name overlay serving as the sign-up/sign-in surface.

---

### Phase 5a amend3 — spoiler flash fix on transition (2026-05-27)

Production verification of f6f8d05 + amend1 + amend2 surfaced a ~250ms window during the HOLD-to-arc crossfade where the user briefly saw the fully-resolved state (final scores, headline, CTA) before entrance choreography began. Defeated the purpose of the reveal — the user saw the answer before the question.

**Root cause:** `useH2HReveal` defaults `phase = "done"` on mount (originally designed so the dev-route phase-2 static end-state could render correctly without ever calling `play()`). The production wrapper inherited that default. `H2HRecipientReveal`'s outer `<div>` mounts with `opacity: 0`, then the wrapper's rAF flips `visible=true` and CSS transitions opacity 0 → 1 over `HOLD_TO_ARC_CROSSFADE_MS=250ms`. During that 250ms ramp, both `H2HRevealScreen` AND `H2HResultsOverlay` are already rendering underneath — the hook says we're done, so `showOverlay = (reveal.phase === "done")` is true on the first frame and `useCrossfade` mounts the overlay visible immediately. After the 250ms ramp, `reveal.play()` finally fires and hard-resets state to `phase="entering"` + zero totals. The user sees the resolved overlay fade in, then snap back to the entrance.

**Fix:** `useH2HReveal` now accepts an `initialPhase?: "idle" | "done"` option, defaulting to `"done"`. Production wrappers (`H2HRecipientReveal`) pass `"idle"`. When idle, the initial state is: `phase="idle"`, `matchupIndex=-1`, `senderRunningTotal=0`, `recipientRunningTotal=0`, `entranceStages` all `"pre"`. `showOverlay = (phase === "done")` is now `false` on mount, so `useCrossfade` doesn't mount the overlay visible during the wrapper crossfade-in. The arc renders the entrance-pre state behind the wrapper opacity. `reveal.play()` fires after the 250ms crossfade as before, transitioning `idle → entering` with no visual jump because the visible state was already pre-play.

The dev mock route does not pass `initialPhase` and so inherits the `"done"` default — its phase-2 static end-state behavior is preserved bit-for-bit.

**Locked invariant:** Production wrapper always passes `initialPhase: "idle"`. The hook's `"done"` default is reserved for static-end-state callers (dev route, future server-rendered preview cards, etc.). Only `"idle"` and `"done"` produce stable starting states; other phases require state machinery only `play()` populates.

Regression-lock test: `useH2HReveal.test.tsx` adds a test asserting `initialPhase: "idle"` mounts with zero totals + all-`"pre"` entrance stages, and `play()` cleanly transitions to `"entering"`.

---

### Phase 5a amend2 — overlay strip also sorted by revealOrder (2026-05-27)

Production verification of amend1 appeared to show the bug persisting after deploy. Root cause: amend1 fixed `H2HRevealScreen`'s `HandStrip` (the arc strips) but missed the parallel render layer in `H2HResultsOverlay`'s `ResultsStrip` (the overlay strips). The overlay is what's visible AFTER the arc completes — it crossfades in at `reveal.phase === "done"` and covers the arc with its own strip rendering. The user's screenshots showing held cards in the leftmost slot were of the OVERLAY, not the arc.

Both renderers share the same data + same design rule but had independent sort implementations; amend1's fix at one site was a half-fix.

**Surface observation:** post-amend1 production showed the strip-order bug surviving exactly because the user reads strip order AFTER the arc crossfade lands, i.e. on the overlay. The arc strips were already correct from amend1; the overlay strips were not.

Fix shape mirrors amend1 exactly:
- `H2HResultsOverlay`'s `ResultsStrip` accepts an optional `revealOrder?: H2HCard[]` prop and prefers it in its `ordered` `useMemo`, falling back to `slotIndex` sort for static dev/test paths.
- `H2HResultsOverlay` accepts top-level `senderRevealOrder?` + `recipientRevealOrder?` props and threads each into the corresponding `ResultsStrip` call site.
- `H2HRecipientReveal` (the production wrapper) passes `reveal?.senderRevealOrder` + `reveal?.recipientRevealOrder` into the overlay, drawing from the same `useH2HReveal` hook return already in scope.

**Locked invariant (extended from amend1):** `revealOrder` is the canonical sort for ALL strip surfaces, not just the arc. Any new strip-rendering component MUST accept and prefer `revealOrder` over `slotIndex`. The two strip render paths now share a uniform sort rule even though their implementations remain independent.

Regression-lock test: `H2HResultsOverlay.test.tsx` adds a deliberately misaligned-`slotIndex` fixture and asserts the overlay strip displays in revealOrder, not slotIndex order. Parallel to amend1's `HandStrip` test.

---

### Lessons learned during phase 5a (2026-05-27)

Three architectural lessons surfaced during the amend1 / amend2 / amend3 fix loop. Capturing them here alongside the fixes themselves so future surfaces don't repeat the same bug shapes.

#### Lesson 1: Arc and overlay are parallel render surfaces.

`H2HRevealScreen` (arc) and `H2HResultsOverlay` (overlay) both render hand strips. Fixing one does not fix the other — the amend1/amend2 split was caused by exactly this oversight, and the user lost two verification rounds reading the strip from the overlay after only the arc had been patched. Future strip-like surfaces (sender flow, summary cards, replay viewer) must accept and respect the same sort contract from inception.

#### Lesson 2: Mock fixture coincidences hide bugs.

`h2hMockFixture.ts`'s `slotIndex` was hand-authored to match `buildRevealOrder`'s `(wasHeld, salary)` output. That coincidence hid the slotIndex-vs-revealOrder bug from every round of dev testing — both the arc strips and the overlay strips looked correct against the mock because the two orderings happened to agree. When authoring future test fixtures, deliberately misalign data shape from sort-order expectation when both are independently variable in production. The amend1 and amend2 contract-lock tests now embed this discipline (misaligned `slotIndex` on purpose).

#### Lesson 3: Dev defaults can be production traps.

`useH2HReveal`'s `phase = "done"` default was correct for the dev mock route's static end-state rendering, but caused the amend3 spoiler flash in production because the wrapper inherited the default. When a hook has dev-affordance defaults, prefer explicit opt-in from the production caller (`initialPhase: "idle"`) rather than default-inheritance. The dev route gets the convenience default; production declares its starting state at the call site.

---

### Locked invariant — strip-component sort contract

Any component that renders an `H2HCard`-shaped array in a horizontal strip MUST:

- Accept `revealOrder` (or equivalent) as a prop.
- Prefer `revealOrder` over `slotIndex` (or any other intrinsic sort) when provided.
- Fall back to a deterministic default (`slotIndex` ascending) only for static/dev/test surfaces where `revealOrder` is not computed.

**Rationale:** `slotIndex` is deal-positional in production data (basketball: PG/SG/SF/PF/C/FLEX), NOT display-order. The mock fixture's `slotIndex` matches `revealOrder` by coincidence; production data does not. Trusting `slotIndex` for display means held cards land wherever they sat in the deal — including the leftmost strip slot.

**Components currently honoring this contract:**
- `HandStrip` (inside `H2HRevealScreen`) — fixed by amend1.
- `ResultsStrip` (inside `H2HResultsOverlay`) — fixed by amend2.

**New strip-like surfaces (sender-side overlay, summary cards, replay viewer, future analytics dashboards) must include this contract from inception.** The contract-lock tests on both existing components serve as the template — deliberately misaligned `slotIndex` against the design rule, asserted via DOM order.

---

### Phase 5a amend1 — strip display sorted by revealOrder, not slotIndex (2026-05-27)

Production-data verification of f6f8d05 surfaced a sort-order bug: HandStrip rendered cards by `slotIndex`, but production `hand_log.final_roster` stores `slotIndex` as deal-positional (basketball's PG/SG/SF/PF/C/FLEX), not in reveal-order. The mock fixture coincidentally had `slotIndex` match `(wasHeld, salary)`, hiding the bug during dev. The first real recipient hand showed a held $57 card in the leftmost strip slot and the cheapest swap displaced to the right.

Fix: HandStrip's `ordered` computation at `H2HRevealScreen.tsx:374-388` now sorts by `revealOrder` (server-computed via `buildRevealOrder` at `useH2HReveal.ts:366-371`, already threaded through props as `senderRevealOrder` / `recipientRevealOrder`) when provided. Falls back to `slotIndex` sort for the static phase-2 dev/test path that doesn't compute revealOrder. Production callers always pass revealOrder; legacy phase-2 callers don't change.

**Locked invariant:** `revealOrder` is the canonical display + reveal sequence for the H2H strips. `slotIndex` is deal-positional and not display-relevant except as a fallback for dev surfaces.

Regression-lock test: `H2HRevealScreen.test.tsx` adds a fixture with `slotIndex` deliberately misaligned from `(wasHeld, salary)` and asserts the strip displays in revealOrder, not slotIndex order. A future change that reverts to slotIndex-driven sorting now fails loudly.

---

### Phase 4 amend9 — shake + blast emotional reveal with band-vs-dead-band contrast (2026-05-27)

After amend8, cards arrived in the hero slot and rolled up FP directly with no pre-rollup buildup. Single-player's emotional reveal language (shake before reveal, blast at the moment of stamp) was absent in H2H. The user's rule: match single-player's shake + blast for band-tier cards (cardShakeType ∈ `{legendary, big, cold, frozen}`); give dead-band cards (cardShakeType `null`) a short plain "hype" shake — no blast — so band cards feel meaningfully bigger by contrast.

Per-matchup gating: the rollup waits for the slower of sender + recipient pre-rollup beats so each 1v1 pair completes before the next set begins.

**Fix landed:**
- `useH2HReveal` adds per-side state: `senderShakeInfo`, `recipientShakeInfo`, `senderGlowState`, `recipientGlowState` — parallel to single-player's `setShakeInfo` / `setGlowState`, which are single-card by design.
- New `planRevealBeats(card)` helper computes per-card beat plan: `shakeType`, `shakePre`, `blastEnabled`, `glowTier`, `glowDurationMs`, `postBlastDelay`, `legendaryCelebrationShake`. Band-tier shake durations match single-player's `SHAKE_DURATION_MS_*` constants (400 / 550 / 700). Dead-band returns `shakeType="hype"`, `shakePre=200`, `blastEnabled=false`.
- `runMatchup` restructured: at matchup-enter, apply shake + (conditional) blast immediately. Compute `maxShakePre + maxPostBlastDelay` across both cards. At `T=maxShakePre`, clear shake props. At `T=maxShakePre + maxPostBlastDelay`, begin rollup (existing sentinel write + RAF tick run inside this deferred callback).
- Glow duration formula ported verbatim from `shared/views/GameView.tsx:999-1033` (base tier value + shake-type modifier; no skip-mode override since H2H always runs full duration).
- Legendary cards get a post-rollup celebration shake re-firing per-side `setShakeInfo` for `SHAKE_DURATION_MS_DEFAULT` (mirrors single-player `useEmotionalReveal.ts:459-465`).
- All shake/glow timers integrate with the existing run-id cancel pattern via `scheduleTimeout`.

**Locked invariants:**
- **Matchup gating.** Both cards' pre-rollup beats must complete before the rollup begins. Arc duration becomes variable based on shake-type distribution — a hand of dead-band cards plays faster than a hand of band-tier cards.
- **`"hype"` is reserved for H2H dead-band.** Single-player does not produce `"hype"` from `getShakeType` (verified at `useEmotionalReveal.ts:156-171`); the keyframe at `PlayerCardShell.tsx:98-110` + the type-union slot at `useEmotionalReveal.ts:30` are H2H's exclusively.
- **No blast for dead-band cards.** Blast is the "this matters" beat; reserving it for band-tier cards keeps the visual hierarchy clear.

---

### Phase 4 amend8 — pre-reveal rule + Option β brightness (2026-05-27)

After amend7, ALL post-reveal content (FP, badges, fire/ice) was visible on all 12 cards from arc-start, regardless of whether that specific card had taken its turn in the hero zone. The user's rule: H2H should match single-player's reveal language exactly — no post-reveal content visible until the card has been revealed in the hero slot.

Root cause: H2H renderers passed `phase="RESULTS"` plus full card data from arc-start, so CardFront's post-reveal layer was visible from frame zero. CardFront's `isPreReveal` gate at `L335` additionally carved out held cards via `!isHeldCard`, which would have prevented the State B visual from applying to the 4 of 12 H2H cards marked `wasHeld=true`.

**Fix landed:**
- `useH2HReveal` exposes new `revealedCardIds: Set<string>` derived from `visibleFpMap` (entry exists AND `visibleFp >= actualFp`).
- `H2HRevealScreen` threads `revealed` through `CardRenderer` options to every renderCard call (strip, hero, entrance deck).
- `renderBattlefieldCard` gates badges + cardShakeType on `isRevealed`: pre-reveal cells get `badges=[]` and `cardShakeType=null`; revealed cells get `card.achievements` + `shakeForCard(card)`.
- `renderBattlefieldCard` passes `isRevealing={!isRevealed}` so CardFront's State B path activates for pre-reveal cards.
- New `ignoreHeldStatus` prop on CardFront + PlayerCardShell. When true, the `isPreReveal` gate at `CardFront.tsx:335` ignores the `!isHeldCard` carve-out — held cards in H2H follow the same pre-reveal rule as non-held cards. H2H renderers always pass `ignoreHeldStatus=true`; single-player call sites do not pass this prop (default false; behavior preserved).

**Brightness invariant (Option β — supersedes amend5's rule):**
- **Bright** (opacity 1) = active card OR pre-reveal card
- **Dim** (opacity 0.35) = post-revealed card that is NOT currently active
- Three reveal states collapse to two visual bands. Top + bottom strips remain independent (amend5 invariant preserved).

**Locked invariant:** H2H always overrides single-player's held-card optimization. Held cards in H2H follow the same reveal choreography as non-held cards — there is no held-card carve-out in H2H.

---

### Phase 4 amend7 — fire/ice live-render fix (2026-05-27)

Amend6 wired `cardShakeType` through both H2H renderers but no fire/ice gradient appeared in live browser. Live-browser console instrumentation surfaced TWO defects:

**Defect A:** H2H strip + overlay renderers passed `visibleFp=undefined`, causing PlayerCardShell's stamp effect at `L393-413` to bail at `if (visibleFp === undefined) return;` for 20 of 24 card mounts. The amend6 wiring was correct as documented, but the stamp-firing PRECONDITION (`visibleFp` must reach `actualFp`) was never satisfiable for static cells.

**Defect B:** `useH2HReveal.runMatchup` wrote `visibleFp=0.001` as a one-shot sentinel meant to TRIGGER CardFront's RAF, but PlayerCardShell's stamp effect reads `visibleFp` as a LIVE-COUNTING value and waits for it to reach `actualFp`. The hook never advanced the map past 0.001, so the actively-rolling battlefield card also failed to fire its stamp.

**Fix landed:**
- New optional `staticEndState` prop on PlayerCardShell + `CardShellProps`. When true AND `cardShakeType` is set, the stamp effect fires immediately on mount, bypassing the rollup-complete precondition. Single-player call sites do NOT pass this prop (default `false`; behavior preserved).
- H2H renderers pass `staticEndState=true` for static strip + overlay cells via `renderBattlefieldCard` + `renderOverlayCard`.
- `useH2HReveal.runMatchup` tick closure now advances `visibleFpMap` each tick via `setVisibleFpMap(prev => new Map(prev).set(cardId, eased * target))`, mirroring `useEmotionalReveal.ts:490`. Terminal tick locks to `actualFp` mirroring `L495`. CardFront's internal RAF ignores these post-trigger updates (per the `animatingRef` gate at `CardFront.tsx:379`) so the visual count-up is unaffected; only the stamp pipeline gains the signal.

**Locked invariant:** PlayerCardShell's stamp effect is a two-branch state machine — `rollupComplete` (existing path) for animated reveals, OR `staticEndState` (new branch) for callers that know no rollup will arrive. Single-player keeps the existing path; H2H is the only current caller of the new branch.

---

### Phase 4 amend6 — fix hero photo mismatch + wire fire/ice tier effects (2026-05-27)

Two bug fixes documented as known issues in amend5; landed as the first amend after the phase 4 force-push.

**Bug A — hero photo mismatch (root cause: wrong basePlayerIds in fixture).** `BasketballHero` builds the headshot URL from `card.basePlayerId` via `headshotUrl(basePlayerId)`. Three fixture rows had copy-paste-wrong NBA IDs:
- Naz Reid: `1629029` (Luka Dončić's ID) → corrected to `1629675`.
- Bobby Portis: `1629638` (Nickeil Alexander-Walker) → corrected to `1626171`.
- Tyrese Maxey: `1629680` (Matisse Thybulle) → corrected to `1630178`.

The user's perception that "the strip cell showed the correct headshot" was a small-scale illusion — strip cells use the same `BasketballHero` and same wrong URL; at ~55px wide the wrong face is hard to recognize, while at hero scale (~125px) the Lakers jersey gave it away.

**Bug B — fire/ice regression (root cause: `cardShakeType` not forwarded from H2H renderers).** Single-player passes `cardShakeType` from `useEmotionalReveal.cardShakeTypeMap` to each card; `PlayerCardShell` turns it into an `OverlayStamp` (SMOKING HOT / ON FIRE / ICE COLD / FREEZING) when the FP rollup completes; `CardFront` reads the stamp and renders the fire/ice gradient. The two H2H renderers (`renderBattlefieldCard` arc + `renderOverlayCard` overlay) were never passing the prop. Fix: import `getShakeType` from `@shared/hooks/useEmotionalReveal`, derive `cardShakeType = getShakeType(card, false)` per card, pass to both renderers. To get a FIRE-class card in the mock for demonstration, Giannis's `projectedFp` was lowered 54 → 40 (display-only field; totalFp is summed from actualFps so totals are unaffected).

Known limitation: chrome `--headless --virtual-time-budget` doesn't reliably advance the per-matchup RAF rollup past matchup 0, so headless captures can't easily land at the moment stamp + gradient appear. Verification requires live-browser observation of each matchup completing its rollup.

---

### Phase 4 amend5 — hero visible while deck depleted + invert mini-card brightness (2026-05-27)

Two fixes on top of amend4.

**Hero zone occupied throughout the entrance.** Amend4 fixed the empty-middle during `anticipating` but a ~750ms gap remained during `entering`: between the moment the last `pre` card transitioned to `lay` (deck visual depleted to 0) and the moment phase transitioned to `anticipating`. Fix: `useH2HReveal.activeMatchup` now returns `matchups[0]` during `entering` as soon as `entranceStages.some(s => s === "pre")` is false. `H2HRevealScreen` switches its conditional from `isEntering` to `showEntranceDeck = isEntering && deckHasPreCards` — the deck visual renders only while cards remain; otherwise CardCenterCell renders matchup-0 hero cards. Net: the hero zone is occupied by the deck OR the matchup-0 cards at every instant of the arc.

**Mini-card brightness inverted.** Previously the active mini-card (whose card was in the hero slot) was dimmed and the other 10 were bright — the user's eye was drawn to inactive cards. New rule: active = bright (opacity 1), others on the same strip = dimmed (opacity 0.35). When no card is active on a strip (overlay default state, no flip), all 6 cards on that strip render bright. Top + bottom strips are independent — on the overlay, flipping a card in only one strip brightens that strip's selection and dims its other 5 cells without affecting the other strip.

---

### Phase 4 amend4 — eliminate empty-middle state + pixel-identical hero-cell heights (2026-05-27)

Two bug fixes on top of amend3.

**Empty-middle state during `anticipating` eliminated.** `useH2HReveal.activeMatchup` returned `{ sender: null, recipient: null }` for `anticipating` phase. The hero zone rendered as empty placeholders for the ~1.65s pre-reveal pulse window. Fix: `activeMatchup` anchors on `matchups[0]` during `anticipating`. The matchup-0 hero cards appear the moment the entrance settles; the pulse plays on the strip cells while the heroes wait above. No URL param, dev control, or normal flow can produce a strips-present-middle-empty render anymore.

**Pixel-identical hero cell heights.** The overlay's `HeroCell` collapsed to `minHeight: 60px` when empty, while the arc's `CardCenterCell` always renders at `aspectRatio: "329 / 478"` regardless of card presence. That mismatch (~240px difference across 2 rows) pulled the overlay's bottom strip up by ~240px relative to the arc, breaking the locked-geometry invariant. Fix: empty hero cells in the overlay also use `aspectRatio: "329 / 478"`. The cell reserves the same Y span whether empty or occupied. `EMPTY_HERO_CELL_MIN_HEIGHT_PX` constant removed.

Verified pixel-parity at 390×844: top strip Y, both hero slot Ys, bottom strip Y all agree within ±2px between arc and overlay captures.

---

### Phase 4 amend3 — tight top-to-bottom composition + reserved space BELOW bottom strip (2026-05-27)

Correction to the locked-geometry model from amend2: the flex-grow reserved space sat BETWEEN the bottom hero and the bottom strip, which pushed the bottom strip to the viewport bottom and stretched the hero zone. That's wrong.

The correct model:

> **The top-strip → hero-pair → bottom-strip block is ONE tight vertical composition near the top of the viewport. Strips are positioned relative to the hero cards with fixed small gaps, not pulled to viewport edges. ALL remaining viewport space sits BELOW the bottom strip.**

Layout from top to bottom (locked across entrance / arc / overlay):

```
safe-area + 20 paddingTop
↓
Top strip (MIKE header + 6 cards)              ← ~110-130px
↓ 18px fixed gap
Top hero slot                                   ← full hero card
↓ 14px sliver
Bottom hero slot                                ← full hero card
↓ 18px fixed gap
Bottom strip (6 cards + YOU header)             ← ~110-130px
↓
Reserved bottom space (flex: 1 1 auto)
  on arc: empty
  on overlay: countdown (if LOSS_OPEN) + primary CTA
              anchored flex-end + paddingTop:16 so it
              hugs the bottom for thumb position
↓
safe-area + 20 paddingBottom
```

The reserved space's `flex: 1 1 auto` absorbs all extra viewport height. Result: the tight top block stays anchored near the top regardless of viewport tallness, hero content, or variant.

Locked invariant (still): top strip Y, both hero slot Ys, and bottom strip Y are pixel-identical between the arc and the overlay. Only what fills the hero slots (active matchup vs flipped backs) and what sits below the bottom strip (empty vs CTA) changes.

---

### Phase 4 amend2 — real-deck entrance + locked geometry + TIE/EVEN removal (2026-05-27)

Four corrections to the first phase 4 restructure (below), landed as a second amend on top of `c2e78fb`.

**Real face-up deck (replaces face-down placeholders).** The `EntranceDeck` no longer renders an N-tall stack of `CardBackGeneric` placeholders. Instead, each deck shows the **real cards still in `pre` state**, layered with a small Y offset so the stack reads as a depth pile. The TOP of each stack is the next-to-deal card — its **full FRONT** is visible (player photo, tier color, name, salary). As that card's stage transitions `pre → lay`, it flies out (rendered in `HandStrip` via `deckTransform`) and the next card underneath becomes the new visible top. Visual model: a dealer's stack. The deck visibly depletes; when the last card flies, both decks unmount.

Implementation: `EntranceDeck` props are now `{ cards: H2HCard[], entranceStages: EntranceStage[], renderCard: CardRenderer }`. It filters `cards` to the `pre`-stage subset and renders them stacked, ordered by stage_index so the lowest-index card sits on top. Each layer below the top gets `translateY(layer * 4px)` + a small opacity dim. Reveal-orders (`senderRevealOrder`, `recipientRevealOrder`) come from `useH2HReveal`; each side renders its own deck.

**Transient TIE / EVEN insignia removed.** The final-margin pill ("TIE / EVEN / +N.N YOU / +N.N OPP") was removed from `MidRailContent` entirely. It flashed as "TIE / EVEN" for an instant at the start of `revealing` when both running totals were still 0 (the rolling totals animate in over `BATTLEFIELD_TRAVEL_DURATION_MS`). The overall margin is conveyed by the two FP totals themselves; the user does not need a separate readout. `MidRailContent` now renders ONLY the per-matchup delta.

**Locked geometry between arc and overlay.** This is the load-bearing invariant of the amend:

> The TOP STRIP, both HERO SLOTS, and the BOTTOM STRIP render at IDENTICAL pixel positions on the arc and the overlay. Nothing moves between states. Only the **content** of those zones changes.

Both `H2HRevealScreen` and `H2HResultsOverlay` now use the same outer flex column with `justifyContent: "flex-start"`, the same paired `safe-area + 36px` paddings, the same `LEFT_RAIL_WIDTH_PX (100)` + `RIGHT_RAIL_WIDTH_PX (80)` columns, and the same `BATTLEFIELD_ROW_GAP_PX (14)` sliver between the two hero rows.

Layout structure (identical on both surfaces):

```
[ safe-area + 36 padding ]
[ Top zone: MIKE header + top strip ]                       ← anchored to TOP
[ Battlefield grid (2 rows, sliver gap):
    ┌─ left rail ─┬─ top hero ──┬─ top score ─┐
    │             ├─ sliver ────┤             │
    │             ├─ bottom hero ┤  bottom    │
    │             │             │  score      │
    └─────────────┴─────────────┴─────────────┘
    Left rail content swaps per state:
      arc → empty
      overlay → headline + trash-talk (spans both rows)
    Right rail content:
      arc → FP totals + absolute matchup-delta float
      overlay → FP totals only
    Hero cells content:
      arc → active matchup cards (CardCenterCell or EntranceDeck)
      overlay → flipped card backs (per-strip flip, both can be filled)
]
[ Reserved bottom space (flex: 1 1 auto, fills slack) ]    ← empty on arc; CTA on overlay
[ Bottom zone: bottom strip + YOU header ]                  ← anchored to BOTTOM via flex-grow above
[ safe-area + 36 padding ]
```

The per-matchup delta (matchup readout) renders on the arc only, **absolutely positioned** inside the battlefield grid at `right: 0, top: 50%, transform: translateY(-50%)`. Absolute = doesn't push the hero rows apart, so the sliver gap stays consistent.

The reserved bottom space is the geometry-locking spacer: `flex: 1 1 auto` absorbs any extra viewport height so the bottom strip sits at a fixed Y from the safe-area bottom regardless of variant, viewport tallness, or hero-zone content.

**Safe-area floor bumped 24 → 36.** Both surfaces' `paddingTop` and `paddingBottom` floors increase so the MIKE/YOU player headers never sit tight to a notch or viewport edge on real iOS devices.

---

### Phase 4 restructure — deck entrance + arc layout tighten + overlay 3-zone middle + per-strip flip

Three connected restructures to phase 3 + phase 4, landed in a single amend on 2026-05-27.

**Deck-metaphor entrance (replaces phase 3.10 slot-direct lay-down).** When the entering phase begins, two card-back deck stacks render at the top and bottom hero-card positions (existing `CardBackGeneric` reused — diamond grid + center emblem + REPLAY IFS wordmark). Each deck shows N face-down cards stacked (basketball N=6). As each stage_index advances `pre → lay`, the corresponding card flies out from its deck to its strip slot. Both sides' stage_index 0 cards fly simultaneously (same pairing invariant from phase 3.9). As cards leave, the deck visibly shrinks (count = number of stage_indexes still in "pre"). When the last card flies, both decks unmount and the anticipation beat (stillness → pulse → matchup 0) begins.

The flight animation: the strip cell's content transforms from deck position (hero-zone center, hero-card scale) to slot position (strip cell, mini scale) over `CARD_LAY_MS`. Re-uses the phase 3.8 "lay at middle then travel" geometry — the difference from the prior phase 3.8 attempt is that the deck visualization at the source point makes the motion read as "card emerging from a stack" rather than "card appearing in the middle of the screen for no reason." The deck supplies the missing context.

The "TIE / EVEN" insignia + per-matchup delta in the middle row of the battlefield grid is hidden during the entering phase. The mid-rail content only renders when matchups are active (`phase === "revealing"` or `paused`).

**Arc layout adjustments.** Two changes to the battlefield-zone layout during the reveal phase + end-state:
- The per-matchup delta (e.g., "-3.7 MATCHUP" / "+11.0 OPP") moves OUT of the mid-rail (between the two hero cards) and into the RIGHT RAIL, positioned between the two FP totals. Right-rail vertical order: sender total → matchup delta → recipient total.
- The two hero cards tighten together — the mid-rail row shrinks to a thin sliver. The hero cards remain visibly separated (do not touch) but read as one clash unit. Implementation: `BATTLEFIELD_ROW_GAP_PX` reduced and the mid-rail row's content (delta + margin pill) removed.
- Top strip ("MIKE") and bottom strip ("YOU") stay at their exact current vertical positions. Bottom hero moves UP to close the gap with the top hero, opening up unused vertical space below the bottom hero before the bottom strip. The unused space is intentional — it becomes the CTA band in the overlay (see below).

**Results overlay — 3-zone middle structure.** The arc's static end-state structure carries into the overlay (top strip → middle → bottom strip), but the middle's content rearranges into three zones rendered as columns in the existing battlefield grid:
- **Left zone (~120-150px on mobile):** Headline + trash-talk. Text-only, no glass-panel chrome. Headline color tracks variant (green WIN / red LOSS_OPEN / muted LOSS_CLOSED / amber photo_finish). Spans the full hero-zone vertical range.
- **Center zone (two hero card slots):** Empty by default. Tapping a strip card flips it at the matching hero slot.
- **Right zone (~64px):** Two FP totals stacked vertically. Top FP anchored to top hero slot Y; bottom FP anchored to bottom hero slot Y. NO matchup-delta pill in the middle — the result is implicit from the two totals (and the new arc layout already moved the delta into the right rail, so removing it from the overlay's right zone keeps the rail content stable).

Strip positions in the overlay match the arc's static end-state exactly — no jump on transition.

**Per-strip card flip (replaces single-flip-across-both-strips).** Independent flip state per side:
- One card in the TOP strip can be flipped at a time; tapping a top-strip card sets the TOP hero slot. Tap another top-strip card → swap. Tap the same card → unflip top.
- One card in the BOTTOM strip can be flipped at a time, independently from top.
- BOTH hero slots can be filled simultaneously, enabling 1v1 card-back comparison across players.
- The flipped strip cell dims to ~0.35 opacity to signal "currently shown."
- Card backs render at full hero card size in the matching hero slot — no scale-up hack. Reuses existing `BackBStats` pipeline.

**CTA placement.** The vertical space below the bottom strip houses the primary CTA — `Send It Back` (WIN) / `Try Again` (LOSS_OPEN) / `Play your own hand` (LOSS_CLOSED). Full-width orange button. Dismiss CTA REMOVED — the × button in the top-right handles dismiss exclusively. For LOSS_OPEN, the countdown pill sits above the primary CTA.

### Phase 4 amendment — strip-density lineup + scale-up flip + crossfade

Three layered fixes after the initial phase 4 smoke:

**Lineups at hand-strip density.** The initial overlay rendered cards at ~150px tall in two-row strips that overflowed the viewport, occluded each other, and blocked the LOSS_OPEN countdown. Reverted to hand-strip density (~55px wide × 80px tall — same as `H2HRevealScreen.HandStrip`) so all 12 cards fit on mobile, no overlap, full visual continuity with the arc.

**Scale-up on flip.** At hand-strip density the back face is illegible. Tap-to-flip now scales the cell's content up by `FLIPPED_SCALE_BOOST = 2.4×` (visual goes ~55px → ~130px wide). Combined with `z-index: 100` on the flipped cell, the enlarged card pops above neighbors and the back-face stats are readable. Tap again returns to strip density.

**Overlay-owned flip state.** Lifted `flippedIds` out of the dev route and into `H2HResultsOverlay` itself. Callers don't thread flip state. The `CardRenderer` signature extends with an `options.flipped` flag; the cell wrapper owns the click. Tests verify toggle-on-click and `initialFlippedIds` seed prop.

**Crossfade arc → overlay (350ms placeholder for phase 6).** Phase 4 originally hard-cut from arc end-state to overlay mount. The overlay now accepts a `visible` prop; when false it fades to `opacity: 0` + `pointer-events: none` over `OVERLAY_CROSSFADE_MS = 350ms`. The dev route's `useCrossfade` hook coordinates mount/unmount with the same duration. Phase 6's win/loss climax animation replaces this placeholder with the real transition.

**Dev-route dismissed flag.** Added a `dismissed` state in the dev route. The × button and Dismiss CTA both flip it true → overlay crossfades out → underlying arc end-state is visible again. Replay clears it.

### Phase 3.9 — entrance order invariant + pre-reveal anticipation beat

Two refinements layered on phase 3.8.

**Both strips lay leftmost-first (same direction, paired by reveal order).** The phase 3.8 implementation mapped sender's stage_index by mirrored display position so the user saw bottom-left + top-right cards land first. Reverting that — both strips now follow the SAME entrance order as the reveal arc (cheapest swap first, working up through swaps, then held cards by salary). When card 1 lays at the middle, BOTH sides' card 1 land at the same instant; same for cards 2-6.

Implementation: HandStrip looks up each card's stage_index via `revealOrder.indexOf(card)`. The hook exposes `senderRevealOrder` and `recipientRevealOrder`; both are passed through to their respective HandStrip. For the mock fixture (where `slotIndex` happens to match reveal order), this maps to `stage_index = displayPos` on both sides. Phase 4's real data — where slotIndex is deal-order and reveal-order is recomputed — gets the same invariant for free.

**Pre-reveal anticipation beat.** A new `"anticipating"` phase between `entering` and `revealing`. Three sub-phases:

| Sub-phase   | Duration                          | Behavior                                                  |
|-------------|-----------------------------------|-----------------------------------------------------------|
| Stillness   | `POST_ENTRANCE_STILLNESS_MS` = 700ms | Silent hold. Cards in slots, no animation. Anticipation. |
| Pulse       | `ENERGY_PULSE_MS` = 700ms         | `pulseActive` = true. All 12 cells glow with their tier color via a single rise/peak/fade @keyframes (`h2h-card-pulse`). Subtle scale pulse 1.0 → 1.025 → 1.0 synced with the glow. |
| Settle      | `POST_PULSE_SETTLE_MS` = 250ms    | `pulseActive` = false. Glow fades; brief breath before matchup 0. |

Total beat: ~1.65s. Replaces the prior single `PRE_REVEAL_PAUSE_MS = 700ms` pause.

Tier color is piped per cell via `--h2h-pulse-color` CSS variable (set inline from `TIER_ACCENT[card.tier]`); the same `@keyframes h2h-card-pulse` rule drives every card with `box-shadow: 0 0 18px 6px var(--h2h-pulse-color)` at the 50% peak. Collective effect: a multicolored "charging for battle" moment, not a single uniform glow.

**Hook state additions:**
- `pulseActive: boolean` — true during the `ENERGY_PULSE_MS` window only.
- `phase: "anticipating"` — added between entering and revealing.
- `activeMatchup` returns `{null, null}` during anticipating (battlefield empty; BattlefieldSlot's placeholder keeps grid row height).
- Reduced-motion path unchanged — skips entrance AND anticipation beat.

**Dev controls.** During `anticipating`, the progress string reads `still` then `pulse`, then transitions to `1/6` when matchup 0 starts.

### Phase 3.8 — sequential dealing (lay-down at middle → travel to strip)

The phase 3.7 strip-local lay-down was replaced with a sequential dealing motion the user can track with their eye, card-by-card.

**Per-card lifecycle.** Each card walks through five stages:

1. **PRE** — invisible, pre-positioned at the middle of the screen (no transition).
2. **LAY** (`CARD_LAY_MS = 200ms`) — fades in (opacity 0 → 1) at the middle, rendered at hero scale (~125px wide, vs ~55px mini).
3. **BEAT** (`CARD_LAY_BEAT_MS = 200ms`) — sits at the middle, full opacity, hero-sized. Beat is long enough for the user's eye to register the card.
4. **TRAVEL** (`CARD_TRAVEL_MS = 350ms`) — transform animates from `translate(middleX, middleY) scale(heroScale)` to `scale(stripScale)` (back to slot). Card visibly travels from middle to its hand-strip slot, shrinking en route.
5. **SETTLED** — at slot, mini scale. Placeholder fades out beneath.

**Paired across sides; sequential within an arc.** Sender's stage_index 0 (top-right cell) and recipient's stage_index 0 (bottom-left cell) walk through stages together. Stage_index 1 starts after stage_index 0 fully settles + `CARD_STAGGER_MS = 150ms`. So card N+1 begins its LAY only after card N has settled — no overlapping cards in the middle.

Per-card cycle: `CARD_CYCLE_MS = 200 + 200 + 350 + 150 = 900ms`. Total entrance for a 6-card hand: `5 × 900 + 750 = 5250ms` ≈ 5.25s. Intentionally slow.

**Middle position is two slots.** Sender card translates `translateY(+110)` from its strip cell into the upper battlefield slot. Recipient card translates `translateY(-110)` into the lower battlefield slot. Both lay simultaneously but at different vertical positions (so they don't overlap). `translateX` is computed per-cell to bring each card's scaled-visual center to the viewport horizontal center.

**Layout stabilization.** During the entering phase, the BattlefieldSlot renders an invisible placeholder of the same aspect ratio as a hero card, so the battlefield grid rows keep their full height. Without this the rows collapsed to the mid-rail's content height (~30px), pulling the hand strips toward each other and breaking the strip-relative coordinates the entrance translateY values calibrate against.

**Reduced motion.** When `prefers-reduced-motion: reduce` is set, the hook skips the entrance schedule entirely. All cards snap to "settled" immediately; matchup 0 starts after a 200ms fixed delay. The H2HRevealScreen detects via `usePrefersReducedMotion` and passes the flag down to the hook.

**Hook state.** `entranceStages: EntranceStage[]` (length N) replaces the prior `entranceLandedCount: number`. Each cell looks up its stage from `entranceStages[stage_index]`. The hook schedules 4 setTimeouts per card (LAY, BEAT, TRAVEL, SETTLED transitions) — 4N timeouts per arc, tracked under a `timersRef` set for cancellation.

### Phase 3.7 — strip-local entrance, no center traversal

Refines the lay-down motion so the eye stays in the strip zones throughout the entrance. Two changes:

**BattlefieldSlot skips its enter keyframe on initial mount.** The wrapper used to apply `animation: h2h-bf-enter-{top,bottom}` unconditionally — so on first paint of the end-state, the battlefield cards visibly flew in from translateY(±110px). The user (reasonably) read this as "cards traveling from above/below the battlefield into the center." Fix: `BattlefieldSlot` tracks a `hasTransitionedRef` that flips true the FIRST time the `card` prop changes. Until then, the wrapper renders with `animation: none`, so the initial end-state paint shows cards directly at their final positions. After play() fires (card → null → matchup0), the ref is true and the enter keyframe runs for all matchup transitions.

**Hand-strip cells now slide ~12px into their slots.** Pure opacity fade-in didn't read as "card being placed." Each cell's card content now carries a `transform: translateY(±12px)` when not landed (negative for sender, positive for recipient), transitioning to 0 on landing. Combined with `scale(STRIP_CARD_SCALE)`. Cell `overflow: hidden` clips the overshoot — motion stays inside the strip zone, never extends into the center.

**Side fix in BattlefieldSlot:** added an early-return when `card === null && exitingCard === null` so during play()'s batched state update, the slot doesn't render a stale `renderedCard` for the one-frame gap before its useEffect catches up. Eliminates a brief flash of the previous matchup during the entering phase.

### Phase 3.6 — direct-to-slot lay-down + deliberate pacing

Refines the phase-3.5 entrance: cards lay directly into hand-strip placeholder slots, not "in the middle of the screen." Slows all timings to feel like a deliberate game moment instead of a function call.

**Placeholder slots.** Each hand-strip cell renders TWO stacked layers:
- A dim placeholder (1px dashed border + 4% white background) — visible BEFORE the card lands. Forms the strip's empty skeleton at t=0.
- The card content layer (renderCard output, scaled to fit). Fades in over the placeholder when `landed` flips to true.

This gives the user a structural anchor: "empty slot waiting for a card → card placed onto that slot." No relocation phase after lay-down.

**Pacing constants (all at the top of `useH2HReveal.ts`).**

| Constant | Old | New | Purpose |
|---|---|---|---|
| `ENTRANCE_LAY_MS` | 130 | **220** | Per-card slide-in |
| `INTER_CARD_STAGGER_MS` | 100 | **175** | Gap between consecutive cards |
| `PRE_REVEAL_PAUSE_MS` | 400 | **700** | Entrance → matchup 0 |
| `MATCHUP_RESOLVE_PAUSE_MS` | 350 | **850** | Between intermediate matchups |
| `END_OF_ARC_HOLD_MS` | — | **1700** | After final matchup, before "done" |
| `BATTLEFIELD_TRAVEL_DURATION_MS` | 320 | **420** | Card-pull travel window |
| `MATCHUP_DURATION_MS` | 1500 | 1500 | (unchanged) per-matchup rollup |

Total arc time for a 6-card hand: ~16.75s. Intentionally longer than the previous ~10s.

**End-of-arc hold phase.** New `phase: "end-hold"` between the last matchup's `onMatchupResolved` and the final `setPhase("done")` + `onArcResolved`. During the hold (1.7s):
- The static end-state is visible (last matchup's heroes, final totals).
- `onArcResolved` is deferred — phase 5 commentary / phase 6 results-overlay triggers won't fire during the hold.
- Dev-route controls hide BOTH the Replay and Skip buttons. Reappear when phase transitions to "done."

This prevents next-step UI from rushing past the climax. The user sees the final result, breathes, then the next step engages.

### Phase 3.5 — entrance + card-pull animations

Two motion layers added on top of the base phase-3 reveal arc:

**Entrance choreography (poker lay-down).** When `play()` is called, all N hand-strip cards reset to a pre-landed state (`opacity: 0`, vertical offset away from the strip resting position) and stagger-animate into position. Stage map:
- Recipient (bottom strip): `stage = displayPos` — leftmost-to-rightmost lay-down (user's POV).
- Sender (top strip): `stage = (N-1) - displayPos` — mirrored from opp's dealing POV (rightmost-to-leftmost from user's POV).
- Both sides advance via the same `entranceLandedCount` counter, so stage 0 on each side fires simultaneously (the user's bottom-left card + the opponent's top-right card land at the same instant).

Timing: `ENTRANCE_CARD_DURATION_MS = 130ms` per card, `ENTRANCE_STAGE_GAP_MS = 100ms` stagger, total ~625ms for 6-card hands, then `ENTRANCE_TO_REVEAL_PAUSE_MS = 400ms` settle before matchup 0 begins.

**Per-matchup card-pull motion.** When `activeMatchup` transitions, both battlefield cards swap with a cross-fade keyframe pair:
- The OUTGOING matchup card stays mounted with `h2h-bf-exit-{top,bottom}` keyframes (slide back toward its hand strip + shrink 1.0 → 0.4).
- The INCOMING card mounts in parallel with `h2h-bf-enter-{top,bottom}` (slide from the hand strip + grow 0.4 → 1.0).

Both run for `BATTLEFIELD_TRAVEL_DURATION_MS = 320ms`, which fits within `MATCHUP_PAUSE_MS = 350ms`. Per-side simultaneous: top card flies down to enter / up to exit; bottom card flies up to enter / down to exit.

**Reduced motion.** Both animations gate on `prefers-reduced-motion: reduce` via a `usePrefersReducedMotion` hook + a CSS `@media` rule that disables the battlefield keyframes. CardFront's internal FP rollup is unaffected — scoped out per the spec ("if single-player doesn't respect this, log as a followup and don't fix here").

**Hook state additions:**
- `phase: "entering"` between `play()` and matchup 0.
- `entranceLandedCount: number` separate from `matchupIndex`; HandStrip flips each cell's "landed" flag based on this + the side-specific stage map.

**Implementation notes:**
- Battlefield keyframes injected via a singleton `<style>` tag (`ensureKeyframesInjected()` in H2HRevealScreen.tsx). Idempotent.
- BattlefieldSlot tracks `renderedCard` + `exitingCard` state. The exiting card renders with `visibleFp=undefined` so CardFront's `phase=RESULTS` path shows actualFp directly (no fresh RAF rollup on the re-mounted CardFront instance).
- Hand-strip cells use inline `transition: opacity + transform 130ms ease-out` driven by `landed` flag changes. The staggered timing comes from the hook's setTimeout chain incrementing `entranceLandedCount` at 100ms intervals.

### Phase 3 — reveal sequence choreography (in-progress)

Phase 2 ships the static end-state of the arc. Phase 3 wires the animation that walks through all matchups and lands on that end-state.

**Reveal order (per the original Reveal sequence spec).**
- Each player's cards sort independently by `(wasHeld ASC, salary ASC)`: swap cards first (cheapest → most expensive), then held cards (cheapest → most expensive).
- Matchup N pairs `senderOrder[N]` with `recipientOrder[N]`. Pairs may not align by player identity or salary across columns; that's accepted by design (the design doc's "Reveal sequence" section calls this out).
- The mock fixture's `slotIndex` happens to match the reveal-order index (slot 0 = cheapest swap, slot N-1 = most expensive held), but the H2H hook re-sorts independently so phase 4's real data (where `slotIndex` may be deal-order) works correctly.

**Animation primitives reused from single-player.**
- **`visibleFp` prop on CardFront/AthleteCard** drives the per-card FP rollup animation. `shared/components/CardFront.tsx:354-399` runs an internal RAF loop interpolating from 0 → actualFp when `visibleFp` first transitions undefined → defined. H2H reuses this verbatim — passes `visibleFp` to each battlefield card during its matchup.
- **`visibleFpMap: Map<cardId, currentFp>` pattern** mirrors `shared/hooks/useEmotionalReveal.ts:182,476-495`. H2H builds its own visibleFpMap inside the new orchestration hook; the values flow into AthleteCard's `visibleFp` prop via the renderCard call site.
- **RAF driveTick pattern** from `useEmotionalReveal.ts:481-525` (ease-out cubic, 16ms ticks). H2H's hook uses the same shape; the difference is two cards per tick instead of one.

**NOT reused from single-player.**
- `useEmotionalReveal` hook itself — too coupled to single-player flow (sequential reveal, anchor concept, `flipState.beginReveal()`, achievement gating). H2H has matchup pairs and parallel two-card animation; the orchestrator is its own hook.
- `_useReveal.ts` — single-player coordinator with gauge spring, FTUE, payouts, leaderboard. None of this applies to H2H phase 3.

**New hook: `useH2HReveal`** (lives in `shared/components/useH2HReveal.ts`).

Inputs:
```ts
interface UseH2HRevealArgs {
  sender: H2HHand;
  recipient: H2HHand;
  onMatchupResolved?: (index: number, matchup: { sender: H2HCard; recipient: H2HCard }, state: { senderTotal: number; recipientTotal: number }) => void;
  onArcResolved?: (finalState: { senderTotal: number; recipientTotal: number }) => void;
}
```

Outputs:
```ts
interface UseH2HRevealReturn {
  phase: "idle" | "revealing" | "paused" | "done";
  /** Index into the reveal-order matchup array. -1 when idle. */
  matchupIndex: number;
  /** Total matchups (= sender.cards.length, assuming both sides are equal-N). */
  matchupCount: number;
  /** Per-cardId current FP — drives both battlefield cards' `visibleFp` props during a matchup. */
  visibleFpMap: Map<string, number>;
  /** Animated running totals — drive TeamScore.displayTotal during reveal. */
  senderRunningTotal: number;
  recipientRunningTotal: number;
  /** The active matchup pair (or the final matchup when phase==="done"). */
  activeMatchup: { sender: H2HCard | null; recipient: H2HCard | null };
  /** Start the arc from the beginning. */
  play: () => void;
  /** Reset to idle (clears visibleFpMap, totals, matchupIndex). */
  reset: () => void;
  /** Skip to end-state instantly (visibleFpMap fully populated, totals at final values). For dev iteration; phase 6+ defines the production "skip" behavior. */
  skipToEnd: () => void;
}
```

**Callback contract:**
- `onMatchupResolved(index, matchup, state)` — fires after each matchup's FP rollup completes, BEFORE the inter-matchup pause. `state.senderTotal`/`recipientTotal` reflect the running totals AFTER this matchup is added in. Phase 5 will wire commentary trigger evaluation here.
- `onArcResolved(finalState)` — fires after the last matchup's pause completes. `finalState.senderTotal`/`recipientTotal` equal `sender.totalFp`/`recipient.totalFp`. Phase 5 fires the end-of-arc summary commentary here. Phase 6 will use this to transition to the results overlay.

**Timing budget:**
- `MATCHUP_DURATION_MS = 1500` — both FP rollups + score-rail updates happen simultaneously within this window.
- `MATCHUP_PAUSE_MS = 350` — breathing room between matchups.
- Total for 6-card hand: 6 × 1500 + 5 × 350 = 10,750ms (~10.75s). Within the design doc's 10-14s spec.

**Renderer prop change (small but breaking):**
```ts
// before phase 3
export type CardRenderer = (card: H2HCard) => React.ReactNode;
// phase 3
export type CardRenderer = (card: H2HCard, options?: { visibleFp?: number }) => React.ReactNode;
```

Mock route's renderCard wires `options.visibleFp` → AthleteCard's `visibleFp` prop. Hand-strip cells pass no options (static); battlefield cells pass `{ visibleFp: visibleFpMap.get(card.cardId) }` from the hook.

**TeamScore animation:**
- New optional `displayTotal?: number` prop. When set, overrides the static `total` for display.
- H2HRevealScreen passes the animated running total during reveal phases; static `hand.totalFp` after.

**Dev-route enhancement:**
- `basketball/src/dev/H2HRevealMockRoute.tsx` adds three controls in a fixed footer:
  - **Play** — kicks off the arc from idle.
  - **Replay** — resets + plays.
  - **Skip to end** — instantly populates the end-state (for layout iteration without watching the full arc).
- Optional `?autoplay=1` URL flag triggers Play on mount.

**Out of scope for phase 3:**
- Card "rise from hand strip into battlefield" positional animation. Phase 3 cross-fades via the existing dim treatment (mini-card dims at active slot; battlefield shows the active slot's cards). Positional motion is a phase-3-polish or phase-4 concern.
- Skip-mid-arc behavior beyond the dev-route Skip button. Production "no skip ever" lock is per the design doc; the dev Skip is for iteration.
- Commentary firing — callbacks fire but only `console.info` in this PR.

### Visual chrome — reuses single-player's pattern (post-eighth-smoke amendment)

The H2H reveal screen brings the same visual chrome single-player uses for its game view, so the two read as one product family. Investigation summary captured in the phase-2 smoke artifact; key reuse:

| Chrome element | Single-player source | H2H usage |
|---|---|---|
| Background gradient | `linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)` (`GameView.tsx:2181`) | Verbatim on the outer container |
| Text + font | `color: #EAF0FF; fontFamily: 'Inter', system-ui, sans-serif` | Same |
| Safe-area padding | `paddingTop: env(safe-area-inset-top, 0px)` (`GameView.tsx:2186`) | `calc(env(safe-area-inset-top, 0px) + 24px)` for top + bottom (additive: notch height + 24px floor) |
| Inner column cap | `maxWidth: min(480px, 100%); margin: 0 auto` (`GameView.tsx:2212`) | Same — H2H content sits in a 480px-max centered column on wide viewports |
| Glass-panel chrome | `borderRadius: 16; border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.05); boxShadow: 0 8px 24px rgba(0,0,0,0.28); backdropFilter: blur(10px)` (`GameView.tsx:2228-2235`) | Reused as `ZonePanel` component wrapping each hand-strip zone (opponent + your). Padding: 8px 12px |
| Card-stage chrome | NONE — flex container with the card grid (`GameView.tsx:2291-2302`) | H2H battlefield matches: open, no panel chrome around the hero cards (cards ARE the focal element) |

Result: hand-strip zones are framed glass panels (context); battlefield is open with cards as the spotlight. Same visual rhythm as single-player's header-panel → card-stage → GameBar.

### Layout decisions surfaced during phase 2 build (locked)

- **Battlefield card aspect ratio:** the existing `CardFront` (`shared/components/CardFront.tsx:1-17`) spec is `329 × 478px` portrait (~0.688 aspect). Battlefield cards preserve this — sized to fit two cards stacked vertically with a small gap, taking the dominant central viewport space (`flex: 1 1 auto` after content-sized zones).
- **Visual hierarchy lock (post-smoke amendment):** battlefield cards are the hero; hand strips are compact context. `HAND_STRIP_HEIGHT_PX = 100` (cells ~68×100). The first visual-smoke iteration used a `repeat(N, 1fr)` grid for the hand strip + `aspectRatio: 329/478` per cell, which let cell width grow with viewport width — on a desktop viewport, each mini-card inflated to ~190px tall and the strips dominated the page. Fix: cap the strip's HEIGHT explicitly and let aspect-ratio derive width. Mini-cards stay at ~68×100px on any viewport.
- **Mini-card content scaling via `transform: scale()` (post-fourth-smoke amendment):** the third visual smoke surfaced that the renderCard output (AthleteCard) renders at the cell's outer dimensions but its INTERNAL elements (16px salary chip, 22px FP, 32px initials placeholder) keep their absolute pixel sizes regardless of cell width. On a 68px cell, the salary chip ends up half the card height, the initials dominate the body, and the name/FP at the bottom clip or overlap. Fix: render the AthleteCard at a "natural" 150px width inside an `overflow: hidden` cell, then apply `transform: scale(cell_width / 150)` to scale the entire card uniformly. All internal content shrinks proportionally — salary, FP, initials, badges — as if it were CSS zoom. Result: at the ~0.45 scale factor (68/150), 16px salary renders effective ~7px, 22px FP renders ~10px, 32px initials placeholder renders ~14px. Visible but proportionally small, matching "a clearly smaller version of the same card" intent.
- **Battlefield card width matches single-player (post-third-smoke amendment):** `BATTLEFIELD_CARD_MAX_WIDTH = "min(145px, 32vw)"`. Single-player renders 3 cards across in a roster grid, so each card is ~1/3 of viewport width (~125px on a 390px mobile portrait). On wider viewports single-player cards grow proportionally, but H2H has two cards stacked + a mid-rail + two zones, so a hard 145px cap is needed or the stack overflows shorter desktop viewports. The 32vw expression tracks single-player scale on mobile (390→124.8, 414→132.5); the 145px cap kicks in around viewport width 453px. Battlefield card wrapper matches single-player's `RosterGrid.tsx:206-210` pattern verbatim: `width: 100%; aspectRatio: 329/478; position: relative`.
- **Battlefield as 3-column grid (post-seventh-smoke amendment):** `gridTemplateColumns: "80px 1fr 80px"`. Symmetric left/right rail widths (both `LEFT_RAIL_WIDTH_PX = SCORE_COLUMN_WIDTH_PX = 80`) place the center column at viewport horizontal center. Hero cards live in the center column → visually centered in the viewport. Scores live in the right column → consistently positioned next to each card. Left column is empty in phase 2 (reserved for phase 5 commentary). MidRail (matchup + final-margin pill) sits in the center column's middle row → at the cards' x-center, which IS at viewport center. The grid replaces the previous flex-with-flex-spacers layout that had the hero card visually offset 20-30px left of center on narrow viewports (because the score lived inside the battlefield row's flex container, breaking left/right symmetry).
- **Hand strip cell sizing derived from viewport (post-seventh-smoke amendment):** `HAND_STRIP_HEIGHT_PX = 80`, `HAND_STRIP_GAP_PX = 4`. Each cell is `height: 100%; aspectRatio: 329/478` (width derived from height = 55px). Six cells × 55 + five gaps × 4 = 350px — fits within the mobile content width (390 − 32 padding = 358px) with an 8px buffer. Prior 100px strip height made cells 69px wide; 6 × 69 + 5 × 6 = 414px overflowed the mobile viewport and clipped the rightmost cells' FP text. The new 80px constant + 4px gap is the largest size that fits 6 cards in a 390px viewport without horizontal scroll.
- **Safe-area-aware vertical padding (post-seventh-smoke amendment):** `paddingTop: "max(24px, env(safe-area-inset-top))"`, same for bottom. Notched iOS devices respect the OS safe-area (status bar / notch / home indicator); non-notched and headless test environments get a 24px floor so MIKE/YOU labels and the top/bottom hand strips have breathing room from the viewport edge. Horizontal padding is a fixed 16px each side.
- **Single renderCard prop for both zones (post-smoke amendment):** the H2HRevealScreen component takes a single `renderCard` function and invokes it for both battlefield slots AND hand-strip cells. Sport-specific consumers (basketball mock) pass their existing single-player card component (`AthleteCard`). Mini-cards visually read as the same game cards at a smaller scale — same headshot, tier border, name, FP layout — rather than as abstract chips. Matches the pattern at `shared/components/LandingPage.tsx:369` where the same CardComponent renders at ~62×90px in a card-flip demo grid. **Followup if AthleteCard's absolute-pixel font sizes feel cramped at small scale:** plumb a `compact` prop through PlayerCardShell + CardFront to swap to scaled font sizes; out of scope for phase 2.
- **Mock fixture slotIndex follows reveal order, not deal order (post-smoke amendment):** per the design doc's reveal sequence ("swap cheapest → expensive, then held cheapest → expensive"), `slotIndex = 0` is the cheapest swap card (revealed first) and `slotIndex = N-1` is the most expensive held card (revealed last). The H2H battlefield defaults to the highest slotIndex, which pairs each side's climactic final reveal. First-iteration mock used deal order (slot 0 = most expensive), which made the battlefield show the cheapest swap pair — anticlimactic. Fixed by re-sorting cards in the fixture.
- **Score anchored to battlefield card (post-third-smoke amendment):** the original design carried "score+delta in a separate right rail." First implementation made that rail a sibling of the battlefield column, sized to match the battlefield's full vertical height with `justify-content: space-between` — scores ended up floating against the rail's top/bottom edges, far from the battlefield cards they referred to. Restructured: each battlefield card lives in a `BattlefieldRow` (card column + `TeamScore` column side-by-side), so the score sits visually adjacent to its card. The `MidRail` (matchup delta + final-margin pill) lives between the two battlefield rows, occupying the gap. Same visual surface as the original spec; cleaner alignment.
- **Held vs swapped indicator:**
  - **Held:** existing `CardFront.tsx:857-867` gold corner triangle with "H" letter. Triggered by passing `locked={card.wasHeld}` to AthleteCard (matches `RosterGrid.tsx:252` `locked` prop name). No new visual. Renders correctly on both battlefield and hand-strip cards since AthleteCard is used in both zones.
  - **Swapped:** absolute-positioned `SWAP` pill top-right corner of the BATTLEFIELD card only (not on hand-strip mini-cards, where it would be visual noise at small scale). Subtle treatment so it reads as "this card was swapped, not held" without competing with the held indicator's visual weight. In the hand strip, swap cards are differentiated by absence of the gold triangle rather than by an explicit pill.
- **Tier color tokens:** inlined matching the existing pattern at `ChallengeLandingScreen.tsx:59`. RED `#EF4444` / ORANGE `#FB923C` / PURPLE `#C084FC` / BLUE `#3B82F6` / GREEN `#22C55E` / WHITE `#9CA3AF`. **Followup:** centralize tier tokens — currently duplicated across 3+ shared components.
- **Score column width:** 80px per side (one column adjacent to each battlefield card). Wider than the score text itself (~50px for "182.4" at 22px font) so the score reads as "centered in a defined right-rail column" rather than "tag attached to the card." Combined with the `BATTLEFIELD_INTERNAL_GAP_PX = 20` separating card from score, the score has visible breathing room.
- **MidRail anchored to card x-center (post-sixth-smoke amendment):** the MidRail (matchup delta + final-margin pill) mirrors BattlefieldRow's outer flex structure (card-width column + gap + score-width placeholder) so the row's horizontal rhythm matches the battlefield rows above and below. The matchup delta + pill render INSIDE the card-width column, centered horizontally — so they sit at the card's x-center, NOT at the team-totals' x-position. The right placeholder column is empty (no team total in the gap between cards). Result: matchup info is centered between the two cards (aligned with their x-axis), while the team totals (178.4, 182.4) stay anchored to the right of their respective cards.
- **Inter-zone vs intra-battlefield spacing (post-fifth-smoke amendment):** outer container gap = 28px (between opponent zone, battlefield, your zone). Battlefield column gap = 6px (between top card row, MidRail, bottom card row). This inverts the prior spacing — strips have generous breathing room from the battlefield, and the two battlefield cards read as one matchup unit with the MidRail nested between them.
- **Left rail width:** 28px (matches design doc). No content in phase 2; reserved for phase 5 commentary stream.
- **Zone sizing (post-fourth-smoke amendment):** every zone — opponent, battlefield, your — is `flex: 0 0 auto` (content-sized). The outer container uses `justify-content: center` so empty viewport space ends up ABOVE the opponent zone and BELOW the your zone, not between zones. This makes the layout read as one tight composition rather than three zones floating in a void. Prior iteration had battlefield `flex: 1 1 auto` with `justify-content: center` on the battlefield column — that left ~150px of empty space between the hand strips and the battlefield cards on tall viewports.
- **Zone header (post-fourth-smoke amendment): displayName only.** Earlier iterations rendered `displayName + tier + totalFp` in the header. Two problems: the totalFp duplicated the TeamScore that already sits next to the battlefield card, and the small 13px displayName at the left edge was easy to miss next to the tier label in the visually-central position. Reduced to just the display name at 18px. Tier is implied (the TeamScore color indicates win/loss); totalFp lives only in TeamScore. Display name horizontally centered in the zone (post-sixth-smoke amendment).
- **Active-slot dim on hand-strip mini-cards (post-sixth-smoke amendment):** HandStrip takes an `activeSlotIndex` prop. The mini-cell whose slotIndex matches renders at opacity 0.35 (with a 200ms transition) — signaling "this card is currently in the battlefield, out of the hand." Cell stays in its slot (no layout shift); just the visual dim. Phase 3 (animation choreography) will drive activeSlotIndex dynamically as the reveal walks through matchups; phase 2 mirrors the static `battlefieldSlotIndex` (the same default slot the battlefield uses).
- **Mock fixture types import directly from the H2H component (post-third-smoke amendment).** A prior iteration declared local `H2HMockHand` / `H2HMockCard` interfaces with a `playerName` field where the H2H component's `H2HHand` expected `displayName`. TypeScript structural-compatibility was lenient enough to let the mismatch through (`SENDER_HAND.displayName` arrived as `undefined`, the zone header rendered an empty cell — the "ROOKIE" tier label appeared where the player name should have been). Fix: the fixture now declares `SENDER_HAND: H2HHand` and `RECIPIENT_HAND: H2HHand` using the component's exported types directly. Any future field rename in the component immediately surfaces as a tsc error at the fixture site.

## What's not designed yet (followups)

- Commentary engine: trigger taxonomy, bank shapes, silence rules.
- Win/loss climax animation between end-of-arc and results overlay.
- Results overlay detail: win/loss visual differentiation, headline copy, lineup display layout.
- V4 layout sketch validating locks against pixels. Should include async reveal state, sync decision state, sync reveal state, transition between sync phases, results overlay landing.
- Skill-share enhancements to challenge format (asymmetric info variants, prediction-lock, etc.) — all parked as post-MVP.
- Calibration arc from prior session (three open diagnostic questions) — deferred until it blocks smoke.
- **Centralize tier color tokens.** TIER_ACCENT inline map is currently duplicated across `ChallengeLandingScreen.tsx:59`, `PostHandSheet.tsx:10`, `SportAdapter.ts:140`, and now `H2HRevealScreen.tsx`. Sport-agnostic constants module (e.g. `shared/theme/tierColors.ts`) would make future tier-color tuning a single-file change. Surfaced during phase 2 build; not in scope per catastrophic-only discipline.
- **Left-rail expansion will compress the battlefield central column.** Phase 5 commentary will widen the currently-reserved left rail from its phase-2 placeholder of 28px to ~80-150px. On mobile portrait viewports (≤414px wide), the battlefield central column already runs tight: card (145px max) + 20px gap + 80px score column = 245px of content needing horizontal room. Available width on a 390px viewport with the 28px placeholder left rail is 390 − 16 (outer padding) − 28 (rail) = 346px. Widening the left rail to 150px would shrink available width to 224px — narrower than the 245px battlefield block. **Phase 5 implementation must either: (a) shrink BATTLEFIELD_CARD_MAX_WIDTH on narrow viewports when the commentary rail is active, (b) overlay the commentary rail above the battlefield rather than alongside it, or (c) target only larger viewports for the full-width commentary rail.** Don't pre-fix in phase 2; the constraint is logged here so phase 5 doesn't surface it as a surprise.

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
