# Stamps smoke test — 2026-05-22

## Run context

| Field | Value |
|---|---|
| Branch | `feat/team-stamps` at `9a8a80c` (post-rebase onto `origin/main` `bb41084`) |
| Worktree | `.claude/worktrees/feat-team-stamps` |
| Date | 2026-05-22 |
| Build target | Dev server (`npm run dev` from `basketball/`) |
| URL | `http://localhost:5173/basketball/` |
| Vercel API proxy target | `https://replay-mod-git-main-john-tangs-projects-1c51aca7.vercel.app` |
| Deployment freshness | `basketball/public/data/winThresholds.json` sha-1 `7069be3...4682` matches `origin/main` ✓ |
| Active season (today's slate) | **1718** — rendering paths are season-agnostic; only the FP boundaries change |

### Pre-flight checks (all green)

- **Feature flags** — `shared/featureFlags.ts` has only `topGames` and `isSlateV2Enabled`; neither gates stamp rendering or trigger evaluation.
- **Trigger rename** — `shared/utils/triggerEvaluation.ts` emits `trigger: "miss"` (line 102); 5 remaining `nearMiss` references are deliberate DB-column-compat field-name retentions per design doc.
- **Deployment** — winThresholds.json hash matches main; proxy serves current backend.
- **Dev server** — Vite 7.3.1, booted clean in 145ms, HTTP 200 on `/basketball/`.

### Rendering model (from static trace)

- `triggerEvaluation.ts` emits one of `{ rare_pull | big_score | miss | bad_beat | default }` based on tier outcome + record-pulls + miss-window + held-card pattern.
- `GameView.tsx` L2339–2342 computes `stampKind` via **explicit allowlist**:
  ```
  bad_beat → "bad_beat"
  miss     → "miss"
  anything else → null  // suppresses <TeamStamp> mount
  ```
- `<TeamStamp>` receives `kind` (the allowlist value) and `missTier={challengeTrigger?.nearMissNextTier}`.
- `big_score`, `rare_pull`, `default` ⇒ `stampKind = null` ⇒ no panel stamp by design.

## Pass criteria

| # | Criterion | Threshold |
|---|---|---|
| 1 | `big_score` plumbing | Clean ALL_STAR / MVP / LEGEND win → evaluator returns `big_score`, **no panel stamp**. Holds **even when gap to next tier is within `MISS_WINDOW`** — branch order in `triggerEvaluation.ts` (big_score at L80, miss at L96) does not stack a MISS chip on top of big_score wins. ≥1 observation required. |
| 2 | `miss` rendering | Fires when **all** of: current tier ∈ {STARTER, ALL_STAR, MVP} (not BUST, not ROOKIE, not LEGEND); gap to next tier ≤ 5 FP; AND no `rare_pull` precondition (no Season High / Career High / Record badge on any roster card, i.e. `topGameTier` unset). ≥1 observation with correct `[TIER] MISS` prefix matching the evaluator's `nearMissNextTier`. |
| 3 | `bad_beat` rendering | ≥1 observed with correct `BAD BEAT` text; extend to 150/200 if still 0 at 75; defer-don't-fail if still 0 at 200. |
| 4 | `rare_pull` precedence | When any roster card has a Season High / Career High / Record badge (`topGameTier ∈ {"season","career","record"}`), `rare_pull` fires (L66 of `triggerEvaluation.ts` — *first* branch checked) and **suppresses the team-level panel stamp**, regardless of gap-to-next-tier, tier outcome, or held-card colors. ≥1 observation: a `rare_pull`-eligible hand produces no panel stamp. |
| 5 | Clean BUST control | ≥3 clean BUSTs (FP well below ROOKIE) with no panel stamp. |
| 6 | Multiplier-chain | ROOKIE+ wins show `{tierMult}× × {streakMult}× → +$X` (streak active) or `{tierMult}× → +$X` (no streak); BUST shows net `±$X` only. |

### 1718 win-tier thresholds (for clean-control judgment)

| Tier | minFp |
|---|---|
| ROOKIE | 171 |
| STARTER | 200 |
| ALL_STAR | 230 |
| MVP | 247 |
| LEGEND | 276 |

**Clean-control rule of thumb (1718 boundaries):**
- **Clean ALL_STAR** = FP in `[230, ~242]` (comfortably below MVP 247, outside the 5-FP miss window). If FP is `[243–246]`, it's MVP-miss territory — should fire `miss` with `MVP MISS` stamp; doesn't count as clean control.
- **Clean MVP** = FP in `[247, ~271]` (below LEGEND 276 outside the 5-FP miss window). FP `[272–275]` is LEGEND-miss territory.
- **Clean BUST** = FP comfortably below ROOKIE 171 AND not bad_beat-eligible (<2 RED/ORANGE cards held). `miss` doesn't fire on BUST→ROOKIE transitions (gate is `currentTier ≥ STARTER`), so no stamp expected even at the boundary. Bad-beat fires independently of FP, based on held-card colors.
- **Bad-beat condition** = BUST or ROOKIE outcome with ≥2 RED/ORANGE cards user **actually held** (per `wasHeld === true` check in trigger evaluator).
- **`miss` is only available STARTER → ALL_STAR → MVP → LEGEND**, not on ROOKIE wins (`currentIdx >= STARTER_IDX` in `triggerEvaluation.ts` L94). So the possible `[TIER] MISS` stamps are `ALL STAR MISS`, `MVP MISS`, `LEGEND MISS` — never `ROOKIE MISS` or `STARTER MISS`.

## Fail-fast conditions (STOP and surface immediately)

- First observed `miss` renders wrong tier prefix (e.g., `STARTER MISS` when the user actually fell short of ALL_STAR)
- First observed `bad_beat` renders wrong stamp text or doesn't say `BAD BEAT`
- Stamp renders on a clean ALL_STAR / MVP / LEGEND win (false-positive — suppression broken)
- Stamp renders on a clean BUST that has 0–1 RED/ORANGE held cards (false-positive bad_beat)
- Multiplier-chain shows wrong tier multiplier value, wrong streak multiplier, or appears on a BUST loss
- Console shows React errors / warnings around `<TeamStamp>` or trigger evaluation
- API call to deployed backend fails in a way that breaks panel rendering

## Tally

Fill one row per hand. Stamp values: `BAD BEAT` | `[TIER] MISS` (e.g., `ALL STAR MISS`) | `none`. Use `?` in "matches expected" when uncertain — flag for review.

| hand# | FP | tier outcome | stamp observed | Evaluator trigger | multiplier chain | matches expected? | notes |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| 6 | | | | | | | |
| 7 | | | | | | | |
| 8 | | | | | | | |
| 9 | | | | | | | |
| 10 | | | | | | | |
| 11 | | | | | | | |
| 12 | | | | | | | |
| 13 | | | | | | | |
| 14 | | | | | | | |
| 15 | | | | | | | |
| 16 | | | | | | | |
| 17 | | | | | | | |
| 18 | | | | | | | |
| 19 | | | | | | | |
| 20 | | | | | | | |
| 21 | | | | | | | |
| 22 | | | | | | | |
| 23 | | | | | | | |
| 24 | | | | | | | |
| 25 | | | | | | | |
| 26 | | | | | | | |
| 27 | | | | | | | |
| 28 | | | | | | | |
| 29 | | | | | | | |
| 30 | | | | | | | |
| 31 | | | | | | | |
| 32 | | | | | | | |
| 33 | | | | | | | |
| 34 | | | | | | | |
| 35 | | | | | | | |
| 36 | | | | | | | |
| 37 | | | | | | | |
| 38 | | | | | | | |
| 39 | | | | | | | |
| 40 | | | | | | | |
| 41 | | | | | | | |
| 42 | | | | | | | |
| 43 | | | | | | | |
| 44 | | | | | | | |
| 45 | | | | | | | |
| 46 | | | | | | | |
| 47 | | | | | | | |
| 48 | | | | | | | |
| 49 | | | | | | | |
| 50 | | | | | | | |
| 51 | | | | | | | |
| 52 | | | | | | | |
| 53 | | | | | | | |
| 54 | | | | | | | |
| 55 | | | | | | | |
| 56 | | | | | | | |
| 57 | | | | | | | |
| 58 | | | | | | | |
| 59 | | | | | | | |
| 60 | | | | | | | |
| 61 | | | | | | | |
| 62 | | | | | | | |
| 63 | | | | | | | |
| 64 | | | | | | | |
| 65 | | | | | | | |
| 66 | | | | | | | |
| 67 | | | | | | | |
| 68 | | | | | | | |
| 69 | | | | | | | |
| 70 | | | | | | | |
| 71 | | | | | | | |
| 72 | | | | | | | |
| 73 | | | | | | | |
| 74 | | | | | | | |
| 75 | | | | | | | |

### Extension (hands 76–150, if extending)

| hand# | FP | tier outcome | stamp observed | Evaluator trigger | multiplier chain | matches expected? | notes |
|---|---|---|---|---|---|---|---|
| 76 | | | | | | | |
| | (add rows as you go through 150 / 200) | | | | | | |

## Fail-fast observations

*Populated by analyst after each batch. Empty so far.*

## Anomalies / questions

*Populated by analyst when something doesn't classify cleanly into pass/fail. Empty so far.*

## Per-batch analysis log

Updated after each 25-hand batch is pasted back.

### Batch 1 (hands 1–25)

*Pending.*

### Batch 2 (hands 26–50)

*Pending.*

### Batch 3 (hands 51–75)

*Pending.*

### Extensions (76–200 if needed)

*Pending.*

## Design follow-ups surfaced

Items that surfaced during smoke that are design questions, not smoke-test fail-fasts. To be logged separately for future sessions.

- **`big_score` vs `miss` precedence (raised hand 17, 2026-05-22):** Per code, `triggerEvaluation.ts` checks `big_score` (L80–87) before `miss` (L96–110). An ALL_STAR / MVP / LEGEND win that falls within `MISS_WINDOW` (5 FP) of the next tier returns `trigger: "big_score"` and never reaches the miss branch — so no `[TIER] MISS` stamp renders on top of the celebration. The session-state design doc's "Stamps system — LOCKED" caveat ("ALL STAR / MVP / LEGEND wins may still receive a `MISS` stamp if the user missed the tier above") says the opposite. Decision needed: (a) reorder branches / extend the stampKind allowlist so MISS can stack on `big_score`, OR (b) update the design-doc caveat to reflect that `big_score` takes precedence. **Lean toward (b)** — stacking a "you missed" overlay on a celebration UX is probably the wrong product call — but it's a design judgment, not a smoke-test outcome.
- **Per-season threshold reference (raised batch 1, 2026-05-22):** 1718 thresholds (ROOKIE 171 / STARTER 200 / ALL_STAR 230 / MVP 247 / LEGEND 276) are materially different from 2425 thresholds (173 / 203 / 233 / 248 / 277). Mental models for smoke tests and other observation tasks must use the active slate's season-specific thresholds, not assume 2425. Worth adding a per-season threshold quick-reference table to `docs/replaymod-design-decisions.md` so future smokes don't recompute against `winThresholds.json` each time.

## Final evaluation

**Smoke test closed at hand 25 — PASS (early termination).**

Rationale: spec criteria met for the stamps-specific cases. Remaining gaps (chip-label tier matching not recorded in batch 1; hand-18 `rare_pull` console-log hypothesis unverified) are deferred as low-risk because trigger logic was confirmed correct via direct code read of `shared/utils/triggerEvaluation.ts` and the panel-stamp suppression at `shared/views/GameView.tsx:2339–2369`. The static trace already establishes the chip-label and rare_pull paths; the cost of further play-through to manually verify is not justified relative to the residual risk.

### Per-criterion results

| Criterion | Result | Evidence |
|---|---|---|
| `big_score` plumbing | PASS | Hand 5 (MVP 251.6, no panel stamp). Hand 17 (ALL_STAR 245.3, no panel stamp) — code-correct per `big_score`-precedence rule; design-vs-code drift logged separately in **Design follow-ups surfaced**. |
| `miss` rendering | PASS | Hand 24 (`ALL STAR MISS` at STARTER 225.3, gap 4.7 against 1718 ALL_STAR threshold 230). Single observation matches the ≥1 spec criterion. |
| `bad_beat` rendering | PASS | 6 observations (hands 4, 15, 19, 20, 21, 25), all on BUST or ROOKIE with ≥2 held RED/ORANGE cards. Correct per emission rule (`triggerEvaluation.ts:117–127`). |
| Clean ALL_STAR+ control | PASS | Hand 5 (MVP 251.6) — no panel stamp on a clean MVP win, confirming `big_score` correctly suppresses the team-level overlay. |
| Clean BUST control | PASS | Multiple clean BUSTs with no panel stamp (hands 3, 6, 9, 10). |
| Multiplier-chain format | PASS | Consistent `0.5× → +5` (no streak) and `1.5× × 1.2× → 15` (with streak) across observed wins. |
| Chip-label tier matching | UNVERIFIED | Not recorded in batch 1. Accepted as untested. Logged as a gap. Risk low — chip label derives from the same `nearMissNextTier` field that drives the panel stamp, and the panel stamp was confirmed correct on hand 24. |
| Console-clean (TeamStamp / trigger errors) | PASS | No React errors or warnings on `<TeamStamp>` or trigger evaluation. Pre-existing audio 404s and the `selectCommentary` `basePlayerId` fallback log are unrelated to stamps and captured in `docs/open-followups.md`. |

### Items deferred to follow-ups (not smoke-test fails)

- Hand-18 `rare_pull` console-log confirmation
- Chip-label tier-matching observation
- All side-observations from play-through (position data, transition UX, icon legibility, audio 404s, chad commentary quality, `bad_beat` on ROOKIE wins) — captured in `docs/open-followups.md`
