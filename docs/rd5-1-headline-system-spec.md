# RD5.1 — Challenge landing headline + CTA system (v3 — native vocabulary lock)

Status: architecture LOCKED (decision-frame). Copy + stamp vocabulary now ALSO locked to the
game's native language (HOLD/KEEP, TierGauge stamps). v3 supersedes v2 — v2's `TRUSTED … THE
CALL COST HIM` headline and its invented `BIG SCORE` / `NEW RECORD` stamps are retired.

## Governing principle (unchanged)
**The headline starts an argument. The stamp provides evidence. The CTA lets the recipient answer.**
- Headline = what the challenger DID, in the game's own verb (`HELD`).
- Stamp = what HAPPENED — the SAME label/colors the player saw at the end of the live game.
- CTA = the recipient's answer in the game's own verb (`KEEP`).

No-duplication guardrail (now dynamic): the headline must NOT contain the actual rendered stamp's
vocabulary. Computed per-trigger from the resolved stamp string, NOT a hardcoded word list.

## The Headline Test (unchanged)
After reading it, the reader should naturally ask **Why? / Really? / What happened?**

## Native vocabulary lock (v3 — the major change)

The landing is no longer allowed to invent stamp labels. It mirrors what `shared/components/
TierGauge.tsx` renders at the end of a live game. The InFlowBadge component on the landing
re-renders the same vocabulary + the same colors. The grep that locked this:

- `chadChallenge.ts:43-46` — the in-game stamp variants are `choke | miss | win_tier | rare_pull`.
  The `big_score` *trigger* fires but renders a `win_tier` stamp whose label IS the tier —
  no "BIG SCORE" suffix.
- `TierGauge.tsx:451-455, 472-480` — rare_pull renders `RECORD / CAREER HIGH / SEASON HIGH`,
  no "NEW" prefix.

## Canonical triggers (verified)
choke · miss · big_score · rare_pull · default. Legacy bad_beat → choke.

## Stamp = evidence (v3 — mirror TierGauge)

Set apart from the headline as a slanted seal. Labels + colors come from `TierGauge.tsx`.

- **choke** → `CHOKE` · red gradient `#ef4444 → #b91c1c → #7f1d1d` (TierGauge.tsx:386-393).
- **miss** → `{TIER} MISS` — only `ALL STAR MISS / MVP MISS / LEGEND MISS`; bare `MISS` is a
  defensive fallback. Amber gradient `#fde68a → #f59e0b → #b45309`. "NEAR MISS" does NOT exist.
- **big_score** → **tier label ONLY**: `LEGEND` / `MVP` / `ALL-STAR`. Color from `TIER_CFG`:
  LEGEND `#EF4444` · MVP `#FB923C` · ALL_STAR `#C084FC`. **The string `BIG SCORE` is RETIRED
  from the landing** — it was the only occurrence in the codebase. Resolution: the win tier is
  computed from the challenge's `target_score` via the sport adapter's `calculateWinTier`,
  threaded through the landing shell as a prop (mirrors how `H2HRecipientPlay` already gets it).
- **rare_pull** → bare `RECORD` / `CAREER HIGH` / `SEASON HIGH` (drop "NEW"). Lime gradient
  `#7FFF00 → #5BBE00`. Match TierGauge, NOT TopGameOverlay (the player-card surface uses
  `NEW RECORD`; the in-commentary chip — which is what fires next to a win/loss — does not).
- **default** → no stamp.

## Voice profiles (v3 — HELD verb throughout)

Decision clause uses the game's actual mechanic. The verb the recipient will repeat back on the
next screen is `KEEP` ("Tap the players you'd keep. Draw the rest." — H2HRecipientPlay.tsx:406).
The headline gives that decision its sender-side name: `HELD`.

### choke — the held lineup didn't deliver
- Headline: `{NAME} HELD {PLAYERS}. IT COST HIM.`
- Worked: `JOHN HELD HARDEN AND BEAL. IT COST HIM.`
- Default consequence: `IT COST HIM.` Alternates documented for later A/B (NOT wired):
  `WRONG HOLD.` · `IT BACKFIRED.`
- Stamp: `CHOKE` · CTA: `KEEP THE RIGHT ONES`.

