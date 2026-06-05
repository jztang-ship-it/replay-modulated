# Phase 4 · Pass 1 Salience Fix — Held-Cards-Only Narrative Signals

**Branch:** new branch off the Pass-1 foundation (recommend `fix/salience-held-only`),
since this is a foundation fix that the Pass-2 voice branch sits on top of. Coordinate the
merge order: this fix lands first (or Pass 2 rebases onto it) — see §6.
**Status:** DRAFT — awaiting commit. Build prompt follows AFTER this lock is committed.
**Severity:** Blocks the Pass-2 merge. The voice is good; the signal feeding it is wrong, and
a confident voice on a wrong signal is more dangerous than a robotic one.

---

## Why this fix exists

On-glass review of a real choke hand produced:
**"Fourteen turnovers killed this before Bosh could matter."** It reads perfectly. It is
also false in the way that matters: the player held only **3 turnovers between the two
cards they held** (Bosh 2, Jefferson 1). The other 11 came from **bench cards they did not
hold** (Duncan alone had 6). The "14" is a hand-wide sum.

Root cause: `computeSalience` → `rankPerStat` (`shared/utils/computeSalience.ts:57-73`)
aggregates per-stat FP contributions across **all** cards with no `wasHeld` filter, so
`primaryPositive` and `primaryNegative` describe the whole roster. But the narrative's entire
purpose is to **critique the decisions the user made — the cards they held**. The headline
blamed the user for turnovers committed by cards they cut.

Why no existing guard caught it: the number 14 *is* in the facts (`primaryNegative: "14
turnovers"`), so the §1 numeric validator correctly accepts it — numeric grounding is not
semantic correctness. The smoke harness, the grader, and on-glass voice-reading all pass it.
The defect is upstream of all of them, in which **population** salience aggregates over.

### The two-lens principle (the governing intent)

These are deliberately different scopes and must stay different:

- **FP score / `target_fp` / tier / payouts** count **all stats** (held + bench). This is
  the game's scoring rule and does not change. Confirmed isolated from salience (§ recon 6).
- **Narrative salience** (`primaryPositive`, `primaryNegative`) must reflect **only the cards
  the user held** — what their chosen lineup did. The critique is about their decisions.

The fix makes salience held-only. It does **not** touch the score. The two lenses disagreeing
(score = all cards, narrative = held cards) is the *intended* design, not a bug.

---

## §1 — The change

In `shared/utils/computeSalience.ts`, make the per-stat aggregation that feeds
`primaryPositive` and `primaryNegative` operate on **held cards only**.

`rankPerStat` (lines 57-73) currently iterates all cards filtering only on `!c.statLine`. Add
the held filter, mirroring the pattern already used by the `primaryDragPlayer` loop at line
173 (`if (c.wasHeld !== true) continue;`):

- Filter `rankPerStat`'s card iteration to `c.wasHeld === true` (skip cards where `wasHeld`
  is not strictly true), in addition to the existing `!c.statLine` skip.

Preferred implementation: filter at the `rankPerStat` **call site** for the
positive/negative ranking (pass it the held subset), OR add the `wasHeld` guard inside the
loop. Either is acceptable; pick whichever keeps `rankPerStat` reusable if anything else ever
calls it. (Recon: nothing else calls it today.)

**Do NOT change:**
- `primaryDragPlayer` — already held-only (line 173), correct as-is.
- The FP-total / `target_fp` / tier / payout paths — fully isolated (recon §6); the change
  cannot perturb them, and must not.
- `rare_pull`'s existing salience strip (`commentaryFacts.ts:178`) — unchanged.

---

## §2 — Behavior after the fix (worked against the real hand)

For challenge `c3b8247b…` (the hand that exposed this):

- **Before:** `primaryNegative = "14 turnovers"` (all six cards). Model led with it →
  false accusation.
- **After:** held cards are Bosh (2 TO) + Jefferson (1 TO) = 3 turnovers. Held-only
  per-stat negative FP from turnovers = −3. Whether that becomes `primaryNegative` or whether
  it's weak enough that the narrative leans on `BIGGEST DRAG` instead, the result is correct
  either way: the misleading "14" is gone. The model will naturally lead with
  `primaryDragPlayer` = **Chris Bosh** (held star, 12.1 FP under projection) — which is the
  architecturally-correct choke "why" the system was built to surface.
- `primaryPositive` also becomes held-only (Bosh + Jefferson points), which is likewise
  correct — the positive story should be about the user's stars, not the bench.

This is the fix landing exactly as intended: the choke narrative now critiques the held
lineup's decisions, not the roster's box score.

---

## §3 — Null / empty edge (already handled — preserve it)

Held-only shrinks the aggregation population, so `primaryNegative` (and rarely
`primaryPositive`) can legitimately be **undefined** — e.g. a choke where held stars
underperformed via drag but committed zero turnovers.

