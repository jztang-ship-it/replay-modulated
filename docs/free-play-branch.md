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

Use a dedicated free-play database/project and its own environment configuration. Do not apply migration `021_free_play_sessions.sql` to the mother's database: it intentionally revokes browser access to legacy economy functions and wallet records. It preserves historical records, writes only zero monetary compatibility values to the existing hand audit schema, and never creates or updates a wallet.

No remote migration or deployment is part of this change. Until that separate backend is configured, the local shell can be inspected but real authenticated gameplay is unavailable. There is no fallback to the old deployed API or to fabricated local results.

The score-only database test is `scripts/tests/free-play-db.mjs`. It uses disposable PGlite/PostgreSQL and can be run with `PGLITE_MODULE` pointing at an installed `@electric-sql/pglite/dist/index.js`; it never connects to the live product.
