# Rivalry Arc — Divergence Primitive

**Status:** SHIPPED behind `VITE_FEATURE_RIVALRY_CLAUSE` (push-held on `feat/rd8-rivalry-divergence`). Reconciled to the built code: v2 result-congruent selection + the ship pass (real name + delta-once un-gated, luck line retired, §8.3 closed). Variety/salience deliberately OUT (§10). Doc-before-code.
**Scope class:** RD7.2-sized design, but the build is a render-time derivation over data already present — no artifact / serialization / API re-plumbing (per the investigation report).

---

## 0. Honesty model (the whole thing in one line)

> **Score only to rank salience, never to frame.**

The selector may ask *"which disagreement mattered most?"* It may **not** ask *"which outcome comparison makes the best story?"* The first is ownership. The second is sports-media narrative generation. Everything below exists to make the second one structurally impossible, not merely discouraged.

This is the RD7.2 constitution applied to rivalry: **decisions are ownable, pulls are not.**

**Attribution corollary (v2).** Praise/blame attaches to what actually happened. If the result was luck, the **base** says luck and the clause stays **silent** — the clause must never contradict the base's verdict (enforced by the result-congruent bar, §5). And the eye is never sent to the opponent's pull: variance is a property of the slate/board/math, never of a named opponent card (§8.3). Score still never crosses the `Divergence` boundary (§2).

---

## 1. What this builds (and what it doesn't)

Three kinds of ownership exist in Replay. Only one is in scope here.

- **Type 1 — "I made that call."** Hold/fade. Already shipped, already working. Untouched.
- **Type 2 — "I beat YOU."** Rivalry. *This spec.* Increases ownership via **visibility**, not decisions. The shared deal already exists; the disagreement already happened; the data was serialized the whole time. The emotion is missing only because the player never sees it.
- **Type 3 — "I built this outcome."** Authored redraw / choose-from-3 / boosts / lanes. **Explicitly ruled out.** Manufactures ownership by adding decision surface (~50% more), taxing the thesis (*sports fan → emotional sweat, no learning curve*). Not a competing priority — a different category. Revisit only if players ask for depth; today there is zero evidence they are.

**Motivation (why Type 2 is the right lever):** sports fans feel enormous ownership while making almost no decisions — through allegiance, rivalry, identity, bragging rights, not agency. The variance-heavy resolution copy is therefore not a deficiency to patch with mechanics; it is evidence the ownership lever was never agency. Rivalry-reveal aims at the actual lever.

**The four constraints this must satisfy simultaneously (the test every ownership idea is run against):**
1. No new mechanic.
2. No extra tap.
3. No fake skill.
4. Makes the opponent more present.

Redraw fails #1. "You called it" copy fails #3. Diff tables fail #2. This survives all four — and it stays that way only if kept aggressively small.

---

## 2. The primitive

Rivalry is **not** an explanation feature. It is a product pillar whose first consumer happens to be the explanation engine. The reusable unit is the *derivation*, not the sentence.

```ts
selectDivergence(
  initialRoster: GeneratedCard[],   // the shared deal (same slots both sides)
  senderResolved: GeneratedCard[],  // Mike's post-redraw roster (carries his wasHeld)
  myRoster: GeneratedCard[],        // recipient's resolved roster (carries my wasHeld)
  result: ResultContext,            // v2 — { outcome, decisiveLineFound } from the base engine
): Divergence | null
```

