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

Real code work, broken into shippable phases:

1. **Phase 1 — Data layer (shipped 2026-05-26, commit d827337):** sender-hand endpoint + write-side population. See "Data model gap — RESOLVED for phase 1" above.
2. **Phase 2 — Static H2H reveal screen with mock data (this PR):** full-viewport component, 3-zone vertical layout (opponent / battlefield / your), 2 rails (scores+delta / commentary placeholder). No animation, no real-data wiring. Mounted via dev-only route. Locks the visual structure before timing/animation work in phase 3.
3. **Phase 3 — Animation + per-matchup choreography:** cards flip, FP rolls, scores update, swap-first then held-last reveal order, simultaneous-within-matchup.
4. **Phase 4 — DEAL transition + real-endpoint wiring:** animated reshape from hold/swap UI into H2H layout (~500ms); recipient client fetches the phase-1 endpoint at DEAL time and drives the sender column from real data.
5. **Phase 5 — Commentary engine:** trigger taxonomy + evaluation + bank integration + rail rendering. Reuses existing banks where possible.
6. **Phase 6 — Results overlay:** refactor existing `ChallengeComparisonScreen` from bottom-sheet to full-viewport overlay. Add flippable lineup display. Migrate trash-talk + CTAs + state-machine. Compress/remove resolution line.
7. **Phase 7 — Win/loss climax animation** between end-of-arc and results overlay.

**Single-player code path unchanged** throughout. Tier panels, single-player reveals, etc. stay as-is. H2H is a parallel path branching at DEAL time when in challenge mode.

Effort estimate not produced in this session.

### Phase 2 integration anchors (locked 2026-05-26)

For future phases to extend without re-deriving:

- **Component (sport-agnostic):** `shared/components/H2HRevealScreen.tsx`. Takes resolved sender + recipient data (matching the phase-1 `sender_resolved: true` payload shape) plus a `renderCard` prop for sport-specific battlefield card rendering. No internal state; pure render of an already-resolved hand pair.
- **Mock fixture (basketball-specific):** `basketball/src/dev/h2hMockFixture.ts`. Two resolved hands matching the phase-1 endpoint shape exactly so phase 4's real-data wiring is a drop-in replacement.
- **Dev route mount (basketball):** `basketball/src/dev/H2HRevealMockRoute.tsx`. Wires fixture → `<H2HRevealScreen>` → `<AthleteCard>` as the card renderer. Hosted at pathname `/basketball/dev/h2h-reveal-mock` via regex match in `basketball/src/App.tsx` (matches existing convention for `/basketball/profile/:uuid` and `/basketball/challenge/:uuid`). Production users have no entry point to `/dev/*` paths.
- **Import pattern:** static import + `import.meta.env.DEV` guard at the usage site (`App.tsx` `if (import.meta.env.DEV && devSlug === "h2h-reveal-mock")`). NOT `React.lazy()` — an earlier lazy attempt surfaced a fragility where stale Vite dev-server state (regenerated optimizeDeps with new `?v=` hash, HMR boundary mismatch after the dev/ directory landed mid-session, browser-cached chunk URLs that no longer exist) caused the lazy chunk fetch to 404 with the Suspense boundary hanging silently. Static import sidesteps that entire surface; production builds strip the branch via DCE (Vite constant-folds DEV → `false`, Rollup removes the unreferenced import). Bundle impact in production: ~4 KB residual after tree-shaking (acceptable; the dev-only mock fixture is small).
- **Phase 4 swap-in path:** in real challenge flow, replace the mock fixture with a `fetch('/api/challenge/{id}/sender-hand')` call. The mount component (which becomes the real recipient flow's reveal mount) keeps the same shape: `<H2HRevealScreen sender={...} recipient={...} renderCard={AthleteCardLike} />`.

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
