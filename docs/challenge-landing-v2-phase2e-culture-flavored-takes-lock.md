# Challenge Landing V2 — Phase 2e Design Lock: Culture-Flavored Anchor Takes + Held-Name De-dup

> **The take should sound like a sports fan wrote it about THAT player.**
> "KOBE WASN'T THE PROBLEM" is good. "YOU DON'T WASTE A MAMBA HAND" is an argument a
> Lakers fan walks into. 2e flavors the anchor take with the player's perceived image —
> the stuff that resonates with fans — and in doing so fixes the triple-named-player
> redundancy, because a culture-flavored take REINFORCES the name instead of repeating it.

**Status:** LOCKED, pending implementation
**Workstream:** Accept / Challenge Landing V2 — culture pass (the 9→9.5 texture)
**Phase:** 2e (builds on 2d — must be merged + verified first)
**Coupling:** MEDIUM. Generator + banks + the existing culture DB + a layout de-dup. The
boundary-crossing is ALREADY SOLVED (see architecture) so this is lower-risk than it looks.

**PREREQUISITE:** Confirm 2d is on `origin/main` (it's deployed/verified on prod, but verify
the merge landed — 2c sat uncommitted once). 2e branches off post-2d main.

---

## Architecture: REUSE the existing culture path (do NOT invent a new one)

The take-card generator + landing are sport-agnostic (`shared/`); culture data is
sport-specific (`basketball/src/utils/playerCulture.ts`). This boundary is ALREADY crossed:
- `shared/commentary/selectCommentary.ts:41-42` imports `PLAYER_CULTURE` from each sport into
  `_cultureDb` keyed by sport (`_cultureDb[sport]`), looked up by
  `${normalize(name)}_${basePlayerId}`.
- `shared/commentary/chadChallenge.ts:2011` has `getCultureLine(anchor, triggerType)` already
  resolving culture for the recipient-intro banks via an `anchor.culture` field.
- There's a `CultureShape` structural-subset type at `selectCommentary.ts:808` — culture is
  already abstracted to a subset, not raw `PlayerCulture`.

