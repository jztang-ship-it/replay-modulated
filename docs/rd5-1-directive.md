# CC directive — RD5.1: decision-frame challenge landing

**Build now. Landing surface only — contained blast radius, no reveal/results/play changes.**
Spec of record: `docs/replaymod-design-decisions.md` § RD5.1 + the committed
`rd5-1-headline-system-spec.md`. Rules: `CLAUDE.md`. Branch: `feat/rd5-1-decision-landing`.
Commit this directive + the headline-system spec on the branch as step 1 (spec on the tree).

## Governing principle (do not violate)
The headline starts an argument. The stamp provides evidence. The CTA lets the recipient answer.
- Headline = what the challenger DID (decision + consequence), in human language.
- Stamp = what HAPPENED (outcome label), set apart as evidence — NOT a word in the headline.
- CTA = the recipient's answer ("would you have made a better call?").
No-duplication guardrail: the headline must NOT contain the stamp's label word.

## Investigate → confirm → report → then build
1. Confirm the **miss-tier enum** — the actual tier labels the code produces (grep showed
   `{TIER} MISS` / `NEAR MISS` / bare `MISS`; the ALL-STAR/MVP/LEGEND set is UNVERIFIED). Headlines
   are tier-agnostic and don't depend on this; the miss STAMP label does.
2. Confirm **`chadChallenge.ts`** — does it hold usable player-cultural banks for RED/ORANGE stars,
   or only general commentary? No cultural copy authored until this is known.
3. Confirm current composition of `ChallengeTakeCardLanding.tsx`: `heroLine` template (≈388-390),
   the h1 (`take-headline`, ≈412-450), inline `InFlowBadge` (≈144-202), CTA (≈565), the HELD line,
   the dare, the attribution footer, and the held-card "HOLD" pill.
4. Locate the **yellow-H hold glyph** used in the normal game / H2H card layout (the standard hold
   indicator), so the landing reuses the real glyph rather than the red "HOLD" pill.
Report findings + proposed approach before editing.

## Build (after sign-off)

### Headline — per-trigger decision-frame prose (templated by trigger + name-listing)
Replace the current `heroLine` with a trigger-keyed template. The headline NEVER contains the score
and NEVER contains the stamp's word. Name-listing for held players: 1 → `HARDEN`; 2 →
`HARDEN AND BEAL`; 3+ → `HIS STARS` / `THE BIG NAMES`.

| trigger    | headline (worked example)                              | stamp seal        | CTA                  |
|------------|--------------------------------------------------------|-------------------|----------------------|
| choke      | JOHN TRUSTED HARDEN AND BEAL. THE CALL COST HIM.       | CHOKE             | MAKE THE BETTER CALL |
| big_score  | JOHN PUT TOGETHER A MONSTER HAND.                      | BIG SCORE         | TRY TO TOP IT        |
| rare_pull  | JOHN FOUND SOMETHING NOBODY SAW COMING.                | {tier} (verified) | TAKE YOUR SHOT       |
| miss       | ONE SWAP STOOD BETWEEN JOHN AND GREATNESS.             | {TIER} MISS (#1)  | FIND THE SWAP        |
| default    | JOHN SET THE BAR.                                      | — none —          | CLEAR IT             |

Choke headline ships **THE CALL COST HIM** as default. Leave `IT COST HIM.` and `WRONG CALL.` as
documented alternates (comment or simple const array) for a later A/B — do NOT build an A/B harness now.
Choke decision-verb set for varying the setup clause: trusted · backed · rode with · bet on · stuck with · handed the keys to.

### Stamp — move out of the headline, render as an evidence seal
The stamp is no longer inline in the h1. Render it as a standalone slanted seal set apart from the
headline (reuse the `InFlowBadge` visual identity — gradient, border, slant, font — as a standalone
element, keep the component intact for its other uses). `default` renders no seal.

### Cards — proof, with the real hold glyph
Keep the 6-card hand as-is (held = Harden/Beal, others dim). Replace the red "HOLD" pill on held
cards with the **yellow-H hold glyph** from the normal game / H2H layout (located in step 4).

### Target line
Add one prominent line above the CTA: `Target to beat: {targetScore} FP`. The score appears here and
NOWHERE else on the screen.

### CTA — frame-aware, recipient path only
Recipient (fresh) CTA = the per-trigger value above. Fallback `Accept Challenge` if trigger missing.
Do NOT touch the owner/`alreadyAttempted` path or its "Play Again" copy (separate, out of scope).

### Delete
- The `HELD: …` line
- The dare ("Can you beat him?")
- The attribution footer ("from … · FP · CHOKE")
- Any other duplicate sender-name or player-name recap

## Hold pending grep (fill within this run, after step 1/2)
- miss STAMP label → from the confirmed miss-tier enum (headline already authorable).
- any cultural seasoning → only if `chadChallenge.ts` is confirmed a usable player bank.

## Do NOT
- Do NOT put the score or the stamp's word in any headline.
- Do NOT touch reveal / results / play surfaces, or the owner replay path.
- Do NOT author miss-tier labels or player-cultural copy ahead of the grep confirmations.
- Do NOT build an A/B harness for the choke candidates.

## Tests
- Each trigger renders its headline template + correct stamp (default = no stamp).
- Guardrail: no headline contains its stamp's label word (e.g. choke headline contains neither
  "CHOKE" nor "CHOKED").
- Score renders exactly once, in the target line, never in a headline.
- Recipient CTA is the frame-aware value; owner/`alreadyAttempted` path unchanged.
- Deleted elements (HELD line, dare, footer) are absent.

## Verify
- `bash scripts/build-vercel.sh` + full root `npm test`.
- Glass the recipient landing for choke + one badge trigger (big_score or rare_pull) + default:
  stamp reads as an evidence seal, yellow-H reads as hold, target line reads as the number to beat,
  CTA answers the headline. Confirm the owner/replay path is visually unchanged. Push held for John's
  glass-confirm.

## CC investigation outcome (2026-06-10) — both holds resolved before code

1. **Miss-tier enum** — confirmed. Canonical `WinTierKey` in `shared/utils/payoutLogic.ts:12` is
   `BUST | ROOKIE | STARTER | ALL_STAR | MVP | LEGEND`; `shared/utils/triggerEvaluation.ts:185-186`
   fires miss only for `ALL_STAR | MVP | LEGEND`. Render path `_`→` ` ⇒ stamp labels are
   `ALL STAR MISS / MVP MISS / LEGEND MISS`. **"NEAR MISS" does not exist** (earlier directive note
   was wrong). Bare `MISS` is a defensive fallback only. Miss headline stays tier-agnostic; the
   stamp carries the tier.

2. **chadChallenge.ts** — confirmed: generic trigger-keyed prose with `{starName}`/`{name}`
   substitution, NOT a player-cultural bank. Player-specific copy lives in
   `shared/commentary/playerCulture.ts` (`knownFor` populated; `controversySafe` empty).
   **Cultural copy LOCKED OUT of RD5.1**, not pending — auto-generating player-specific lines on a
   cold recipient's first screen without a populated safety field is a reputational risk. Revisit
   only if `controversySafe` is later populated.

3. **Headline no-stamp-word guardrail** — strict, whole-word, case-insensitive. Hard-fail in
   tests; whole-word so e.g. "scoreboard" doesn't trip the big_score guard on "score".
