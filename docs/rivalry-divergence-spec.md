# Rivalry Arc — Divergence Primitive

**Status:** §8 closed against real code; build-ready on the divergence path. One open call (§8.3, bad-beat residual) is John's constitution, not a blocker for the divergence build. Doc-before-code.
**Scope class:** RD7.2-sized design, but the build is a render-time derivation over data already present — no artifact / serialization / API re-plumbing (per the investigation report).

---

## 0. Honesty model (the whole thing in one line)

> **Score only to rank salience, never to frame.**

The selector may ask *"which disagreement mattered most?"* It may **not** ask *"which outcome comparison makes the best story?"* The first is ownership. The second is sports-media narrative generation. Everything below exists to make the second one structurally impossible, not merely discouraged.

This is the RD7.2 constitution applied to rivalry: **decisions are ownable, pulls are not.**

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
): Divergence | null
```

Returns **at most one** consequential shared-deal disagreement, or `null` when nothing diverged-and-mattered, or the hand is legacy / pre-enrichment (see §6).

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

**Subsume — decision divergence demotes the luck-outlier (constitutional, not just plumbing).** The existing luck-outlier read (`explainH2HResult.ts:62-71`) selects a sender card by *score* (`swing = fp − p50`) and feeds the bad-beat pull-frame (`resolutionEngine.ts:112,358`: *"Mike just caught a monster Curry pull"*). That is itself a pull-frame. A literal one-pass merge is impossible — §2 forbids score crossing the `Divergence` boundary, so the selector cannot reproduce the score-axis pick. Resolution: **`selectDivergence` is the single sender-side "what mattered" authority.** When it returns non-null, `explainH2HResult` builds `ResolutionInput` with `opponentOutlier: null` (→ `badBeatEligible` false → pull-frame never renders; base loss line degrades to the honest `MID_LOSS` variance cause) and returns the divergence clause instead. When it returns null, today's outlier/bad-beat path is unchanged. Exactly one sender-side frame ever renders, and where a real decision divergence exists the pull-frame is retired in its favor — the constitution choosing decisions over pulls. (Residual: see §8.3.)

---

## 5. Wins and losses — both, loss is sharper

Fires on both. The loss case is the stronger one, but **for the right reason**: it gives the loss a *face* without claiming the face caused it. "Mike's decision became the most important disagreement" — never "Mike's decision caused the loss." A loss with a face creates rematches; accountability is a better engine than celebration. The sharpness comes from restraint, not from stronger causality.

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

**8.1 — Luck-outlier relationship: SUBSUME, as arbiter.** Resolved in §4. The luck-outlier is itself a pull-frame; the §8.1 contradiction (it can name a sender card by score while the clause names a shared-deal player by decision — both as "what mattered," same screen) is real on close losses. Subsume = mutual exclusion via `opponentOutlier: null` suppression when divergence is non-null; **not** a merge (a merge would export score, violating §2).

**8.2 — Compose point: separate field, append after the LLM swap.** Resolved in §4. `rivalryClause: string | null` returned by `explainH2HResult`; physical `+` at `H2HRecipientReveal.tsx:215` onto `displayExplanation`, so it survives both LLM and deterministic bases. `explainH2HResult` gains `initialRoster`. Single call site → contained change.

**8.3 — OPEN (John's constitution, not a build blocker): the bad-beat residual.** Subsume retires the pull-frame only where a divergence exists. On a loss with **no** divergence (or a legacy hand we can't name honestly), today's *"Mike caught a monster pull"* line still ships. Two options:
- **Conditional (CC's proposal, current spec):** arc touches only what it replaces. Keeps the build aggressively small. Leaves a known pull-frame shipping on no-divergence losses.
- **Unconditional retirement:** always fall to the `MID_LOSS` humble-variance line, divergence or not. Constitutionally cleaner (the constitution has no "forbidden unless we've nothing better" clause). One-line branch, but expands blast radius into loss copy on no-rivalry hands and costs the "you played it right" specificity there; the bare variance line may want its own copy pass first.

Lean: ship **conditional** in this build; log **unconditional retirement** as a near-term honest-copy fast-follow (§9, same family as killing "you called it"). Reversible either way. John's call.

---

## 9. Tracked separately (not part of this build, not forgotten)

- **Honest-copy cleanup** (independent, near-free, should ship regardless): kill "You knew." / "You called it." / "That's the read." Keep "You held him." / "Mike let him go."
- **The two parked deterministic-copy nits:** agency-win dangling "it" (`resolutionEngine.ts` agency-win template); variance-loss margin doubling (RD7.12-c VARIANCE/LOSS_CLOSERS — if the cause clause stated the margin, the closer omits it).
- **Coincident-player clause redundancy (build-time render nit):** when the LLM Flavor base already centers the player the clause names (both = Giannis), the score gets stated twice. `renderDivergenceClause` needs a score-free variant for the coincident case ("…and Mike let him go" without restating 91). Same family as the variance-loss margin-doubling nit above.
- **Bad-beat unconditional retirement (fast-follow, pending §8.3):** if John reads the residual as "a pull-frame is a pull-frame," retire `resolutionEngine.ts:358` on no-divergence losses too → always `MID_LOSS` variance. Same family as the honest-copy cleanup.
- **Confirm RD7.11/7.12 cleanup ran:** preview teardown, registry, worktree archives (`feat/rd7-11-substance`, `feat/rd7-12-llm-flavor`). Left open in the handover.

---

## Locked design, one breath

A pure `selectDivergence(initialRoster, senderResolved, myRoster) → Divergence | null` that diffs the three rosters, ranks shared-deal disagreements by an internally-computed salience that reads score and discards it, and returns at most one — or null on legacy / nothing-mattered. The struct carries slot, player, both decisions, salience; no raw score crosses the boundary. `explainH2HResult` is the first consumer (a sibling, not new responsibility): appends exactly one clause, states the disagreement without causal claim, validator-enforces one shared-deal player identity from one slot with both parties referenced only in relation to that player, falls back silently otherwise. Fires on wins and losses, loss sharper via restraint not causality. No new screen, tap, decision, or mechanic.
