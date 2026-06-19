# Economy-layer retrieval map

The F2P social/emotion layer was built on top of the economy plumbing by
**pausing/hiding, never deleting**. Every concept below is dormant but intact and
re-wireable. This doc is the index the economy rebuild reads to turn each back on.

Scope of the pause work: branch `feat/build-phase`, basketball only. Baseball/
football and the shared `WinTierKey` union are untouched (they still run the full
economy). The governing pattern is an **adapter flag read at a shared site with a
`?? <today's-default>`** — basketball opts out; absent ⇒ unchanged.

> **HEADLINE OPEN ITEM — the F2P layer is NOT actually free yet.** Tiers/streaks
> are cosmetic, but the **money seam still moves real balance**: every locked hand
> debits `BASE_BET` (=10) from the wallet, an affordability gate can block a deal,
> wager/net math renders, and the balance persists to `localStorage`. Making the
> game truly free is an unfinished task, not a done one — see **Economy surface
> (live, pending F2P gating)** below for the five sub-surfaces and the
> `ECONOMY_ENABLED` boundary flag that should gate them.

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

## Entry-fee / rake seam — NOT free yet (the open item, not a paused one)
- **Was / IS:** the once-per-hand charge + bonus rake + hand_log persist at
  lineup-lock. **Unlike everything else in this doc, this is NOT paused — it is
  fully live and moves real money.** A locked hand actually **debits the wallet**
  by `BASE_BET` (=10): `charge` runs `setBalance(prev - fee)` **and** `saveBalance`,
  there is a live **affordability gate** (`balance < currentBet → alert("Insufficient
  balance!")`), wager/net math renders, and the balance **persists** to
  `localStorage` (`replaymod_balance`, one wallet across sports). Coins/multipliers
  being "gone" describes the *intent*; the spend path is still wired.
- **Where:** `shared/views/_roundMachine.ts` lock path → `persistLock → charge →
  rake` (controller UNTOUCHED all task); GameView wires the effects. See the
  **Economy surface** section below for the five concrete sub-surfaces + lines.
- **To make the F2P layer actually free — gate with `ECONOMY_ENABLED`, do NOT
  zero `BASE_BET`.** A zeroed `BASE_BET` still executes the debit / persist /
  affordability-gate code paths (a "spend $0" that re-saves the wallet and can
  still gate at balance 0) — wrong mechanism. Introduce an `ECONOMY_ENABLED`
  boundary flag (off for the F2P layer) that **bypasses** charge + gate + wager +
  persist at their call sites; flip it on to restore real pricing (alongside the
  multiplier above + real payout weight). It is the single on/off seam for the
  whole money layer.

## Economy surface (live, pending F2P gating)
The five concrete sub-surfaces the `ECONOMY_ENABLED` flag must gate to make the
game free. All currently live in `shared/views/GameView.tsx` unless noted.
- **(a) Charge closure — `GameView:1903`:** `charge: (fee) => setBalance(prev => {
  const next = prev - fee; saveBalance(next); return next; })`. The actual debit
  + persist. Wired as the `_roundMachine` lock effect.
- **(b) Affordability gate — `GameView:1711`:** `if (balance < currentBet) {
  alert("Insufficient balance!"); return; }` in the IDLE/deal branch — can block a
  deal at low balance.
- **(c) Wager / net math — `GameView:2672`:** `amountWagered = BASE_BET *
  effectiveBetMultiplier`; `net = winPayout - amountWagered` (drives the post-hand
  net readout).
- **(d) Persistence — `saveBalance` → `replaymod_balance`:** `setBalance` is
  mirrored to `localStorage` via `saveBalance` (`_useSharedGameState.ts:91`;
  `persistBalance: saveBalance` alias at `GameView:462`). One wallet across sports.
- **(e) Coin / balance display:** GameBar wallet readout fed by `balance={balance}`
  (`GameView:2977`) + `coins={coins}` (`:2909`); the `BASE_BET × {mult} = $X` wager
  readout at `:2812` is already `multiplierEnabled`-gated (hidden for basketball).
- **TEST CONSTRAINT — gate at call sites, do not rewrite the pinned lines.** The
  protected money-path test `GameView.betOncePerHand.test.ts` asserts the **literal
  text** of the charge closure (`:60`, matches `charge: (fee) => setBalance(prev =>
  { const next = prev - fee …`) and the affordability gate (`:88`, matches `if
  (balance < currentBet)`). `ECONOMY_ENABLED` must therefore wrap/bypass these at
  their **call sites** — leave the closure body and the gate expression byte-for-byte
  intact, or that test goes red (same collision that forced Step 3's streak pause to
  be surfacing-only).

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
