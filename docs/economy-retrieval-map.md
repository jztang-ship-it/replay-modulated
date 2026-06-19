# Economy-layer retrieval map

The F2P social/emotion layer was built on top of the economy plumbing by
**pausing/hiding, never deleting**. Every concept below is dormant but intact and
re-wireable. This doc is the index the economy rebuild reads to turn each back on.

Scope of the pause work: branch `feat/build-phase`, basketball only. Baseball/
football and the shared `WinTierKey` union are untouched (they still run the full
economy). The governing pattern is an **adapter flag read at a shared site with a
`?? <today's-default>`** — basketball opts out; absent ⇒ unchanged.

> **RESOLVED — the basketball F2P layer is now free** (the wallet does not move).
> Implemented via the `economyEnabled` adapter flag (basketball `false`, read-site
> default `?? true` so baseball/football stay live). When off, the three
> wallet-movement sites are bypassed (no entry-fee debit, no affordability
> lockout, no payout credit) and the balance/payout displays are hidden. The
> charge/gate/credit code stays intact and re-wireable — flip `economyEnabled` to
> restore. See **Economy surface** below for the gated sites + how each bypass
> preserved the pinned money-path test text. Two surfaces stay LIVE on purpose
> (not wallet movement, and gating either collides with a pinned test): the `rake`
> bonus-pill nonce and the `money_won` leaderboard submit (the latter deferred to
> the leaderboard-revamp task). **`coins` is a SEPARATE currency — left untouched
> (see Parked items).**

---

## Multiplier (bet multiplier 1/3/5/10×)
- **Was:** per-hand bet multiplier escalating the wager/payout; selector in GameBar.
- **Dormant where:** `betMultiplier`/`setBetMultiplier` state in
  `shared/views/_useSharedGameState.ts` (intact); GameView pins it via
  `effectiveBetMultiplier = (!multiplierEnabled || challengeCtx) ? 1 : betMultiplier`;
  selector hidden via `showBetMultiplier={multiplierEnabled}` (GameBar gates on it).
- **Reactivate:** set `multiplierEnabled: true` on the basketball adapter
  (`basketball/src/views/GameView.tsx`). Read-site default is
  `adapter.multiplierEnabled ?? true`, so removing the flag also restores it.

## Entry-fee / rake seam — GATED off for basketball (`economyEnabled: false`)
- **Was:** the once-per-hand charge + bonus rake + hand_log persist at lineup-lock,
  moving real balance — debit `BASE_BET` (=10) via `setBalance(prev - fee)` +
  `saveBalance`, a live affordability lockout, wager/net math, balance persisted to
  `localStorage` (`replaymod_balance`).
- **Now:** bypassed for basketball by the `economyEnabled` adapter flag (default
  `?? true`; basketball sets `false`). The wallet never moves: no debit, no
  lockout, no payout credit; `saveBalance` never fires for outcomes (balance loads
  once and stays static). `_roundMachine.ts` UNTOUCHED — the controller still calls
  the charge effect; the effect itself no-ops when off.
- **Reactivate:** set `economyEnabled: true` on the basketball adapter (read-site
  default `?? true`). Restoring real *pricing* also wants the multiplier (above) +
  real payout weight. It is the single on/off seam for the wallet layer. **Do NOT
  zero `BASE_BET`** — a zeroed fee still runs the debit/persist/gate paths
  (spend-$0 that re-saves the wallet); `economyEnabled` bypasses at the call sites
  instead. See **Economy surface** below for each gated site + the test-text
  constraint that shaped the bypass.

## Economy surface (now gated by `economyEnabled`)
The concrete sub-surfaces and how each was gated. Line numbers drift; the symbols
are the durable anchors. All in `shared/views/GameView.tsx` unless noted.
- **(a) Charge closure — `charge` effect:** `(fee) => setBalance(prev => { const
  next = prev - fee; if (!economyEnabled) return prev; saveBalance(next); return
  next; })`. **Gated in-body, after** the pinned prefix → no debit, no persist when
  off. Invoked by the untouched `_roundMachine` lock path.
