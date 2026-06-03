# Phase 3.3 Design Lock: The Subject Is the Hand, Not the Game

> **Challenge headlines are not sports journalism. Challenge headlines are sports
> arguments. The subject is always the fantasy hand. Never the historical NBA game that
> supplied the stats.**

ReplayMod's story is not "Lakers lose to Milwaukee." That is a real NBA game and the wrong
story. ReplayMod's story is: *You held Kobe and CP3. You busted. Think you can do better?*
3.3 re-aims the authored headline at that story.

**Status:** LOCKED, pending implementation
**Builds on:** Phase 3 (engine) + 3.2 (authored line wired into the on-page TAKE — both
merged, live, working). 3.3 is a PROMPT + INPUT-SCOPING fix. No engine change, no wiring
change, no new endpoint, no threshold change.
**Coupling:** LOW. `VOICE_CONTRACT` rewrite + a headline-scoped `CommentaryFacts` input
policy + harness re-tune.

---

## The diagnosis (what 3.2 shipped, and why it read wrong)

3.2 correctly put the authored line on the page — but the line read
"LAKERS STUMBLE AT HOME AGAINST MILWAUKEE, CAN'T FIND THEIR RHYTHM." That is an NBA game
recap. Root cause: the headline prompt was fed the anchor's real-game context (opponent,
venue, homeAway, date) as prime material, and the model reaches for the most concrete nouns
it is given. **The fix is not a better instruction — it is removing the recap inputs and
re-pointing the subject.** A model that cannot see "Milwaukee" cannot write a Milwaukee
recap.

---

## Rule 1 — The subject is the hand (universal, all surfaces)

