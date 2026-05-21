# Design decisions

Long-form log of architectural and design decisions worth re-reading
when context resets. Newest entries first.

---

## 2026-05-21 — Calibration overhaul: win thresholds, sim parity, and the role of holds

The calibration workstream that landed across commits `5488615` →
`5e54b47` rebuilt the basketball threshold calibration end-to-end. It
started from a narrow goal — re-derive `winThresholds.json` against the
post-tier-filter resolve distribution — and grew, through repeated
parity audits, into a comprehensive sim-production reconciliation. By
the end the simulator was production-faithful enough that "what does
the sim measure" and "what does the game produce" are the same question
within sampling noise.

The methodology principle the workstream surfaced and made
non-negotiable: **calibration derives from measurement of the real
production pipeline, never from re-derivation against a parallel
implementation**. Every sim-production divergence found during this
workstream was treated as a calibration bug, not a sim shortcut. The
rule is durable; it should apply to every future tuning pass.

Four distinct sim-production divergences were caught and closed:

1. **Position-aware roster deal.** The sim was using positional slots
   for basketball, but production had been moved to all-FLEX
   (basketball has no position-unique stats, so positional structure
   is pure overhead). The sim was promoted to `positionAware: false`
   alongside the production fix.

2. **Per-season FP-sum proxy for career FP.** The sim approximated
   `getCareerFPById` with a single-season sum across playable logs.
   Production uses last-two-seasons × 2 weight across the RAW
   (unfiltered) logs map. The fix extracted production's formula into
   `basketball/src/adapters/careerFp.ts:computeBasketballCareerFp` —
   `SportAdapter.getCareerFPById` and the sim both call it. Same
   pattern was later applied to the FP formula
   (`basketball/src/adapters/fantasyPoints.ts`) and the badge
   computation (`basketball/src/adapters/badges.ts`).

3. **Tier-aware log filter.** Production's `pickBiasedLog` applies
   `min > 0` for RED/ORANGE/PURPLE cards and `min ≥ 10` for
   BLUE/GREEN/WHITE. The sim was applying `min ≥ 10` uniformly at
   season-load. The fix was to drop the season-load pre-filter
   entirely and call `resolveCards` directly, letting production's
   filter run inline at resolve time. Spot-check measured 0.22%
   sub-10-min surfacing rate for PURPLE cards in the sim — matching
   the production rate.

4. **Daily bonus.** Production picks 3 slate-eligible
   ORANGE/PURPLE/BLUE/GREEN players per UTC day and adds +20/+10/+5
   FP additive on top of the resolved FP. The sim was passing no
   `dailyBonusMap` to `resolveCards`. Plumbing in
   `shared/utils/dailyBonus.buildDailyBonusMap` (production's helper,
   no reimplementation) shifted measured hand FP up by ~2.7 FP
   cross-season and closed the slate-vs-full-pool calibration gap to
   within 1 FP at ALL_STAR and LEGEND.

The shipped per-season thresholds are calibrated against this fully
production-faithful pipeline. For 29 seasons × 10k hands the sim hits
all six tier-share target bands (BUST 30-40%, ROOKIE 35-40%, STARTER
18-25%, ALL_STAR 3-5%, MVP 1-2%, LEGEND 0.1-0.3%) cleanly, with no
marginal misses and every adjacent-tier gap ≥ 5 FP. The active 2425
thresholds are ROOKIE 173 / STARTER 203 / ALL_STAR 233 / MVP 248 /
LEGEND 277.

A parallel investigation looked at whether realistic player hold
strategies shift the FP distribution enough to warrant calibrating
against a particular strategy. The answer was that they don't. Three
realistic strategies (`auto_press`, `premium_hold`, `value_hold_strict`
with the tight 1.5× tier-median ratio threshold + top-3 cap) produced
cross-season mean FP within ±0.3 FP of each other and tier shares
within ±0.2pp on every tier. The loose `value_hold` (hold every card
with above-median ratio) underperformed by ~3.7 FP, but only because
it held ~72% of the dealt roster and starved the unheld slots of cap
headroom — a self-handicapping artifact of the rule shape, not a
strategic finding.

The framing this produced — and the one that should guide future
mechanic design — is that **the hold mechanic in this game is engagement
infrastructure, not skill expression**. The slate composition does the
skill work upfront by pre-filtering tier quotas and capping each tier
by career FP; the deal pipeline then plays salary²-weighted random
within those rails. Whatever the player picks to hold and what the
redraw produces converge on roughly the same statistical distribution.
This is the same pattern slot machines, blackjack, and baccarat have
used for decades — visible agency, structural equivalence. The agency
matters for feel; calibration treats every hand as a single sample
from the same distribution.

Skill in this game lives at the meta-game level: which season to
play, which day to ride a hot daily-bonus rotation, whether to chase
a streak through bust risk, when to walk away from a session. Those
are real choices with real expected-value differences. Hand-level
hold-or-redraw is decorative within a single hand.

The RTP back-of-envelope against the locked tier shares × current
multiplier schedule (0.5 / 1.5 / 3 / 8 / 50) lands the base RTP at
~87.4%, comfortably inside the healthy band. Layering on the streak
multipliers (1.3× / 1.7× / 2.5× at 3-/5-/10-win runs) at the
measured ~65% per-hand win rate adds roughly a 1.16× boost to the
winning-tier slice, pushing total RTP to ~101%. That is meaningfully
outside the healthy 88-95% band. The dominant pressure is LEGEND 50×
combined with the streak boost: LEGEND alone contributes ~12pp of
RTP at a 0.2% hit rate, and is sensitive to small drift (0.3% LEGEND
share would add another ~5pp). Tier shares + thresholds are tight;
the multiplier schedule is the lever. **Adjusting the multiplier
schedule is a separate workstream** — not gated on this calibration
landing, but worth taking before any production rollout that would
absorb the RTP exposure at scale.

Open items at the end of this workstream:
- **Stamps smoke test** is pending (separate worktree
  `feat/team-stamps`, untouched throughout calibration). Merges
  before stamps smoke.
- **Multiplier schedule decision** is open. Reducing LEGEND from 50×
  or softening streaks (e.g., 1.2/1.5/2.0) would land RTP closer to
  92-95%; either is a small numeric edit, but both need a product
  call.
- **Sim Migration B** is deferred — the shared sport-agnostic
  `shared/tools/runSimulator.ts` still reimplements the deal loop
  rather than calling `generateRoster` directly (per CLAUDE.md
  sim-production parity rule). The basketball-local sim was deleted
  in Migration A (`55a5715`), so the parity surface area shrank, but
  the shared sim's own divergence remains as acknowledged tech debt.
  Tracked, not blocking.

The calibration tools that remain in the tree as ongoing infrastructure
are `slateAwareThresholds.ts` (canonical threshold derivation),
`slateAwareCalibrate.ts` (slate vs full-pool comparison),
`deriveThresholds.ts` (full-pool baseline), and `dumpFpDistribution.ts`
(per-season FP shape dump). Anything that should never reimplement
production logic — FP formula, badge math, career FP, daily bonus —
lives in pure helpers that both `SportAdapter` and the sim import.
That arrangement is the load-bearing decision; the threshold numbers
themselves will move as the game evolves, but the parity discipline
should not.