**2e reuses this.** The generator resolves the anchor's culture through the SAME
`_cultureDb[sport]` lookup (it has `sport` + the anchor's `basePlayerId`). Extend the
existing `CultureShape` subset to carry the fields 2e needs (nickname, knownFor, and the new
landing-safe controversy flag) — do NOT reach into raw `PlayerCulture`, and do NOT build a
new injection mechanism. RECON CONFIRMS the exact lookup signature before building.

---

## Change 1 — Culture-flavored anchor takes (SHIPS NOW, safe fields only)

The 2d anchor take is `vindicated` / `blamed` / `generic`. 2e adds a CULTURE layer ON TOP,
for the **anchor/star only** (RED/ORANGE — culture is already tier-gated: RED always, ORANGE
conditionally, lower none; the anchor of a choke is a held high-tier card by definition, so
this mostly comes free — but keep the tier gate explicit).

Flavor the take using the **provably-safe culture fields**: `nicknames[]` and `knownFor`.
These need NO curation and ship immediately. Examples:
- vindicated + nickname: "YOU DON'T WASTE A {nickname} HAND" / "{nickname} DID HIS PART"
  ("THE MAMBA DID HIS PART")
- blamed + knownFor: "EVEN {anchor} WENT QUIET" leaning on the player's scoring rep
- The take BANK gains culture-flavored variants keyed by (mode/anchor-truth) × (has-nickname).
  When no culture entry exists for the anchor (or no nickname), fall back to the 2d
  non-culture take (generic/vindicated/blamed). FAIL-SAFE: missing culture → 2d behavior,
  never a broken `{nickname}` token.

Determinism preserved: culture variant selected by the same `challengeId` seed.

### Optional supporting culture line (gated, cuttable)
Per the "both" decision: an OPTIONAL second line below the take carrying richer image
(`knownFor` / a flagged-safe `controversy` line) — e.g. "Five rings. The Mamba doesn't fold."
BUT: 2c/2d fought hard to de-bloat this page. So the supporting line is:
- OFF by default in the first build (ship the flavored take alone),
- a `showCultureLine` toggle the localhost loop evaluates: render it, screenshot, decide if it
  ADDS punch or RE-BLOATS. **Explicit see-it-then-keep-or-cut decision on screenshot review.**
- only ever shown for the anchor, never stacked with a controversy line in the take too
  (no double culture dose).

---

## Change 2 — Controversy via fail-closed landing-safe flag (CURATION DEFERRED)

The `controversy[]` field is gold for sport-rep image ("mid-range artist in a three-point
era," "loyalty was never the brand") BUT contains §3-radioactive lines in the SAME array
(audit found the Arenas gun-incident entry). So:

- **Fail-closed flag.** A controversy line is usable in a take/line ONLY if explicitly
  flagged landing-safe. Absence of the flag = NOT used. An un-curated player or line can
  NEVER leak — default is "don't use it." Add the flag to the `CultureShape` subset (or a
  parallel `controversySafe: string[]` curated list), NOT a runtime keyword filter (brittle,
  rejected).
- **§3 still governs the flag.** Landing-safe = sport-relevant on-court image only (style,
  era, accolades, trade/loyalty rep, on-court controversies). NEVER personal life,
  marriages, legal/criminal, substance, even where §3's league-penalty exception would
  technically permit it — the broadcast test plus "this is a fun landing" rules it out.
- **Curation is DEFERRED and incremental.** The mechanism ships with ZERO flagged lines →
  takes use nickname/knownFor only (Change 1). As lines get flagged, they start appearing. No
  code change needed to enrich over time. Start curation with RED/ORANGE-tier players (the
  only ones whose controversy can ever surface, via the anchor + tier gate).
- **Curation method: Code-Claude proposes flags, user approves.** CC scans `controversy[]`
  across RED/ORANGE players, proposes a landing-safe flag per line (auto-rejecting
  gun/arrest/suspension/legal/substance/personal terms, auto-accepting clear sport-rep),
  surfaces the proposed flags + the judgment-call middle for user batch-approval. CC does NOT
  self-approve any line — every flagged line is user-ratified. This is a SEPARATE deferred
  task (its own branch), not part of the 2e mechanism build.

---

## Change 3 — Fix the triple-named-player redundancy (the 2d leftover)

On the live 2d page, the held players appear 3× in a vertical stack: HOLD badges (cards) +
"DENZEL'S LINE / HOLD: Kobe, Kidd" block + "KOBE AND KIDD. BUSTED." stakes line. Three
surfaces mechanically repeating the same two names.

The culture-flavored take (Change 1) is PART of the fix: once the take names the anchor with
image ("YOU DON'T WASTE A MAMBA HAND"), the name is an argument, not a list. The remaining
mechanical repetition is the **stakes line + the DENZEL'S LINE block** both listing names.
Resolution:
- **Drop the names from the stakes line** → it becomes the verdict only: "BUSTED." /
  "HELD THE STARS. BUSTED." (no "Kobe and Kidd" — the take + block already carry them).
- **Keep the DENZEL'S LINE block** — it carries info the take doesn't: the take names the
  ANCHOR (one player); the block lists ALL held (2+). So the block is not redundant with a
  single-anchor take. BUT: this is a **see-it-then-decide** on screenshot review — if, with a
  culture-flavored take + HOLD badges, the block still feels redundant, cut it. Build it
  retained; the localhost loop makes the keep/cut call.

Net: names appear as badges (visual) + block (full held list) + take (anchor, as argument) —
three DIFFERENT jobs, not three repetitions. The stakes line stops repeating names.

---

## Out of scope (LOCKED)

NO new systems (feeds/boards/etc. — reaffirmed every phase). NO mechanic-tutorial line. NO OG
share-card wiring. NO trigger/snapshot/stamp-logic changes. The controversy CURATION is a
separate deferred task (propose-approve), NOT this mechanism build. Competition-mode culture
takes ("{anchor} WENT OFF") are a nice-to-have — include only if the bank's trivial, don't
block on them; correction is the priority.

---

## Gates

- `npm test`:
  - Culture-flavored take fires for an anchor WITH a nickname; falls back to the 2d
    non-culture take when the anchor has no culture entry / no nickname — with NO broken
    `{nickname}` token (the fail-safe guard).
  - Tier gate: a non-RED/ORANGE anchor (shouldn't happen for choke, but guard it) gets no
    culture flavor.
  - **Controversy fail-closed: with ZERO flagged lines, NO controversy text appears in any
    take/line** (the safety guard — the mechanism ships inert on controversy). A flagged line
    appears; an UNflagged line on the same player never does.
  - Determinism preserved through the culture branch (same challengeId → same card).
  - De-dup: the stakes line contains NO held-player names; the DENZEL'S LINE block still
    lists all held; assert the held names appear in the block but not the stakes line.
  - Legacy (holdsRecorded:false): no anchor → no culture flavor → 2d generic take, no leak.
- `npx tsc --noEmit`; `bash scripts/build-vercel.sh`; function count 11/12.

## Assert-the-neighbors

The culture lookup reuses `selectCommentary`'s `_cultureDb` path — confirm 2e's use doesn't
change the RECIPIENT-INTRO culture behavior (the existing `getCultureLine` consumers in
`chadChallenge.ts`). 2e READS the same DB; it must not mutate the shared culture path or
alter the intro banks' output. Ship a check that the recipient-intro culture line is
unchanged by the 2e additions.

## Live-verification (Code-Claude owns the loop)

Screenshot at 390 for: choke with a culture-rich anchor (Kobe — has nickname "Mamba") showing
the flavored take; choke with a culture-POOR anchor (no nickname → 2d fallback take, no broken
token); the de-dup'd stakes line (no names) + retained block. The two see-it decisions:
(1) does the optional supporting culture line ADD or BLOAT — keep or cut; (2) with the
flavored take, does the DENZEL'S LINE block still earn its place. Then PROD: a real Kobe-anchor
choke reads with image-flavored attitude, the page is no more cluttered than 2d (ideally
less — names de-duped), no broken tokens on culture-poor anchors.
