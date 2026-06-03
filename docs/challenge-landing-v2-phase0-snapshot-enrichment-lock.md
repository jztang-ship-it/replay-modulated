# Challenge Landing V2 — Phase 0 Design Lock: Snapshot Enrichment

**Status:** LOCKED, pending implementation
**Workstream:** Accept / Challenge Landing V2
**Phase:** 0 of 3 (data foundation — must merge before Phase 1/2)
**Coupling:** LOW (serialization + create-site wiring + tests; no visual, no locked layout invariant)

---

## Why this phase exists (the blocker)

The Landing V2 design requires the recipient to see **the sender's decisions**, not
just the starting hand + score — "here's the hand, here's what he did with it, you
disagree." Two surfaces depend on it:

- **Hold badge** on the landing lineup (the "H" marker — which cards the sender held).
- **Decision-disagreement copy** (Phase 2), e.g. "John held Vucevic and he shot 4-16" —
  needs the held card's *outcome*.

Today the stored challenge cannot support either. `SportAdapter.serializeRoster`
(both `shared/adapters/SportAdapter.ts` and `basketball/src/adapters/SportAdapter.ts`)
persists only: `id, basePlayerId, personKey, cardId, name, team, season, position,
photoCode, salary, tier, slotIndex, projectedFp`. It does **not** persist `wasHeld`
or `actualFp`. `deserializeRoster` hardcodes `wasHeld: false` and `actualFp: 0` on
every card. So `initial_roster` on every existing challenge has zero hold/outcome
information — every card reads as un-held, zero-scored.

**This phase adds that data to the snapshot. Nothing visual ships here.** It is the
foundation Phase 1 (trigger split) leans on lightly and Phase 2 (generator + landing)
leans on heavily.

---

## What recon established (CORRECTS the original draft's wrong assumption)

The original draft of this lock claimed the resolved roster was the starting hand
"mutated in place" and that the two roster refs shared identity. **Recon (2026-06-02)
proved that false.** The corrected, verified facts:

1. **The two rosters DIVERGE after deal time.** `initialRosterRef.current` and
   `rosterRef.current` start from the same `nextRoster` at deal (`GameView.tsx:1688`),
   but then:
   - `GameView.tsx:1714` builds `markedRoster = roster.map(c => ({...c, wasHeld}))` —
     **new objects via spread; the originals in `nextRoster` are NOT mutated.**
   - `GameView.tsx:1745` reassigns `rosterRef.current = finalRoster` — a **different
     array** (held subset + redrawn cards).
   - `initialRosterRef.current` is never reassigned after 1688; its card objects are
     the original deal-time objects and **never receive `wasHeld` or `actualFp`.**
   - No in-place `.wasHeld =` mutations exist anywhere in `GameView.tsx`.

2. **`serializeRoster` is called with `initialRosterRef.current`** (the starting hand,
   no holds/outcomes), via `ChallengeSharePrompt:173` → `useChallengeShare.ts:97`
   (`serializeRoster(args.initialRoster)`). So adding `wasHeld`/`actualFp` to the
   mapping alone would serialize `false`/`0` on every card — `holdsRecorded: true`
   over an empty husk.

3. **`finalRoster` (resolved) is the only array carrying live `wasHeld` + `actualFp`,**
   but for any hand that didn't hold all 6 its non-held slots are *different players*
   than the starting hand. It is the FINAL hand, not the starting hand.

### DECISION — Path A (enrich the starting hand). Not Path B.

