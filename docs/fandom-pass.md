# Replay: focused fandom pass

Implementation scope approved by John on 2026-09-20.

## Objective
Make the basketball worth watching, the player's backing legible, and the outcome readable. Evaluate what the free experience offers without assuming it can replace monetary stakes. No claim that prizes will solve weak engagement.

## Baseline
Clean free-play branch release/basketball-free-play, e859bda673d3bbbcfebf6a631e406cbea1f324f0. Live https://replay-free-play.vercel.app/basketball/ . Preserve mother branch. This brief does not authorize reintroducing economy behavior.

## First implementation slice: backing and score reference
- Keep current deal, two draws, hold locking, scoring, season selection and reveal order.
- Normal solo primary actions: DEAL → DRAW → FINAL DRAW → REVEAL → REPLAY. Map labels to actual state; do not introduce another action or confirmation screen. Preserve tutorial behavior until its scripted instructions are reconciled.
- Persist a readable BACKED marker for held players through reveal and result. Explain that backing retains a player, not that it guarantees a strong performance. Mark replacements distinctly only where useful; avoid cluttering every card.
- Before final draw, use the actual held set: e.g. “Backing Duncan and Iverson · 3 spots to draw.” Handle zero, one and all five held; all-held advances must not promise replacement cards.
- Show compact season tier reference during selection and result. Use existing authoritative/shared thresholds. No percentiles, simulated rarity, currency or new scoring calibration.

## Second implementation slice: historical reveal and result
- Present current revealed player's name, backed status, real game date/opponent and a concise actual stat line in the existing reveal area. Use verified data; omit unavailable details. Ordinary nights remain ordinary.
- Provide next tier and exact points remaining alongside unresolved player count. Derive from completed reveals, not animation overshoot or hidden final scores. Do not promise a tier is reachable without calculating that. At top tier show achieved tier rather than a fictitious next target.
- Result: total FP + tier, leading player's contribution with backed/drawn attribution, and exact gap to next tier where applicable. Use existing scoring conventions for badge effects; numbers must reconcile with authoritative final total.
- Keep expanded historical details available without making another tap mandatory. Retain existing pace and skip controls; no extra reveal stage.

## Existing implementation points inspected
- shared/components/GameBar.tsx: actionLabel currently gives NEXT for both basketball hold advances, GAME TIME for reveal; roundsUsed already passed.
- shared/views/GameView.tsx: held IDs and reveal completion state exist. TierGauge hideBar explicitly hides selection phases and verdict results. Existing layout has dedicated gauge region; visual fit must be checked before restoring content.
- shared/views/_useReveal.ts: onCardComplete and displayed score state exist. Presentation spring can differ temporarily from actual completed score; suspense arithmetic must remain factual.
- basketball/src/utils/seasonThresholds.ts: shared browser/server lookup, including existing fallback thresholds.
- Live cards already expose date, opponent, actual stat line and badges on their reverse; improve their presentation rather than create historical facts or duplicate data stores.

## Verification / acceptance
- Same hand generation, held-card rules, historical outcomes and settlement before/after.
- Labels accurately describe each of the two decisions and final draw, including all-held case.
- Backed identity survives drawing, reveal, skip, result and clears on replay.
- Displayed score targets use active season thresholds; completed sums and result reconcile; no hidden-outcome leakage.
- Real-browser mobile and desktop checks: all cards, reference, historical detail and CTA fit without overlap. Reuse current layout rather than stack new panels.
- Full regression suite, release build, economy guard; real deal/hold/draw/reveal/result/replay smoke.
- Challenge/tutorial surfaces must retain working behavior; do not silently change their scripted mechanics.

## Test boundary
After this one bounded pass, observe target fans: choice attachment, attention to real performances, comprehension, voluntary replay and later return. Collect minimal nonfinancial events only if existing analytics cannot answer completion/replay questions. Do not treat telemetry as proof of feelings.
Interest without repeat play is a valid finding. No new mode, opponent, progression, currency, rewards, streak incentives or extra spectacle in response to weak results within this pass.

## Implementation notes — 2026-09-20
Normal solo basketball uses a dedicated compact panel in the existing 96px gauge/commentary region. Other modes keep their existing gauge. Historical context only reads completed reveals; result leaders use total actual FP including existing score effects. Explicitly completed card IDs reset on new selection/deal; skip completion fills the set. Backed labels live in the card corner, away from the badge strip.
Automated coverage includes hidden-performance exclusion, real box-score presentation, drawn leader attribution, top tier, reset and all-backed actions. Full suite: 156 files /1666 tests. Release build, unbound-symbol gate and economy artifact guard pass. Real-browser verification recorded in the workspace deployment status report.
Responsive release-file checks passed at 390×700 and 360×590 through idle, hold, final selection, reveal, result and replay. Checked actual bounding rectangles of cards, backing labels, panel children and primary controls; panel/control overlap also checked. Small-screen flow exercised skip. Browser fixture is retained in workspace outputs, not shipped with the app.

Desktop 1280×900 passed the same six stages. All 18 viewport/state checks passed.
