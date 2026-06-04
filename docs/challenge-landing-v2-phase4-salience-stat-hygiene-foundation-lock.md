# Phase 4 — Voice overhaul, Pass 1: salience + stat-hygiene data foundation

## Why this pass exists
On-glass review found the authored voice is robotic across all triggers. Root cause
(per ChatGPT + recon): the model is asked to DERIVE why a result happened from raw
stats, so it manufactures meaning ("the shimmy died", "the shot selection said
different") and cites stats that don't feed FP (minutes, threes, fg%). The fix is
"compute salience, not conclusions": code decides WHICH facts mattered; the model
explains them. This pass builds that data foundation. NO voice rewrite here.

## Scope (DATA / facts-shape only — VOICE_CONTRACT rules are NOT rewritten this pass)
1. STAT HYGIENE — trim the statLine rendered into the model prompt to FP-component
   keys only: {pts, reb, ast, stl, blk, turnovers}. min / threes / fg% / any other
   key never reach the model. Mechanism mirrors the existing surface-keyed game-
   context withholding in formatStatLine (voiceContract.ts ~234-250). The full
   statLine stays on CommentaryFacts.anchor.statLine — only prompt rendering trims.
   - Source the allowlist from the sport's FP-weight keys, not a hardcode.
   - FIX the latent mis-key: formatStatLine orders "to" but source statLines carry
     "turnovers" — turnovers currently falls to the tail bucket. Align so turnovers
     renders in its slot AND so salience reads the source key (turnovers), not "to".

2. SALIENCE — new hand-level signal. Code computes which facts mattered; model
   later explains them (Pass 2/3). Shapes:
   - New SalienceFact type, mirroring TopGameReason ({category, value, label}),
     added beside TopGameReason in commentaryFactsTypes.ts (keep zero runtime
     imports in the pure-types module).
   - New TOP-LEVEL optional field on CommentaryFacts (NOT on the anchor — must be
     hand-relative, and miss has no anchor block):
       salience?: {
         primaryPositive?: SalienceFact;   // largest positive FP contribution
         primaryNegative?: SalienceFact;   // largest negative FP contribution
         primaryDragPlayer?: {             // choke: the held star who fell short
           basePlayerId: string;
           name: string;
           shortfall: number;              // actualFp - projectedFp (negative)
         };
       }
   - New optional field on BuildCommentaryFactsInput carrying the computed salience.

3. SALIENCE COMPUTATION — Option A (weights stay sport-side):
   The live caller (ChallengeSharePrompt.tsx ~175-200) computes salience via
   basketball/src/adapters/fantasyPoints.ts:computeBasketballFpDetailed
   ({ total, breakdown } keyed by stat) and threads a finished salience object into
   BuildCommentaryFactsInput. shared/commentary/ does NOT import basketball/.
   - Uniform mechanical rank (all triggers): per-stat FP contribution = weight ×
     value, summed across the roster. Largest positive → primaryPositive; largest
     negative → primaryNegative.
   - choke ALSO gets primaryDragPlayer: the held card with the largest negative
     (actualFp - projectedFp). This is the real "why" for choke — turnovers alone is
     misleading. Stat-level negative for choke is usually small; the player shortfall
     is what voice must explain.

4. TOTAL FP — add discrete CommentaryFacts.totalFp, threaded from the value
   evaluateTrigger already computes (triggerEvaluation.ts ~146). Closes a prior
   deferral (the big_score "238.7 FP" example needs the hand total). Single-field
   thread; the upstream value is authoritative — don't re-sum in the builder.

5. PROMPT RENDERING — render salience + totalFp into the user prompt between the
   anchor/nearMiss block and the closing instruction (voiceContract.ts ~252-298),
   same outdent as NEAR_MISS_GAP_FP. Applies to BOTH surfaces (challenge_headline
   and post_hand — post_hand needs it more, it has room to explain).

## Per-trigger signal map (which signals each trigger carries)
- big_score — primaryPositive (carry stat); primaryNegative usually small/absent.
- choke — primaryPositive (the star's good stat) + primaryDragPlayer (the shortfall
  that sank it). primaryNegative (stat-level, e.g. turnovers) may also be set.
- miss — primaryPositive (closest contributor); leans on existing nearMissGap for
  the negative. A "what stat would close the gap" signal is DEFERRED to Pass 3.
- rare_pull — UNCHANGED. Keeps existing topReason (the rare-line signal). NO
  salience layered on — it would duplicate or distract from topReason.

## Honesty / unchanged
- Code still owns facts + verdict; model styles only. Game context still withheld
  from challenge_headline. anchorTruth gate unchanged. Validators unchanged.

## Verification (this is a DATA pass — voice grade is NOT the gate)
- Unit tests: salience computation per fixture — correct primaryPositive /
  primaryNegative / primaryDragPlayer values; statLine trim drops min/threes;
  turnovers reads + renders correctly.
- Prompt-assembly check: the assembled user prompt for each smoke fixture shows
  (a) trimmed stats only, (b) the salience block, (c) totalFp. Confirm via the
  smoke harness output or a prompt-dump.
- Smoke voice grades may stay low/robotic — EXPECTED. Voice is Pass 2/3. Do NOT
  tune VOICE_CONTRACT rules to chase grades in this pass.

## Out of scope (later passes / separate)
- All VOICE_CONTRACT rule rewrites: narrative hierarchy, hand-centric framing,
  scaffold ban, one-clause default, Norman-Chad replacement, new gold set → Pass 2.
- The three register deltas (game commentary / headline / trash talk) + miss voice
  → Pass 3.
- miss "closeStatToGap" signal → Pass 3 (with miss voice).
- post_hand endpoint / fixture / client wiring → not this effort.
- miss `team_not_in_facts:WAS` validator bug → separate standalone code fix.
- Lifting the FP-vs-points rule out of the big_score deep dive into shared → Pass 2.
