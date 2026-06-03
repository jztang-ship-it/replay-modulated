# Challenge Landing V2 — Phase 2d Design Lock: Plain-Language Stakes + Anchor-Aware Takes + Tightening

> **The number means nothing to a newcomer. The stakes are in words, not FP.**
> "165.5 FP" tells a first-timer nothing. "Kobe and Kidd. Busted." tells them everything.
> 2d drops the raw FP from the landing, leads every outcome with plain-language stakes a
> stranger understands, and makes the take name the anchor when it's TRUE.

**Status:** LOCKED, pending implementation
**Workstream:** Accept / Challenge Landing V2 — polish (the 8.5→9.5 pass)
**Phase:** 2d (builds on 2c, which must merge first)
**Coupling:** MEDIUM. Generator-logic changes (anchor-aware takes + plain-language stakes,
both keyed off `actualFp` which Phase 0 already persists) + layout tightening. No
trigger/snapshot/stamp-logic changes.

**PREREQUISITE:** 2c must be committed + merged first (it was uncommitted in the worktree as
of last check). Do NOT start 2d until `feat/challenge-take-evidence-dare` is on `origin/main`
and live. 2d branches off the post-2c main.

---

## Context: what's already working (do NOT regress)

The live 2c page (per product, 8.5/10) nailed: headline-first argument, the "SAME STARTING
HAND. DIFFERENT DECISIONS." USP banner, card-first hierarchy, HOLD badges, in-flow stamp
(no clip), mode-coherent CTAs. 2d KEEPS all of that. The remaining gap product named: the
page tells you *what* happened but not *how bad*, and "165.5 FP" is meaningless to a
first-timer. 2d closes that.

---

## Change 1 — DROP the FP number; lead with plain-language stakes

The bare "165.5 FP on the board" line is the weakest element — a number with no scale is
noise to a newcomer. **Remove the raw FP from the landing entirely.** Replace `evidenceLine`
with a plain-language stakes line that needs ZERO game knowledge.

