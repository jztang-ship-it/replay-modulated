# Challenge Landing V2 — Phase 2b Design Lock: The Landing Component

**Status:** LOCKED, pending implementation
**Workstream:** Accept / Challenge Landing V2 — FINAL phase
**Phase:** 2b of 2
**Depends on:** Phase 0 (snapshot holds), Phase 1 (choke trigger + stamp), Phase 2a (take-card generator + re-toned voice) — all merged.
**Coupling:** MEDIUM-HIGH. This is the first **layout + feel** phase of the workstream. Green tests ≠ done — the hierarchy must be confirmed to *read* right on a real viewport. This is where the localhost visual loop matters most.

---

## What 2b delivers

The recipient-facing challenge landing, rebuilt to the V2 hierarchy, replacing the
current score-first screen:

```
BADGE (CHOKE / {TIER} MISS / etc.)
  ↓
HOOK (the provocation — take card hookHeadline)
  ↓
STARTING HAND (the hero visual — 6 cards as evidence, held cards prominent)
  ↓
OUTCOME (score visible, NOT the top element — outcomeLine)
  ↓
DECISION DISAGREEMENT (where acceptance happens — disagreementLine)
  ↓
CTA ("PLAY YOUR LINE" family — ctaText)
```

It renders the four `generateChallengeTakeCard` fields (2a) + the Phase-1 stamp + hold
badges on the starting hand. The current screen (giant 232.3 FP → "Think you can beat
it?" → flat card grid → "Accept Challenge") is the anti-pattern being replaced.

---

## Locked product decisions (from the design conversation)

1. **Held cards get visual PROMINENCE + inline outcome.** The 2 (or more) held cards are
   visually elevated (brighter/accented vs the discarded four) AND show the held card's
   actual outcome inline (e.g. "Embiid 62"). The discarded cards stay plain, no outcome
   number (their `actualFp` is 0 — never played; do NOT render "0"). This makes the
   sender's decisions visible on the cards, echoing the disagreement copy.
2. **Score still prominent, but NOT the top element.** It moves out of the hero slot
   (no longer the first/biggest thing). It sits with the OUTCOME line, sized clearly but
   subordinate to the HOOK and the hand. The current 68px top-of-page treatment goes away.
3. **New component, scoped to the presentational layer.** See architecture below.

---

## Architecture — "new component," scoped correctly

"New" applies to the **V2 presentational hierarchy**, NOT a re-plumb of the orchestration
that already works. `ChallengeLandingScreen` today owns: the fetch, self-match detection
(`SelfMatchView` + the anti-self-farm guard), deserialize, `onAccept` wiring,
already-attempted hint, loading/error states. All of that is correct and tested — do NOT
re-implement it.

**Build:** a new presentational component (proposed `ChallengeTakeCardLanding`) that
receives already-fetched + deserialized data and renders the V2 hierarchy.
`ChallengeLandingScreen` keeps its shell role (fetch / self-match routing / error /
loading / accept wiring) and delegates its **accept-flow render body** (the current
score-first JSX, ~lines 167–235) to the new component. Replace ONLY that body.

- **Self-match surface stays as-is** (`SelfMatchView`) — out of scope for the V2 redesign;
  it's the creator's own view, not the recipient provocation surface. (If you later want
  it restyled, that's a separate task.)
- **Loading / error / already-attempted** stay in the shell. The new component is pure
  presentation: given the data, render the hierarchy. This keeps it testable and keeps the
  anti-self-farm logic untouched.

This honors "new component" (the V2 hierarchy is a clean new file, not a mutation of the
score-first JSX) while not re-litigating the fetch/self-match/anti-farm logic.

---

## Data wiring (how the component feeds the generator)

The new component (or the shell, passing down) derives `TakeCardInput` from `ChallengeData`
+ the deserialized enriched roster:
- `trigger` ← `normalizeTriggerType(data.trigger_type)` (the 2a/Phase-1 alias — never raw `bad_beat`).
- `challengerName` ← `data.challenger_name` (null-guard via `isRealName`).
- `targetScore` ← `data.target_score`.
- `holdsRecorded` ← `data.initial_roster.holdsRecorded` (Phase 0).
- `heldCards` ← deserialized roster filtered `wasHeld===true`, mapping `{name, actualFp, tier}`.
- `anchorName` ← find `card.basePlayerId === data.anchor_base_player_id` in the roster, read
  `.name` (the lookup recon confirmed — same as `H2HRecipientPlay.tsx:390-396`); null when
  absent → generator's null-anchor fallback.
- `nearMissGap` / `nearMissNextTier` ← `data.near_miss_gap` / `data.near_miss_next_tier`.
- `challengeId` ← `data.challenge_id` (the determinism seed).

**RECON ITEM before building:** confirm whether `generateChallengeTakeCard` actually
consumes `winTier`. The 2a sample outputs never reference a tier name, so it may be
unused. IF it's needed, `winTier` derives client-side from `target_score` via
`calculateWinTier(target_score, winTiersMap)` — and `winTiersMap` is NOT currently a prop
of the landing; it must be passed from the App mount site (where `sportAdapter` is in
scope, `basketball/src/App.tsx:454`). Report whether the prop is needed before adding it.

---

## Component spec (the hierarchy, top to bottom)

### Stamp (badge)
Render the Phase-1 `TeamStamp` keyed off the normalized trigger: `choke` → CHOKE,
`miss` → `{nearMissNextTier} MISS`. (big_score/rare_pull use the `win_tier`/`rare_pull`
stamp family — confirm which stamp surfaces apply to the landing; `default` shows none.)
- **DECISION NEEDED — stamp entrance:** `TeamStamp` ships a `thud` entrance animation
  (`ts-stamp-wrap-thud` + `delayMs`), designed for the results-reveal punctuation. On a
  cold-loaded static landing there's no reveal sequence to punctuate. **Lean: subtle or no
  entrance on the landing** (a thud-on-page-load can read as jank). 2b confirms on device.
- **Note from 2a:** the choke `outcomeLine` ("the stamp earned itself") assumes the stamp
  sits visually adjacent to the outcome. Place the stamp within visual proximity of the
  OUTCOME line, or that copy reference breaks. This is the 2a→2b dependency that was logged.

### Hook
`hookHeadline`, top textual element, the largest/boldest type. This is the provocation —
it replaces "Think you can beat it?".

### Starting hand (the hero visual)
The 6 cards, the centerpiece. Held cards (`wasHeld===true`) get:
- visual prominence (brighter border/fill, the tier accent at full strength vs dimmed for
  discards — exact treatment is a feel call, confirm on device),
- an inline outcome chip showing the held card's `actualFp` (e.g. "62"), formatted as a
  clear "what it scored" marker.
Discarded cards: plain, dimmed, NO outcome number.
- **Graceful degrade:** when `holdsRecorded===false` (legacy challenge), there is no
  trustworthy hold data — render all six plain (no prominence, no outcome chips), exactly
  as today. The hook/disagreement copy already degrades to hold-agnostic via the generator.

### Outcome
`outcomeLine` + the score. Score is clearly legible but NOT the hero — subordinate to hook
and hand. Do not reintroduce the 68px top treatment.

### Disagreement
`disagreementLine`. This is the acceptance moment — give it room, place it adjacent to the
hand (the cards are the evidence the line refers to).

### CTA
A button rendering `ctaText` (the "PLAY YOUR LINE" family from 2a). Wires to the existing
`handleAccept` / `onAccept` flow unchanged. Keep the already-attempted relabel ("Play
Again") behavior from the shell.

### Attribution / stats
"from {challengerName}" + the optional stats line — keep minor, below the CTA, as today.

---

## Out of scope for 2b

- Self-match surface redesign (stays as-is).
- Wiring the take card into the OG share-card image (`api/share/card`) — the generator is
  deterministic so this is now POSSIBLE, but it's a separate follow-up, not 2b.
- The discarded-card "would-have" outcome hook (unresolved Phase-0 data question).
- Any change to the generator (2a) or trigger logic (Phase 1). 2b only consumes.
- **Do NOT touch `chadChallenge.ts` or `shared/commentary`** — 2b renders the generator's
  output and edits landing files only. (Keeps 2a/2b cleanly separable; honors the
  serialize-merges rule.)

---

## Gates

- `npm test`:
  - The new component renders all five trigger cases without crashing (choke, miss,
    big_score, rare_pull, default), each showing hook/hand/outcome/disagreement/CTA.
  - Held-card prominence: a roster with 2 held cards renders 2 prominent cards with
    outcome chips and 4 plain; a `holdsRecorded:false` roster renders 6 plain, no chips,
    no crash.
  - Score is NOT the first rendered element (assert the hook precedes the score in DOM
    order) — the anti-regression guard for the hierarchy flip.
  - CTA wires to `onAccept` (the accept path still fires).
- `npx tsc --noEmit`
- `bash scripts/build-vercel.sh` (shared/ touched)
- Function count 11/12.

## Assert-the-neighbors

The shell delegation must NOT break the self-match path or the loading/error states.
Ship a test that the self-match surface still renders for a creator-viewer (unchanged) and
that the shell still handles the fetch-error path — i.e. prove the refactor of the
accept-body didn't regress its neighbors in `ChallengeLandingScreen`.

## Live-verification (REQUIRED — this is a layout/feel phase)

Per the standing rule, the harness can't see "reads right." After merge + PROD flip:
1. **Localhost visual loop (the #1 speed lever):** build → screenshot on a phone-width
   viewport → iterate the held-card prominence, the score demotion, the stamp placement,
   the hierarchy spacing — Code-Claude owns this loop and surfaces RESULTS (screenshots),
   not observations to relay. Use the dev mock route for the landing if one exists; if not,
   note that the recipient/challenge flow is PROD-only (workflow note 7) and plan the
   device check accordingly.
2. **PROD device check:** open a real choke challenge link on a phone — confirm the CHOKE
   stamp + hook read as the approved register, the 2 held cards are visibly prominent with
   their outcomes, the score is present-but-subordinate, and a refresh shows the SAME take
   card (the 2a determinism, now visible). Open a legacy `bad_beat` challenge — confirm it
   renders CHOKE via the alias with 6 plain cards (no hold data) and does not look broken.
3. **Mobile clearance:** watch the known parked bug — bottom zone-header overlap with the
   sticky CTA at ~390w. Don't reintroduce it.
