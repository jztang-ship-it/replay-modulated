# Open follow-ups

Living document. Each entry: short title, context, priority hint, suggested next action. Address in dedicated sessions, not bundled.

## Open from 2026-05-25 (smoke-driven post-amend findings)

- **PURPLE-tier inclusion question for bad_beat predicate** — User-flagged 2026-05-24: hands with 2+ PURPLE held cards on BUST/ROOKIE feel bad-beat-worthy to user, but current predicate requires RED/ORANGE. Decision deferred to calibration arc — broadening to PURPLE may push bad_beat frequency too high. Decide post-frequency-analysis: if current rate <30%, consider broadening; if >50%, keep narrow.

- **Inline RARE_PULL sub-tier chip color should match card-level achievement-banner color** — chip currently uses generic green (rare_pull family color); card's SEASON HIGH / CAREER HIGH / RECORD banner uses the card's tier color (e.g. purple for ALL_STAR-tier cards). Future polish: chip background reads from card-tier-color rather than hardcoded family color. Confirmed on 2026-05-24 smoke (Image 2, Robinson).

- **Win-tier threshold recalibration** — post-game-data-broadening (all games, not top-40%), FP distribution has shifted upward. 30+ smoke hands on 2026-05-24 produced zero big_score triggers (no ALL_STAR+ wins). TOP_BIG_SCORE bank and win_tier inline chip are effectively dead code until thresholds are recalibrated. Use slateAwareCalibrate.ts and slateAwareThresholds.ts to re-derive thresholds against the broader distribution. Multi-session work; standalone calibration arc.

- **Bad_beat trigger frequency post-broadening** — empirical observation needed. Predicate broadened from `>= 2 R/O held cards on BUST/ROOKIE` to `>= 1 R/O held card on BUST/ROOKIE` (2026-05-24 amend). Frequency target unknown; user-stated mental model is "any premium-held hand that BUSTs or barely ROOKIEs is a bad beat." Future session should play 15-30 hands, count bad_beat firing rate, evaluate whether 30-50% feels right or whether predicate needs tightening (e.g. require BUST rather than BUST||ROOKIE, or require RED specifically rather than RED||ORANGE). If too frequent, tighten; if still feels right, lock.

- **TOP_BAD_BEAT copy second-pass rewrite** — broadened bad_beat predicate (2026-05-24 amend) means held cards may have overperformed while lineup still fell short. Bank copy patches landed tonight cover the worst mismatches but the bank could benefit from a fuller rewrite that explicitly handles both "held underperformed" and "held overperformed but lineup couldn't lift" textures. Future copy session, possibly with voice-polish tooling.

- **Voice-polish tool integration** — chat-drafted bank copy reads written rather than spoken; voice-pass AI tool or human pass before shipping is a methodology improvement worth investing in. Bucket 2 piece B copy and any future copy work would benefit.

- **Inferred dismissal cascade on panel TeamStamp / missTier surfaces** — when user dismisses ChallengeSharePrompt, the dismiss handler nulls `challengeTrigger`. Code reading suggests this also clears the win-tier panel TeamStamp (kind goes null at `GameView.tsx:2403-2406`) and the missTier props on TierGauge (~L2570) / TeamStamp (~L2429). Not observed broken during 2026-05-24 smoke — user reported only the TOP-slot symptom (Finding A, fixed Option-B style this session). Verify whether these surfaces actually clear on dismissal; if yes, decide whether they should persist like the TOP slot now does, or whether dismissal should retain the "clear everything chip-shaped" UX. Touches the dismissal handler at `shared/views/GameView.tsx:2995-3001`.

## Bucket 1 scope — bad_beat predicate redefinition

- **bad_beat predicate broadens to "held N high-tier cards but low result"** — current predicate (`shared/utils/triggerEvaluation.ts` ~L152-163):

  ```ts
  if (winTier === "BUST" || winTier === "ROOKIE") {
    const highTierHeldCount = roster.reduce(
      (n, c: any) => n + (c.wasHeld === true && (c.tier === "RED" || c.tier === "ORANGE") ? 1 : 0),
      0,
    );
    if (highTierHeldCount >= 2) {
      return {
        trigger: "bad_beat",
        headline: `Brutal hand. See if they survive the same slate.`,
      };
    }
  }
  ```

  Distilled: fires iff `winTier ∈ {"BUST", "ROOKIE"}` AND `count(c => c.wasHeld === true && c.tier ∈ {"RED", "ORANGE"}) >= 2`. Doesn't match user mental model. User-stated rule (locked 2026-05-24 chat): "Whenever user gets two top cards, regardless if they performed, that's a bad beat in their minds." Two example hands surfaced during smoke: (a) Webber held +3 FP, hand BUST at 162.4 FP. (b) Iverson held +1 FP, Duncan held +5 FP, hand ROOKIE at 194.2 FP. Both feel like bad beats to user; neither fires under current predicate. Bucket 1 work: define "top tier" (RED only? RED+ORANGE? confirm product vocabulary for high-tier cards), thresholds, interaction with current predicate (replace, extend, new trigger concept). Cascade implications: existing TOP_BAD_BEAT bank copy assumes held-card-underperformance — lines like "premium disappointment from both" don't read right for hands where held cards beat projection. Either copy rewrite or sub-bank split needed if predicate broadens. Estimated work: 1-2 dedicated bucket-1 sessions.