### Correction mode (choke / miss) — stakes vocabulary keyed to tier:
Choke fires only on BUST/ROOKIE; miss fires below the tier it missed. So correction needs
only these words (NOT the raw tier names — a newcomer doesn't know "ROOKIE" = half-back):
- **BUST** (< 190 FP) → **"BUSTED"**
- **ROOKIE** (190–204, half bet back — limbo) → **"BARELY SURVIVED"**
- **miss, small gap** (≤ 7 FP, from 2c) → **"ONE DECISION SHORT"**
- **miss, wide gap** (> 7 FP, from 2c) → **"CAME UP SHORT"** / **"MISSED THE CUT"**

The stakes word is the LEAD. The raw FP does not appear. (Tier name MAY appear as tiny
supporting detail if needed, but the plain word leads and carries alone.)

### Competition mode (big_score / rare_pull) — social-proof stakes, attempt-count-keyed:
These didn't lose — the stakes are "this is hard," shown via social proof, NOT a number.
**Pick per challenge based on `attemptCount` / `winnerCount`** (already generator inputs):
- **0 attempts** → **"UNBEATEN"** / **"NOBODY'S TRIED YET"** (be careful: 0 attempts isn't
  "unbeaten" in a proven sense — prefer "FRESH OFF THE PRESS" / "FIRST TO TRY IT" for 0, OR
  just "UNBEATEN" if simpler — DECISION: use "UNBEATEN" for 0–1 attempts, it reads fine).
- **2+ attempts, 0 winners** → **"{N} TRIED. {N} FAILED."** (the strongest — proven hard).
- **2+ attempts, ≥1 winner** → **"BEEN BEATEN ONCE. DO IT AGAIN."** or fall back to the
  attempt framing without the false "unbeaten" claim.

Raw FP does not appear in competition either — "232.5" means nothing; "3 TRIED. 3 FAILED."
means everything.

### Neutral (default):
Plain: **"A NUMBER ON THE BOARD. BEAT IT."** — no FP, no tier.

### Legacy degrade (holdsRecorded:false):
Tier-based stakes still work (the tier is on the challenge regardless of holds). "BUSTED" /
"BARELY SURVIVED" render fine with no hold data. The anchor-aware take (Change 2) falls back
to the generic take when no anchor.

---

## Change 2 — Anchor-aware takes (name the anchor, but ONLY when TRUE)

The strongest takes name the betrayed star ("KOBE AND KIDD. BUSTED."). The generator already
has the anchor (`selectChokeAnchor` → `anchor_base_player_id` → resolved name) AND per-card
`actualFp` (Phase 0). Use them — but the claim MUST be true to the data:

The choke fires because held cards underperformed. Compare the held cards' `actualFp` to
decide which framing is honest:
- **Anchor DELIVERED, other held card(s) tanked** → indict the others, vindicate the anchor:
  - take/outcome: **"{anchor} DID HIS PART."** + stakes, OR **"{anchor} WASN'T THE PROBLEM."**
  - The disagreement: the anchor was fine; the *other decision* sank it.
- **Anchor ITSELF tanked** (anchor is the disappointment) → indict the anchor:
  - **"EVEN {anchor} COULDN'T SAVE IT."** + stakes, OR **"{anchor} FORGOT TO SHOW UP."**
- **Both held cards tanked / can't single one out** → generic claim:
  - **"THESE CARDS SHOULD NOT HAVE LOST."** (the current 2c take — always true, safe default).

"Delivered" vs "tanked" needs a threshold: compare each held card's `actualFp` to its
`projectedFp` (both in the enriched snapshot). Anchor "delivered" if `actualFp >=
projectedFp * SOME_RATIO` (propose ~0.9 — within 10% of projection counts as showing up);
"tanked" if well below. Code-Claude proposes the exact ratio in recon; the PRINCIPLE is the
take must not claim "{anchor} wasn't the problem" when the anchor underperformed.

The outcome line (Change 1) fuses with this: **"{anchor} and {otherHeld}. {STAKES}."** is
the default fused form ("Kobe and Kidd. Busted."). When the anchor split applies, the take
itself carries the anchor ("KOBE WASN'T THE PROBLEM") and the outcome line can be just the
stakes.

This is a GENERATOR LOGIC change (comparing actualFp/projectedFp to branch the take), not a
copy swap. It's the 8.5→9.5 move product named.

### Competition anchor:
Same idea, positive: **"{anchor} WENT OFF. CAN YOU CATCH IT?"** when the anchor was the
heater. Optional for this phase — correction is the priority; competition anchor takes are a
nice-to-have if the bank's easy. Don't block on them.

---

## Change 3 — Layout tightening (from the live-page review)

1. **Move the CHOKE/MISS stamp inline at the END of the headline**, not stacked above it.
   It must flow AFTER the headline text regardless of where the headline wraps (the take
   varies in length and wraps differently) — inline-end-of-heading, NOT absolutely placed
   after a specific word. Tightens the top, consolidates two stacked elements into one.
2. **Color-fill ALL six cards with their tier color** (purple/blue/white/green), not just the
   held ones. Currently unheld cards are near-black and read as "disabled," not "cards you'll
   also get." Held cards stay distinct via **full saturation + HOLD badge**; unheld cards get
   the **same tier color but dimmer/desaturated**. The contrast becomes
   saturated-vs-muted, not colored-vs-black — so all six read as the real hand being dealt.
3. **Restructure the held line into a scannable evidence block** (replaces the prose
   "Denzel held: X, Y"):
   ```
   DENZEL'S LINE
   HOLD:  Kobe Bryant
          Jason Kidd
   ```
   Vertical, label-led, reads as an exhibit, not narration. KEEP both this block AND the
   on-card HOLD badges — restructured, they're complementary (badges = spatial/visual on the
   cards; block = the named claim), not duplicative.