### big_score — the held lineup delivered
- Headline: `{NAME} HELD HIS STARS AND THEY DELIVERED.`
- Stamp: `LEGEND` / `MVP` / `ALL-STAR` (resolved from target_score) · CTA: `TRY TO TOP IT`.

### rare_pull — found something nobody saw coming
- Headline (unchanged from v2): `{NAME} FOUND SOMETHING NOBODY SAW COMING.`
- Stamp: `RECORD` / `CAREER HIGH` / `SEASON HIGH` · CTA: `TAKE YOUR SHOT`.

### miss — de-swapped to KEEP
- Headline (v3): `{NAME} WAS ONE KEEP AWAY FROM GREATNESS.`
- v2's `ONE SWAP STOOD BETWEEN…` is RETIRED — the mechanic is keep/draw, not swap.
- Stamp: `{TIER} MISS` (tier-agnostic headline; stamp carries the tier) · CTA: `KEEP WHO YOU'D KEEP`.

### default — clean direct dare (unchanged)
- Headline: `{NAME} SET THE BAR.`
- No stamp · CTA: `KEEP THE RIGHT ONES`.

## Name rules (mostly unchanged, HELD prefix universal on held-derived clauses)
- Lead with the decision, name the sender inside the headline.
- Name-listing for held cards: 1 → `HELD {LAST}` · 2 → `HELD {LAST} AND {LAST}` · 3+ →
  `HELD HIS STARS`. Cards carry the full roster as proof.
- Hold-verb pool for future variation (NOT wired as A/B): `held · kept · stuck with · rode with`.
  Build default is `held`.

## Score rule (unchanged)
Never in the headline. Sole numeric is `Target to beat: <targetScore> FP` above the CTA.

## CTA rule (v3 — frame-aware, keep-action where appropriate)
- choke / default → `KEEP THE RIGHT ONES`
- miss → `KEEP WHO YOU'D KEEP`
- big_score → `TRY TO TOP IT`
- rare_pull → `TAKE YOUR SHOT`
- Fallback only: `ACCEPT CHALLENGE`
- v2's `MAKE THE BETTER CALL` and `FIND THE SWAP` are RETIRED.

Recipient-path only. Owner / `alreadyAttempted` keeps `Play Again` verbatim — untouched.

## No-duplication guardrail (v3 — dynamic per rendered stamp)

For each trigger, derive the forbidden vocabulary from the **resolved stamp string** the trigger
will render, NOT a hardcoded list. Whole-word, case-insensitive.

- Example: `miss` with `missTier="MVP"` renders seal `MVP MISS` → headline must not contain
  `\b(MVP|MISS)\b` (whole words). `miss` with `missTier="ALL_STAR"` renders `ALL STAR MISS` →
  forbids `ALL`, `STAR`, `MISS` (each as a whole word).
- Example: `big_score` with winTier=MVP renders bare `MVP` → forbids `\b(MVP)\b`.
- Tier-word collision is handled: if a future miss headline contains "MVP" *and* the miss
  fires at MVP tier, the dynamic check catches it; a static list would either over-block (ban
  MVP from all miss headlines) or under-block (let it through). Dynamic mirrors the actual
  contradiction risk.
- `default` has no stamp → guardrail N/A.

The guard function lives in `landingHeadlines.ts` next to the headline templates so the two
evolve together.

## Cultural trash-talk banks — STAYS LOCKED OUT (from v2, hold #2 RESOLVED)
No player-specific cultural copy until `playerCulture.controversySafe` is populated. v3 does not
change this.

## Layout (unchanged)
Headline (decision-frame prose) · evidence stamp (slanted seal) · cards (proof, yellow-H holds) ·
`Target to beat: X FP` · frame-aware CTA. Removed: HELD list · dare · attribution footer.

## v3 verify-checklist (must all hold before push)
1. `ChallengeTakeCardLanding.tsx` no longer contains the strings `BIG SCORE`, `NEW RECORD`,
   `MAKE THE BETTER CALL`, `FIND THE SWAP`, `TRUSTED`, `ONE SWAP STOOD BETWEEN`.
2. InFlowBadge resolves big_score's color + label from sport adapter's `calculateWinTier`.
3. Headline guardrail computed from the rendered stamp string, not a const array.
4. Score still renders exactly once (target line).
5. Owner / Play Again path verified visually unchanged.
