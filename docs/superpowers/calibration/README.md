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
- **Bonus-player draw rate < 30%** → adjust eligibility N or `weightExponent`.

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
`docs/superpowers/calibration/<date>-<sport>-slate-v2.md`. Commit before
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
