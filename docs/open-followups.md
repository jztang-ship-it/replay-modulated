# Open follow-ups

Living document. Each entry: short title, context, priority hint, suggested next action. Address in dedicated sessions, not bundled.

## User-visible bugs (highest priority)

- **Hand-5 transition state UX** — clicking through win resolution transitions before user can read win tier + coins won. Animation/state-machine timing in `shared/views/GameView.tsx`. Spec: pause transition until user has read the result, or persist the data in a visible place post-transition.
- **Position icon + badge legibility** — position icons and badge "+N" numbers on player cards hard to read. UI polish, basketball/ player card component.
- **Audio 404s** — 13 files under `/api/audio/basketball/` return 404 (full list in smoke-test doc anomalies log). Files missing from `public/`, wrong path resolution, or proxy not serving audio directory. Diagnose path of one file end-to-end.

## Commentary content quality

- **Chad commentary doesn't name extremes** — multiple observations (hands 1, 9, 15, 16 of stamps smoke 2026-05-22) where commentary mentioned neutral-performing players instead of the actual over/under-performers on the hand. Defer to broader chad commentary refactor (already on handover list).

## Design decisions needed

- **`big_score` vs `miss` precedence** — code returns `big_score` first; ALL_STAR/MVP/LEGEND wins never produce `MISS` for the next tier even when gap ≤ 5 FP. Session-state design doc caveat says `MISS` should still fire on these. Design call: update doc to match code (lean), or update code to allow `MISS`+`big_score` stacking. See smoke-test 2026-05-22 hand 17.
- **Per-season threshold reference** — 1718 thresholds (171/200/230/247/276) differ materially from 2425 thresholds (173/203/233/248/277). Worth a per-season quick-reference table in the session-state doc so future smokes / observation tasks don't have to recompute against `winThresholds.json`.
- **`bad_beat` fires on ROOKIE wins** — confirmed firing on ROOKIE wins with held RED/ORANGE cards (hands 4, 19, 20, 25 of stamps smoke 2026-05-22). Is firing on a low-tier *win* (not just BUST) intentional? See smoke-test 2026-05-22 hand 4.

## Pre-existing items from handover (carried forward)

- Baseball/football RTP audits using `rtpSim.ts` infrastructure
- Sim Migration B — `shared/tools/runSimulator.ts` still reimplements the deal loop, should call `generateRoster` via SportAdapter
- PBP ingestion for ejection data — ~7–8 hours single-machine fetch via `playbyplayv2`, populates dormant `injured`/`ejected` flags
- TD/DD badge dedupe in `computeBasketballBadges` — dormant dedupe code with stale id names
- `CLAUDE.md` worldcup → football drift — 4 stale references (`dev:worldcup`, `runSimulator.ts worldcup`, `lint` and `typecheck` under `npm --prefix worldcup`)
- `chad.ts:45` — literal `"1.3x"` in streak-intro message, cosmetic drift after multiplier rebalance

## Methodology / housekeeping

- Football culture tier 1 WIP stash (currently `stash@{0}`) — sitting since May, untouched throughout calibration. Evaluate or discard.
- Worktree audit — 4 unrelated pre-existing worktrees noted during final state check. Enumerate and decide which still active.
- Session-state doc update discipline — after stamps lands, add a "Stamps — SHIPPED" pointer section. Treat as a per-workstream methodology rule.
- Login / Google auth popup overlay conflict — user-reported, not diagnosed this session. Symptom needs detail. Could be z-index, modal-stacking, or auth-flow timing.

## Path-2 / Path-3 followups from prior shipped fixes

- **Position override map for residual hyphenated-position errors** — small basePlayerId-keyed map for high-salience players where the systematic POS_MAP rule produces a wrong simplified position. Confirmed residuals: Ben Simmons (G-F → SF, canonical PG), Luka Dončić (F-G → SG, canonical PG), Scottie Pippen (F-G → SG, canonical SF), Kyle Anderson (F-G → SG, canonical SF), Scottie Barnes (F-G → SG, canonical SF), Amen Thompson (G-F → SF, canonical PG). Plus any others surfaced by play observation. Low priority — improvement on a partial improvement.
- **Consider dropping the simplified-position field entirely** — have UI consume `positionFull` directly. NBA hyphenated positions don't reliably collapse to a single letter; the systematic rule applied 2026-05-22 fixed the majority of cases but leaves a residual the override map can only patch player-by-player. Path-3 is the larger UI redesign that removes the collapse step entirely. Real consideration if position-display continues to surface accuracy complaints after the override map is in place.

## Shipped this session

- **Position data fix** (2026-05-22) — flipped POS_MAP simplification rule from secondary-letter-wins to primary-letter-wins for hyphenated positions: `C-F → C` (was PF, affected 81 players incl. Embiid, KAT, Duncan, Howard, Pau Gasol), `G-F → SF` (was SG, affected 114 players incl. Vince Carter, McGrady, Iguodala, Marion, DeMar DeRozan). `F-C → PF` and `F-G → SG` left unchanged (were already correct). Re-ran `fetchHistoricalPositions.mjs` + `mergePositions.mjs`, updated `nba-positions.json` and all 29 per-season `players.json` files. Acknowledged residual errors captured above as path-2 override-map followup.
