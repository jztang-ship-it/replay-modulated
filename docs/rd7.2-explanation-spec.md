# RD7.2 — Resolution Engine

## Objective lens
More understandable AND more emotionally competitive. Replaces the flavor resolution line with a causally-honest explanation of WHY the hand resolved as it did. No new mechanics.

## Naming / heading (amendment 2026-06-14)
The engine is the "Resolution Engine". The ON-SCREEN HEADING IS OPEN — do NOT hardcode "THE DIFFERENCE" or any difference-implying heading; default to NO heading / neutral, resolved in the Phase-3 nod review. A difference-implying heading pressures the engine to always find a difference — the exact hero-hunting failure mode we are avoiding.

## DEFAULT POSTURE (read before any classification)
**Under-firing card/allocation into VARIANCE is SAFE — and is the entire trust strategy.** Default to humility. Agency claims must WIN their way out of variance, not the reverse. "No single decision swung this" is a FIRST-CLASS, valued output — never a fallback or a failure. The engine earns the right to claim skill by being willing not to.

## Foundational principle (read first)
This is a TRUST ENGINE, not a copywriter. Its credibility comes from being willing NOT to teach: it must sometimes simply RECOGNIZE ("lost by 2.7 — no single decision swung it") rather than manufacture a lesson. The right to claim skill in the card/allocation classes is EARNED by honestly admitting variance when variance is the truth.
ACCEPTANCE BAR = NOD TEST **AND** ARGUE TEST (amendment 2026-06-14).
- NOD = tone: does it sound human, not AI? If the user watched a replay of their hand, would they nod? Not "clever," not "insightful," not "motivational." Would they nod.
- ARGUE = truth: would the user — who was THERE and saw every pull — rebut the line? A plausible-but-WRONG line passes nod but FAILS argue. A possible argue-failure is itself the TRIGGER to under-fire to variance: when the decisive-card anchor (percentile × leverage) is not CLEARLY dominant, prefer the variance recognition over a contestable agency claim.
Both must pass. The Phase-3 prototype file must let John mark BOTH nod and argue per hand (two columns).

## What the engine knows / never claims
KNOWS (your side, fully): your 6 cards' hold/fade (wasHeld), each salary, each final actualFp, each pulled box score (gameInfo + statLine), each card's percentile within ITS OWN player pool (precomputed, §Percentile), cultural tags (stars only), win/loss + margin.
NEVER CLAIMS: any comparison between your decision and Mike's. The two hands are independent draws with no shared player/slot identity — "you held him, Mike faded him" is NOT computable and is FORBIDDEN copy. Mike is the SCOREBOARD (threshold cleared/missed), never a decision-comparand. HARD INVARIANT.

## Cause classes — CLASSIFY 3, NARRATE 2 (amendment 2026-06-14)
The selector CLASSIFIES internally into THREE (card A1–A4 / allocation B / variance C) — that classification is what makes this an explanation, not a receipt. But the WRITER works in only TWO registers:
- AGENCY ("your choice mattered") — all card AND allocation leaves share ONE voice.
- VARIANCE ("that's how the logs fell") — class C.
Do NOT author three mechanically-distinct template families. Card and allocation must share one agency voice or the seams show. Classification → 3; narration → 2.