Existing code handles this correctly and must be preserved:
- `computeSalience.ts:188` collapses to `{ salience: undefined }` when all three fields are
  empty.
- The object spread emits only present fields — never a literal `primaryNegative: undefined`.
- The prompt renderer (`voiceContract.ts:298-314`) guards each field individually; undefined
  cannot reach prompt text.

**Desired behavior on the empty-negative edge:** skip the `MOST IMPORTANT NEGATIVE` line
entirely; the choke narrative leans on `BIGGEST DRAG` for the "why" (Rule 3 LEAD SIGNAL).
This is correct — a held-only negative that doesn't exist should not be fabricated.

**One guard to honor (recon §5):** the `SALIENCE:` header is pushed unconditionally once a
salience object exists. Today the zero-field collapse on line 188 prevents an empty
`{ salience: {} }` from ever rendering a bare `SALIENCE:` with no fields. The fix must keep
that invariant — if held-only ever produces an object with the header but no field lines,
that's a regression. Verify the collapse still triggers when held-only yields nothing.

---

## §4 — Tests (part of the fix, not an afterthought)

The math-assertion tests will move; updating them with documented held-only intent is in
scope. Do NOT silently re-baseline numbers.

1. `shared/utils/__tests__/computeSalience.test.ts` — the test named "hand-level (not
   anchor-only): sums contributions across all cards" asserts the OLD all-cards behavior in
   its **name and intent**. Re-examine it: its cards default `wasHeld: true` (via the `card()`
   factory) so the numbers may still pass, but the *name* now misdescribes the contract.
   Rename/reframe to reflect held-only ("sums contributions across HELD cards"), and confirm
   the assertion is testing the right thing.
2. Add/extend a **mixed-held** test: a roster with held and unheld cards where an unheld card
   carries a large negative stat (mirror the real bug — e.g. unheld card with 6 turnovers).
   Assert `primaryNegative` reflects ONLY held cards and does NOT include the unheld card's
   turnovers. This is the regression test for the exact defect; it must fail on old code and
   pass on new.
3. `shared/commentary/__tests__/salience.test.ts` — re-read for any mixed-held assertions;
   update intent as needed.
4. Full `npm test` green. (Was 1094/1094 on the Pass-2 branch; this is a different base —
   report the baseline before and after.)

---

## §5 — Blast radius (confirmed safe — do not expand scope)

Recon confirmed the ONLY live reader of `primaryPositive`/`primaryNegative` values is the LLM
prompt formatter (`voiceContract.ts:298-314 formatSalienceBlock`). No take-card, share-card,
post_hand, UI, or analytics surface reads them. There is no surface that wants the all-cards
aggregate. Do not change any consumer; the change is strictly to the values computed.

Dev fixtures (`headlineMockFixture.ts`) and the prompt-dump script hand-construct salience as
static literals — no code change needed. If a fixture's hand-built salience implies an
all-cards aggregate that no longer matches held-only intent, note it; do not block on it
(no test currently asserts a fixture aggregate equals a specific cross-roster sum).

---

## §6 — Merge order and verification gate

**Sequencing:** this is a Pass-1 foundation fix and it sits *under* the Pass-2 voice branch.
Land this first, then rebase/merge Pass 2 onto it (or merge this into the Pass-2 branch if
that's the cleaner path for your worktree setup — your call, but the foundation fix must be
present before Pass 2 ships, because Pass 2's good voice amplifies whatever signal it's given).

**The verification gate is on-glass, on the real hand:** after the fix, regenerate the choke
challenge (a freshly created hand of the same shape — held stars underperform, bench commits
the turnovers) and confirm on glass that the headline now blames the **held** lineup
(BIGGEST DRAG / held-star story), NOT a bench-driven turnover aggregate. Smoke + unit tests
confirm the math; only on-glass confirms the narrative reads correctly on a real hand. Green
tests ≠ done.

---

## §7 — What this fix does and does not address

- **Does:** make narrative salience reflect the held lineup; eliminate the
  correctly-sourced-but-wrongly-scoped number class of error (the "14 turnovers" bug) at its
  source.
- **Does NOT:** change the FP score (intentionally all-cards). Does NOT replace the §1 numeric
  validator (still valuable for invented numbers — a different threat). Does NOT address
  `miss` grammar (Pass 3) or example-number templating (deferred).

### Carried-forward parked items (unchanged)
- `miss` grammar break → Pass 3 / miss voice.
- Example-number templating → contract-hygiene (deferred unless a leak is observed).
- `team_not_in_facts:WAS` one-liner → still parked.
- Upstash KV missing in all Vercel envs → code is null-KV-tolerant; the KV-based
  anti-redundancy routing is dead everywhere. Separate finding, build thread.
- OAuth-resume navigation bug (sender bounced off the challenge page after Google login)
  → build thread; not blocking, but it's what made on-glass verification awkward.