The headline is an ARGUMENT about the fantasy hand, in this priority of subject:
held players → the decision → the outcome → the claim. Game context (opponent, venue,
home/away, date) is **color, never subject.** It may garnish a line ("a career high against
the Knicks") but must never BE the line.

**Surface-specific input policy (the operative part):**
- **Challenge headline (this build):** WITHHOLD opponent / venue / homeAway / date from the
  headline's `CommentaryFacts` entirely. The model has not earned them on a short format that
  drifts to recap, and a punchy headline rarely has room for the color anyway. Lock the
  subject first. Reintroducing opponent-as-color is a deliberate, tested LATER step — NOT in
  3.3.
- **Normal commentary (future phase):** game context stays AVAILABLE as permitted color —
  "Wade's career high against the Knicks" is exactly the texture wanted there, and commentary
  has room for it. Same universal rule (color, not subject); different input exposure.

**Headline `CommentaryFacts` — KEEP vs CUT:**

| KEEP (hand facts) | CUT (real-game-identity → recap bait) |
|---|---|
| held player names | opponent |
| nicknames / culture | venue |
| tier | homeAway |
| trigger | date |
| outcome / stakes word | |
| target FP / stat line | |

The stat *line* stays (it's a hand fact — "238.7 FP. GOOD LUCK." needs the number). Only the
real-NBA-game IDENTITY is cut. Implement as a headline-scoped builder that omits the
game-context fields; the full `CommentaryFacts` (with game context) remains for the
commentary surface later.

---

## Rule 2 — Name players. Never blame them. (replaces the 2.1 "don't name the anchor" rule)

Step 2.1 over-corrected: to stop false blame on mid-zone chokes it forbade naming the anchor
at all, which produced bland no-name lines. **Naming is not blaming.** The stars are the
attraction — KOBE, JORDAN, SHAQ, LEBRON, CURRY carry emotional weight; users WANT to see
them. The real constraint:

> Name the held players as the STARS you held. NEVER frame any player as the CAUSE of the loss.

This rule supersedes 2.1's blanket suppression on all triggers.

**GOOD (named as talent; failure pinned on the hand/outcome):**
- `KOBE AND CP3. STILL BUSTED.`
- `THE MAMBA COULDN'T SAVE THIS.`   ← edge case, allowed: "even greatness wasn't enough" = about the hand's difficulty, NOT Kobe failing
- `YOU HELD KOBE. WHAT HAPPENED?`
- `TWO STARS. ZERO EXCUSES.`

**BANNED (player as cause-of-loss):**
- `KOBE CHOKED.`
- `CP3 FAILED.`
- `KOBE SOLD THE HAND.`

The boundary the contract must thread: `EVEN {star} COULDN'T SAVE IT` (hand was brutal) =
allowed. `{star} CHOKED / FAILED / SOLD IT / WENT QUIET / COULDN'T DELIVER` (player as cause)
= banned. Put BOTH lists in the prompt verbatim — the contrast is what teaches the line.

---

## Rule 3 — Universal philosophy, per-trigger flavor

The subject-is-the-hand rule is authored ONCE, universally. Each trigger gets an emotional
register, not its own philosophy:

| trigger | flavor | example claim |
|---|---|---|
| choke | accusation | `KOBE AND CP3. STILL BUSTED.` / `THE STARS WERE THERE. THE SCORE WASN'T.` |
| miss | regret | `THIS HAND WAS ONE DECISION AWAY.` / `YOU LEFT MVP ON THE TABLE.` |
| big_score | challenge | `JOHN THINKS THIS HAND IS SAFE.` / `238.7 FP. GOOD LUCK.` |
| rare_pull | nostalgia | `JORDAN WALKED BACK INTO THE BUILDING.` / `YOU GOT THE JORDAN GAME. NOW WHAT?` |

Every one is an ARGUMENT, not a recap. All four talk about the hand / players / decision /
outcome — never the box score.

---

## Build

1. **`VOICE_CONTRACT` rewrite.** Open with the lock's banner sentence. Encode Rule 1
   (subject = hand; game context is color-not-subject), Rule 2 (name-don't-blame, with the
   good/bad lists verbatim as gold-standard + anti-examples), Rule 3 (per-trigger flavor).
   Keep the inherited Chad register / §3 / trademark / accuracy / anti-anachronism segments
   from the Option-A refactor unchanged.
2. **Headline-scoped `CommentaryFacts`.** Omit opponent / venue / homeAway / date from the
   fact set the CHALLENGE-HEADLINE path sends. Keep players, nicknames, tier, trigger,
   outcome, stat line. Do NOT alter the full `CommentaryFacts` shape (commentary surface
   needs game context later) — scope the omission to the headline builder.
3. **Re-tune on the harness, CHOKE FIRST.** Use the user's GOOD example sets as the literal
   gold standard. Re-run `npm run smoke:headline`; the choke fixtures must produce
   hand-subject, player-named, never-blamed lines with zero opponent/venue mentions.
4. **Then tune the other three triggers** (miss / big_score / rare_pull), each its own
   harness pass against the Rule-3 flavor + example claims. **None left out** — 3.3 is not
   done until all four read as arguments. Choke SHIPS first; the rest follow in order.

## Acceptance
- No challenge headline names an opponent, venue, or frames the line as an NBA-game recap.
- Choke headlines name the held stars without blaming them (Rule 2 good/bad enforced).
- Mid-zone choke: still no player-as-cause-of-loss (the honesty gate holds, now via "don't
  blame," not "don't name").
- Each trigger reads in its flavor (accusation / regret / challenge / nostalgia).
- Anti-anachronism + §3 still clean (inherited segments unchanged).
- Voice judged on the harness + on-glass by the user against the GOOD examples; not unit-asserted.

## Roadmap notes (NOT in 3.3)
- Reintroduce opponent-as-COLOR to the challenge headline as a deliberate, tested step once
  the subject-is-the-hand instinct is solid on all four triggers.
- Normal-commentary phase exposes game context as permitted color (Wade-vs-Knicks texture),
  reusing this same `VOICE_CONTRACT` with a commentary-scoped fact set.

## Non-negotiables
- Subject is the hand. Game identity is withheld from the headline path this build.
- Name players; never blame them. Replaces 2.1's blanket suppression.
- Universal philosophy, per-trigger flavor. All four triggers tuned; choke first; none left out.
- No engine / wiring / threshold change. Prompt + input-scoping + re-tune only.
- Committed lock is NOT a build signal. Build on explicit go-ahead; report green + HOLD per trigger.
