# RD7.2 — Results Explanation Engine ("THE DIFFERENCE")

## Objective lens
More understandable AND more emotionally competitive. Replaces the flavor resolution line with a causally-honest explanation of WHY the hand resolved as it did. No new mechanics.

## Foundational principle (read first)
This is a TRUST ENGINE, not a copywriter. Its credibility comes from being willing NOT to teach: it must sometimes simply RECOGNIZE ("lost by 2.7 — no single decision swung it") rather than manufacture a lesson. The right to claim skill in the card/allocation classes is EARNED by honestly admitting variance when variance is the truth.
ACCEPTANCE BAR = THE NOD TEST: if the user watched a replay of their hand, would they nod? Not "clever," not "insightful," not "motivational." Would they nod. The moment they don't, causal trust breaks — and causal trust is the entire foundation.

## What the engine knows / never claims
KNOWS (your side, fully): your 6 cards' hold/fade (wasHeld), each salary, each final actualFp, each pulled box score (gameInfo + statLine), each card's percentile within ITS OWN player pool (precomputed, §Percentile), cultural tags (stars only), win/loss + margin.
NEVER CLAIMS: any comparison between your decision and Mike's. The two hands are independent draws with no shared player/slot identity — "you held him, Mike faded him" is NOT computable and is FORBIDDEN copy. Mike is the SCOREBOARD (threshold cleared/missed), never a decision-comparand. HARD INVARIANT.

## Cause classes — classify FIRST, then narrate (this is what makes it an explanation, not a receipt)
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

## Copy budget (hard constraint)
~25–35 words, 2–3 lines @ 12–14px, as a 4th child of the results commentary column (recon E3: slots in, no grid change, ≥390×700). Results is the Pro-Max-tight screen. Every class needs a template that FITS; Class B (explains a pattern) is the highest overflow risk — guard hardest.

## Percentile — PRECOMPUTE (the one engineering artifact)
Build-time per-player pool stats {basePlayerId → {mean,p10,p50,p90,min,max}}, ~100KB, VERSIONED.
NON-NEGOTIABLE: precompute MUST use the SAME candidate filter as pickBiasedLog (min-minutes/eligibility) so percentile is measured against the population the draw actually sampled. A percentile vs a different population is a quiet lie — the exact drift a trust engine cannot tolerate. Pin the filter once, version the file, results reads one number. Off-pool/off-season card (absent from stats) → no percentile → cannot anchor Class A → degrade to Class C.
