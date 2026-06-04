# Phase 3.3 — big_score tuning pass (confident-challenge register)

## Scope
Tune the authored challenge headline for the big_score trigger only. One commit,
on-glass review before merge. Voice tuning only — NO engine, schema, or
facts-boundary changes. Tuning surface = the big_score register guidance in
VOICE_CONTRACT / buildUserPrompt. Authored strictly from fields that reach the
model today (voiceContract.ts ~234-246).

## Register / intent
big_score = a strong hand daring the opponent to beat it. Confident, terse, a
challenge — not a recap. The number is the weapon, and the number is the ANCHOR's
FP (anchor.topReason label, e.g. "65.3 FP"). NOT the hand total — hand total is
not in CommentaryFacts today (see Deferred).

Authorable-today gold direction:
- "YOU HELD CURRY AT 65.3 FP. BEAT IT."
- "65.3 FP FROM ONE MAN. GOOD LUCK."

## Primary fix (the reason this pass exists)
Smoke shows accuracy=2: model rendered "YOU HELD CURRY AT 65 POINTS" from a
65.3 FP topReason while statLine pts=42 — it conflated fantasy points with game
points. The authored line MUST treat the anchor FP figure as fantasy points:
never "POINTS", never pull the statLine point total as the number. The FP value
(anchor.topReason) is the only number that may anchor the line.

## Facts in scope (engine decides, model styles)
- anchor.topReason — the FP figure/label; central, the weapon.
- anchor name / team / tier / nicknames / knownFor / statLine — present; name
  players, never blame them (inherited from 3.3). statLine is context, not the number.

## Facts withheld at input boundary (unchanged)
- opponent / homeAway / date — gated off by surface === "challenge_headline"
  (voiceContract.ts 234, 242-246). venue rejected at the network boundary
  (api/headline.ts 299-301). Same for every trigger; leave untouched.

## Honesty gate
big_score is verdict="credited", honest-by-construction (commentaryFacts.ts
121-144) — NO anchorTruth classifier call, no soft-verdict path. The pass does not
touch the gate; there is no mid-zone case to handle for big_score.

## Validation
Validators are trigger-blind (api/headline.ts 149-190); unchanged. team_not_in_facts
allowed set for the Curry fixture = {GSW, PHX} + anchor-name tokens. Voice is not
unit-asserted.

## Test plan
- Harness: npm run smoke:headline — big_score line judged against the gold
  direction above; accuracy must clear the FP/points conflation.
- On glass: fresh challenge that triggers big_score (per-row storage), real browser
  not the messaging webview (OAuth 403). Green harness != done.

## Deferred (NOT this pass)
- totalFp (hand total) at the facts boundary — required for "238.7 FP. GOOD LUCK."
- creatorName at the facts boundary — required for "JOHN THINKS THIS HAND IS SAFE."
  Both are facts-boundary plumbing; their own pass if/when chosen.
- miss tuning pass (next); opponent-as-COLOR; KV / rate-limit / ESM-CI cleanup.
