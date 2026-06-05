# Phase 4 · Pass 2 Pre-Merge Patch — Numeric Grounding + Fixture Collision

**Branch:** `feat/phase4-pass2-voice-foundation`
**Status:** DRAFT — awaiting commit. Build prompt follows AFTER this lock is committed.
**Scope:** Two small, mechanical guardrail fixes that must land before Pass 2 merges. Neither
touches the voice contract's substance — they are enforcement and test hygiene, not a rewrite.

---

## Why this patch exists

The `smoke:headline` run on this branch showed the voice foundation is sound: fact-first
is working, the AT-scaffold is dead, verdict-discipline and anti-anachronism hold across all
nine fixtures, and `choke_credited` ("Thirty-eight points and nothing else showed up.") proves
the voice can be genuinely good. The two lines I initially flagged as fabricated numbers were
**not** fabrications — both 245.8 (big_score) and 30 (miss) are real fields in their fixtures.

But the recon that cleared those two lines surfaced two real, structural holes:

1. **There is no numeric stat-grounding validator.** `validateHeadline()` checks length,
   template tokens, the apology sentinel, the phrase denylist, and NBA team codes — but
   **nothing checks that numbers in the output exist in the facts.** Per recon: `"312.4 FP.
   Good luck."` against facts carrying `TOTAL_FP: 245.8` would pass today. Axis (b) of our
   review — "every cited stat exists in this hand" — is unenforced for numbers. It held in
   smoke only because the model behaved.

2. **The big_score fixture collision masks example leakage.** The fixture's `totalFp` is set
   to exactly `245.8`, byte-identical to the gold example `"245.8 FP. Good luck."`. So the
   smoke output `"245.8 FP. Good luck."` is indistinguishable between "model used the
   TOTAL_FP fact (legitimate)" and "model copied the example verbatim (a guard leak)." The
   test can't tell, by construction.

**Out of scope for this patch** (parked, see §4): the `miss` grammar break (Pass 3 / miss
voice), templating the contract's hardcoded example numbers (contract-hygiene), and
retry-on-numeric-fail before fallback (router enhancement).

---

## §1 — Numeric stat-grounding validator

### Goal and governing principle

Reject any headline that cites a number not grounded in the hand's facts. **Governing
principle: bias toward permissiveness.** A validator rejection returns `headline: null`, which
makes the client fall back to the take-card bank pick — the robotic, stat-free voice this
whole project exists to kill. So a false positive is *worse* than a missed catch: it
resurrects the failure mode. When a number's grounding is ambiguous, ALLOW it.

### Where it slots

Add as the final check in `validateHeadline()` (`api/headline.ts`, currently checks 1–6
ending at the `team_not_in_facts` check ~line 177–187). Same mechanism as the existing
checks: on failure return the validator's null+reason path; on pass, fall through. New check
is #7.

### The allowed-number set

**Definition: the allowed set is every numeric literal that appears in the rendered
user-prompt fact block that was sent to the model for this hand.** Parse the numbers out of
the same rendered fact string the model received — not out of the raw `CommentaryFacts`
object.

This definition is deliberate and has a valuable property: because the rendered fact block is
already stat-trimmed (Pass 1 strips minutes / threes / fg% before rendering), **the validator
automatically inherits the stat-hygiene invariant.** A trimmed stat (e.g. a `threes` value
present in the raw fixture but stripped from the prompt) is not in the allowed set, so a line
citing it gets rejected. This is the first mechanical enforcement of the architecture's
"every cited salience fact references a stat that survived the trim" invariant — it has only
ever been a prose rule until now.

Source fields that contribute numbers to the rendered block (for reference — the
implementation parses the rendered string, not this list): `TOTAL_FP`, `NEAR_MISS_GAP_FP`,
the surviving `statLine` values (pts / reb / ast / stl / blk / turnovers), `topReason.value`,
and the SALIENCE values (`MOST IMPORTANT POSITIVE`, `BIGGEST DRAG` magnitude if numeric).
`SEASON` and any date digits, if rendered, are included in the allowed set (they are present
in the block); citation-appropriateness of dates/seasons remains governed by the
anti-anachronism prose rule, not by this validator.

### Extracting numbers from the headline

