# Slate v2 Calibration

Per-sport simulation runs that gate production rollout of slate v2.

## When to run

Required between staging-flag-ON and production-flag-ON for each sport.
Re-run if any of these change:
- `slateSize`, `anchorCount`, `weightExponent` in adapter config
- Career FP formula on the SportAdapter
- Eligibility cutoff `n` (default 200)
- Exclusion list

## How

**Use `tsx` (not plain ts-node).** The slate-v2 simulator branch uses dynamic
imports that require ESM-aware loading. tsx handles this; plain ts-node may
fail on the slate-v2 branch's import.

**Run from a sport workspace** (`cd basketball && npx tsx ...`) — sport
`node_modules` are independent per CLAUDE.md.

```bash
npx tsx shared/tools/runSimulator.ts basketball 100000 --slate-v2 \
  > docs/superpowers/calibration/$(date +%Y-%m-%d)-basketball-slate-v2.json
```

## What to compare

Run a baseline (without `--slate-v2`) against current production for comparison:

```bash
npx tsx shared/tools/runSimulator.ts basketball 100000 \
  > docs/superpowers/calibration/$(date +%Y-%m-%d)-basketball-baseline.json
```

Diff the two JSON outputs:
- **Mean FP shift ≥ 10%** → recalibrate win-tier thresholds.
- **Roster-cost shift meaningful** → recalibrate `salaryCap` / `salaryCapMin` per sport (HARD CAP behavior unchanged; only numeric values move).
- **`bonusFPPerHand` baseline drop ≥ 30%** → adjust eligibility N or `weightExponent`. (When the slate restricts the bonus pool, fewer bonus players become drawable; if FP/hand falls disproportionately, the slate is excluding too many bonus-eligible players.)

**Green-light criteria:** If all metrics within tolerance (mean FP < 10% drift, roster cost steady, bonusFPPerHand stable) → green-light flag flip per sport; commit calibration summary.

## Known simulator quirks (from Task 22 implementation)

- **`slatePlayerDrawRate` field is currently tautological** — when `--slate-v2`
  is ON it always reports 1.0 (deal pool IS the slate by construction); when
  OFF it reports 0.0. Use the `slateV2` boolean directly, not this field. The
  metric will be redefined as "slate coverage" (fraction of slate players that
  appeared in any roster) in a future simulator iteration.
- **`tierFrequency` may report `{"WHITE": 1}` for all players** when a sport's
  `economyConfig.tierThresholds` aren't populated. Pre-existing simulator gap;
  the metric will populate properly once tier thresholds are surfaced through
  `getEconomy()`. For sports where tierThresholds are loaded, the metric works
  correctly.
- **Career FP is approximated by `projFp`** in the simulator (the average of
  per-game projections). Production uses true multi-season career FP via the
  adapter override. Slate composition will be structurally similar but not
  byte-identical to production.
- **Anchor count formula** in simulator is `min(10, floor(slateSize * 0.2))`.
  Production uses adapter-configured `anchorCount` (default 10). For typical
  slate sizes (50-90), the simulator and production match (both yield 10 anchors).

## Output

Save calibrated adapter config + summary as
`docs/superpowers/calibration/<date>-<sport>-calibration.md`. Commit before
flipping the production flag.

## Rollout sequence per sport

1. Implementation behind flag (default OFF).
2. CI green, full test suite passing.
3. Local QA with flag ON.
4. Staging deployment with flag ON in staging only.
5. **This calibration run** — required gate.
6. Beta runs on prod with flag OFF.
7. Beta concludes, data analyzed.
8. Production rollout per sport (one sport at a time, ~1-2 weeks apart).
9. Cleanup commit (~2 weeks after both sports stable on flag-ON).

## v1 manual verification checklist

Per the spec, before flipping flags ON in production, run a manual end-to-end
check locally with the flag ON. Two sports, two checks each (flag ON, then OFF
to verify byte-equivalence).

### Setup

Add to `basketball/.env.local`:
```
VITE_FEATURE_SLATE_V2_BASKETBALL=true
```

(Or `baseball/.env.local` for baseball.)

### Basketball flag-ON verification

```bash
npm run dev:basketball
```

Open http://localhost:5173/basketball/ and verify:

- [ ] `TodaysSlatePanel` renders on landing
- [ ] Panel auto-expanded on first visit; collapsed on second visit (same UTC day)
- [ ] Anchors section shows ~10 players with anchor badge
- [ ] Bonus section shows 3 players (matches `getTodaysStars()`)
- [ ] Countdown shows hours/minutes
- [ ] "See full slate" toggle reveals full ~60 players
- [ ] Click play → first hand draws cards only from today's slate (verify by comparing dealt names against the slate panel)
- [ ] Top Games surface (if accessible) still shows extreme historical hands from full pool
- [ ] No console errors

### Basketball flag-OFF verification

In `basketball/.env.local`, set `VITE_FEATURE_SLATE_V2_BASKETBALL=false` (or
delete the line). Restart dev server. Verify:

- [ ] No `TodaysSlatePanel` rendered
- [ ] Deal pulls from full pool — i.e., players outside today's slate appear
- [ ] No console errors

### Baseball verification

Same checklist with `VITE_FEATURE_SLATE_V2_BASEBALL` toggle and
`npm run dev:baseball`.

### Sport-isolation manual check

With basketball flag ON and baseball flag OFF, switch between the two sports
in the same browser session. Confirm:

- [ ] Basketball deals from slate
- [ ] Baseball deals from full pool
- [ ] Switching sports doesn't pollute the other's repeat-limit window or
      slate cache

### Verification result

Date: ____
Verified by: ____
Result: ____
Notes: ____
