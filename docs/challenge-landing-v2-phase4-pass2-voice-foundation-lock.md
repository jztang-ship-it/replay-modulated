# Phase 4 — Voice overhaul, Pass 2: shared voice foundation rewrite

## Why this pass exists
Pass 1 fixed what the model is FED (clean FP stats, salience, totalFp). Pass 2 fixes
what the model is TOLD TO DO. Current framing tells it to "write a sports argument /
clever line" and to lead with held players — so it manufactures meaning and defaults
to the "YOU HELD…" scaffold. This pass rewrites the shared instruction layer to:
explain what the hand's salient facts did to the result (fact → why → verdict, THEN
voice), hand-centric, scaffold-free, one-clause default, no named commentator.

## Gate (read first)
On-glass is the gate for this pass. The grader's humanness axis is NOT sensitive to
the construction-vs-observation failure we're fixing (pre-fix "YOU HELD CURRY AT 65
POINTS" scored humanness=8). So: smoke is REGRESSION-ONLY (confirm accuracy /
clarity / culturalTruth did not drop; ignore humanness/vibe as proof of success).
The real judgment is fresh challenges in a real browser against the gold set below.
Grader tuning is a SEPARATE later pass — do NOT touch the grader here.

## Scope — shared layer only (NOT the three register deltas; those are Pass 3)

### A. Narrative target (the core rewrite)
Rewrite the "what is your job" framing. Replace:
- voiceContract.ts:102/104 — "headlines are sports arguments / write to THAT story"
- voiceContract.ts:108 — the subject priority ladder "held players → decision →
  outcome → claim" (this is the player-first inversion driving the scaffold)
With a fact-first narrative target:
- The job is to EXPLAIN what this hand's salient facts did to the result — not to
  manufacture a clever line. Walk fact → why it mattered → verdict, THEN style it.
- Subject priority INVERTS to: the salient fact (what the SALIENCE block names) →
  the result it produced → the player as the talent involved. Stat/outcome leads;
  player is named, not led with.
- Hand-centric, not player-centric: explain what the stat line did to THIS HAND
  ("8 turnovers were too much for this hand"), never "tell me about the player."
- Keep the existing true constraints: subject is the fantasy hand not the NBA game;
  game context (opponent/venue/date) stays withheld on challenge_headline.

### B. Retire the named commentator
basketballVoice.ts lines 94 / 96 / 102 / 106 — remove "Norman Chad at a sportsbook"
framing. Replace the voice definition with: "a smart sports fan explaining to a
friend what just happened — plain, observational, no performance." Wit comes from
the obviousness of the observation, not from doing an impression. (The Chad bank
pools in chad.ts / chadChallenge.ts are the deterministic fallback surface, NOT the
LLM path — OUT OF SCOPE, leave them.)

### C. Flip the structure default (BOTH rules — they compound)
Two STRUCTURE rules reach the model and both currently lead with two-clause:
- INHERITED basketballVoice.ts:102 "Two-clause lines. Setup, then editorial twist."
  — fires FIRST. Retire the two-clause-as-default; if the segment keeps a structure
  note, it must lead single-clause.
- OVERRIDE voiceContract.ts:216 "One to two clauses… OR a single confident assertion"
  — reorder to LEAD with the single-clause form; demote a second clause to "ONLY
  when it adds new information." Add the explicit anti-rule: "Never pad to reach a
  second clause" (this is the vague-metaphor failure: "the shimmy didn't save this").
Both must change — fixing only the override lets the inherited rule re-establish the
bad default before the override is read.

### D. Ban the scaffolds + rebuild the gold set
- Name "{verb} {player} AT {number}" as an explicit anti-pattern (3 instances remain:
  voiceContract.ts:144, 198, citation 203 — all big_score; remove/replace).
- Player-first / "YOU HELD…" openings are the dominant imitated pattern (7 of the
  gold examples open with YOU). Ban YOU-as-default opening; rebuild the gold set
  toward varied openers: stat-first, verdict-first, challenge-first.
- New gold set (calibration from on-glass review; these are the TARGET voice):
  Choke:
    - "Eight turnovers ended this before it started."
    - "AI scored 37. The rest of the hand never caught up."
    - "Twelve points from T-Mac was never enough."
  Big score:
    - "62.1 FP is the number to chase."
    - "Vince turned this hand into an All-Star bid."
    - "245.8 FP. Good luck."   (hand-total leads — totalFp now available)
  Miss:
    - "Seven FP short of an All-Star hand."
    - "This hand came up one decision short."
  (rare_pull keeps its existing topReason-led golds; refresh only to drop YOU-prefix
   where it's the default opener.)

### E. Salience-consumption instruction (NEW — Pass 1 only rendered it)
The model currently gets NO instruction on how to use the SALIENCE block. Add per-
trigger "which signal leads" guidance in the shared Rule 3 (Option A from recon —
one shared edit, four triggers, sits next to the register cue):
  - choke     → lead with BIGGEST DRAG (the player-shortfall is the real why)
  - big_score → lead with MOST IMPORTANT POSITIVE / TOTAL_FP (the carry / the line)
  - miss      → lead with NEAR_MISS_GAP_FP (what was left on the table)
  - rare_pull → lead with topReason (existing rare-line signal)

### F. Lift the FP-vs-points rule to shared
Move voiceContract.ts:185-193 out of the big_score deep dive into FORMAT +
INHERITED CONSTRAINTS, REWRITTEN conditionally: "When topReason carries an FP-typed
value, render it as 'FP', never 'POINTS'…". This is required — rare_pull's topReason
is stat-typed ("48 pts"), so an unconditional "render as FP" would be wrong for it.
Keep the Curry failure as a general callout, not a big_score-only example.

### G. Render consistency fixes (fold in — same concept-not-mechanics principle)
- topReason render (voiceContract.ts:348): drop the "(category=value)" suffix —
  emit just the label. Same analyst-suffix the Pass 1 SALIENCE fixup retired.
- BIGGEST DRAG magnitude (formatSalienceBlock ~285-298): the model sees WHO/THAT
  dragged but not HOW MUCH, so it can't modulate small-vs-large drag (a -3 and a -25
  read identically and the canned phrase commits to "large"). Compute a magnitude-
  BAND concept word at the renderer from shortfall ("just short" / "well below" /
  "vanished") — concept, NOT the raw number. Renderer change, no shape change.

## Out of scope (Pass 3 / separate)
- The three register deltas (game-commentary / headline / trash-talk split) → Pass 3.
- miss "closeStatToGap" signal → Pass 3.
- Grader tuning (humanness sensitivity / new construction axis) → separate pass.
- Chad bank pools (deterministic fallback surface) → not the LLM path, leave.
- post_hand endpoint/fixture/wiring → not this effort.
- miss `team_not_in_facts:WAS` validator bug → separate standalone code fix.

## Verification
- Smoke (regression-only): accuracy / clarity / culturalTruth hold for all four
  triggers; humanness/vibe are NOT the gate. Paste the four trigger lines.
- On-glass (the gate): fresh challenges per trigger in a real browser, judged
  against the gold set above. Robotic = fail; observation = pass.
- Confirm no YOU-prefix-as-default and no AT-scaffold survive in the gold set.
