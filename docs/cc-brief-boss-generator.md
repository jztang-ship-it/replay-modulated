# CC BRIEF — Boss Generator (build in `feat/build-phase`)

## Context
We're building the daily shared-PvE "boss" generator for ReplayIFS. A boss = the
5 starters of one team-season, scored total-FP vs the player's capped lineup. The
design is locked; a **mechanism prototype already runs** at
`boss_gen/boss_generator_proto.py` (synthetic data) and proves the control flow —
deterministic seeding, band-rejection, identity-era scheduling, authored naming.
Your job is to build the real thing by replacing the prototype's synthetic hooks
with the live data substrate, starting from the cheap 30×27 validation table.

Curation seed (the story bank, with tiers + catch-phrases): `boss-story-bank-v1.md`.
**The bank is curated by accolade/recognizability, NOT by FP rank.** Do not let FP
become the eligibility gate — that re-introduces the false-positive (high-pace bad
teams) / false-negative ('04 Pistons, Grit-n-Grind) failures we already sorted.

## Hard constraints (standing — do not violate)
- Branch `feat/build-phase` only. Per-step commits, **green before each**, push to origin.
- **Map first.** Before writing generator code, produce a short map (Step 0) and stop for review.
- **Do NOT touch:** `_roundMachine.ts`, money-path pinned tests, `chadChallenge` / paused-voice code, challenge-resolution logic.
- **Hide-don't-delete** for anything paused.
- **FP identity is sacred:** the boss total and the player's lineup total MUST be computed by the *same* FP function over the *same* stat source. One code path, never two — if they diverge the benchmark is meaningless. Locate the existing player-side FP path and reuse it; do not reimplement.
- Determinism is a correctness property, not a nice-to-have: same date ⇒ identical boss for every user, every machine, every run.

## Step 0 — Map (stop after this)
Confirm and write down:
1. Signatures + return shapes of `computeRosterCeiling`, `runSimulator`, `recordDetector`.
2. The box-score table schema: per-player per-game stat rows, season + team keys, games-started / position fields, trade handling (a player's stint with a team).
3. Where the canonical FP function lives (the one the player lineup uses).
4. Season coverage actually present (expect 96-97 → 22-23). Flag any data-thin seasons (lockout 98-99, 2011-12, bubble 19-20/20-21) — per-game design tolerates these but note thinner roll pools.
Output the map, then pause.

## Step 1 — The 30×27 table (cheap prototype, de-risks everything)
For every available team-season:
- **Starter selection:** most-games-started **per position**; tie / no owner ⇒ most-minutes-at-position; a traded player counts only for his stint with that team, and his game pool draws only from that stint.
- Compute the 5-starter expected total via the **canonical FP path**.
- Pull the **player-lineup FP distribution** from `runSimulator` (strong capped lineups) and derive the band as a percentile window (default **P60–P85**, configurable).
Emit a ranked table: team-season, tier (join from bank), expected total, band-relative route (daily / handicap / raid), roll-pool depth. **This validates pool richness + difficulty band before any UI/social build.** Acceptance: table covers all available team-seasons; data-thin rows flagged; ≥27 champion rows present.

## Step 2 — Generator core (mirror the prototype, real data)
Port the prototype's structure with live hooks:
- **Seed:** deterministic PRNG from `date(+slot)` (sha256 → RNG), as in proto `seeded_rng`.
- **Game-roll:** one random *played* game per starter (exclude DNP / 0-min / sub-~5-min garbage), drawn only from that starter's games with that team, RS-only.
- **Band via deterministic rejection sampling:** roll 5 games → if total out of band, advance PRNG and re-roll the **games** (not the team) up to K=8 → if still failing, fall to next eligible team in seeded order. All deterministic.
- **Routing:** expected below band ⇒ `handicap` (curated exception / difficulty handicap, never silent drop); above band ⇒ `raid` slot (elite, unbeatable-is-the-point); else daily pool.
- **Eligibility:** tiers from the bank (champ / iconic / false_neg). Accolade overlay gates recognizability; FP only ever gates the *curated/Tiny-Giants* style picks, never team bosses.
- **Scheduling:** headline slot from `{champ, iconic}`, weighted (champ 1.0 / iconic 0.6), **no identity-era within `cooldown=5` days**. The era_id — not team, not season — is the anti-repeat unit (Lakers win 6 of 27, weight by era or it reads repetitive).
- **Naming:** authored catch-phrase from the bank per team-season; template fallback for unnamed. Naming is most of the "feels authored vs procedural" eyeball test — keep the marquee names bespoke.

## Defaults for the open decisions (flags, flip as needed)
- `daily_slots = 1` headline/day. Themed side-bosses behind a flag, off for v1.
- `tier_b = off` (v1 = champions + iconic + false-neg handicaps only).
- `playoffs = off` (RS-only; playoff lines later as bespoke marquee one-offs, never the daily roll pool — sample too thin, band-guard would reject most).
- `band = P60–P85`, `K = 8`, `cooldown = 5`.

## Step 3 — Acceptance tests (must be green)
1. **Determinism:** same date ⇒ identical boss totals across two runs (proto asserts this).
2. **Band:** ≥ most daily headline bosses land in-band; below/above route to handicap/raid correctly.
3. **Schedule:** no identity-era within `cooldown` days over a 60-day horizon.
4. **False-neg:** '04 Pistons + Grit-n-Grind route to handicap, present (not dropped).
5. **Elite:** '17 Warriors routes to raid, out of the daily pool.
6. **Authored eyeball:** 10 headline bosses, names read authored, not Mad-Libs.
7. **FP identity:** boss FP and player FP demonstrably share one code path (test asserts same function reference / same output on a fixed roster).

## Commit plan
One commit per step, green before each, push to origin. Step 0 (map) → review gate → Step 1 (table) → Step 2 (core) → Step 3 (tests). Don't proceed past the map without sign-off.
