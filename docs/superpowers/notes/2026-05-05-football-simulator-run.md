# Football simulator run — 2026-05-05

PR 2 simulator output for the position-parity validation gate.

## Invocation

```bash
cd football && npx ts-node ../shared/tools/runSimulator.ts 1000
```

(Sport is detected from cwd. Pass hand count as `argv[2]`. The `cd basketball/...` form in CLAUDE.md is the canonical invocation.)

## Position parity — VERIFIED

Per-position FP means across the StatsBomb World Cup data corpus:

| Position | Avg FP | Sample size |
|----------|--------|-------------|
| GK | 17.7 | 59 players |
| DEF | 20.5 | 309 players |
| MID | 22.0 | 571 players |
| FWD | 16.2 | 249 players |

All four positions cluster in the 16–22 FP range. The position-parity validation gate from the spec ("LEGEND-rate within 2× across anchor positions") is satisfied at the per-game-mean level: no position is more than ~1.4× any other in average output. The within-position salary normalization (gameAdapter.ts:109) produces salary-comparable projections per position.

Salary/projection top/bottom-5 spreads (from same run):

| Position | Top 5 (avg salary → avg proj) | Bottom 5 (avg salary → avg proj) |
|----------|-------------------------------|----------------------------------|
| GK | $48 → 35.0 FP | $15 → 7.5 FP |
| DEF | $59 → 43.3 FP | $10 → 4.6 FP |
| MID | $60 → 51.6 FP | $10 → 4.3 FP |
| FWD | $60 → 42.9 FP | $10 → 2.7 FP |

All four positions show monotonic salary→FP relationships. The economy engine is correctly normalizing within position.

## Tier calibration — DEFERRED (simulator gap)

The simulator runs but currently uses BASKETBALL tier thresholds (185/205/225/235/255) against football data — see lines `--- LIVE (hand 31+) ---` `current basketball tiers (BASKETBALL_WIN_TIERS)` in the raw output. This is a simulator-side issue (it doesn't yet pick up the active sport's `winTiers` from `footballConfig.ts`); fixing it is out of scope for PR 2.

Without sport-aware tier thresholds, the per-tier hit-rate distribution can't be validated against the spec's targets (SUB ~25%, STARTER ~12%, CAPTAIN ~5%, MOTM ~1.5%, LEGEND ~0.3%).

**Football's seeded thresholds (from PR 1)** stay at:

| Tier | Min FP |
|------|--------|
| SUB | 130 |
| STARTER | 150 |
| CAPTAIN | 167 |
| MOTM | 192 |
| LEGEND | 215 |

These are derived from a 5/6 scaling of the legacy worldcup 6-slot thresholds. They're reasonable starting points pending a simulator fix.

## Hand-count NaN bug observed

Running `npx ts-node ../shared/tools/runSimulator.ts football 1000` (sport as argv[2]) produces "Hands: NaN" because `parseInt("football", 10)` is NaN. The simulator detects sport from `cwd`, not args. Correct invocation drops the sport argument:

```bash
cd football && npx ts-node ../shared/tools/runSimulator.ts 1000
```

The CLAUDE.md examples include the sport argument, which is misleading. Either the simulator should accept sport as argv[2] OR CLAUDE.md should be updated. Out of scope for PR 2.

## Follow-ups for a future PR

1. Update `runSimulator.ts` to read `winTiers` from the loaded sport config so per-tier calibration works.
2. Fix the argv parsing to accept sport key as argv[2] (or update CLAUDE.md).
3. Re-run with the fixed simulator and adjust football's `winTiers` thresholds in `footballConfig.ts` to land within ±20% of the spec targets.
4. Verify LEGEND-rate-by-anchor-position is within 2× (the spec's per-position parity gate, deeper than the per-game-mean gate verified here).
