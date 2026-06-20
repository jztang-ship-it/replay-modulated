# Five-override hook map (Step 1 — sign-off record)

Manual curated-starter override for 2 iconic bank identities, without touching the
Method-A selection rule. Deterministic **post-selection substitution**, gated to
listed identities, FP via the one canonical path.

## The two swaps (verified read-only via the canonical path)
| identity | swap-out (auto, the artifact) | swap-in (curated) | gp≥30? |
|---|---|---|---|
| GSW-1718 "The KD Repeat" | Quinn Cook (gp 25, mean 20.9, avgMin 28.4) | **Andre Iguodala** (gp 63, mean 18.1, avgMin 25.7) | ✓ |
| DAL-1011 "Dirk's Title" | Caron Butler (gp 28, mean 23.7, avgMin 30.6) | **Tyson Chandler** (gp 74, mean 26.1, avgMin 27.8) | ✓ |

Root cause: Method-A ranks by avg minutes/game; the role player had higher mpg on
fewer games than the iconic starter, so minutes-rank grabbed Cook/Butler. The
override restores the recognizable five. (Marion already in the DAL five — the hole
is the C slot = Chandler.)

Recomputed expected (Σ five meanFp): GSW 174.6 → **171.8** (dips, Iguodala
low-usage; stays ≫ band → raid). DAL 140.3 → **142.7** (rises, Chandler reb/blk).

## Where the override hooks in (the layered flow)
```
bank.fiveOverride[{out,in}]   (curation; NEW optional field, _meta.version bumped)
        │  (read at the bank ⨝ bossData join)
        ▼
bossData.buildSeason(season, overrides?)   ← optional param; default none = byte-identical
   Method-A selection → 5 starters         ← SELECTION RULE UNTOUCHED
   POST-SELECTION substitution (gated to override keys): replace the `out` starter
   with the `in` player's BossStarter, BUILT FROM THE SAME season `stat` map
   (canonicalFp + qualifying min≥10 pool — ONE FP path, no fork). name→basePlayerId.
        ▼
buildAll(overrides?) → loadBankBosses (builds the override map from bank, passes it)
        ▼
Boss.starters (overridden five) → materializeIdentity → BossIdentity.starters
        ▼
projectSenderFacing → rollBoss over the overridden gamePools
```

## Invariants (why the pins still hold)
- **Selection rule untouched.** Override is a separate post-selection layer; the
  Method-A ranking code is unchanged.
- **bossTable / Step-1 table unchanged.** `bossTable` calls `buildAll()` with NO
  overrides → byte-identical auto fives. The override is **identity-layer only**
  (generator + contract). Step-1 selection table stays auto.
- **Seeded regen byte-identical.** The override changes WHICH players (different
  gamePools) — so the overridden boss's rolls differ from pre-override (intended).
  Determinism is preserved: same seed + overridden five → identical result. The
  byte-identical-regen test asserts within an instance, unaffected.
- **Field-allowlist unaffected.** The sender-facing projection shape is identical;
  only the players inside change.
- **Gated.** Override applies ONLY to (season,team) keys with a `fiveOverride` in
  the bank (the 2). Absent → no override (hide-don't-delete).
- **One FP path.** The `in` player's per-game FP uses `canonicalFp`
  (computeBasketballFp + computeBasketballBadges, `_position` injected) — same as
  the player lineup / computeRosterCeiling. No second path.

## Steps after this map
(2) bank `fiveOverride` + apply + `_meta.version` bump · (3) verify new starters
(gp/mean/avgMin) · (4) recompute totals · (5) variance cert dump for the locked 36 ·
(6) regenerate generator checkpoint (table noted identity-layer-only) + re-pin
FP-identity / byte-identical-regen / field-allowlist + override-applied tests · (7)
commit per step, push.
