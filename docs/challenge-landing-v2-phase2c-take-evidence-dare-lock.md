# Challenge Landing V2 — Phase 2c Design Lock: TAKE → EVIDENCE → DARE

> **The challenge page is not a recap. It is an argument.**
> Sports fans don't engage with stories — they engage with claims. The page must
> publish a TAKE (a claim), back it with EVIDENCE (the cards), and issue a DARE
> (the challenge). First reaction target: **"Holy shit, I get THIS hand?"**
> The psychology is Curiosity + Ego: not "what happened to John" but "John thinks
> this hand is X — and I get the same hand to prove him wrong."

**Status:** LOCKED, pending implementation
**Workstream:** Accept / Challenge Landing V2 — redesign (supersedes the 2a/2b presentation)
**Phase:** 2c
**Depends on:** Phases 0/1/2a/2b merged + live (`cb13551` + stamp fix). The data plumbing
(snapshot holds, choke trigger, deterministic generator, legacy alias) is DONE and correct.
2c changes ONLY presentation: the generator's OUTPUT SHAPE + banks, and the landing layout.
**Coupling:** MEDIUM. Generator output reshape (4 fields → structured) + landing rebuild.
No trigger-logic, snapshot, or stamp changes.

---

## Why this supersedes 2a/2b's presentation

2a/2b faithfully built the V2 hierarchy (hook/outcome/disagreement/cta as prose slots) —
and the result was a **post-game recap**: three text blocks all re-stating "John held the
studs and choked," John named 3×, FP spoilers on the cards, competing messages. The
hierarchy was the problem: prose slots telling the same story three ways. 2c replaces it
with the argument formula. The ENGINE is untouched; we change what it emits and how the
landing arranges it.

---

## The formula (every challenge, every trigger)

```
TAKE      — a CLAIM, not an outcome. Why should I care?
  ↓
EVIDENCE  — the six cards + the minimal facts. Why should I believe it?
  ↓
DARE      — the challenge. Why should I act?
```

New Post headline, not a Times article. Short. Skimmable. An argument a sports fan
walks into voluntarily.

---

## Two modes (LOCKED — the claim flips on this)

The TAKE only works mode-aware. The correction claim ("somebody wasted this") is nonsense
for a hand that *won big*.

- **CORRECTION** (`choke`, `miss`) — emotion "I can do better."
  - choke TAKE family: "SOMEBODY WASTED THIS HAND" / "THESE CARDS SHOULD NOT HAVE LOST"
  - miss TAKE family: "THIS HAND WAS ONE DECISION AWAY" / "ONE DECISION FROM {nextTier}"
  - DARE: "Would you keep the same core?" / "Can you finish the job?"
- **COMPETITION** (`big_score`, `rare_pull`) — emotion "I can match that."
  - big_score TAKE family: "JOHN THINKS THIS HAND IS SAFE" / "THIS NUMBER IS A WALL"
    ({challengerName} substituted; "SOMEONE THINKS..." when name is null)
  - rare_pull TAKE family: "HISTORY IS ON THE BOARD" / "THE RECORD BOOK GOT A NEW PAGE"
  - DARE: "Same hand. Beat the receipt." / "Can you match it?"
- **NEUTRAL** (`default`) — no strong claim. TAKE: "SAME HAND. YOUR MOVE." DARE: "Beat the number."

`challengerName` null-guard: the choke/correction TAKEs are claims about the HAND
("these cards should not have lost"), so they read fine without a name. The competition
TAKEs naming the sender ("JOHN THINKS...") fall back to "SOMEONE THINKS..." / the claim form.

---

## Generator output reshape (this is a real 2a change, not just layout)

REPLACE the current `ChallengeTakeCard`:
```ts
// OLD (2a): hookHeadline, outcomeLine, disagreementLine, ctaText
```
WITH:
```ts
interface ChallengeTakeCard {
  mode: "correction" | "competition" | "neutral";
  take: string;        // the claim — the TAKE headline (largest type)
  subHeadline: string; // ALWAYS "Same starting hand. Different decisions." (the USP — see note)
  heldCards: string[]; // structured held player names (NOT prose) — [] when holdsRecorded:false
  evidenceLine: string;// the ONE minimal fact (see mode-specific facts below)
  dare: string;        // the DARE — mode-aware challenge line
  ctaText: string;     // "PLAY YOUR LINE" family
}
```