- **(b) Affordability gate — IDLE branch:** wrapped `if (economyEnabled) { if
  (balance < currentBet) { alert("Insufficient balance!"); return; } }`. **Outer
  wrap** keeps the inner line byte-identical → no lockout when off.
- **(c) Payout credit — `_useReveal` `pendingBalanceUpdateRef`:** `if
  (economyEnabled && payout > 0) setBalance(prev => prev + payout …)`. New
  `economyEnabled` arg into `useReveal`. **Both debit (a) and credit (c) are gated**
  — gating only one would make the wallet drift.
- **(d) Wager / net math + payout `$` display:** `amountWagered`/`net` are
  display-only (no downstream consumer; the `net` span is BUST-branch, dead for
  basketball). The post-reveal `+$payout` / net display is hidden via `{!challengeCtx
  && economyEnabled && …}`; FP + ceiling still show.
- **(e) Persistence — `saveBalance` → `replaymod_balance` (`_useSharedGameState.ts`):**
  not gated directly — with (a) and (c) bypassed, `saveBalance` never fires for
  outcomes, so the balance loads once (`STARTING_BALANCE`) and stays static.
- **(f) Balance display — GameBar wallet:** `balance={balance}` prop still passed;
  the two wallet readouts (action-row chip + non-split "Balance") are render-gated
  on `economyEnabled` (new GameBar prop, default true). The `walletRef` coin-fly
  anchor node stays mounted. (The `coins` prop is a SEPARATE currency — not gated;
  see Parked items.)
- **TEST CONSTRAINT (held) — gated at call sites, pinned text untouched.**
  `betOncePerHand` pins the literal charge-closure prefix (`:60`,
  `charge: (fee) => setBalance(prev => { const next = prev - fee`) and the
  affordability line (`:88`, `if (balance < currentBet)`). The in-body guard (after
  the prefix) and the outer-wrap (keeping the inner line) leave both byte-identical;
  the payout-credit gate touches `_useReveal:pendingBalanceUpdateRef`, not the
  pinned payout *computation* (`:91`). `betOncePerHand` + `entryFeeCollapse` stayed
  green UNEDITED.

## Streaks (consecutive-win multiplier escalation)
- **Was:** 3/5/10-win streak → 1.2/1.5/2.0× payout escalation, with a fire-row
  display + celebration pips.
- **Dormant where (preserved, re-wireable):** `streak`/`setStreak` +
  `incrementStreak`/`resetStreak` counting in `_useSharedGameState.ts` (still
  runs); the `streak_at_play` column in `logHandToDb` (still logs the real value);
  `STREAK_TIERS` schedule in `basketball/src/utils/payoutLogic.ts`;
  `recordStreakWin/Bust`. Paused via the `streaksEnabled` adapter flag
  (basketball `false`): GameView `effectiveStreak = streaksEnabled ? streak : 0`
  neutralizes celebration/inline display; GameBar `showStreak={streaksEnabled}`
  hides the `StreakFireRow`.
- **Reactivate:** set `streaksEnabled: true` on the basketball adapter (read-site
  default `?? true`). ⚠️ **Residual:** the payout formula in `_useReveal.ts`
  (`calculatePayoutWithStreak(tier, currentBet, streak)`) still folds the **real**
  streak into the cosmetic payout — left frozen because the protected money-path
  test `GameView.betOncePerHand.test.ts` pins that line. So re-enabling
  `streaksEnabled` makes the streak multiplier visible/effective again with no
  formula change; the economy rebuild decides streak's role in the new payout.

