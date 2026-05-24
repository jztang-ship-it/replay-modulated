# Smoke-data analysis — 2026-05-25

Investigation of the 2026-05-24 smoke session's "30+ hands, zero
`big_score` triggers" symptom. Reframes the question that was originally
queued as a calibration-arc data-collection task ("re-derive thresholds
against the broader game-log dataset"). The premise behind that task —
that the prior arc calibrated against a top-40% subset and a broader
dataset would shift the FP distribution upward — turned out to be
incorrect on multiple counts. The actual production data is the
authoritative input for diagnosing the symptom; that's what this note
captures.

Companion to `docs/calibration-overhaul-log.md` (prior calibration arc)
and `docs/open-followups.md` (which has a "Win-tier threshold
recalibration" entry that pre-dates this analysis and is the entry to
update or close tomorrow).

## What was queried

Read-only SELECT against `hand_log` (defined `supabase/migrations/001_player_tables.sql:24`)
via service-role REST. Last 36 hours, `sport = 'basketball'`,
`ORDER BY created_at DESC LIMIT 200`. Returned 78 rows from a single
`player_id`, all on 2026-05-24 between 12:17 UTC and 19:31 UTC.

That is the full smoke session — well past the "30+" the
smoke-test artifact (`docs/smoke-tests/2026-05-24-s1-slot-split-real-copy-smoke.md`)
described.

**Every one of the 78 hands was season `9899`**, not 2425. The
threshold numbers cited in the smoke-followup framing (ROOKIE 173 /
STARTER 203 / ALL_STAR 233 / MVP 248 / LEGEND 277) are the **2425**
thresholds. The **9899** thresholds are:

| Season | ROOKIE | STARTER | ALL_STAR | MVP | LEGEND |
|---|---|---|---|---|---|
| 9899 (what played) | 168 | 196 | 224 | 238 | 266 |
| 2425 (smoke-note assumed) | 173 | 203 | 233 | 248 | 277 |

`big_score` (per `shared/utils/triggerEvaluation.ts:116`) fires at
ALL_STAR+. Tonight's actual bar was **224**, not 233.

## Observed distribution (n=78, season 9899)

```
FP: min 114.5 | p25 162.2 | p50 175.4 | mean 176.4 |
    p75 192.5 | p90 208.0 | p95 214.3 | max 251.0
```

Server-recorded tier shares vs the calibration target bands
(`basketball/src/tools/slateAwareThresholds.ts:66-69`):

| Tier | Observed | Target | Verdict |
|---|---|---|---|
| BUST | 33.3% (26/78) | 30–40% | ✓ in band |
| ROOKIE | **50.0% (39/78)** | 35–40% | ✗ **+10pp over ceiling** |
| STARTER | **12.8% (10/78)** | 18–25% | ✗ **−5.2pp under floor** |
| ALL_STAR | 1.3% (1/78) | 3–5% | ✗ −1.7pp under (within n=78 noise) |
| MVP | 2.6% (2/78) | 1–2% | ✗ +0.6pp over (within n=78 noise) |
| LEGEND | 0/78 | 0.1–0.3% | sampling limit (~0.15 expected) |

`big_score` combined (ALL_STAR + MVP + LEGEND) = **3 hands = 3.85%**,
vs target ~4–7% midpoint ~5.5%.

Top hands (chronological): MVP at hand 2 (251 FP at 12:18:20),
then a 57-hand stretch with no MVP/LEGEND and only one borderline
STARTER (214 FP), then MVP at hand 65 (242 FP at 19:25:15 — almost
certainly Image 4 in the smoke artifact), then ALL_STAR at hand 71
(226 FP at 19:28:23).

## Verdict on the user's hypotheses

**H5 — bad_beat masking big_score: FALSE, ruled out by predicate logic.**

`shared/utils/triggerEvaluation.ts:116-122` requires
`winTier ∈ {ALL_STAR, MVP, LEGEND}` for `big_score`; `:160` requires
`winTier ∈ {BUST, ROOKIE}` for `bad_beat`. Mutually exclusive on the
same field. Can't co-fire on the same hand.

(However, `rare_pull` is checked first — `:95-113` — and DOES preempt
`big_score`. `hand_log` doesn't capture which trigger fired, only the
winTier, so this analysis can't measure rare_pull preemption rate
from this data alone.)

**H4 — bad-luck variance: MOSTLY TRUE for the "30+ without big_score" symptom.**

There is a real 57-consecutive-hand stretch (hand 7 → hand 64) with
no MVP/LEGEND. The intermediate ALL_STAR (226 FP) didn't arrive until
hand 71. Under `Bin(57, p=0.055)`, `P(0 successes) ≈ 4.0%` — rare but
not weird-rare. A long cold stretch on top of a slightly-cold
underlying rate fully explains the smoke-followup's "30+ no
big_score" framing. The user's day started hot (251 FP MVP on hand 2)
then went cold for ~57 hands before recovering.

**H3 — real distribution drift: PARTIALLY TRUE, localized to 9899 thresholds.**

The 9899 ROOKIE-STARTER boundary sits at 196 FP, but p75 of observed
hands is 192.5 — the calibrator put STARTER's floor right above the
bulk of the actual distribution. Result: ROOKIE band sweeps up 50%
(target 35–40%); STARTER only catches 12.8% (target 18–25%). The
~10pp excess in ROOKIE matches roughly the ~5pp deficit in STARTER
plus compression at the top.

This is **threshold-fit drift on the 9899 season specifically**, not
a `generateRoster` change, not a data change, not a top-40%-vs-broader
issue. Two candidate explanations:

- (a) The 9899 sim shares were within tolerance during the prior arc,
  but tonight's n=78 real-prod sample landed in the unlucky tail of
  the simulated distribution.
- (b) Something between the calibration sim and production (slate
  seeding, daily-bonus rotation, RNG seed, or per-season pool
  differences) is shifting the 9899 production distribution downward
  relative to what the sim measured.

(a) and (b) are distinguishable with more samples — either a fresh
smoke on 9899, or a sim re-run of 9899 with the same seed strategy
the prior arc used, or both.

## Things worth knowing before deciding what to do

1. **Why was the entire session 9899?** The user_id played 78
   consecutive hands of one season. Was this a deliberate
   season-select, or does production lock to 9899 for some reason
   (FTUE? reel state? cache?). The 9899 dataset is the smallest in
   the 29-season collection (10,215 logs vs ~20-25k typical — 9899
   was the lockout-shortened 50-game season). Smaller pool may
   amplify per-day slate variance, which may shift FP distribution
   relative to the sim's day-rotated average.

2. **No record-badge / rare_pull data in `hand_log`.** Record-badge
   hits → `rare_pull` → preempts `big_score`. If many would-be
   ALL_STAR+ hands also happened to be record/career/season top-10
   games on the anchor card, they'd route to rare_pull and never fire
   big_score, even though the hand cleared 224 FP. The PostHog
   `gameplay/hand_resolved` event captured all 78 hands and has
   richer props (`shared/analytics/useGameAnalytics.ts:60`); querying
   PostHog (or adding a `trigger` column to `hand_log`) would
   disambiguate.

3. **bad_beat trigger frequency on this same dataset is also worth
   checking.** BUST+ROOKIE was 83.3% of hands tonight, and the
   broadened `≥1 R/O held` predicate (landed 2026-05-24 amend) may
   have shifted bad_beat firing rate from the smoke-note target of
   30-50% in either direction. Out of scope tonight; related to the
   open followup "Bad_beat trigger frequency post-broadening"
   (`docs/open-followups.md`).

## Suggested framing for tomorrow's session

The original "broaden the dataset and re-derive thresholds" task was
queued on a chain of reasoning whose first link (top-40% filter) didn't
match reality. Specifically:

- The slate-aware tools (`basketball/src/tools/slateAwareThresholds.ts`,
  `slateAwareCalibrate.ts`) don't apply a literal "top-40%" filter.
  They apply MIN_GAMES≥30 (drops 2-13% of players per season) plus
  TIER_POOL_CAPS={BLUE:40, GREEN:25, WHITE:20} (caps non-premium
  tier pools to top-N by career FP). Both mirror production
  (`basketball/src/adapters/SportAdapter.ts:290, 322`), so removing
  them in calibration would diverge from production rather than
  converge.
- The prior arc explicitly enshrined sim-production parity as a
  non-negotiable methodology principle
  (`docs/calibration-overhaul-log.md:18-25`). A counterfactual sim
  with the caps removed would not be a calibration; it would be a
  measurement of a different system.
- Tonight's smoke fired on 9899, not 2425. The "broaden against
  29-season dataset" plan would not have surfaced the 9899-specific
  threshold fit issue regardless of how it was run.

**Counterfactual sim explicitly NOT run for those reasons.**

The three unresolved questions tomorrow should pick from:

1. **Is the 9899 threshold fit drifted from the prior arc's sim, or
   did n=78 land in a tail?** Re-run `slateAwareThresholds.ts` for
   9899 specifically (or all 29 seasons but focus on 9899), check
   whether sim shares match the published 9899 cuts. If sim matches
   spec but production drifts, dig into what's different between sim
   and prod for that season. If sim itself shows the same
   miscalibration, the 9899 thresholds in `winThresholds.json` need
   recomputing or the prior arc's "29/29 seasons hit target bands"
   claim is wrong somewhere.
2. **rare_pull preemption rate on big_score-eligible hands.** Query
   PostHog `hand_resolved` events (or instrument `hand_log` with a
   `trigger` column going forward) to measure how often
   ALL_STAR+ hands route to rare_pull instead of big_score. If
   substantial, the smoke artifact's "big_score is dead code" framing
   is partially explained by routing, not by tier-share drift.
3. **bad_beat frequency on the same 78-hand dataset, post-broadening.**
   Needs the held-card detail not in `hand_log`; either query PostHog
   `card_held` events or instrument the trigger eval to record which
   trigger fired per hand. Related followup already open.

Decision to make: do any/all of these warrant a dedicated session, or
should one of them block a larger calibration question first.

## What this session did NOT do

- No sim run.
- No threshold changes; `winThresholds.json` untouched.
- No code edits to triggers, predicates, or eval logic.
- No PostHog query (would benefit from one — flagged above).
- No `hand_log` schema change (instrumenting `trigger` was flagged
  but not done — that's a decision for tomorrow).
- No update to `docs/open-followups.md` "Win-tier threshold
  recalibration" entry; that entry's framing is invalidated by this
  analysis but the edit is left for tomorrow's review.
