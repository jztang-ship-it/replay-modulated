# Phase 3.2 Design Lock: Wire the Authored Headline INTO the On-Page TAKE
### (corrects the Phase 3 lock §2 surface error + the prod generation failure)

> **The recipient reads `takeCard.take`, not `share_headline`.** Phase 3 generated an
> authored ESPN-register headline and stored it where the accept page never looks. The
> page kept rendering the old `TAKES.choke` template ("THIS HAND HAD A WINNING SHAPE").
> 3.2 connects the engine's output to the surface the recipient actually sees — and fixes
> the separate prod failure where generation returns null.

**Status:** LOCKED, pending implementation
**Supersedes:** the Phase 3 lock §2 claim *"landing + api/share/card read share_headline."*
That was wrong. The landing renders `takeCard.take` (the deterministic bank picker);
`share_headline` reaches ONLY the OG share-card, the native share-sheet text, and the
sender's results strip — never the recipient's on-page headline. **This error is the
reason the authored engine shipped invisible.** Correcting it is the fix.
**Coupling:** LOW. One landing read-site change + one nullable field + a generation-failure
recon. No engine change (the engine is correct). No threshold change.
**Base:** main at `832bddc` (Phase 3 merged).

---

## Two stacked issues (both confirmed on prod row `0f912813-…`)

**Issue A — architectural (primary).** `ChallengeTakeCardLanding.tsx:425-454` renders
`{takeCard.take}` as the visible `<h1>`. `takeCard.take` is from `generateChallengeTakeCard`
(the `TAKES.choke` / 2d / 2e bank picker). `share_headline` is on the data shape but is
never a JSX expression in the landing. So the authored line is invisible on the accept page.

**Issue B — generation failure (secondary).** Recent prod choke rows carry bank-pick
strings in `share_headline`, not authored lines → `/api/headline` is returning null in prod
(env is confirmed present, so it's validator-rejection, timeout, or the client not POSTing).
**B must be diagnosed first** (see recon) because its cause may live in the same client path
3.2 edits — and because fixing A without B just renders the template fallback on every row.

---

## The trap 3.2 must design around: bank-pick must NOT become the TAKE

`share_headline` is **never null** — on generation failure the client writes the
`chadShareTrashTalk` bank pick into it (e.g. "Brutal hand. See if you read it better.").
That string is fine as share-sheet text / OG caption (a casual dare), but it must NEVER
render as the giant uppercase on-page TAKE — that would be worse-register than the current
template. **The authored line and the bank fallback must stay distinguishable.**

### Design: a dedicated `authored_headline` field (do NOT overload `share_headline`)
- `/api/headline` already returns the authored line OR null.
- The client writes the authored line to a NEW nullable column `authored_headline` —
  populated ONLY when `/api/headline` returns a real authored string; left **null** on
  failure. `share_headline` keeps its current meaning and its bank-pick fallback unchanged
  (OG card / share text / results strip are untouched).
- `api/challenge/[id].ts` whitelists `authored_headline` into the landing payload (same
  explicit-field pattern as the rest of the response object).
- **Landing TAKE = `data.authored_headline` (when non-empty) ELSE `takeCard.take`.** Only
  the headline string swaps; the take card's structure stays exactly as-is — badge,
  held-list block, evidence/stakes line, dare, CTA, the `takeNamedAnchor` dedup. The
  authored line replaces the `<h1>` text and nothing else.

Why a dedicated field, not `share_headline` + a flag: `share_headline` is consumed by three
other surfaces with their own fallback semantics; overloading it to also mean "is this
authored" risks promoting a bank pick to the TAKE the first time the distinction is missed.
A null-or-authored field makes the landing's choice unambiguous: a value means "authored,
show it"; null means "fall back to the template."

---

## Honesty + safety carried forward (unchanged)
- The authored line already passed the engine's honesty gate at generation time (verdict
  obedience, anti-anachronism, validators). 3.2 only changes WHERE it renders; it adds no
  new generation. So the mid-zone "name no hero/villain" guarantee rides along.
- **Strictly additive / never worse than today:** `authored_headline` null → landing renders
  exactly today's `takeCard.take`. Worst case is the current behavior. The bank-pick string
  can never reach the TAKE.
- Determinism: the take card structure stays deterministic; the authored line was generated
  once and stored once (now in `authored_headline`).

---

## Recon FIRST (Issue B) — report and WAIT before building

1. For row `0f912813-eb68-4831-b382-324d0385e70a`: pull the Vercel function log for its
   `/api/headline` call. Report the `reason` on the response (validator rejection / timeout
   / apology-sentinel) — OR confirm the client never POSTed for this trigger. This is the
   single fact that turns Issue B from three hypotheses into one cause.
2. If the cause is a client-side skip or throw on choke specifically, report where — it may
   be in the same `ChallengeSharePrompt` path 3.2 edits.
3. Confirm the prod Anthropic latency: the smoke harness needed real time per call; confirm
   whether the 2.5s `HEADLINE_TIMEOUT_MS` is too tight for real prod hands (a timeout would
   explain null on every row).
Report all three. WAIT for review — the fix for B folds into the 3.2 build once known.

## Build (on explicit go-ahead, after B's cause is known)
1. New nullable `authored_headline` column (migration); `create.ts` writes it from the
   client; `api/challenge/[id].ts` whitelists it into the payload.
2. Client (`ChallengeSharePrompt`): write the `/api/headline` result to `authored_headline`
   ONLY when non-null; `share_headline` behavior unchanged.
3. Landing: `<h1>` renders `data.authored_headline || takeCard.take`. No other take-card
   change. Add a test asserting (a) authored present → authored renders, (b) authored null →
   `takeCard.take` renders, (c) a bank-pick string never reaches the TAKE.
4. Whatever B's fix requires (timeout bump / validator loosening / client-POST fix).
5. Gates: `npm test`, `npx tsc --noEmit`, `bash scripts/build-vercel.sh`, function count 12
   (no new function — `authored_headline` is a column, not an endpoint).

## Non-negotiables
- Bank-pick fallback NEVER renders as the on-page TAKE.
- `authored_headline` null → exact current behavior (template). Never worse than today.
- No engine change, no threshold change. 3.2 is a wiring + one-field + B-fix lock.
- Committed lock is NOT a build signal. Recon B → review → explicit build prompt.
