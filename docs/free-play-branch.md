# Basketball free-play branch — 2026-09-18

Authorized by John: preserve a mother version with all features, create a separate clean no-economy branch. No meaningful-stakes redesign in this change.

## Provenance
- Mother: `mother/all-features-2026-09-18`, exact release `ab082b55695478ecc553314afc299483f7f32555`. Preserves every tracked file, including dormant economy, other sports and migration history.
- Child: `release/basketball-free-play`, based on that release in a separate worktree. Desktop ReplayMod main at 67203bae and all dirty/untracked files remain untouched; its unrelated unpublished layout adjustment is not silently imported.
- Mother is a preservation baseline, not a claim that all parked branches were integrated or that money features are production-ready. No remote push or deployment is implied.

## Locked scope and verification
The basketball product must have no wallet, spendable/earnable currency, referral rewards, wagering, payout multipliers, prize pools, currency-based rankings, or economy copy. No environment switch may re-enable these in this branch. Historic database records and mother-branch assets are preserved; no destructive database operation is authorized. A nonmonetary lineup selection budget and fantasy-point scoring remain gameplay rules.

Verify: clean free-play wording and profile; no currency reads/writes on entry or result; no referral reward calls; reject nonzero stakes; separate score-only database start/settlement functions without wallet access; no public bonus-pool routes; no monetary leaderboard metrics; no monetary fields in game responses; regression tests, full test suite, production-equivalent build, browser checks. Backend integration requiring credentials/migrations must be reported as unverified rather than simulated success. Branch creation and local implementation authorized; remote deployment not requested.

The new branch-specific lock supersedes older hide-only economy locks for this child only. Preserve future economy work through the mother branch and Git history, not through active rewards in this product.

## Database isolation

Use a dedicated free-play database/project and its own environment configuration. Do not apply migration `021_free_play_sessions.sql` to the mother's database: it intentionally revokes browser access to legacy economy functions and wallet records. Migration 021 introduces score-only sessions. Migration 022 then removes the legacy economy tables, functions and hand-log columns from the dedicated free-play schema. It requires an explicit dedicated-database marker and refuses existing financial data; never apply it to the mother database.

No remote migration or deployment is part of this change. Until that separate backend is configured, the local shell can be inspected but real authenticated gameplay is unavailable. There is no fallback to the old deployed API or to fabricated local results.

The score-only database test is `scripts/tests/free-play-db.mjs`. It uses disposable PGlite/PostgreSQL and can be run with `PGLITE_MODULE` pointing at an installed `@electric-sql/pglite/dist/index.js`; it never connects to the live product.

## Hidden-economy removal — 2026-09-19

Remove, rather than hide, the dormant pool leaderboard, pool store, payout/streak calculators, wallet/bet state, payout celebration, and monetary simulators from this branch. Preserve score tiers and the nonmonetary lineup budget. Keep only defensive rejection/filtering of legacy monetary inputs/messages. The basketball bundle must not import parked-sport money commentary.

Release verification includes a built-artifact economy guard, solo and friend-challenge regression tests, and disposable database checks proving the final schema has no wallet or monetary hand-log fields. Migration 022 must refuse an unmarked database or existing financial history. No live migration, push, or deployment is authorized by this cleanup.

## Isolated deployment — 2026-09-19

John authorized deployment as the improvement baseline, then explicitly approved guest sign-in and connecting the clean branch/new backend credentials. This supersedes the earlier local-only boundary.

- Supabase `replay-free-play`: `gvlgtyaljojesaultumv`, Seoul. Applied migrations 001–022 to verified empty schema; live checks confirm free-play sessions exist and wallet, monetary sessions, monetary hand-log columns and legacy money functions are absent.
- Vercel `replay-free-play`: `prj_dclS1pib6k3ThwaJcyglMmzjWaSj`. Production source is `release/basketball-free-play`. Only isolated database settings are configured.
- Mother database and production version remain unchanged. Both source branches are now backed up on origin.
- Redis provisioning and real gameplay verification are pending. Do not label a deployment playable until the hand API, score history and challenges pass against the isolated backend.

## Shared free Redis — 2026-09-19

John authorized reuse of existing `replay-analytics` Free store. Every Redis key in this branch uses fixed `replay-free-play:v1:` prefix, including Lua rate limits and router pipelines. Existing mother keys remain untouched; no legacy keys are read or migrated. Shared capacity and command allowance apply; no new paid store. Separate Supabase remains mandatory. Connect only after isolated code has been deployed, then redeploy with Production credentials and verify live gameplay.
