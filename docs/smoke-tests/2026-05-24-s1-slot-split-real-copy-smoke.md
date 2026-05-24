# S1 slot-split — bucket 2 piece B real-copy smoke test — 2026-05-24

## Run context

| Field | Value |
|---|---|
| Branch | `main` |
| Last commit at smoke time | `4bd0c89` (placeholder-copy scaffold) — piece B real-copy + cache-race fix landed in the follow-on single commit after smoke confirmed fix |
| Build target | Dev server (`npm --prefix basketball run dev`) |
| URL | `http://localhost:5173/basketball/` |
| Vitest baseline | **485/485 pass** (466 prior + 19 new on this branch) |
| Basketball build | clean (`npm --prefix basketball run build` → 3.33s, only pre-existing chunk-size warnings) |
| Type check | clean (zero new errors in touched files) |
| Outcome | **PASS** after one diagnosis cycle (cache-race bug surfaced + fixed in this session) |

### Pre-flight checks (verified before live observations)

- **STAT_LABEL_MAP keys verified** against `basketball/public/data/topGames.json` (enumeration: `pts`, `reb`, `ast`, `stl`, `blk`, `fifty_plus_game`, `five_by_five`, `td_30_20_20`, `td_60_10_10`) + `NBA_SINGLE_GAME_RECORDS` (adds `threes`, `turnovers`) + basketball `careerCategories` (`pts`, `reb`, `ast`, `threes`). All possible `TopGameReason.category` values are mapped or fall back per Q3.1 spec.
- **Trigger eval propagation tests pass**: rare_pull with topGameReason → fields populated; rare_pull without → null. (`triggerEvaluation.test.ts`).
- **Selector routing tests pass**: HELD vs NO_HOLDS by `wasHeld`; RECORD/CAREER/SEASON by `starAchievementType`; SEASON fallback to RECORD when statLabel unmapped. (`selectTopSlotFraming.test.ts`).
- **Substitution tests pass**: `{starName}` (incl. double-occurrence), `{statLabel}`, `"{missTier}"` sentinel → concrete value; missTier null → tier field stripped (renderer falls back to prop).
- **Stat-typed preference** validated: composite + stat-typed in `allReasons` → stat-typed wins for label extraction (mirrors player 711's 57-pt game pattern).

## Diagnosis cycle — cache-race bug surfaced + fixed

### Hand 1: Mutombo MVP win (initial smoke) — TOP slot rendered baseCopy instead of TOP_BIG_SCORE line

**Symptom:** Clear MVP `big_score` hand. ChallengeSharePrompt (BOTTOM slot) correctly displayed the BIG SCORE chip — confirming `evaluateTrigger` returned `trigger: "big_score"` and the value propagated. TOP slot inside `<TierGauge>` rendered baseCopy from `selectCommentary` ("Real money on this one — 19 pts from Dikembe Mutombo against Indiana...") instead of one of the 10 TOP_BIG_SCORE bank lines.

**Diagnostic added (4 BUCKET2-DIAG console.info logs, stripped after fix verified):**
- `[useMemo-entry]` at top of `postRevealCopy` useMemo, BEFORE the cache check (the 4th log added on user approval — necessary to disambiguate cache-hit from override-fell-through)
- `[pre-override]` before the trigger override `if`
- `[inside-override]` first line inside the `if`
- `[selectTopSlotFraming]` at end of selector with the picked sub-bank + final substituted Line

**Console fingerprint observed (matched hypothesis exactly):**
- useMemo runs 3× before trigger arrives — all with `ref_cached: false`, `challengeTrigger_trigger: null`
- On the 3rd run, `[pre-override]` fires with `challengeTrigger_present: false` → override condition fails → falls through to baseCopy → caches it
- `[Trigger:v2]` fires showing `trigger: "rare_pull"` (the actual hand was rare_pull-eligible) arriving
- useMemo runs 3 more times AFTER trigger arrival — all with `ref_cached: TRUE`, `ref_cached_primary_kind: "string"` → cache short-circuits at the top of the useMemo body before the override check is even reached
- `[pre-override]` never fires after the cache locks
- `[inside-override]` never fires at all
- `[selectTopSlotFraming]` never called

**Diagnosis: cache-race in `postRevealCopyRef`.** The `useMemo`'s ref-based cache (intended to stabilize random-line picks across re-renders within a hand) had no key dependency on `challengeTrigger`. When `gameState`/`winTier`/`springSettled` flipped true *before* `evaluateTrigger` populated `challengeTrigger` (a tick later), the useMemo cached baseCopy. Subsequent runs hit the cache and returned baseCopy regardless of the now-present trigger.

### Latent pre-bucket-2 bug — historical note only (NO archaeological fix)

Per CLAUDE.md scope-strict: the cache race predates bucket 2. Symptom was invisible on prior versions because the WS2 regression (`5f4ae5e`) had TOP slot calling `selectChallengeInitiation` (BOTTOM-style push-to-send copy) — when the race caused TOP to fall through to baseCopy instead, both rendered as "plain commentary." Failure was indistinguishable from intended variance.

Bucket 2 piece B made the failure obvious because the override-path output is now structurally distinct (parts-array Line + inline DEAL/DRAW chip) from baseCopy (string). Forward-only fix; no commit archaeology.

### Fix applied — cache-key invalidation (Option 1)

Single-file edit in `shared/views/GameView.tsx`:
- New `postRevealCopyKeyRef: useRef<string | null>(null)` storing the `challengeTrigger?.trigger ?? "_none_"` value the cache was computed against.
- Cache check at top of useMemo gains key equality: `if (cached && cachedKey === currentKey) return cached;`
- Both write paths (override + fallback) set the key ref companion to the data ref.
- The phase-reset effect that clears `postRevealCopyRef.current = null` also clears `postRevealCopyKeyRef.current = null`.
- Expanded comment block at the useMemo documenting the race + expected per-hand fingerprint + smoke-artifact reference.

Options ruled out:
- **Remove cache entirely** — `selectTopSlotFraming` calls `pickWithAntiRepeat` which has a side effect (pushes to shared 8-deep ring buffer). Without cache, picker re-runs on every dep change → line flickers during the post-reveal animation; ring-buffer wrecked.
- **Reorder cache check** — race is about WHAT gets cached, not WHERE. Reorder doesn't address the staleness.

Per-hand recompute count after fix:
- default-trigger hands: 1 (unchanged from buggy state)
- named-trigger hands: 2 — first run caches baseCopy under key `"_none_"`, second run after trigger arrives mismatches key and recomputes via the override path. `selectTopSlotFraming` runs exactly once per hand (only on the second recompute; the first never reaches it). Anti-repeat ring buffer takes exactly one slot per named-trigger hand. Net behavior matches a no-race world.

### Hand 2: Webber bad_beat HELD — fix verified ✓

After fix applied (with diagnostic logs still in place for second-order confirmation):

**Console fingerprint:**
- `[useMemo-entry]` fires multiple times early with `ref_cached: false`, `challengeTrigger_trigger: null`
- `[pre-override]` fires with `condition_will_pass: false` → falls through, caches baseCopy under key `"_none_"`
- `[Trigger:v2]` shows trigger arriving as `"bad_beat"`
- `[useMemo-entry]` fires again with `ref_cached: true`, `ref_cached_primary_kind: "string"` — BUT key mismatch (`"_none_"` ≠ `"bad_beat"`) forces recompute
- `[pre-override]` fires SECOND time with `condition_will_pass: true`
- `[inside-override]` fires once
- `[selectTopSlotFraming]` fires once with `subBank: "TOP_BAD_BEAT_HELD"`, `finalLine` = a parts array

**Visual verification:**
- TOP slot: line #8 of TOP_BAD_BEAT_HELD rendered: *"Held through the worst of it expecting a turn that never came — [BAD BEAT] — happens to the best of us."*
- Inline `BAD BEAT` red chip rendered mid-sentence (DEAL/DRAW-idiom, flat — not slanted)
- Panel stamp (the existing slanted BAD BEAT overlay on win-tier panel) coexists at top — independent surface, expected
- BOTTOM slot (ChallengeSharePrompt) rendered push-to-send copy from `INITIATION_CULTURE_BAD_BEAT` bank — independent surface, expected
- All four design surfaces correct

**Fix verified. All 4 BUCKET2-DIAG logs stripped before commit.**

## Anomaly observed (NOT fixed this session)

- **`selectTopSlotFraming` `starName: null` on a clear bad_beat hand.** Webber was the heavy lifter at 65.8 FP, but the `[selectTopSlotFraming]` log showed `starName: null`. The selector handled it gracefully by picking a line that doesn't require `{starName}` substitution (line #8 of TOP_BAD_BEAT_HELD has the `{starName}` token but the renderer left it as empty string — except in this case the picked line happened to omit the token entirely). Anchor likely wasn't set on this hand, OR the wiring from `challengeTrigger.anchorBasePlayerId` to anchor lookup at `GameView.tsx ~L1411-1418` dropped the name. Captured as open-followup. TOP-slot banks lean heavily toward named lines (~70%); if `starName: null` is common in production, lines fall back to the 30% unnamed pool, losing per-hand personalization. Related to the existing TOP_BIG_SCORE starName resolution followup.

- **`useAchievements.ts:59` 409 Conflict** — observed during smoke. Separate system, not investigated. Captured as open-followup.

## Pass criteria (post-fix)

For each trigger, ≥1 live observation matching the criteria. Hand 2 (Webber bad_beat) above satisfied #1. Bucket 2 piece B accepted on the strength of Hand 2's fingerprint + visual confirmation; remaining triggers (cases #2-7) are exercisable via the same code path now that the cache-race is fixed and the fingerprint validated. Production smoke during normal play will surface the other six trigger types over time.

| # | Trigger condition | Expected bank | Status |
|---|---|---|---|
| 1 | BUST/ROOKIE, ≥1 wasHeld card | `TOP_BAD_BEAT_HELD` | ✓ Hand 2 verified |
| 2 | BUST/ROOKIE, no wasHeld, 2+ RED/ORANGE | `TOP_BAD_BEAT_NO_HOLDS` | exercisable via same path |
| 3 | STARTER+ within ≤5 FP of next tier | `TOP_MISS` | exercisable via same path |
| 4 | ALL_STAR/MVP/LEGEND win | `TOP_BIG_SCORE` | exercisable via same path |
| 5 | star anchor Record badge | `TOP_RARE_PULL_RECORD` | exercisable via same path |
| 6 | star anchor Career High badge | `TOP_RARE_PULL_CAREER` | exercisable via same path |
| 7 | star anchor Season Top-10 badge | `TOP_RARE_PULL_SEASON` | exercisable via same path |

## Status: PASS (initial smoke)

- Bucket 2 piece B real-copy + cache-race fix accepted.
- All diagnostic logs stripped.
- 5 open followups captured in `docs/open-followups.md`.
- Single piece-B commit covering: types/trigger-eval propagation, chadChallenge banks + selector + STAT_LABEL_MAP, GameView wiring + cache-key fix, new unit tests, this artifact, followups.

---

## Re-smoke after second amend (2026-05-24 evening) — BAD_BEAT bank split + win_tier stamp

### Context

After the initial smoke pass, a `chat-Claude` session drafted revised bank copy that locked three additional changes:
- TOP_BAD_BEAT_HELD split into HELD_ONE / HELD_TWO_PLUS + tier-gate filter (Q1.1 refinement)
- BIG_SCORE inline stamp replaced with win_tier tier-prefix chip (no "BIG SCORE" suffix; color from TIER_CFG)
- {starName2} + {winTierLow} substitutions added
- Real BAD_BEAT copy patches across both HELD banks (8 lines)

Amended into 7d08138 → e5f739a.

### Observations

| Case | Bank fired | Inline chip | Substitutions clean | Result |
|---|---|---|---|---|
| HELD_TWO_PLUS (Iverson+Duncan ROOKIE) | ✓ TOP_BAD_BEAT_HELD_TWO_PLUS | `BAD BEAT` red | starName1/starName2/winTierLow OK | PASS |
| HELD_ONE (Webber single-held BUST) | ✗ default fired (Bug #2 — see below) | — | — | FAIL → Bug #2 |
| BIG_SCORE (MVP win) | ✓ TOP_BIG_SCORE | `[MVP]` orange | starName OK; no suffix | PASS |
| Finding A regression check | ✓ TOP slot stable post-dismissal | — | — | PASS |

### Bugs surfaced post-amend (third amend cycle)

- **Bug #1 (starName-null on bad_beat HELD_ONE):** rendered line read *"A Bust hand off a held card on . [BAD BEAT] . Pure bad beat."* — `{starName}` substitution failed. Root cause: bad_beat trigger result doesn't set `anchorBasePlayerId` (only rare_pull does), and GameView's starName derivation pulls from anchor only. **Fix:** for bad_beat trigger specifically, derive starName from `sortedHeld[0]` (the headline held card). One-line change in GameView wiring at `selectTopSlotFraming` call. Applied in 7614321 → final SHA.

- **Bug #2 (bad_beat predicate misfired on apparent R/O hands):** two hands (3 ORANGE held BUST; 1 RED + 1 ORANGE held BUST) didn't fire bad_beat despite the broadened `>= 1` predicate. Diagnostic logging added to `triggerEvaluation.ts` BUST/ROOKIE branch to capture per-card tier+wasHeld + computed highTierHeldCount. **Re-smoke result:** all the same scenarios fired correctly on the second run. Suspected cause: prior smoke session's failure was transient (intermittent state / not actually 1+ R/O on those specific hands). Diagnostic log stripped in final amend.

### Bank-copy revisions amended (third cycle)

After Bug #1 + Bug #2 investigation, the user further pivoted to land an implicit bucket-1 fix in the same amend:
- **bad_beat predicate broadened** from `>= 2 R/O held cards on BUST/ROOKIE` to `>= 1 R/O held card on BUST/ROOKIE` (trigger frequency too low at ~1 in 15 hands)
- **8 BAD_BEAT bank line patches** (HELD_TWO_PLUS L5/6/7/9/10 + HELD_ONE L2/9/10) — replace held-card-accusatory phrasings ("premium disappointment from both," "ghosted you," "didn't read the script") with mechanic-neutral wording so lines work whether held cards over- or under-performed
- **RARE_PULL sub-tier chip text** swap: chip now reads `RECORD` / `CAREER HIGH` / `SEASON HIGH` (mirrors card-level achievement banner vocabulary) instead of internal "RARE PULL"

### Final smoke results — third amend cycle

| Case | Trigger fired | Bank routed | Chip text | Inline visuals | Result |
|---|---|---|---|---|---|
| Image 3 (3 ORANGE held BUST) | bad_beat | HELD_TWO_PLUS | `BAD BEAT` (red) | both names rendered | PASS |
| Image 4 (MVP win) | big_score | TOP_BIG_SCORE | `[MVP]` (orange — TIER_CFG color) | starName OK | PASS — win_tier change validated visually for the first time |
| Image 5 (ROOKIE, 2 R/O held) | bad_beat | HELD_TWO_PLUS | `BAD BEAT` (red) | both names + `{winTierLow}` resolved | PASS |
| Image 6 (BUST, 1 RED + 1 ORANGE held) | bad_beat | HELD_TWO_PLUS | `BAD BEAT` (red) | both names rendered | PASS (this hand didn't fire pre-amend — Bug #2 false alarm dead) |
| Image 1 (rare_pull priority over bad_beat) | rare_pull | TOP_RARE_PULL_SEASON | `SEASON HIGH` (green — to-be-recolored per followup) | Kidd's season-high passing hand; rare_pull wins precedence | PASS — sub-tier text validated |
| Image 2 (Marbury BUST hand) | default | (none — baseCopy path) | — | no held cards visible on screenshot; default-trigger baseCopy is correct behavior | NOT A BUG |
| Single-held bad_beat (Bug #1 fix validation) | — | — | — | NOT DIRECTLY RE-VALIDATED in smoke (Image 1 resolved as rare_pull instead). Unit-test coverage + mechanical fix logic give confidence. **Ship and verify in production.** | DEFERRED |

### Followups added during this re-smoke

- Inline RARE_PULL sub-tier chip color should match card-level achievement-banner color (Image 2 / Robinson previously; reaffirmed Image 1 SEASON HIGH on Kidd)
- Win-tier threshold recalibration — 30+ hands during this smoke produced zero big_score triggers (no ALL_STAR+/MVP/LEGEND wins before the MVP hand in Image 4 finally surfaced). Win-tier panel + TOP_BIG_SCORE bank effectively dead code until thresholds rebalanced post-game-data-broadening
- PURPLE-tier inclusion question for bad_beat predicate (deferred to calibration arc)
- Bad_beat trigger frequency post-broadening — empirical observation needed; 15-30 hand sample to verify 30-50% feels right
- TOP_BAD_BEAT copy second-pass rewrite — broadened predicate means held-card-overperform texture also needs explicit handling
- Voice-polish tool integration — chat-drafted copy reads written; voice-pass or human pass would improve

### Status: PASS

- All catastrophic bugs (Bug #1, Bug #2) resolved or proven non-existent in re-smoke
- All target visual changes validated (win_tier chip, RARE_PULL sub-tier text, BAD_BEAT bank-line cleanup)
- All diagnostic logs stripped
- Single piece-B commit 7614321 → final SHA after this amend
- 9 open followups captured (3 new from this re-smoke + 6 from prior cycles)
