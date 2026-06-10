# RD5.1 — Challenge landing headline + CTA system (v2 — decision-frame architecture)

Status: architecture LOCKED (founder call, decision-frame / "Mock B"). Copy candidates open by design.
Two CC verify-holds remain — now affecting stamp LABELS and cultural copy only, not headlines.
Becomes the RD5.1 CC directive on the branch when the build is greenlit.

## Governing principle (this is the whole system)
**The headline starts an argument. The stamp provides evidence. The CTA lets the recipient answer.**
- Headline = what John *did* — the decision and its consequence, in human language.
- Stamp = what *happened* — the outcome label.
- CTA = the recipient's answer — "would you have made a better call?"

Division of labor (the no-duplication guardrail): the headline and the stamp must say **different**
things. "THEY CHOKED" + CHOKE was the same information twice. "THE CALL COST HIM" + CHOKE is
decision + evidence. Never put the stamp's word in the headline.

## The Headline Test (apply to every headline)
After reading it, the reader should naturally ask **Why? / Really? / What happened?**
If the headline fully explains itself, it's too informational — rewrite it.
- ❌ JOHN SCORED 126.2 FP.  → no follow-up
- ❌ JOHN HIT A CAREER HIGH. → no follow-up (the stamp already said it)
- ✅ THE CALL COST HIM. → "what call?"
- ✅ JOHN FOUND SOMETHING NOBODY SAW COMING. → "why?"
- ✅ ONE SWAP STOOD BETWEEN JOHN AND GREATNESS. → "which swap?"

## Retired (do not reintroduce)
- The v1 hard rule "the stamp IS the outcome word in the sentence."
- The Class A / Class B two-class proposal.
Both are replaced by ONE rule for all triggers: decision-framing prose headline + evidence stamp set
apart. Because headlines are now tier-agnostic prose, all five headline shapes are authorable today;
only the stamp LABELS depend on the verify-holds.

## Canonical triggers (verified)
choke · miss · big_score · rare_pull · default. Legacy bad_beat → choke.

## Stamp = evidence
Set apart from the headline as a slanted seal — never a word in the sentence. Names the outcome; the
headline never repeats its word.
- choke → CHOKE
- miss → ALL STAR MISS / MVP MISS / LEGEND MISS (fires only for those win-tiers; bare MISS is a defensive fallback). "NEAR MISS" does NOT exist — earlier note was wrong. (hold #1 RESOLVED)
- big_score → BIG SCORE
- rare_pull → NEW RECORD / CAREER HIGH / SEASON HIGH; fallback RARE PULL (verified)
- default → no stamp (headline must start the argument unaided — the hardest case)

## Voice profiles  (headline = argument · stamp = evidence · CTA = answer)

### choke — the decision backfired (blame the call, not the players)
Worked example: JOHN TRUSTED HARDEN AND BEAL. THE CALL COST HIM.  · stamp [CHOKE] · CTA MAKE THE BETTER CALL
Approved choke candidates — leave ALL THREE in the spec (different theories of motivation, A/B later):
- IT COST HIM.        — outcome-focused
- THE CALL COST HIM.  — decision-focused (most on-thesis; build default)
- WRONG CALL.         — argument-focused (sharpest; the stamp carries the consequence)
Setup verbs to vary the decision clause: trusted · backed · rode with · bet on · stuck with · handed the keys to.

### rare_pull — the miracle (match or survive it). Stamp: tier (verified).
- JOHN FOUND SOMETHING NOBODY SAW COMING. · [CAREER HIGH] · CTA TAKE YOUR SHOT
Must pass the Why? test — "John hit a career high" fails (restates the stamp); this passes.

### big_score — the monster hand (top it). Stamp: BIG SCORE.
- JOHN PUT TOGETHER A MONSTER HAND. · [BIG SCORE] · CTA TRY TO TOP IT

### miss — so close (finish it). Stamp: ALL STAR MISS / MVP MISS / LEGEND MISS.
Headline is tier-agnostic; the stamp carries the specific tier.
- ONE SWAP STOOD BETWEEN JOHN AND GREATNESS. · [MVP MISS] · CTA FIND THE SWAP

### default — clean direct challenge, no stamp.
Hardest to make argumentative (no dramatic outcome). Keep it a direct dare that still invites "oh yeah?"
- JOHN SET THE BAR. · CTA CLEAR IT

## Name rules
- Lead with the decision/drama, not the sender — but the sender must resolve inside the headline
  block so the recipient knows whose challenge this is. ("HARDEN AND BEAL HAD JOHN BELIEVING…" resolves John in-line.)
- No fake relationship words ("buddy/friend/rival") unless the app has that data. Sender name is the fallback.
- Name-listing: 1 → HARDEN. · 2 → HARDEN AND BEAL. · 3+ → HIS STARS / THE BIG NAMES. Cards carry the full roster.

## Score rule
Never in the headline. One line above the CTA: `Target to beat: <targetScore> FP`. Choke mock locked
at 126.2 FP. Appears exactly once on the screen.

## CTA rule
Outcome-aware AND frame-aware — it answers the headline's argument, and must still imply play.
- Good: MAKE THE BETTER CALL · PLAY THE BETTER HAND · PROVE HIM WRONG · FIND THE SWAP · TRY TO TOP IT · TAKE YOUR SHOT
- Risky alone (abstract — only with a very clear headline): CHASE IT · SOLVE IT · PROVE IT
- Fallback only: ACCEPT CHALLENGE

## Cultural trash-talk banks — LOCKED OUT (hold #2 RESOLVED)
No player-specific cultural copy in RD5.1. `chadChallenge.ts` is generic name-substitution prose, not
a player-cultural bank; the real `playerCulture.ts` ships `controversySafe` EMPTY. Auto-generating
player-specific trash talk without a populated safety field is a reputational risk on a cold
recipient's first screen. Revisit only if `controversySafe` is later populated.

## Layout
Headline (decision-frame prose) · evidence stamp (seal, set apart) · cards (proof, yellow-H holds) ·
`Target to beat: X FP` · frame-aware CTA.
Remove: "HELD: …" line · "Can you beat him?" · footer "from … · FP · CHOKE" · any duplicate name/recap.

## CC verify-holds — BOTH RESOLVED (2026-06-10)
1. **Miss-tier enum** — RESOLVED. Real labels: ALL STAR MISS / MVP MISS / LEGEND MISS (win-tiers
   ALL_STAR/MVP/LEGEND; `payoutLogic.ts`/`triggerEvaluation.ts`). "NEAR MISS" does not exist. Bare
   MISS is a defensive fallback only.
2. **chadChallenge.ts** — RESOLVED. Generic name-substitution prose, not a player-cultural bank.
   `playerCulture.ts` has only `knownFor` populated, `controversySafe` empty → cultural copy LOCKED
   OUT of RD5.1 (see section above).