- **(A) Digit numbers — always checked.** Integers and decimals (`245.8`, `65`, `38`, `7`).
  This is the must-have: it catches all FP totals and decimals, which is where essentially
  all real fabrication risk lives.
- **(B) Spelled-out cardinals — checked, with conversion.** Convert hyphenated/compound
  cardinals ("thirty-eight" → 38, "two hundred forty-five" → 245) and standalone cardinals
  **≥ 13** ("thirteen".."ninety-nine"+) to digits, then check them. This covers the
  `choke_credited` canary ("Thirty-eight points…").
- **(C) Excluded from extraction — never checked** (to prevent false rejects):
  - Standalone spelled cardinals **≤ 12** ("one".."twelve") — these appear idiomatically
    ("one decision short", "give it a second"). Cost of excluding: small spelled-out
    fabrications escape — an accepted residual hole, far cheaper than false-rejecting idioms.
  - All ordinals — "first/second/third/…", "1st".."99th".
  - A small idiom skiplist (start empty; add terms only when a real false-reject is observed).
  - **Known edge — franchise-embedded numbers** ("76ers" → 76, "3-and-D"). Skiplist these as
    encountered; flagged here so CC doesn't treat a future "76ers" reject as a real bug.

### Matching / tolerance

An extracted output number **N** matches an allowed fact number **F** when **F is within one unit of N at N's displayed precision** — formally `|N − F| < 10^(−dp(N))`, where `dp(N)` is the number of decimal places N is written with. This is the permissive reading of "rounded or truncated to N's precision" and is what shipped; the strict "rounded OR truncated" phrasing was narrower than the worked examples below and is superseded. (Band is unit-absolute: tight on small stats — "8" vs a fact of 7 is |1| ≮ 1, correctly rejected — and appropriately loose on large totals — "238" vs 238.6 accepted as truncation.)

Worked examples (all should MATCH):

| Output cites | Fact is | Match? | Why |
|---|---|---|---|
| `65.3` | 65.3 | yes | exact |
| `65` | 65.3 | yes | truncate to 0 dp |
| `66` | 65.3 | yes | round to 0 dp |
| `245` | 245.8 | yes | truncate |
| `246` | 245.8 | yes | round |
| `38` | 38 | yes | exact |
| `thirty-eight` → 38 | 38 | yes | spelled, converted |

A headline number that matches NO allowed number → fail.

### Failure behavior

On the first unmatched checked number: return the null path with
`reason = "number_not_in_facts:<N>"` (where `<N>` is the offending number as written). Client
falls back to the bank pick via the existing short-circuit. Log at `warn` with both the
offending number and the full allowed set, mirroring the existing `team_not_in_facts` logging,
so a borderline reject is debuggable.

### Explicit scope boundaries (do NOT build these here)

- **Unit correctness (FP vs points)** stays a prose contract rule. This validator checks the
  *number*, not whether "FP" vs "points" was used. `"65 FP"` and `"65 points"` both extract 65.
- **Retry-on-numeric-fail before fallback** is deferred (§4). This patch's failure path is
  the existing null→bank fallback, unchanged.
- **Grammar / fluency** is orthogonal. The `miss` line "30 points left this seven short…" is
  numerically grounded (30 is in facts, seven is excluded) and would PASS this validator —
  its brokenness is a Pass 3 voice issue, not a numeric one. Do not try to catch grammar here.

---

## §2 — big_score fixture collision fix

### The change

In `basketball/src/dev/headlineMockFixture.ts`, change the `big_score` fixture's
`totalFp: 245.8` → **`totalFp: 238.6`**.

Verify before committing: 238.6 must not equal any number in the gold-standard examples
(current example numbers include 62.1 and 245.8 — 238.6 is clean) and must not collide with
other numbers in this fixture (`topReason` 65.3, `statLine` 42/5/7, salience `42`). If 238.6
collides with anything after a future fixture edit, pick another distinct non-example value.

`bankPick` for this fixture ("You hit ALL-STAR. Same slate. Beat them.") carries no number —
no change needed. Check the `evalHint` for any literal `245.8` reference and update if present.

### Why

Breaking the byte-identical collision makes the smoke output *diagnostic*: it can finally
distinguish "model used the TOTAL_FP fact" from "model copied the gold example."

