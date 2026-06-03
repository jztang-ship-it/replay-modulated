# Challenge Landing V2 — Phase 1 Design Lock: Trigger Split (bad_beat → choke) + Stamp Cleanup

**Status:** LOCKED, pending implementation
**Workstream:** Accept / Challenge Landing V2
**Phase:** 1 of 3 (depends on Phase 0 merged — `b445061` on main, PROD-verified 2026-06-02)
**Coupling:** MEDIUM (trigger logic + stamp render + bank constant renames + a DB read-alias;
no layout invariant, but `trigger_type` is a stored DB value so back-compat is mandatory)

---

## The product model (what changed, in plain terms)

The single `bad_beat` trigger was doing two unrelated emotional jobs. They split into
two siblings with opposite emotions:

- **near-miss / "finish the job"** — already exists in code as the `miss` trigger
  (within N of next tier, STARTER+). KEEPS its tier-specific stamps —
  **"ALL STAR MISS", "MVP MISS", "LEGEND MISS"** — which resonate and are clearer than a
  generic label. The word **"bad beat" survives only as a *category word in commentary
  copy*** ("brutal bad beat — missed MVP by 3"), NOT as a stamp.
- **choke / "I could fix this"** — held 2+ high-tier cards and still landed BUST/ROOKIE.
  This is what the *code's current `bad_beat` trigger* becomes. New **CHOKE** stamp.

**The `bad_beat` stamp is DELETED** (facing artifact removed entirely — not renamed,
not relabeled). Nothing facing uses the name "bad beat" as a stamp after this phase.

### Naming consequence (call this out loudly in code comments)

Because the facing "BAD BEAT" stamp is gone and the trigger it belonged to is now a
choke, the internal key `bad_beat` is pure legacy with no facing justification. **We
rename the internal trigger key `bad_beat` → `choke`** so the code stops saying
`bad_beat` while meaning choke. The `miss` trigger keeps its key (its facing stamps
already say "{tier} MISS" — key and label agree, no confusion).

---

## Decisions (all locked with the user)

1. **choke fires on 2+ held RED/ORANGE cards landing BUST or ROOKIE.** (Current
   `bad_beat` fires at ≥1 held high-tier card — TIGHTEN to ≥2.)
2. **The 1-held-high-tier-card + BUST/ROOKIE case drops to `default`.** No lighter
   bad_beat retained. Choke is rare and earned; rarity is what makes the stamp sting.
3. **near-miss (`miss`) window → 5% of the next tier's minFp** (was a flat 5 FP
   `MISS_WINDOW`). STARTER and above only — tier floor UNCHANGED (no ROOKIE→STARTER
   firing).