Notes on the new fields:
- `take` — pulled from the mode/trigger TAKE bank, deterministic seed (unchanged seeding).
- `subHeadline` — the "SAME STARTING HAND / Different decisions" USP line. It is effectively
  CONSTANT (the fairness hook), but keep it a generator field so copy can vary per mode later
  if wanted. Lives near the top, below the TAKE.
- `heldCards` — STRUCTURED array of names, rendered as a labeled list ("John held: Finley,
  Grant Hill"), NOT a prose sentence. `[]` on legacy (holdsRecorded:false) → the held block
  is omitted entirely (see degrade).
- `evidenceLine` — the single fact, MODE-SPECIFIC (see the FP-spoiler rule below).
- `dare` — mode-aware (replaces 2a `disagreementLine`).
- DROPPED: the old `outcomeLine` prose ("the studs delivered nothing") — its job is now
  split between `evidenceLine` (the fact) and the cards themselves.

The 2a TAKE/dare BANKS in `templates.ts` get rewritten to the claim/dare register above.
The hook/outcome/disagreement prose banks are replaced, not extended.

---

## The FP-spoiler rule (the one subtle, mode-dependent call — read carefully)

The held-card FP chips (the "41 / 20" on the cards) are **OUTCOME SPOILERS**. "What would
YOU do?" is undercut by "here's exactly what happened." But the resolution is NOT a blanket
hide — it is **mode-dependent**, because the two modes use the number oppositely:

- **CORRECTION (choke/miss):** HIDE the held-card FP chips. The landing teases the
  *decision*, not the result. The held cards show name + salary + rarity ONLY — the HOLD
  badge marks them, no resulting FP. The `evidenceLine` is the hand-level fact WITHOUT
  spoiling per-card outcomes:
    - choke: "John held the stars. The hand still cratered." (claim-consistent, no number
      that reveals each card's line) — OR the bare final "157.9 FP" as the *hand* total is
      acceptable (it's the wall, not a per-card spoiler). **DECISION: show the hand TOTAL
      (157.9 FP) as evidence, HIDE the per-card chips.** The total is the stakes; the
      per-card breakdown is the spoiler.
    - **The DARE goes PURE-HYPOTHETICAL** — "Would you keep the same core?" — and MUST NOT
      reference the outcome ("flinched," "delivered nothing"). Hiding the chip but keeping
      "the stack flinched" in words just moves the spoiler into prose. The savage
      outcome-sting MOVES to the post-play results screen (already exists). The landing is
      the invitation; the result is the reveal. **This is a deliberate de-escalation of the
      choke landing voice from where 2a aimed — confirmed by product.**
- **COMPETITION (big_score/rare_pull):** SHOW the target score prominently — it IS the
  wall you're daring them to clear ("238.7 FP / Still unbeaten"). Per-card held FP still
  hidden (no need to show which card carried it — that's post-play), but the hand total is
  the whole point and stays.

So: **per-card FP chips — HIDDEN in both modes.** Hand TOTAL — shown in both (stakes in
correction, wall in competition). This kills the spoiler while keeping the number that
makes the dare real.

KEEP on every card (per product): player name, salary ($61), rarity color. Salary
communicates value/risk/star-power instantly; a name alone doesn't. The HOLD badge marks
held cards; held cards keep their visual prominence (brighter) from 2b — just WITHOUT the
FP chip.

---

## The locked layout (correction example)

```
SOMEBODY WASTED THIS HAND              ← TAKE (largest, top)
Same starting hand. Different decisions.← subHeadline (the USP, directly under)
[ the six cards — held = bright + HOLD badge, NO fp chip; rest dim ]  ← EVIDENCE visual
John held: Finley, Grant Hill          ← heldCards (labeled list, structured)
157.9 FP                               ← evidenceLine (hand total — stakes, not per-card)
Would you keep the same core?          ← DARE (pure-hypothetical, no outcome ref)
[ PLAY YOUR LINE ]                     ← CTA
```

Competition example:
```
JOHN THINKS THIS HAND IS SAFE
Same starting hand. Different decisions.
[ six cards — held bright + HOLD, no chip ]
John held: Curry, Embiid
238.7 FP · Still unbeaten              ← the wall
Same hand. Beat the receipt.
[ PLAY YOUR LINE ]
```

### Stamp (the clipping saga — resolve it properly)
The CHOKE/MISS stamp has now clipped TWICE off the viewport edge — its positioning model
(absolute-anchored, built for the results panel) is fundamentally wrong for this surface.
**STOP reusing the results-screen TeamStamp positioning here.** Place the badge as a
normal IN-FLOW element (e.g. a small inline pill/tag adjacent to or above the TAKE), no
absolute positioning, no negative-translate, no anchor. It can keep the slanted-red
*aesthetic* via a simple rotate, but it must lay out in normal document flow so it cannot
bleed past the edge at ANY width. RECON the current positioning before re-touching, and
verify at 360 / 390 / 768 / 1024.

### Same starting hand — make the USP unmissable
`subHeadline` ("Same starting hand. Different decisions.") is the fairness mechanic and the
differentiator — a user must grasp in ~1 second that they get the EXACT cards shown. Give
it real visual weight (not buried prose): its own line directly under the TAKE, styled
distinctly. The cards below ARE those same cards — the layout should make that identity
obvious (these aren't John's cards, they're YOUR cards-to-be).

---

## Graceful degrade (legacy holdsRecorded:false)

- `heldCards: []` → OMIT the "John held: ..." list entirely (don't render "John held:" with
  nothing). The TAKE + cards + dare still work hold-agnostically (the generator already
  degrades the claim — e.g. choke TAKE "SOMEBODY WASTED THIS HAND" needs no hold data).
- All six cards render plain (no prominence, no badges) — unchanged from 2b.
- Hand total still shows (it's on the challenge regardless).

---

## Out of scope (LOCKED — do not build)

Per product's explicit "do not add more systems": NO feeds, boards, profiles, crowns,
ownership, rivalry, lifecycle. 2c is ONE page that manufactures "No way, give me those
cards." Also out: OG share-card wiring (the reshaped generator makes it cleaner — separate
follow-up), the in-app-webview OAuth nudge (separate parked item), discarded-card
would-have outcomes (unresolved data question).

---

## Gates

- `npm test`:
  - Generator emits the 6 new fields for all 5 triggers; `take`/`dare` are mode-correct
    (correction triggers produce a "wasted/one decision away" claim family; competition
    produce a "safe/wall/history" family) — assert by shape/keyword.
  - Determinism preserved: same `challengeId` → identical card (the 2a contract must survive
    the reshape).
  - `heldCards` is `[]` and the held list is omitted when `holdsRecorded:false`; populated
    when true.
  - **FP-spoiler guard: the landing renders NO per-card FP chip** (the regression guard for
    the spoiler decision) — held cards show name+salary+rarity+HOLD only.
  - Hand total renders in both modes; competition shows it as "the wall."
  - DARE never references the outcome in correction mode (no "flinched"/"delivered
    nothing"/"cratered" in the dare string) — the pure-hypothetical guard.
  - CTA never emits a banned phrase.
- `npx tsc --noEmit` — the output-type change is a tripwire; clean tsc proves every consumer
  migrated.
- `bash scripts/build-vercel.sh`; function count 11/12.

## Assert-the-neighbors

The generator output type change ripples to EVERY consumer of `ChallengeTakeCard` — the
2b landing is the main one, but grep for any other importer (the OG share path may
reference it). A clean tsc + a test that the landing renders all five triggers without a
missing-field crash is the guard. Also: the stamp is now in-flow — confirm the change
didn't break the results-screen TeamStamp (different surface, same component): the
results panel must keep its thud/absolute behavior (the `staticEntry`/in-flow path is
landing-only).

## Live-verification (REQUIRED — layout + feel)

Code-Claude OWNS the localhost visual loop (the #1 speed lever): build → screenshot at
360/390/768/1024 → iterate the TAKE prominence, the USP line weight, the in-flow stamp (no
clip at any width), the held-list legibility, the absence of FP spoilers → surface
SCREENSHOTS, not observations. Then PROD device check: a real choke challenge reads as a
TAKE→EVIDENCE→DARE argument ("Holy shit, I get THIS hand?"), stamp fully visible, no
per-card FP spoiler, hand total present, refresh-stable. A competition challenge shows the
score-as-wall. A legacy challenge degrades cleanly.