CLASS A — CARD-DECIDED: one card's (decision × variance) dominates the margin.
  A1 Conviction Paid    — held → high pull
  A2 Conviction Failed  — held → low pull (cap flavor when expensive)
  A3 Gamble Paid        — faded → redraw beat the slot (Replay's purest skill story)
  A4 Gamble Failed      — faded → redraw flopped
CLASS B — ALLOCATION-DECIDED: no single card dominates; the SPEND SHAPE did.
  B1 Top-heavy starved the bench (cap felt: "paid for it elsewhere")
  B2 Balanced depth carried it
  v1 GATE: fires ONLY on obvious extremes vs a measured threshold AND only if Phase-0 confirms the spend-shape→margin signal is clean. If not clean, B downgrades to cap-flavor-on-A-lines only; never guess allocation.
CLASS C — VARIANCE / NULL: no decision had leverage; luck or a cluster decided. Honest recognition, NO invented hero ("razor-thin — the logs fell your way" / "lost by 2.7, no single call swung it"). MANDATORY in v1. This is the trust-preservation class.

## Classification logic (the honesty gate)
1. Per card: decision-leverage (fade > expensive-hold > ordinary-hold) × pull-extremity (|pctile−50|, signed by contribution to margin).
2. One card's score clears a DOMINANCE THRESHOLD over the next → Class A, that leaf.
3. Else spend concentration at an obvious extreme AND it tracks the margin → Class B.
4. Else → Class C.
Thresholds are TUNING, resolved on real hands in the nod prototype — NOT guessed. Under-firing A/B into C is SAFE; over-firing a FALSE hero breaks the nod. Bias to C on ambiguity.

## Selection within Class A — leverage, NOT raw FP
Decisive card = max(decision-leverage × pull-extremity), not max(actualFp). A fade-that-paid or expensive-hold-that-busted outranks a quiet high-scoring hold — we explain agency meeting variance, not a number. (Worked: held $62 Booker @34 vs faded $58 Harden whose $-freed replacement hit 31 → the Harden fade is the story though Booker scored more.)

## Salary cap — FELT, never named
Conviction has a cost; this is what makes Replay not-82-0. Two appearances:
- FLAVOR in a Class A line (returning players only, only when load-bearing): "you spent up for the Beard…" — implies cost, never states $250 or any number.
- SPINE of a Class B line: "you paid up for Jokic, the rest never recovered" — here the cap IS the cause.
FIRST-TIME players: cap INVISIBLE entirely; plain decision×luck only. The cap is felt by implication over repeated runs — the dawning is the point. Never teach allocation to someone who hasn't felt the constraint. (Tiering depends on Phase-0 first-challenge-flag confirm; if absent, v1 ships cap-invisible for all.)

## Cultural tags — WRAPPER, never explanation; CAUSE ALWAYS FIRST
MOST PROTECTED RULE IN THE SYSTEM. Cause sentence first, cultural reference second.
  RIGHT: "You trusted Harden and got burned. The Beard picked the wrong night to disappear."
  WRONG: "The Beard disappeared again." (tag became the explanation; teaches nothing)
Stars-only (RED/ORANGE always, PURPLE gated, others never; untagged → null). Static TRAITS, not game-context — "chokes in big games" is a frame WE pair with our own bad-pull signal, not a flag we read. controversySafe ships empty — NEVER use raw controversy. Untagged decisive player → cause line stands alone. Wrapper is optional garnish; cause is mandatory.

## Mike — scoreboard only, ONE exception
Decision-comparand: never. Outcome framing only ("…enough to beat Mike" / "…came up short").
SINGLE EXCEPTION — bad-beat absolution, LOSS ONLY: you played well (no clear your-side failure) AND Mike's side has a single clean outlier pull → closing clause transfers blame honestly: "Your redraw worked — Mike just caught a monster Curry pull." A LUCK statement about Mike, never a decision one. NEVER on a win (diffuses user-as-hero, implies false out-read). "Tough beat" is a re-run emotion; "I suck" is a quit emotion.

## Generation priority — ORDER mandatory, CLAUSE-COUNT not (amendment 2026-06-14)
RECOGNITION → CAUSE → FLAVOR.
- RECOGNITION leads and CAN STAND ALONE. The entire variance class is recognition-only ("lost by 2.7 — no single call swung it"). Recognition is never skipped.
- CAUSE follows ONLY when one honestly exists (anchor clearly dominant); it MAY fuse into the recognition beat rather than be a separate clause. Never force a cause to fill a slot — a forced cause re-introduces hero-hunting through template structure.
- FLAVOR (cultural tag wrapper) is last and drops FIRST under the word budget.
These are PRIORITIES, not fixed slots. Do not template a fixed clause count.

## Copy budget (hard constraint)
~25–35 words, 2–3 lines @ 12–14px, as a 4th child of the results commentary column (recon E3: slots in, no grid change, ≥390×700). Results is the Pro-Max-tight screen. On-screen heading is OPEN/neutral (see Naming) — do NOT reserve height for a "THE DIFFERENCE" label. The agency register (which may carry a cause) is the highest overflow risk — guard hardest; flavor drops first.

## Percentile — PRECOMPUTE (the one engineering artifact)
Build-time per-player pool stats {basePlayerId → {mean,p10,p50,p90,min,max}}, ~100KB, VERSIONED.
NON-NEGOTIABLE: precompute MUST use the SAME candidate filter as pickBiasedLog (min-minutes/eligibility) so percentile is measured against the population the draw actually sampled. A percentile vs a different population is a quiet lie — the exact drift a trust engine cannot tolerate. Pin the filter once, version the file, results reads one number. Off-pool/off-season card (absent from stats) → no percentile → cannot anchor Class A → degrade to Class C.

## Tuning round 1 (2026-06-14, from the seed-7 80-hand nod batch)
These rules SUPERSEDE the earlier selection/bad-beat/variance/generation prose where they conflict.

### ROOT: CONTRIBUTION selects, PERCENTILE qualifies
- WHO the explanation is about = the card with the largest CONTRIBUTION TO THE MARGIN, in the outcome direction — NOT the highest pool-percentile.
  - WIN: the contributor is the top raw-FP scorer (the card that moved the scoreboard). A $16 / 29.9fp card can NOT be "what carried it" when a held star scored 62 — the star wins on contribution.
  - LOSS: the contributor (culprit) is the biggest SHORTFALL vs the player's own median (poolMedian − actualFp), i.e. the expensive/held card that busted.
- PERCENTILE does NOT select. It QUALIFIES the already-selected contributor's framing:
  - selected contributor in the extreme outcome tail (win→high pctile = caught fire; loss→low pctile = no-show) → AGENCY (a decision/pull that mattered).
  - selected contributor at an ORDINARY pctile (a held star scoring his median) → NOT a decision that mattered → fall to VARIANCE.
- A contributor must clear a real bar: its swing (win) / shortfall (loss) ≥ MARGIN_SHARE × |margin| AND dominate the runner-up — else variance.

### BAD-BEAT — THREE HARD GATES (all must hold; was 33/80 false-firing)
Loss only, variance only. Fire iff:
  1. MARGIN GATE: |margin| ≤ ~13 FP (close band; tune). NEVER on blowouts (a −85 / −105 bad-beat is catastrophic).
  2. YOU-PLAYED-WELL GATE: every held/expensive card (wasHeld OR salary ≥ EXPENSIVE) is ≥ ~35th pctile. No "you played it right" when your own held star went 0th.
  3. MIKE-HERO CONTRIBUTION GATE: Mike's named outlier must clear the CONTRIBUTION bar — a genuine high raw FP game (≥ ~45 FP) whose swing ≥ MARGIN_SHARE × |margin|. NOT a high-percentile scrub. "Mike caught a monster Lindy Waters / Micah Potter pull" is the percentile bug on Mike's side — killed.
Target: ~4–6 bad-beats, all close + well-played + truly out-dueled.

### VARIANCE VOICE — split by margin
- CLOSE (|margin| small) diffuse → COINFLIP voice ("razor-thin — the logs fell your way" / "lost by 2.7, no single call swung it").
- BLOWOUT (|margin| ≥ ~25) → BEATDOWN voice, honest, NOT coinflip. Loss: "Mike's slate ran hot top to bottom — nothing to second-guess." Win: "you ran them off the floor." A −85 loss must NEVER read "no single decision swung it."

### GENERATION — implement Recognition → Cause → Flavor (was one fixed frame per leaf)
- RECOGNITION leads with what the user remembers — usually the decisive card's ACTUAL FP ("Jokić dropped 62."), not a generic "a big night."
- CAUSE follows only when one honestly exists (the decision that mattered).
- FLAVOR: lookupCulture(decisive player) as the optional CLOSING wrapper, cause-first, dropped under budget. A tagged star (Jokić/Giannis-tier) MUST produce a cultural tail (round-1 minimum: nickname-based). Resolved in the harness (sport-specific lookupCulture) and passed to the engine.
- Vary the surface form (≥3 phrasings per leaf, chosen by a stable hash) so 7 A1 hands don't read as 7 copies. Order mandatory; phrasing not.