## BUST (sub-floor loss tier)
- **Was:** the bottom "loss" tier (< ROOKIE), with grey loss styling + bust copy.
- **Dormant where:** still a full member of the shared `WinTierKey` union
  (`shared/utils/payoutLogic.ts:12`), the shared fallback `return "BUST"`, and
  every shared/baseball/football/api reference — all untouched. Basketball just
  never reaches it: `ROOKIE.minFp = 0` (FALLBACK_MIN_FP + every season in
  `basketball/src/data/winThresholds.json`) makes `calculateWinTier` always return
  at least ROOKIE. Removed only from basketball **display** (legend row +
  WinCelebration entry). Sub-floor hands log `tier: "ROOKIE"` (string column;
  legacy BUST rows still read fine — string compares, no exhaustive switch).
- **Reactivate:** give basketball ROOKIE a positive `minFp` again (restore a BUST
  cut in `slateAwareThresholds.ts` `CUM_PCT` and regenerate the JSON; bump
  FALLBACK_MIN_FP) and re-add the BUST display row + WinCelebration entry.

---

## Parked items (flag — do NOT fix here; cross-sport / economy-rebuild / glass passes)

- **Dead multiplier payout columns in the basketball legend.** `buildPayoutRows`
  (`basketball/src/views/GameView.tsx`) still renders `20x/8x/3x/1.5x/0.5x` payout
  columns and the `bonusRows` "X-WIN STREAK → Yx payout" — stale now that coins/
  multipliers are gone. Cross-sport legend cleanup pass.
- **Streak still folds into the cosmetic payout number.** See the Streaks residual
  above — `_useReveal` payout uses the real streak; surfacing is hidden but the
  number can differ. Remove in the economy rebuild (it touches the protected test).
- **CollectScreen `streakCount` stat.** The daily collect screen
  (`shared/views/GameView.tsx` → `CollectScreen`) still shows the win-streak count
  as an engagement stat. Separate engagement surface; left intact (re-wireable).
- **Heater / Cold Night visual is NOT device-glassed.** The `CelebrationBottom`
  badge (🔥 gold / ❄️ cold) + Cold Night's reuse of the `isLoss` loss-coloring hook
  are wired but unverified in a real browser. PostGame / ShareResultCard status
  threading was skipped — those surfaces (`PostGameScreen`, `ShareResultCard`,
  basketball `WinCelebration`) are dead/beta with no live mount/caller. Glass the
  live celebration; wire the others if/when they re-enter the flow.
- **Win-tier calibration skews slightly easy.** The per-season cuts come from a
  single-draw sim, which scores lower than real multi-round hold-and-improve play
  (median sim ~185 vs real ~191; LEGEND p98 ~248 vs real ~246). Known/accepted at
  launch; corrected by monthly recalibration via `slateAwareThresholds.ts --write`.
- **`coins` is a SECOND currency — deliberately NOT gated.** `coins` (`rp_coins`,
  `shared/engagement/useEngagement.ts`) is the engagement-task reward currency,
  distinct from the wager wallet (`replaymod_balance`). It is earned/spent entirely
  in the engagement layer and is NOT touched by `economyEnabled`. The
  `coins={coins}` display on `CollectScreen` (and any coin UI) still shows. Whether
  the F2P layer keeps, hides, or reworks `coins` is an **engagement-economy
  decision**, owned by the leaderboard/engagement-revamp task — not papered over here.
- **`money_won` leaderboard submit — deferred, still live.** `_useReveal` still runs
  `submitToLeaderboard("money_won", payout)` (pinned `betOncePerHand:94`). It's a
  leaderboard stat (not a wallet write), and `economyEnabled` does not gate it.
  Logged as the leaderboard-revamp task's first item: F2P ranks on FP/session_score,
  not money_won; pause money_won + audit all economy-signal surfaces there.
- **`economyEnabled` display hide is NOT device-glassed.** The hidden wallet chip /
  payout `$` display (Step 2) are wired but unverified in a real browser — glass the
  free experience: no wallet, no charge, no insufficient-balance lockout, free
  replays, and the reveal/celebration still composing correctly with the money
  chrome gone.
