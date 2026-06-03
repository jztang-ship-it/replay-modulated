# 4b — balanced_win curation + frame cleanup (votable)

**Status:** PROPOSED. Commit after vote. Closes out the challenge + normal frame-voice work.
**Context:** 4a (analogy-leak fix) already shipped — short hands now get a varied closer. This pass fixes the one thing 4a can't: identical *opening frames* in `balanced_win`. Deliberately small.

---

## 1. Disable 6 blatant-duplicate frames (`enabled: false`)

Removes copy-paste openers; keeps the best line of each duplicate set. Every tone stays ≥7 enabled.

| id | tone | line | why disable | Vote |
|---|---|---|---|---|
| bk_0098 | hype | "{nick} was quiet. The supporting cast wrote tonight's story; let them have it." | exact "{nick} was quiet." stem (keep 0097, 0110) | |
| bk_0103 | warm | "{nick} was quiet. The roster depth held; that's all you needed tonight." | exact stem dup, flattest warm quiet | |
| bk_0109 | culture_wry | "{nick} was quiet. The bench picked it up and didn't make a big deal about it." | exact stem dup of 0110 (0110 has the better take) | |
| bk_0125 | deadpan | "Quiet from {last}. Hand got there anyway." | near-identical to 0122 + 0126 | |
| bk_0118 | analytical | "Below-projection from {last}{opp}. Supporting cards covered the line; hand stayed green." | "below projection" dup (keep 0117, 0120) | |
| bk_0121 | analytical | "{last}'s output ran cold. Supporting cards covered the math; the win still cashed." | most generic "below projection" dup | |

---

## 2. Add 12 fresh `balanced_win` frames (q=8, register=win)

New angles on "star quiet / committee won" that break the "{nick} was quiet, depth covered" rut. All token-only (no authored player claims — guardrail-clean). Assign new sequential `bk_` ids; confirm no collision.

| tone | line | Vote |
|---|---|---|
| hype | "Six guys, one number, zero heroes — {last}'s roster won this like a relay, everybody ran their leg." | |
| hype | "No fireworks from {nick}, no problem. The whole rotation chipped in and the hand never broke a sweat." | |
| warm | "Some nights the star sits back and lets the room work. {nick} did exactly that, and it paid." | |
| warm | "{last} didn't need to be the guy tonight — the roster had five other answers and used all of them." | |
| culture_wry | "{nick} mailed it in and the postman still got paid. Depth is a beautiful thing." | |
| culture_wry | "No main character in this box score, and {last}'s hand cashed anyway. The committee says you're welcome." | |
| observational | "Nobody on {last}'s slate cleared twenty, and nobody had to. Even production, clean result." | |
| observational | "The stat sheet around {nick} reads like a group project where everyone actually did the work." | |
| analytical | "Variance hit the anchor and the roster ate it. {last}'s floor was high enough that the cold night never mattered." | |
| analytical | "Spread the production thin enough and no single cold card sinks you. That's the math {nick}'s hand just ran." | |
| deadpan | "Star sat out, statistically speaking. {last}'s roster didn't notice. Hand cashed." | |
| deadpan | "No hero around {nick} tonight. The total didn't ask for one." | |

---

## 3. Fix the one hyperbole line (`bk_0250`, badge_explosion)

Drops the unsupported league-ranking claim ("rest of the league should be taking notes" — implies a ranking the system can't support), keeps the punch.

| | line | Vote |
|---|---|---|
| Current | "{last} put up a {badge}{opp} and honestly the rest of the league should be taking notes right now." | |
| Proposed | "{last} put up a {badge}{opp}. The kind of line that makes the group chat go quiet." | |

(Alternative if you'd rather not reword: `enabled: false` it — badge_explosion has 46 templates, losing one is harmless. My pick is the rewrite.)

---

## 4. No action — `star_delivered` 11 disabled lines

Leave disabled. They're mis-archetyped ("nobody carried" lines sitting in `star_delivered`, where the star *did* deliver). Correctly disabled. Not restoring.

---

## 5. Parked riders (fold into this commit)

**chadTrashTalk loss-narrow — 2 limp CTAs:**
| id-ish | current | proposed | Vote |
|---|---|---|---|
| TRASH_LOSS_NARROW (both NAMED+UNNAMED) | "Right there. Try another hand." | "Right there and gone. Go get the next one." | |
| TRASH_LOSS_NARROW (both NAMED+UNNAMED) | "Brutal. Build a fresh hand." | "Brutal margin. Cook a cleaner one." | |

**F3 doc note (canonical voice spec, §4):** mark F3's banned-jargon list **surface-aware** — rematch CTAs ("run it back," "send it back," "run another") are idiomatic and fine; only UI-verb jargon ("lock in your reads," bare "Draw.") is banned. One-line clarification.

---

## 6. Implementation (after vote)

Single commit, all in `shared/commentary/`: 6 `enabled:false` edits + 12 new `balanced_win` entries (q=8, new ids) + 1 `bk_0250` rewrite + 2 `chadTrashTalk` line swaps + F3 doc edit. No selector/logic change → no new tests beyond confirming the JSON parses, tone filters still resolve, and the existing suite stays green. Gates: `npm test`, `tsc`, `build-vercel.sh`, function count 11. Pure content → merge on green, no live-verify gate.