## Open from 2026-05-24 (real-copy session — piece B landed)

- **First-share invitation BOTTOM-wiring** — gated by Q2 LOCKED, deferred from bucket 2 piece D-min. Today first-share is unwired post-regression-fix; future session decides ChallengeSharePrompt prop boundary + trigger/first-share precedence. Site: `shared/views/GameView.tsx` ~L1304 (TODO comment in place; `firstShareInvitation` no longer imported there; `localStorage` flag `rm_usher_first_share_invitation` intentionally untouched so users who already saw the pre-fix invitation aren't re-presented when the wire-up lands).
- **Big-score inline stamp tier prefix** — `TierGauge` resolves big_score stamps' tier label from its `winTier` prop, but GameView's TierGauge mount passes `winTier={undefined}` (existing animation-semantics decision). Today big_score chips render as bare "BIG SCORE" without prefix. If a future copy session wants tier-prefixed big_score chips (e.g. "ALL STAR BIG SCORE"), thread the resolved hand winTier into TierGauge through a new prop (don't repurpose existing `winTier` — it gates animation behavior). Comment captured at `TierGauge.tsx` missTier prop docstring.
- **TOP_BIG_SCORE starName resolution** — locked design has `{starName}` resolving to anchor (`challengeTrigger.anchorBasePlayerId`). Bank reads strongest when it resolves to the top FP contributor on the hand. These diverge when anchor underperforms and a role-player explodes (user wins big on the role-player's back; bank names the disappointing anchor). Investigate where the right resolution lives — trigger eval picks a smarter basePlayerId for the big_score case, OR selector takes a separate "topContributor" arg. Tested copy quality is OK either way but the right semantics win.
- **TOP_DEFAULT bank unreachable** — placeholder lines scaffolded in 4bd0c89 are never selected at runtime per GameView L1330 filter (`challengeTrigger.trigger !== "default"`). Bank exists for shape consistency with locked Q1 design. Future routing changes that send default-trigger hands to TOP slot would require drafting real copy. Today: no work needed; leave placeholders. Comment block at the bank def in `chadChallenge.ts` documents the unreachability.
- **useChallengeShare evaluateTrigger lacks topGame context** — the share-prompt path's `evaluateTrigger` call (`useChallengeShare.ts:63`) doesn't receive topGame data, so rare_pull triggers from that path fire without `TopGameReason`. Selector falls back to RECORD bank per Q3.1 spec. Acceptable degradation since the user will have already seen full season-tier framing on the original reveal. If this path ever drives primary user perception of rare_pull, thread topGame through useChallengeShare.
- **postRevealCopy cache-key invalidation lacks integration test** — the cache-key invalidation fix at `GameView.tsx` (bucket 2 piece B smoke 2026-05-24) has no test guarding against regression. Extracting the `useMemo` body into a `usePostRevealCopy` hook would make it testable via `@testing-library/react` `renderHook` + `rerender`. Worth doing as a future tech-debt pass; risks bundling structural refactor into unrelated commits if done opportunistically. Verbose comment block at the useMemo site documents the bug fingerprint + reset-effect coupling so the next maintainer has the full context.
- **selectTopSlotFraming `starName: null` frequency** — observed null on a clear bad_beat hand during smoke (Webber 65.8 FP as heavy lifter, anchor potentially unset). Selector handled gracefully via unnamed lines, but TOP-slot banks are 70/30 weighted toward named lines. If anchor-null is common in production, lines will frequently fall back to the 30% unnamed pool, losing per-hand personalization. Investigate whether anchor is consistently set during draft, and consider whether the bank should derive starName from top-FP contributor when anchor is null (related to TOP_BIG_SCORE starName resolution followup above).
- **`useAchievements.ts:59` 409 Conflict** — observed during 2026-05-24 piece B smoke. Separate system from challenge / bucket 2; not investigated this session. Likely benign (duplicate-write race on achievement persistence) but worth a diagnostic pass when next touching the achievements layer.

## Resolved 2026-05-23 (this session)

- Worktree drift audit — full inventory now lives in `docs/worktree-registry.md`. Four worktrees classified: `feat/basketball-perseason-layout` (active-parked, partial supersedence on main for headshot pipeline), `refactor/shared-card-face` (active-parked, no main equivalent), `fix/badge-label-match` (archive-candidate, work shipped via PR #98 + chunkReload), `worktree-feat+achievements-and-challenges` (mergeable but retained per existing rule).
- May 18 culture-tier2 retry-run output safekept on achievements branch as commit `d810983`.

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

## Framing clarifications

- **"One-button frictionless" is a polish phase, not a feature requirement** (clarified 2026-05-22 session) — UX-pruning POLISH phase that happens AFTER all three challenge buckets ship and the feature is fully built. Not a feature requirement driving bucket scoping. Look for friction in the trigger → share → receive → play → return path once the funnel is complete.

## Pre-existing items from handover (carried forward)

- Baseball/football RTP audits using `rtpSim.ts` infrastructure
- Sim Migration B — `shared/tools/runSimulator.ts` still reimplements the deal loop, should call `generateRoster` via SportAdapter
- PBP ingestion for ejection data — ~7–8 hours single-machine fetch via `playbyplayv2`, populates dormant `injured`/`ejected` flags
- TD/DD badge dedupe in `computeBasketballBadges` — dormant dedupe code with stale id names
- `CLAUDE.md` worldcup → football drift — 4 stale references (`dev:worldcup`, `runSimulator.ts worldcup`, `lint` and `typecheck` under `npm --prefix worldcup`)
- `chad.ts:45` — literal `"1.3x"` in streak-intro message, cosmetic drift after multiplier rebalance

## Methodology / housekeeping

- Football culture tier 1 WIP stash (currently `stash@{0}` in `~/Desktop/ReplayMod-basketball`) — sitting since May, untouched throughout calibration. Evaluate or discard. Stash is also recorded in `docs/worktree-registry.md` under the `feat/basketball-perseason-layout` entry.
- **DO NOT DELETE `feat+achievements-and-challenges` worktree or branch** until challenge feature is fully shipped (all 3 buckets) AND verified working in production. Per 2026-05-22 diagnosis, branch is likely fully-merged-to-main (HEAD `34735d6` is an ancestor of main, all 20 "unpushed" commits reachable via the calibration arc), but worktree stays as safety net until live feature is confirmed good. Today's safekeeping commit `d810983` advances the HEAD with the May 18 tier-2 culture-retry artifacts — also recorded in `docs/worktree-registry.md`.
- Login / Google auth popup overlay conflict — user-reported, not diagnosed this session. Symptom needs detail. Could be z-index, modal-stacking, or auth-flow timing.

## Bucket 2 starting context — S1 slot-split restoration + bank rewrite

Scoped 2026-05-22, deferred to fresh session for execution. Bucket 1 (MISS firing-condition reconciliation) and bucket 3 (R-side completion) are separately deferred.

### Verdict on restoration approach

**Structural revert + content rebuild — NOT a clean revert.** Pre-regression commit `5f4ae5e` removed `chadTriggerFraming` (the TOP-slot bank) and rewired the post-reveal commentary slot to use `selectChallengeInitiation` (the BOTTOM-slot push-to-send bank). A pure revert restores the slot split but reintroduces TOP-slot copy that *still violates* the current locked design — pre-regression lines mixed celebration with phrases like "needs an audience," "Find a victim," "Send it — let them try," which the S1 slot rules (LOCKED session 2) explicitly forbid in the TOP slot. So the wiring pattern reverts; the copy gets rebuilt against the stricter spec.

### Implementation pieces

| # | Piece | Action | Change site |
|---|---|---|---|
| A | GameView L1300 wiring | Structural revert pattern: replace `selectChallengeInitiation` call with a new `selectTopSlotCelebration` call (the new TOP-slot function we draft). Trigger value already flows through `challengeTrigger`. | `shared/views/GameView.tsx` ~L1351 (10–15 line block) |
| B | New TOP-slot bank in `chadChallenge.ts` | Add `selectTopSlotCelebration` function + 4 trigger-keyed banks (`TOP_BAD_BEAT` / `TOP_MISS` / `TOP_BIG_SCORE` / `TOP_RARE_PULL`) + `TOP_DEFAULT` fallback. Reuse the `pickWithAntiRepeat` ring buffer. Net ~+150 lines. | `shared/commentary/chadChallenge.ts` |
| C | Inline stamp render in TierGauge | Bank lines need a `{STAMP}` placeholder; TierGauge's typewriter at L769–795 needs to recognize stamp tokens and render them as DEAL/DRAW-style inline tokens. Two implementation directions to decide between: extend the typewriter token-walker, or segment the line into prefix / stamp / suffix before passing in. | `shared/components/TierGauge.tsx` ~L769–795 |
| D | First-share preempt coexistence | `firstShareInvitation` preempt at L1314 writes to TOP slot but its content is push-to-send (violates the new spec). Decide: route first-share through TOP+BOTTOM split, or scope first-share separately. Likely defer to its own decision. | `shared/views/GameView.tsx` ~L1314 |
| E | BOTTOM slot (`ChallengeSharePrompt`) | No change. Already pulls from `selectChallengeInitiation`, the correct BOTTOM-slot bank by design. | n/a |
| F | DEAL/DRAW token visual sourcing | Design doc references "DEAL/DRAW token style" from FTUE as the inline stamp visual idiom. Need to locate existing DEAL/DRAW token code in FTUE for shape + styling reference before piece C is implementable. | FTUE source + design doc inspection |

### Open questions — RESOLVED 2026-05-23

Resolved in a chat-Claude session today. Authoritative versions live in `docs/replaymod-design-decisions.md` under "Bucket 2 (S1 slot-split restoration) — LOCKED". Compact form here for quick reference:

1. **Bank shape** — locked. `Line = Array<string | StampToken>`; 5 sub-banks (`TOP_BAD_BEAT` / `TOP_MISS` / `TOP_BIG_SCORE` / `TOP_RARE_PULL` / `TOP_DEFAULT`) × ~10 lines each. Selector `selectTopSlotFraming(args)` parallels `selectChallengeInitiation`; reuse `pickWithAntiRepeat`.
2. **First-share preempt** — fold-in. First-share routes to BOTTOM only; TOP keeps trigger-aware celebration on that hand. L1326-1332 in `GameView.tsx` writes BOTTOM only.
3. **DEAL/DRAW token rendering** — option B (pre-segment at bank level). Parts model matches FTUE override pattern at `TierGauge.tsx` L714-768; new render branch under L769 walks parts.
4. **Copy-drafting venue** — split. Pieces A, C, D, E, F in code session; piece B (~50 lines across 5 sub-banks) in a separate chat session.

### Code site references

- `shared/views/GameView.tsx`
  - L1244–1376: `postRevealCopy` useMemo (TOP-slot writer set)
  - L1314: first-share preempt block (writes TOP)
  - L1351: post-reveal trigger-override block (the regression site — currently calls `selectChallengeInitiation`)
  - L2917: `<ChallengeSharePrompt />` mount (BOTTOM slot)
- `shared/components/TierGauge.tsx`
  - L769–795: typewriter render that consumes `postRevealCopy.primary` and `.secondary`
- `shared/commentary/chadChallenge.ts`
  - L300–423: existing `INITIATION_*` banks (BOTTOM-slot reference shape)
  - L500: `_CHAD_RECENT_WINDOW = 8` anti-repeat ring buffer
  - L540: `selectChallengeInitiation` (the reference function shape for the new TOP-slot function)

### Note on illustrative copy

Sample TOP-slot lines that appeared in the 2026-05-22 orientation report (e.g. `"Hell of a beat there — {STAMP}"`, `"There it is — {STAMP}. Numbers like that don't fold."`) are **illustrative shape, not committed starting material**. Bank drafting starts fresh against the locked S1 slot rules and current vocabulary.

## Path-2 / Path-3 followups from prior shipped fixes

- **Position override map for residual hyphenated-position errors** — small basePlayerId-keyed map for high-salience players where the systematic POS_MAP rule produces a wrong simplified position. Confirmed residuals: Ben Simmons (G-F → SF, canonical PG), Luka Dončić (F-G → SG, canonical PG), Scottie Pippen (F-G → SG, canonical SF), Kyle Anderson (F-G → SG, canonical SF), Scottie Barnes (F-G → SG, canonical SF), Amen Thompson (G-F → SF, canonical PG). Plus any others surfaced by play observation. Low priority — improvement on a partial improvement.
- **Consider dropping the simplified-position field entirely** — have UI consume `positionFull` directly. NBA hyphenated positions don't reliably collapse to a single letter; the systematic rule applied 2026-05-22 fixed the majority of cases but leaves a residual the override map can only patch player-by-player. Path-3 is the larger UI redesign that removes the collapse step entirely. Real consideration if position-display continues to surface accuracy complaints after the override map is in place.

## Shipped this session

- **Position data fix** (2026-05-22) — flipped POS_MAP simplification rule from secondary-letter-wins to primary-letter-wins for hyphenated positions: `C-F → C` (was PF, affected 81 players incl. Embiid, KAT, Duncan, Howard, Pau Gasol), `G-F → SF` (was SG, affected 114 players incl. Vince Carter, McGrady, Iguodala, Marion, DeMar DeRozan). `F-C → PF` and `F-G → SG` left unchanged (were already correct). Re-ran `fetchHistoricalPositions.mjs` + `mergePositions.mjs`, updated `nba-positions.json` and all 29 per-season `players.json` files. Acknowledged residual errors captured above as path-2 override-map followup.