### Test and expected outcomes

Re-run `npm run smoke:headline` for the big_score case (mind the Groq daily token cap — see
note below; eyeball just this one case rather than the full nine if near the cap):

- **Output cites 238.6 / 238 / 239** → model used the fact correctly. Example-leakage is NOT
  occurring for big_score; the guard concern is resolved.
- **Output still cites 245.8** → model copied the gold example verbatim. This is a real
  EXAMPLES-ARE-SHAPES leak. Escalate: the deferred example-number-templating fix (§4) becomes
  load-bearing and should be pulled forward.

### Interaction with §1 (a nice property)

Once the §1 validator exists, a copied `"245.8"` against a fixture that now says 238.6 would
be **caught** (245.8 ∉ allowed set) → reject → fallback. So the validator converts this latent
voice bug into a *safe* failure even if the model does leak the example. The fixture change
lets us *detect* the leak; the validator makes the leak *non-shipping* regardless.

---

## §3 — Acceptance criteria (to merge Pass 2)

1. §1 validator added as check #7 in `validateHeadline()`, reason string
   `number_not_in_facts:<N>`, allowed set = numbers in the rendered fact block.
2. **No false-positive regression — the critical check.** Re-run smoke (token budget
   permitting): the four primary lines that were clean must still VALIDATE, not get
   false-rejected by the new guard:
   - `rare_pull`: "A Wade career night just got pulled. Match it." (no numbers — trivially passes)
   - `choke_credited`: "Thirty-eight points and nothing else showed up." — **MUST pass**
     (canary for spelled-out conversion + permissiveness; if this rejects, the spelled-out
     handling or allowed-set parse is wrong)
   - `choke_neutral`: "Lamar Odom couldn't carry the weight. Kobe's 24 wasn't enough." (24 grounded)
   - `big_score`: post-fixture-change line citing 238.6/238/239 (grounded)
3. §2 fixture changed; smoke distinguishes fact-use vs copy per the expected outcomes above.
4. Unit / build tests green (necessary, not sufficient — green tests ≠ done).

Note: §3.2 and §3.3 may be limited by the Groq daily token cap hit during the last run
(`TPD: Limit 100000, Used ~99912`). If the cap blocks a full re-run, the minimum viable
verification is the `choke_credited` canary (false-positive guard) + the single `big_score`
case (collision test). The remaining cases can wait for the daily reset.

---

## §4 — Parked / deferred (do not lose)

- **`miss` grammar break** ("30 points left this seven short…") → Pass 3, miss voice. Cause is
  located: model fusing Rule 3's "what was left on the table" with training-set fluency; both
  numbers are grounded, the connective phrasing is garbled. Not a data or leakage bug.
- **Example-number templating** → contract-hygiene. Example numbers in the contract are
  hardcoded literals with zero templating; the EXAMPLES-ARE-SHAPES guard is prose-only and
  cannot prevent verbatim leakage when an example number coincides with a fact number. Pull
  forward if §2's test shows copying; otherwise defer.
- **Retry-on-numeric-fail before fallback** → router enhancement. Generate once more on a
  `number_not_in_facts` reject before falling back to the bank, to reduce the cost of a
  borderline reject. Out of scope here.
- **`team_not_in_facts:WAS` one-liner** → still parked (standalone code fix, anytime).
- **Glass-on-real-data still required for the final pre-merge gate.** This patch + smoke do
  NOT substitute for a browser review of a real *played* hand. `/api/headline` does not run in
  local dev on this repo (no dev script serves `/api/*`); the real endpoint runs only on a
  deploy. So the final pre-merge glass pass remains gated on a **preview deploy of this branch
  with KV + `GROQ_API_KEY` scoped to Preview** — the deferred preview-env fix, which is now
  confirmed as the true prerequisite, not optional. Build thread.

---

## §5 — Workflow

This is the lock. Per cadence: commit this lock, then the build prompt follows. Smoke remains
**regression-only** for voice judgment (the Groq grader is blind to construction-vs-observation
— `"245.8 FP. Good luck."` scored humanness=2). The §1 validator is **enforcement**, not a
voice judge: it guarantees grounding, it does not assess whether a grounded line reads like a
human. On-glass remains the voice gate.