The snapshot stays semantically "the starting hand" (what the recipient will be dealt).
At the create site, **enrich `initialRosterRef.current` before serializing**: for each
starting card, look it up in `rosterRef.current` by `basePlayerId` (fallback
`slotIndex`) and copy over `wasHeld` + `actualFp`. Cards the sender discarded won't
match a held resolved card → they keep `wasHeld: false`, `actualFp: 0` (never played —
correct and harmless; hold badge reads `wasHeld`, disagreement copy reads only held
cards' outcomes).

**Why not Path B (serialize the resolved/final roster):** it would put redrawn cards on
the landing that the recipient never starts with, breaking the "same starting hand"
promise at the exact moment we want the recipient evaluating the hand they're about to
play. The starting hand is the hero; sender holds are annotations on it.

**Implementation location for the enrichment:** prefer doing the merge at the create
site (where both `rosterRef.current` and `initialRosterRef.current` are in scope) and
passing the enriched array into `serializeRoster`, rather than changing
`serializeRoster`'s contract to take two arrays. Keep `serializeRoster` a pure
single-roster mapper.

3. **`initial_roster` is a JSON blob column** (Supabase `shared_challenges`). Adding
   fields to the JSON does **NOT** require a DB migration. Additive only.

4. **`wasHeld` and `actualFp` exist on `GeneratedCard`** (`shared/types/index.ts`
   lines 62 / 180). No type change needed for the in-memory model — only the
   serialize/deserialize boundary.

---

## The change

### Snapshot shape (additive, backward-compatible)

Per-card, add two fields to the `cards[]` objects written by both `serializeRoster`
impls:

- `wasHeld: boolean`
- `actualFp: number`

Top-level, add one flag to the snapshot object:

- `holdsRecorded: true`

**`holdsRecorded` is the availability signal.** It distinguishes "new challenge,
hold data is present and trustworthy" from "old challenge (pre-this-merge), no hold
data." The landing reads `holdsRecorded` to decide whether to render hold badges /
outcome copy at all. A snapshot where the sender held *nothing* still has
`holdsRecorded: true` with all-`false` `wasHeld` — that is different from an old
snapshot with no flag, and the flag makes the difference explicit.

### Version: keep `v: 1`. Do NOT bump.

Rationale: `validateRosterSnapshot` rejects `v !== 1`. Bumping to `v: 2` would force
widening the validator AND risks rejecting legacy rows. The additive fields + the
`holdsRecorded` flag give us everything a version bump would, with zero validator
churn and zero legacy-rejection risk. The validator's required-field check
(`basePlayerId && name && tier && salary`) is unaffected — new fields are not required.

### deserializeRoster

Read `wasHeld` / `actualFp` from the snapshot when present; fall back to the current
hardcoded `false` / `0` when absent (legacy snapshots). Read `holdsRecorded` onto a
surfaced field so the landing can branch on it. Do **not** change the validator's
required-field set.

### Both adapters

The change must land in **both** `shared/adapters/SportAdapter.ts` and
`basketball/src/adapters/SportAdapter.ts` (basketball overrides the shared impl).
Keep them structurally identical for these fields so other sports inherit cleanly.

---

## Graceful degradation (explicit contract)

- **Old challenge (no `holdsRecorded`):** landing shows no hold badges, no
  outcome-dependent disagreement copy. Falls back to the current hand-grid behavior.
  No errors, no empty badges.
- **New challenge, nothing held:** `holdsRecorded: true`, all `wasHeld: false`. Landing
  renders the hand with zero hold badges (correct — the sender held nothing).
- **New challenge with holds:** full data; hold badges + outcome copy available.

The recipient's *own* replay is unaffected — `deserializeRoster` still returns a
playable starting roster carrying the SENDER's `wasHeld` (the landing reads these to
render hold badges), but those flags MUST be cleared before the recipient's own deal.

### DECISION — bleed clear via option (a), the defensive clear at the deal site.

Recon located the leak precisely:
- **`GameView.tsx:1672`** — `res = { roster: challengeCtx.initialRoster }` → `nextRoster`
  → `setRoster` with **no `wasHeld` clear.** This is the leak line. The deserialized
  roster carries the sender's `wasHeld: true`, and this path feeds it into the
  recipient's own deal.
- **`H2HRecipientPlay.tsx:371-374`** — already defensively zeros holds with a documented
  invariant ("Recipient's starting hand carries NO held state"). The H2H path is safe;
  this is the established pattern.

**Fix:** add the same `.map(c => ({ ...c, wasHeld: false }))` clear at `GameView.tsx:1672`,
matching the H2H convention (deal-site owns the clear). Do NOT add a separate
display-only field to `ChallengeCtx` (option b) — it threads new plumbing for no
Phase-0 payoff, and option (a) matches existing intent. Landing display reads the
sender holds off the deserialized output directly; only this one deal path needs the
clear.

---

## Out of scope for Phase 0 (do not build here)

- Any landing-page visual change (badge rendering, layout) → Phase 2.
- The trigger split (bad_beat → near_miss + choke) → Phase 1.
- The `generateChallengeTakeCard` generator → Phase 2.
- The CHOKE stamp → Phase 1.

## Phase 2 open data question (flagged here, NOT solved in Phase 0)

The strongest disagreement hook in the V2 spec is "I'd cut him / that card is bait" —
and its killer form is showing what a *discarded* card actually did ("John cut Vucevic;
Vucevic dropped 52"). Path A's snapshot does NOT carry discarded cards' would-have
outcomes — the sender never resolved them. Whether that outcome is even knowable
depends on whether starting cards have a predetermined historical game or resolve only
at hold time (UNKNOWN — needs investigation before Phase 2 copy design). Do not expand
Phase 0 to chase this; record it for the Phase 2 generator design.

---

## Gates

- `npm test` (add coverage: round-trip serialize→deserialize preserves `wasHeld` +
  `actualFp`; legacy snapshot without the fields deserializes to `false`/`0` and
  `holdsRecorded` absent; `validateRosterSnapshot` still accepts the enriched snapshot).
- `npx tsc --noEmit`
- `bash scripts/build-vercel.sh` (shared/ touched)
- Function count stays 11/12.
- **Live-verification:** create a real challenge on PROD with a known hold pattern,
  open the challenge link, confirm the stored `initial_roster` carries
  `holdsRecorded: true` + correct `wasHeld` per card. (Can inspect via the API
  response / network tab — no visual needed this phase. Recipient flow is PROD-only
  per workflow note 7.)

## Assert-the-neighbors

The deserialize change touches the recipient replay path. Ship a test that FAILS if
sender `wasHeld: true` leaks into a recipient's freshly-dealt roster (the bleed risk
above). A green round-trip test alone is insufficient — it must prove the recipient's
own deal starts with all holds cleared.
