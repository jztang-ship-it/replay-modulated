# Boss Output Contract v1 (definition only)

The boundary the daily-boss generator exposes to its consumers. **Consumers are
the doc's undesigned social rails — out of scope here.** This defines the shapes
and the reference materializers (`basketball/src/tools/bossContract.ts`) and stops
before building any consumer.

`BOSS_CONTRACT_VERSION = "boss-contract-v1"`.

## (1) Identity is split from the daily instance

- **`BossIdentity` — immutable.** The curated team-season identity + its nominal
  five (display labels), stable across days; changes only when the bank changes.
  `{ identityId, seasonCode, teamCode, eraId, tier, display, flavor, starters[{name,pos}], bankVersion }`.
  Carries **no FP and no game pools** — it is identity, not outcome.
- **`BossDailyInstanceSeed` — date+slot keyed.** One per `${date}|${slot}|${identityId}`.
  References an identity; carries the seed needed to regenerate. See (3).

## (2) The instance projects to a challenge with a NON-HUMAN sender — same receive path

A daily instance is presented as a challenge through the **existing** path
(`shared_challenges` → `/api/challenge/[id]` → `ChallengeLandingScreen`). No
parallel path. `toSharedChallengeRow` maps the sender-facing projection onto the
existing columns:

| existing column | boss value |
|---|---|
| `challenge_id` | `instanceId` (`date|slot|identityId`) |
| `challenger_name` | boss `display` ("Banner 18") |
| `share_headline` | boss `flavor` |
| `target_fp` | `totalToBeat` |
| `initial_roster` | `{ cards: presentedFive }` (existing snapshot shape) |
| `sport` / `season` | sport / identity season |
| `trigger_type` | `"boss"` |

**The only added field is `sender_kind` (`"boss"`; default `"player"` for human
challenges)** — the marker that tells the landing to present an authored boss
identity rather than a person. **`isRealName` is untouched**: it stays the
player-name gate (e.g., for `best_user_name` on the leaderboard); the boss name
flows through `challenger_name` as-is, distinguished only by `sender_kind`.

> Integration note (for the social-rail build, not done here): add a nullable
> `sender_kind text default 'player'` column to `shared_challenges`, plus the
> boss-provenance columns (`boss_identity_id`, `boss_bank_version`, `tough_day`).
> No new table, no new endpoint.

## (3) Persist SEED + PARAMS, not the rolled blob

`BossDailyInstanceSeed.seedParams = { mode, band:[lo,hi], k, pLo, pHi }` plus
`{ date, slot, identityId, bankVersion }` is everything needed to **deterministically
regenerate** the roll (`rollBoss` is seeded by `sha256(date+slot+team+attempt)`).
The rolled result — presented five + total — is **derived on demand** by
`projectSenderFacing(boss, seed)`, **never stored**. Two materializations of the
same seed are byte-identical (pinned by test). This keeps instances tiny and the
output reproducible/auditable from the seed alone.

## (4) Bank version is stamped per instance

`BossIdentity.bankVersion` and `BossDailyInstanceSeed.bankVersion` carry the bank's
`_meta.version` (`"v1"`). Regeneration must use the **same** bank version that
produced the instance (identity/starters can change across bank versions), so the
stamp pins reproducibility across bank edits.

## (5) Sender-facing projection exposes ONLY these fields

`BossSenderFacing` — the **only** surface a consumer may read:

```
{ sender: { kind: "boss", name, flavor },
  totalToBeat,
  presentedFive: [{ name, pos, fp }] × 5,
  toughDay }
```

**Deliberately NOT exposed** (generator internals, dropped at this boundary):
rejection attempts / `K`, the band `[lo,hi]`, ceiling / floor, `route` (daily vs
raid — lives on the instance, not the sender-facing surface), daily/raid hit-rates,
per-game indices, roll status beyond the `toughDay` boolean. Pinned by a
field-allowlist test.

## What this contract intentionally does NOT do

- No consumer (social rails undesigned, out of scope).
- No DB writes / migration (documented above as the integration point).
- No band tuning — band stays a live config constant; the band-width gate is open
  on **playtest feel** only (see the generator checkpoint). Note for that gate:
  attempts/hour **N varies by player**, so per-day win-rate is a *distribution*,
  not a flat number; if one band can't serve casual + engaged, the lever is
  **roll-target by audience, not a global band shift**. Parked until playtest.
- Cross-sport promotion: lives in `basketball/src/tools/` for now; promotes to a
  shared location when the rails are designed.