4. **Remove the second sender attribution.** The sender name should appear ONCE. With the
   "DENZEL'S LINE" block now naming the sender, **cut the bottom "from {sender}"** line. (If
   the take is the no-name variant and "DENZEL'S LINE" is the only attribution, that's
   sufficient — one mention.)
5. **Add "DO IT BETTER" to the correction CTA bank** (alongside FIX THE HAND / PROVE YOUR
   LINE / PLAY YOUR LINE). Stays mode-coherent (correction family only).

---

## The target layout (correction, anchor delivered)

```
THESE CARDS SHOULD NOT HAVE LOST  [CHOKE]   ← take + inline stamp at end
─────────────────────────────────────────
SAME STARTING HAND. DIFFERENT DECISIONS.    ← USP (kept, working)
─────────────────────────────────────────
[ six cards — ALL tier-colored; Kobe+Kidd saturated + HOLD, rest muted ]
DENZEL'S LINE
HOLD:  Kobe Bryant
       Jason Kidd
KOBE AND KIDD. BUSTED.                       ← plain-language stakes, NO FP
Would you keep the same core?                ← dare (kept)
[ DO IT BETTER ]                             ← correction CTA
```

(No "165.5 FP", no second "from Denzel".)

---

## Out of scope (LOCKED)

NO new systems (feeds/boards/profiles/crowns/ownership — product reaffirmed). NO mechanic
tutorial line on the landing (the "what do I do" question — deferred to R2/the play screen
per product's funnel design; the landing provokes, the next screen teaches). NO OG share-card
wiring (separate follow-up). NO trigger/snapshot/stamp-logic changes.

---

## Gates

- `npm test`:
  - **No raw FP on the landing:** assert the rendered landing contains no "FP" number string
    in the outcome area (the spoiler/noise guard — the whole point of Change 1).
  - Plain-language stakes: BUST→"BUSTED", ROOKIE→"BARELY SURVIVED", miss small/wide → correct
    short/wide stakes word; competition 0–1 attempt → "UNBEATEN", 2+/0-winner → "{N} TRIED.
    {N} FAILED."
  - **Anchor-aware take truth guard:** construct a hand where the anchor DELIVERED
    (actualFp ≥ ~0.9×proj) and another held card tanked → take/outcome names the anchor
    positively ("wasn't the problem"/"did his part"); construct one where the anchor TANKED →
    the take does NOT claim the anchor was fine (no "wasn't the problem" when anchor
    underperformed). This is the core correctness guard — the claim must match the data.
  - Generic fallback when no clear anchor split / legacy holdsRecorded:false.
  - Determinism preserved (same challengeId → same card, through the new branching).
  - Layout: all six cards render a tier-color class (not black); held cards saturated + HOLD,
    unheld muted; DENZEL'S LINE block renders; only ONE sender attribution in the DOM; stamp
    inline-after-headline (no absolute positioning — the 2b/2c clip guard still holds at
    360/390/768/1024).
- `npx tsc --noEmit`; `bash scripts/build-vercel.sh`; function count 11/12.

## Assert-the-neighbors

The anchor-truth branching reads `actualFp`/`projectedFp` from the snapshot — the same fields
the choke trigger and Phase 0 enrichment use. Confirm the take-branching doesn't
accidentally fire on legacy (holdsRecorded:false, no per-card actualFp) — it MUST fall to the
generic take there, not emit a false anchor claim from zeroed actualFp. Ship a legacy test
proving the generic take fires when actualFp is absent/zero.

## Live-verification (REQUIRED — Code-Claude owns the localhost loop)

Build → screenshot at 360/390/768/1024 → confirm: stakes read in plain language with NO FP,
the anchor take reads TRUE against the fixture's actualFp, all six cards are tier-colored
(held saturated, rest muted), the DENZEL'S LINE block scans, stamp inline + uncut, one sender
mention. Then PROD: a real choke challenge reads as "{anchor} and {other}. Busted." with the
correct anchor framing, no FP number anywhere, the whole page legible to someone who's never
played. The first-timer test: would a stranger understand the stakes and want to tap?