`ResultContext` is the result the clause must stay congruent with (§5): the win/loss/tie `outcome` plus `decisiveLineFound` (the base engine's `register === "agency"` verdict — did the base name a single decisive line, or attribute the result to variance/luck). Selection is **result-congruent**, not valence-blind (§5).

Returns **at most one** consequential shared-deal disagreement, or `null` when nothing diverged-and-mattered, when no divergence is congruent with the result, when the consequential bar isn't cleared, or the hand is legacy / pre-enrichment (see §5/§6).

**Salience is normalized, never a raw score.** `salience` = the disputed player's actualFp as a share (0..1) of the holding hand's total — read inside, the raw FP discarded. A consumer can rank by it but cannot reconstruct or render a point value from it (§0).

The selector thinks in terms of **divergence**, not "consequential player." The player is presentation; the divergence is the truth. Consumers decide how to talk about it.

```ts
type Divergence = {
  slotIndex: number                       // proves shared-deal origin; SAME slot both rosters
  playerId: string
  playerName: string
  senderDecision: 'hold' | 'fade'
  receiverDecision: 'hold' | 'fade'
  salience: number                        // computed internally; the only ranking signal exposed
}
```

**Score does not cross the function boundary.** It is read *inside* the selector to compute `salience`, then discarded. There is no `score` / `salienceInput` field on the returned struct. Rationale: if the struct cannot carry a raw score out, no downstream surface can leak one or render it next to anything — the same structural-impossibility logic that makes the one-player rule (below) stronger than a "no juxtaposition" judgment call. The score did its job inside the selector; it must not survive.

`slotIndex` is carried on the struct (not recomputed per consumer) because the same-slot proof is a property of the divergence itself. Every consumer inherits the guarantee that the named identity is a shared-deal identity.

---

## 3. The invariant (the real constitution)

A rivalry clause, on **any** surface, must obey:

1. **Exactly one player identity.** Never two — even if three disagreements mattered. The engine's job is salience, not completeness. One player is a story; two is analysis; the moment two identities appear it is a matchup, and matchup is the slippery slope back to outcome-comparison.
2. **The identity must originate from a shared-deal slot** (`slotIndex` present in both rosters' deal). This closes the "one each" loophole: *"You kept Giannis. Mike kept Curry"* names one player each and would pass a naive identity count, but it is functionally a comparison. The named player must be the **same** player both were dealt at that slot.
3. **Both parties are referenced only in relation to that one player.** Mike appears as the *decider* on your shared player ("Mike let him go"), never as the holder of a different player with his own outcome.
4. **Any second player identity invalidates the clause** → fall back to base explanation.

This is machine-checkable and therefore durable. "No juxtaposition" is a semantic judgment a future engineer, copywriter, or model can violate by accident. "One shared-deal player identity, same slot, second identity invalidates" is countable. The structure prevents drift instead of relying on vigilance.

---

## 4. First consumer — `explainH2HResult` (compose model, corrected against real code)

`explainH2HResult` runs `selectDivergence` + the §3 validator and returns the clause as a **separate field** — it does **not** concatenate into `text`. Args gain `initialRoster: GeneratedCard[]` (present at the single call site, `H2HRecipientReveal.tsx:187`, via `challengeCtx.initialRoster`).

```ts
// return type gains one field:
{ text; classification; flavorRequest; rivalryClause: string | null } | null
```

**Why a separate field, not concatenation (the real code forces this).** `H2HRecipientReveal.tsx:215` does `displayExplanation = llmFlavor ?? explanation`. The LLM Flavor base is the shipped default (flag ON). Any clause concatenated onto `text`/`explanation` is silently discarded whenever Flavor renders. So the physical append must happen **after** the swap, at the render site:

```ts
displayExplanation = (llmFlavor ?? explanation) + (rivalryClause ? " " + rivalryClause : "")
```

The clause therefore survives whichever base renders. It is a **sibling** not just conceptually but physically composed outside the engine. The clause and the LLM Flavor are orthogonal — Flavor describes *your* card's box line, the clause states a *sender decision divergence* — so they append cleanly. (Coincident-player redundancy is a render nit; see §9.)

**Sibling module** (`shared/explanation/selectDivergence.ts`):
```ts
selectDivergence(initialRoster, senderResolved, myRoster): Divergence | null
renderDivergenceClause(d: Divergence): string   // states disagreement, no causal verb
// validator (§3): identityCount === 1 && d.slotIndex present in both rosters' deal
```

- **States the disagreement; does not argue causality.** Render: *"Giannis scored 91. Mike let him go."* / *"Curry exploded. Mike kept him. You didn't."* The player's brain builds the rivalry story. The moment the copy argues it ("Mike's decision beat you"), we assert false certainty the data cannot support — with 12 divergent decisions and thousands of points through variance, the selector knows only which disagreement was most *salient*, not what *caused* the result. Restraint is the only honest version. **"Mike let Giannis go" over "Mike's decision beat you."**
- **Validator-gated** on the §3 invariant. Fail → `rivalryClause: null`, base renders alone.

**Subsume — REMOVED in the v2 ship pass (the luck line is gone entirely).** v1 suppressed the bad-beat pull-frame (`opponentOutlier: null`) only where a divergence existed. Two facts retired that: (1) under result-congruent gating (§5) the clause fires only on agency/tie hands, which never carry a bad-beat (bad-beat is a variance-LOSS frame) — so the subsume was already inert; (2) the ship pass **retires the opponent-card luck line unconditionally** (§8.3) — there is no pull-frame left to suppress on any hand. `explainH2HResult` now always passes the real `opponentOutlier` (used only for bad-beat *eligibility*, never to name a card). One sender-side frame still ever renders; the constitution's "decisions over pulls" is now enforced by deleting the pull-frame outright, not by conditional suppression.

---

## 5. Wins and losses — both, loss is sharper, selection is RESULT-CONGRUENT (v2)

Fires on both. The loss case is the stronger one, but **for the right reason**: it gives the loss a *face* without claiming the face caused it. "Mike's decision became the most important disagreement" — never "Mike's decision caused the loss." A loss with a face creates rematches; accountability is a better engine than celebration. The sharpness comes from restraint, not from stronger causality.

**v2 — result-congruent selection (the valence-blind bug glass found).** The clause must praise/blame the side that actually owns the verdict, and must never contradict the base's verdict (§0 attribution corollary):

- **WIN** → the most-salient divergence where you *held* and Mike *faded* (your call that paid off).
- **LOSS** → the most-salient where Mike *held* and you *faded* (the call that beat you).
- **TIE** → the sharper side, either direction.

**Consequential bar (reuses the base engine's decisiveness judgment).** On WIN/LOSS the bar is `decisiveLineFound` — i.e. the base named a single decisive line (`register === "agency"`). If the base found **no** decisive line (it called the result variance/luck — "no single hot hand"), `selectDivergence` returns `null`: the clause stays silent rather than contradict a luck verdict. This is the **image-3 fix** — a balanced blowout won on the redraw has no shared-deal call to brag about, so the clause is quiet. TIE has no decisive-line concept (always variance), so it gates on a **salience floor** (`0.20` — the disputed player carried >20% of the holding hand, above the 1/6≈16.7% even-split; a genuine swing piece, reversible).

---

## 6. Fallback / legacy behavior

Silent degradation, never fabrication.

- Arc is already gated on **sender resolution** (`H2HRecipientReveal.tsx:117`). Legacy challenges with no resolved sender hand → no clause at all, base explanation only.
- Robust derivation that sidesteps the legacy `PARTIAL` from the investigation: take **sender's held set from `senderResolved`** (arc-gated, reliable from 2026-05-26 forward), **dealt identities per slot from `initialRoster`** (always present), **my decisions from `myRoster.wasHeld`**. "Mike cut him" = dealt identity at slot *i* absent from his held set. **Do not trust `initialRoster.wasHeld` directly** — pre-enrichment legacy snapshots stamp it all-false (zeroed defensively at the deal/play sites, `GameView.tsx:1799`, `H2HRecipientPlay.tsx:405`).
- **Membership keys on `basePlayerId`, not `slotIndex`** (code-verified, `enrichInitialRosterForChallenge.ts:34-35` precedent): a held card keeps its `basePlayerId`; a cut original is absent from `senderResolved` and never reappears (redraw draws from unused players). `slotIndex` is the addressing/proof key (the §3 same-deal check), not the membership key. Confirmed present on all three rosters at render (`SportAdapter.ts:291`, `resolvedRosterSerialization.ts:36`, `types/index.ts:179`).
- Where the cut player cannot be named honestly (pre-enrichment snapshot), the clause does not fire. Fall back to today's explanation. Never invent a divergence.

---

## 7. Reusability — the pillar beyond the result screen

The result-screen clause may end up the *least* important consumer. The same `Divergence` feeds future surfaces — notifications, challenge cards, rematch prompts — each rendering its own way. Likely the highest-leverage consumer is the notification ("the challenge is a disagreement between friends, not a score").

- **Honesty rule lives in the primitive** (one shared-deal identity, divergence by decision, score for salience only, discarded at boundary) → every future consumer inherits it.
- **Rendering rule lives per surface** (one clause, validator-checked identity count, *state don't argue*). Written down now so the notification surface inherits the restraint instead of rediscovering it: no causal verbs. "revenge," "made him pay," "beat you" creep causality back in — they state more than the data supports. State the disagreement; let the player infer the rivalry.

---

## 8. Resolved against `explainH2HResult` (build-ready)

**8.1 — Luck-outlier relationship: subsume → SUPERSEDED by retirement (v2 ship pass).** v1 resolved this with mutual-exclusion suppression (`opponentOutlier: null` when a divergence fired). The ship pass goes further: it **deletes the pull-frame entirely** (§8.3), so there is nothing to suppress and the subsume is removed (§4). The luck-outlier read is kept only for bad-beat *eligibility*; it never names a card.

**8.2 — Compose point: separate field, append after the LLM swap.** Resolved in §4. `rivalryClause: string | null` returned by `explainH2HResult`; physical `+` at `H2HRecipientReveal.tsx:215` onto `displayExplanation`, so it survives both LLM and deterministic bases. `explainH2HResult` gains `initialRoster`. Single call site → contained change.

**8.3 — RESOLVED (ship pass): unconditional retirement of the opponent-card luck line.** John's call landed on unconditional. The bad-beat line (`resolutionEngine.ts`) no longer names an opponent card; it keeps the process-validation ("you played it right") and attributes the variance to the **slate / board / game / math** via a rotating card-free phrase (`VARIANCE_SLATE`). "you played it right" specificity is preserved.

**Rationale — attention allocation (not a score comparison).** The old line was honest *as luck* ("you played it right, Mike just caught a monster Curry pull"), but it spotlighted the **opponent's pull** — the exact place the constitution says not to send the eye. §0 is not only "no score comparison"; it is "don't make the opponent's outcome the subject." Naming the opponent's hot card does that even while disclaiming causality.

**Constitutional rule (now enforced in copy, strengthened):** variance is a property of the **SLATE / BOARD / GAME / MATH as a SYSTEM** — never of the opponent or his board *as an actor*. The system is the grammatical subject; it may *break / fall / tilt / lean* the opponent's **way**. The opponent's **name may appear**, but neither he nor his board may be the **subject of an active heat/agency verb** — no "his board *went off* / *caught fire* / *exploded* / *overwhelmed* / *did the damage*". Widening the subject from one card to "his whole board" does **not** fix it; that still makes his performance the protagonist (the exact attention-allocation problem). This applies to **all** variance loss copy (bad-beat, beatdown, mid), audited and enforced by a sweep test (`resolutionEngine.test.ts`).

---

## 9. Copy fixes folded into the ship pass (UN-GATED) + still tracked

**Shipped un-gated this pass** (corrections to already-wrong base copy — they apply regardless of `VITE_FEATURE_RIVALRY_CLAUSE`, so flag-OFF is deliberately *no longer* byte-identical to old prod):
- **Real opponent name** — base variance copy (beatdown/blowout) said "Mike"; now uses the challenger's `namedChallenger` (fallback "Mike"). Threaded via `ResolutionInput.opponentName`.
- **Delta-once** — the margin number (and its idea) now appears exactly once; margin-restating variance closers are dropped (`ResolutionInput.deltaOnce`).
- **Luck-line retirement** — §8.3 (also un-gated; it's a constitutional copy fix, not part of the clause feature).
- **Coincident-player render nit** — `renderDivergenceClause` already has the score-free pronoun variant; resolved.

**Still tracked (not this build):**
- **Honest-copy cleanup:** kill "You knew." / "You called it." / "That's the read." Keep "You held him." / "Mike let him go."
- **Agency-win dangling "it"** nit (`resolutionEngine.ts` agency-win template).
- **Confirm RD7.11/7.12 cleanup ran:** preview teardown, registry, worktree archives (`feat/rd7-11-substance`, `feat/rd7-12-llm-flavor`).

---

## 10. Out of scope, by explicit decision — variety & salience (World A vs World B)

This ship is the **honest skeleton**, not the tuned product. Two deliberately-deferred axes:

- **Variety** — the clause has a small fixed phrasing set ("You held X. Mike let him go." / "Mike kept X. You let him go." + coincident pronoun forms). No rotation pool, no LLM-authored variety.
- **Salience** — ranking is a single normalized contribution share (disputed player's actualFp / holding-hand total). No multi-signal salience (recency, tier, margin-share, narrative weight).

**World A vs World B (the reason to defer).**
- **World A (ship now):** rivalry-reveal's value is *visibility* of a disagreement that already happened (§1, Type 2) — it does not depend on phrasing richness or salience sophistication. Ship the honest skeleton, watch whether surfacing the disagreement moves ownership/rematch behavior at all.
- **World B (invest later):** richer variety + a tuned salience model. This is real work with its own eval surface — and it is **unjustified until World A shows the lever exists.** Building World B first would tax the thesis (*sports fan → emotional sweat, no learning curve*) and risk polishing a frame nobody responds to.

Decision: **ship World A; gate World B behind evidence from World A.** Reversible — the `Divergence` primitive already exposes `salience` and the renderer is swappable, so World B is additive, not a rewrite.

## 11. The four-item ship membrane (what's IN this ship, what's OUT)

**IN (this pass):**
1. The rivalry **clause** — result-congruent, one shared-deal identity, no causal verb, no score (flag-gated).
2. **Real opponent name** in base copy (un-gated).
3. **Delta-once** margin (un-gated).
4. **Luck-line retirement** — no opponent card named in any variance line (un-gated).

**OUT (explicitly, not forgotten):** variety, salience tuning (§10); the honest-copy cleanup family (§9); World B. Anything touching selection/invariant/render of the clause beyond the four items above is outside the membrane for this ship.

---

## Locked design, one breath

A pure `selectDivergence(initialRoster, senderResolved, myRoster) → Divergence | null` that diffs the three rosters, ranks shared-deal disagreements by an internally-computed salience that reads score and discards it, and returns at most one — or null on legacy / nothing-mattered. The struct carries slot, player, both decisions, salience; no raw score crosses the boundary. `explainH2HResult` is the first consumer (a sibling, not new responsibility): appends exactly one clause, states the disagreement without causal claim, validator-enforces one shared-deal player identity from one slot with both parties referenced only in relation to that player, falls back silently otherwise. Fires on wins and losses, loss sharper via restraint not causality. No new screen, tap, decision, or mechanic.
