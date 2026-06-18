# ReplayMod — Handoff (2026-06-18) — 5-card basketball shipped

## SHIPPED
- **5-card basketball + recalibrated balance — LIVE.** main @ `f2f06f7`, rollback `ebe20b2`.
  Slice A (UI + deal) and Slice B (threshold recalibration) merged together — prod never
  ran 5-card hands on 6-card tiers. Watched prod deploy SUCCEEDED (both Vercel projects:
  replaymod-basketball + replay-mod root).
  - Slice A: basketballConfig 6→5 (maxPlayers/minPlayers/rosterSlots); roster grid
    2-top/3-bottom via the `bb-dice5` rosterGridLayout scaffold mirror (`bball-23`);
    H2HRecipientPlay roster size from `initialRoster.length`.
  - Slice B: thresholds regenerated 29 seasons via slateAwareThresholds.ts; RTP restored
    79.25% → 89.02%; streak schedule holds; cap held $250; salaries untouched.
- **Data wipe: DONE.** `DELETE FROM public.shared_challenges;` run by hand in Supabase SQL
  Editor (project nba-live-game `hnhrpwwznzokkfagfumb`); cascaded to challenge_attempts
  (ON DELETE CASCADE). Stale 6-card challenges cleared. Prod is clean 5-card end-to-end.

## PREMISE CORRECTION (the old spine is WRONG on this — fix forward)
The FP drop at 5 cards is **~2–3 FP, NOT ~25–40**. The $250 cap binds and redistributes
across 5 pricier cards; sim mean barely moves (185.4 → 183.4). The harshness was
**threshold-vs-distribution leverage** — hands cluster densely at tier boundaries × high
multipliers (MVP 8×, LEGEND 20×) — NOT an FP collapse. A ~2–3 FP threshold shift moved RTP
~10 points (79.25% → 89.02%). Do not reason about 5-card balance as an "FP drop" problem.

## TIER BALANCE — good-enough, NOT final (explicit decision)
Line placement is **deliberately deferred** until after build-phase mechanics land, because
the mechanics change the outcome distribution the tiers sit on. **Do NOT re-tune tiers before
then.** BUST currently unreached (0% sim, 0/10 glass) — open question PARKED to that same
post-mechanics pass, **not a bug**.

## ACTIVE CONSTRAINT (promoted from PARKED — bites NOW)
**api/ is at 12/12 — zero headroom. Vercel Hobby cap.** The next function added by ANY thread
**fails the prod DEPLOY** (not the merge — a 13th passes test/build/merge, then the deploy
fails). **Consolidate api/ routes before adding any endpoint.** Current 12: analytics,
bonus-pool, challenge/[id], challenge/[id]/attempt, challenge/[id]/sender-hand,
challenge/create, headline, leaderboard, me, notifications/index, profile, share/card.

## GENERATOR FACTS (don't use the wrong tool)
- Thresholds come from **slateAwareThresholds.ts** (production-parity; what rtpSim.ts
  validates against). Run `slateAwareThresholds.ts --write` to regenerate, then validate with
  rtpSim.ts. The `--write` flag is REQUIRED — bare runs only print.
- **calibrateWinTiers.mjs is SUPERSEDED** — do not use it. The `payoutLogic.ts:6` doc
  reference naming it is STALE.
- All calibration tooling reads `ROSTER_CONFIG.rosterSize`, not a hardcoded 6 (fixed in
  slateAwareThresholds.ts + rtpSim.ts).

## DOC STATE
- `docs/replaymod-design-decisions.md` marks 5-card shipped; H2H reveal smoke-checklist
  card counts corrected six→five.
- It carries an **active DOC-INTEGRITY WARNING** on the RD2:1194 "Six cells" derivation:
  stale at 5 cards (conclusion inverts). Note the surface — that derivation models the
  **H2H reveal hand STRIP** (a single-row flex), so its 1-row sum is the correct model for
  *that* surface; it is NOT the in-game `bball-23` 2-row roster grid. The shipped 5-card
  strip glassed clean; the warning flags the stale derivation, not the working layout.

## IN PROGRESS
- Nothing mid-flight. (Data wipe completed.)

## NEXT
- **Build-phase mechanics** (roadmap below, now unblocked).

## ROADMAP (unchanged, now unblocked; build order still funnel-gated)
1. **Build-phase mechanics** — full slate shown at once, tap-to-hold, unheld reroll, up to 3
   hold rounds, descending budget. **Implementation note:** this is a real `GamePhase` enum
   extension at the `onPrimaryAction()` dispatcher (shared/views/GameView.tsx:1686), **NOT a
   param bump** — today's flow is single-shot (deal → hold → one draw → reveal → result →
   REPLAY) with NO round concept. The 1/3·2/3·3/3 round indicator rides with it.
2. **Recipient cold-start** (outranks FTUE per spine).
3. **Cross-sport port** (basketball → baseball → football/worldcup).

## STANDING RULES (carried forward verbatim)
- Don't-touch list: salaries, challenge logic, paused challenge-commentary voice, baseball,
  football/worldcup, rivalry worktree, .patches/.
- Map-first (investigation before code; report findings, get direction, then edit).
- Per-step commits; npm test green before each commit.
- Watched deploy before/with any main push (main push = prod deploy trigger).
- **Never ship 5-card hands on 6-card tiers** — now SATISFIED (Slice B recalibrated).

## PARKED (carry forward)
- Offline scripts still hardcode `roster.length < 6`: deriveThresholds.ts,
  slateAwareCalibrate.ts, dumpFpDistribution.ts, auditGameLogs.ts — non-shipping; fix if
  re-run for basketball.
- H2HPlayMockRoute.tsx:85 dev-mock `< 6` (harmless).
- Stale `payoutLogic.ts:6` doc reference (names superseded calibrateWinTiers.mjs).
- CoachLayer / FTUE residuals → fold into the cross-sport new-format pass.
- Not-backed-up local branches from the original spine (machine-death risk) — verify/back up
  if still relevant.
- (RD2:1194 geometry is no longer parked — it's now an active in-doc DOC-INTEGRITY WARNING;
  see DOC STATE.)

## RIGHT NOW
1. Data wipe confirmed done — prod is clean 5-card end-to-end.
2. Before ANY new api endpoint: consolidate routes (12/12 cap).
3. Pick up build-phase mechanics as a GamePhase extension at onPrimaryAction() — not a param bump.