4. **Precedence:** `rare_pull → big_score → choke → miss → default`. choke OUTRANKS
   miss. (Only matters in the rare overlap zone; choke's "held studs and bricked" is a
   sharper story than miss's "almost cleared".)
5. **Internal key rename `bad_beat` → `choke` everywhere** (trigger key, type unions,
   stamp kind, bank constant *names*, analytics value). NOT a re-tone — the choke-voice
   rewrite defers to Phase 2.
6. **Choke-voice copy re-tone DEFERRED to Phase 2.** Phase 1 moves the existing
   `bad_beat` bank lines into `choke`-named banks AS-IS (only the constant names and the
   inline stamp token change). The accusatory choke voice is written in Phase 2
   alongside the generator + the parked loss-side voice pass, so the voice is authored
   once as one spine, not twice.

---

## Mandatory back-compat: stored `trigger_type` read-alias

`trigger_type` is a persisted column on `shared_challenges`, written at create time
(`useChallengeShare.ts:99`, `ResumeShareSurface.ts`). **Every existing challenge has
`trigger_type:"bad_beat"`**, and under the new model those rows mean CHOKE. So:

- **New writes:** `trigger_type:"choke"` (the renamed key flows straight to the column).
- **Reads:** any code that branches on a fetched `trigger_type` MUST treat stored
  `"bad_beat"` as `"choke"`. Add ONE documented alias at the read boundary —
  `normalizeTriggerType(stored): "choke" if stored === "bad_beat", else stored` — and
  route every render-time read through it. Do NOT scatter `=== "bad_beat"` checks.
- The clean read entry point is `ChallengeLandingScreen.tsx:114`
  (`triggerType: data.trigger_type as ChallengeCtx["triggerType"]`) — normalize there so
  everything downstream of the landing ctx sees `choke`. Audit the recipient-intro reads
  in `chadChallenge.ts` (lines ~1431, 1613, 1915, 1922, 1926, 1976, 1983, 2030) and
  `GameView.tsx` (1465, 2555) — these branch on the trigger value and must see the
  normalized form, whether they read from ctx (already normalized) or re-derive.
- NO prod data backfill in this phase. (A backfill that recomputes per-row to avoid
  mislabeling the legacy 1-held-card rows as choke is more risk than the cleanup is
  worth; the alias makes it unnecessary. A backfill can run later on top of the alias if
  DB purity is ever wanted.)

---

## Implementation surface (exact sites, verified against the repo)

### A. Trigger logic — `shared/utils/triggerEvaluation.ts`
- `TriggerResult.trigger` union: `"bad_beat"` → `"choke"`.
- The `MISS_WINDOW = 5` flat constant → 5% computation: `gap <= nextMin * 0.05`
  (compute against the next tier's `minFp`, the value the gap is measured to). Keep the
  STARTER+ floor and the `gap > 0` guard exactly as-is.
- Rule #4 block (`winTier === "BUST" || "ROOKIE"`): change `highTierHeldCount >= 1` →
  `>= 2`; rename the returned `trigger: "bad_beat"` → `"choke"`; rename
  `selectBadBeatAnchor` → `selectChokeAnchor` (logic unchanged).
- **Precedence:** the evaluator already returns on first match top-to-bottom
  (rare_pull → big_score → miss → bad_beat). To make **choke outrank miss**, MOVE the
  choke block ABOVE the miss block. (Today miss is checked first; with choke requiring
  BUST/ROOKIE and miss requiring STARTER+, they can't both fire on the same hand TODAY —
  but the 5% widening + any future floor change could create overlap, so order it
  correctly now: choke before miss.)

### B. Stamp render — DELETE bad_beat stamp, ADD choke stamp
Three label/style sites move in LOCKSTEP (an assertion must guard that they agree):
- `shared/components/TeamStamp.tsx`:
  - `TeamStampKind` union: `"bad_beat" | "miss"` → `"choke" | "miss"`.
  - `labelFor` (line ~90): `bad_beat → "BAD BEAT"` becomes `choke → "CHOKE"`. miss
    branch (`{tier} MISS`) UNCHANGED.
  - `CLASS` map (line ~80): `bad_beat: "ts-stamp-bad-beat"` → `choke: "ts-stamp-choke"`;
    add the `.ts-stamp-choke` style. Choke is a savage red — the existing
    `ts-stamp-bad-beat` red gradient is a fine starting point; the visual *spirit* should
    match the family (ALL STAR MISS / MVP MISS) but read as an accusation. Exact treatment
    is a design nicety, not locked here; ship a clearly-choke red stamp.
  - The guard `if (kind !== "bad_beat" && kind !== "miss")` → `!== "choke" && !== "miss"`.
- `shared/components/TierGauge.tsx` (inline-chip variant, must match TeamStamp):
  - `StampToken["stamp"]` union: drop `"bad_beat"`, add `"choke"`.
  - `INLINE_STAMP_KIND_CLASS` (line ~393): `bad_beat: "tg-inline-stamp-bad-beat"` →
    `choke: "tg-inline-stamp-choke"` (+ style).
  - `INLINE_STAMP_BASE_LABEL` (line ~402): `bad_beat: "BAD BEAT"` → `choke: "CHOKE"`.
    The `miss: "MISS"` base label stays (it's the prefix the `{tier} MISS` render builds
    on).

### C. Banks — `shared/commentary/chadChallenge.ts`
- Rename the constants: `INITIATION_BAD_BEAT` → `INITIATION_CHOKE`,
  `INITIATION_CULTURE_BAD_BEAT` → `INITIATION_CULTURE_CHOKE`, `TOP_BAD_BEAT_HELD_ONE` /
  `_HELD_TWO_PLUS` / `_NO_HOLDS` → `TOP_CHOKE_*`, the `INTRO_BAD_BEAT_*` /
  `NUDGE_BAD_BEAT_*` recipient-intro banks → `*_CHOKE_*`.
- The `InitiationBucket` / bucket-selector value `"bad_beat"` → `"choke"`
  (lines ~479, 527, 629, 636, 647, 1431).
- **51 inline stamp chips** currently emit `{ stamp: "bad_beat" }` — change the token to
  `{ stamp: "choke" }`. (Mechanical; the StampToken union change in B makes the compiler
  find any miss.)
- **DO NOT rewrite the line text.** The accusatory choke-voice re-tone is Phase 2. Note:
  the HELD_ONE bank (`TOP_BAD_BEAT_HELD_ONE`) describes the 1-held-card case which now
  drops to `default` and can no longer fire on the choke trigger — KEEP the bank for now
  (the no-holds/held-one lines may still be reachable via legacy-aliased rows or the
  generic intro path); flag it for review in Phase 2 rather than deleting blind.

### D. Wiring reads — normalize at the boundary
- `GameView.tsx:1465` (`tt.trigger === "bad_beat"`) and `2555`
  (`challengeTrigger?.trigger === "bad_beat" ? "bad_beat" : ...`): these read the LIVE
  trigger (sender side, freshly evaluated → already `"choke"` after A). Update the string
  literals to `"choke"`.
- `chadChallenge.ts` recipient-intro reads (~1431, 1613, 1915, 1922, 1926, 1976, 1983,
  2030): these read the trigger that may have come from a STORED row → route through
  `normalizeTriggerType` so legacy `"bad_beat"` maps to `choke`.

### E. Analytics
- `useChallengeShare.ts:67` `share_trigger_fired` and `:121` `challenge_create` emit
  `result.trigger` / `trigger.trigger` → these now emit `"choke"`. Acceptable — historic
  events keep `"bad_beat"`, new ones are `"choke"`. Note the discontinuity in the
  analytics doc so dashboards UNION both values for the choke series.

---

## Out of scope for Phase 1 (do not build here)

- Choke-voice copy re-tone (accusatory rewrite of the moved bank lines) → Phase 2.
- The landing V2 layout, hold badges, `generateChallengeTakeCard` → Phase 2.
- Prod data backfill of stored `bad_beat` rows → not now (alias covers it).
- Any change to `rare_pull` / `big_score` logic.

---

## Gates

- `npm test` — update existing trigger/stamp tests for the renamed key + tightened rule.
  NEW coverage required:
  - choke fires at exactly 2 held RED/ORANGE + BUST/ROOKIE; does NOT fire at 1 (→ default).
  - miss fires at 5% of next tier, not the old flat 5 FP (add a case that fired under 5 FP
    but NOT under 5% near LEGEND, and one that fires under 5% but would've missed at 5 FP).
  - precedence: a constructed hand matching both choke and miss conditions returns choke.
  - **stamp-label lockstep:** an assertion that `TeamStamp` and `TierGauge` render the SAME
    label for `choke` (both "CHOKE") and that neither renders "BAD BEAT" anywhere.
  - **legacy alias:** `normalizeTriggerType("bad_beat") === "choke"`; a recipient intro fed
    a stored `"bad_beat"` row renders the choke intro, not an empty/default one.
- `npx tsc --noEmit` — the union changes (StampToken, TeamStampKind, TriggerResult) will
  surface every unmigrated site; treat a clean tsc as proof the rename is complete.
- `bash scripts/build-vercel.sh` (shared/ touched).
- Function count 11/12.

## Assert-the-neighbors

The stamp deletion touches the SHARED `TierGauge` inline-chip path, which renders on the
sender's own results screen (not just the challenge surface). Ship an assertion that a
non-challenge results render with the old `bad_beat`-emitting condition now produces a
CHOKE chip (or none, per the tightened rule) — and that NO surface still paints the
deleted "BAD BEAT" inline chip. A green trigger test alone won't catch a stray
`bad_beat` stamp token left in a bank line that only renders on a specific tier.

## Live-verification (per standing rule)

After merge + PROD flip: create a real challenge that holds 2 RED/ORANGE cards and busts
→ confirm the CHOKE stamp renders (sender results) and the stored `trigger_type` is
`"choke"`. Open an OLD challenge link (stored `"bad_beat"`) → confirm it renders as choke
via the alias, not blank. Create a near-miss hand just inside 5% of a high tier →
confirm "{TIER} MISS" still stamps and `trigger_type:"miss"`.
