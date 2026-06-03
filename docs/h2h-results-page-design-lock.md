# H2H Results Page — Design Lock

**Status:** LOCKED — commit this doc before any code (doc-lock-then-implementation).
**Scope:** The results stage of the H2H recipient reveal. Standalone; independent of `h2h-relay-tension-design-lock.md`.
**Workstream:** RESULTS (the priority next workstream). Must land before LANDING V2 starts co-editing `shared/`.

**Files in play (anchors from recon; line numbers may drift):**
- `shared/components/H2HResultsOverlay.tsx` — primary surface (~940 lines).
- `shared/components/H2HRevealScreen.tsx` — touched only for the reveal-side backing panel.
- `shared/components/H2HRecipientReveal.tsx` — the handoff host; mounts both surfaces and runs the 350ms crossfade (`useCrossfade(showOverlay, OVERLAY_CROSSFADE_MS=350)`).
- `shared/components/H2HScoreRail.tsx` — shared `ScoreCell` + rail-width constants (the no-jump column skeleton).
- `shared/commentary/chadChallenge.ts` — commentary bank.

---

## 1. Goal

Results tells the user's story and points to the next move. The screen has one flippable hero (the user's card — tap = preview, tap again = flip to game logs), commentary occupying the freed center, both team scores docked beside their names, and a state-aware CTA. The relay-tension chase is a *reveal-time* effect and is finished by the time results loads — so results is free to reorganise the scores without costing the chase anything.

Hard requirement throughout: **no jump.** Anything that was on screen at the end of reveal and is still on screen in results must not visibly shift, resize, or reorder across the handoff. The one piece of motion that *is* wanted — the scores gliding to their docked positions — is deliberate, choreographed, and must read as the screen settling, never as a snap.

---

## 2. The no-jump contract (invariants — now written down, previously only hand-kept)

These must be byte-identical between `H2HRevealScreen` and `H2HResultsOverlay`:

- **Outer root / inner column:** `position:fixed; inset:0`, same gradient, `padding-top: safe-area-inset-top + 20`, `padding-bottom: safe-area-inset-bottom + 20`; inner column `maxWidth: min(480px, 100%); margin 0 auto; padding 0 16`.
- **Strip geometry:** height 80, gap 4, mini-card natural width 150, cell `aspectRatio 329/478; minWidth:0`, inner card `width:150; height:218; transform: scale(STRIP_CARD_SCALE); transformOrigin: top left`.
- **Zone spacing:** top-strip→hero gap 18; hero→bottom-strip gap 4.
- **Column skeleton:** `gridTemplateColumns: ${LEFT_RAIL_WIDTH_PX(100)}px 1fr ${RIGHT_RAIL_WIDTH_PX(80)}px`. This is what keeps the hero locked — the center `1fr` must be the same width in both screens or the hero card re-centers (a jump). The skeleton is preserved in results **regardless of what fills the side columns**; "locked hero" = preserve the skeleton, repaint the cells.
- **Card order:** both strips are `slotIndex`-sorted on both surfaces (`revealOrder` is ignored for layout). At reveal end-state cards rest in slotIndex slots; results uses the same sort. No reorder on handoff. Do not reintroduce spatial `revealOrder` use (it caused held-card drift; killed 2026-05-30).

**Hazard to close in §3:** every value above currently lives in *two* source-of-truth locations (`HandStrip` in `H2HRevealScreen.tsx` and `ResultsStrip` in `H2HResultsOverlay.tsx`). They're equal only by hand. Any drift surfaces as a 350ms before/after wipe on the crossfade. The middle-band surgery below happens right next to these constants, so the risk is live this workstream.

---

## 3. Build order (serialized worktrees; merge one fully before the next)

1. **Strip lockdown — FIRST, before any middle-band change.** Either (a) factor the strip into one shared component consumed by both surfaces, or (b) at minimum ship a harness assertion that both strips compute to identical geometry (per the standing "assert the neighbors" rule — the assertion must FAIL on a deliberately drifted constant). Recommend (a) if it's clean; (b) is the floor, not the ceiling. This removes the by-eye parity hazard before we operate next to it.
2. **Reveal backing panel** (§4).
3. **Results middle band** — drop opponent hero, commentary, docked-score *targets*, delta-in-copy, CTA (§5). Scores arrive via cross-dissolve placeholder is **not** used — the glide ships in this cut (see §6 ordering note).
4. **Score glide** (§6) — the cross-surface element. Preceded by its own recon+proposal step.

Each step: own worktree, full gates, review, merge, device-verify before the next. Standard repo rules apply (stage explicit paths only — never `git add -A`; `-m` on every commit and merge; commit from inside the worktree; function count stays 11/12).

---

## 4. Reveal stage — unchanged except a backing panel

No layout change. Scores stay in their current cluster, adjacent, with size + glow + chase intact. Because reveal is untouched, the relay beats (delta punctuation, momentum tags, anchor frame) all stay exactly where they are — **no rehoming**, which is the whole reason we landed on "don't relayout reveal."

The one addition: a backing panel behind the score cluster so the numbers stop reading as floating in air. Two constraints:
- **Glow-safe:** the leader glow is a `box-shadow` spread band (the layer that bit abc-8a). The panel must not give the numbers a hard edge that fights the band — keep the panel behind/larger than the glow, soft-edged.
- **Growth-safe:** both totals *grow* as scores climb. Size the panel for the final total or keep it `overflow: visible`, or growth clips against it.

This is a reveal-side visual change → device-verify on a real climbing hand; confirm the panel doesn't perturb the score-change animations or clip the glow on a bright tier.

---

## 5. Results stage — middle band

New stack, top to bottom:

- **Opponent strip** — locked (§2). Opponent's docked score lands far-right in this strip's name header (§6).
- **Commentary block** — occupies the freed center where the opponent HeroCell used to be (`gridRow: 1 / span 2` region). Spans full width (the side columns no longer hold scores, but the hero row below keeps the column skeleton so the hero stays put). Holds the "story of why" copy with the **delta folded into the prose** — the standalone `-8.7 FINAL` float is removed. The headline already states the margin ("8.7 short"); results relies on the copy to carry the number, not a separate float.
- **User hero slot** — locked, flippable. Mechanism already exists: tapping a strip card fills a *separate* HeroCell and dims the strip card to 0.35; the strip card never lifts out. Keep this; just drop the opponent HeroCell. (This is why "two of the same card, no jump" works as-is.) For the back→front flip, lift `BottomStripCell`'s flip-inner pattern (`perspective:600; preserve-3d; rotateY 0/180`) into a shared `FlipCard` if we want animated flip instead of the current instant `flipped:true` swap.
- **User strip** — locked. User's docked score lands far-right in this strip's name header (§6).
- **Sticky bottom** — countdown pill (LOSS_OPEN only) above the state-derived CTA (WIN → "Send It Back" / "Send Receipt"; LOSS_OPEN → "Try Again" / "Run It Back"; LOSS_CLOSED → "Play your own hand"). Timer source of truth unchanged: `windowClosesAtMs` (`first_attempt_at_ms + 1h`, server, stable across replays). Not in scope to make the pill copy margin-aware this cut.

Opponent-card inspection (flipping the opponent's logs) is **out for v1** — it pulls focus on a screen built around the user's story; the user's own card back + score + commentary already cover what opponent logs would say. Don't burn the bridge: wherever the opponent rests, leave it *able* to go tappable later; do not wire the tap now.

---

## 6. The score glide (the hard part)

**Intent:** on results load, each final score glides from its reveal-cluster position to the far-right of its own team's name row — opponent's up to the top strip's name header (e.g. JOHN TANG), the user's down to the bottom strip's header (YOU). It must read as the screen announcing its result form, not as a teleport.

**Docked landing spec (variable name width):**
- Name row is the existing strip name header. Row height must equal the current header height — the docked score lands *inline*, never grows the row (growing it shoves the strip = a jump).
- Layout: `display:flex; align-items:center; justify-content:space-between`. Name on the left gets `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap` — **the name truncates, never the score.** Score on the right gets `flex-shrink:0` and a reserved min-width sized for the widest realistic total.
- Resting score styling reuses `ScoreCell`'s three-state colour (winner green / loser neutral / tie), inline form.

**The cross-surface problem (this is the first such element in the system):** today reveal and results are two fully independent surfaces that only crossfade — nothing survives the handoff. The glide breaks that: one score element must live *across* the boundary and animate from cluster coords to name-row coords *while the 350ms crossfade runs underneath*. The failure mode is a **double-render** — the gliding score plus the crossfade's own copies of both old and new positions all visible for 350ms, which looks worse than either pure option.

**No-double-render contract (must hold for the full 350ms):** exactly one visible score per team at all times during the handoff.
- Reveal surface's own score is suppressed/frozen at handoff start.
- Results surface's docked-score slot renders empty (or opacity 0) until the glide settles, then reconciles to the real docked score.
- The gliding element is owned by exactly one layer.

**Required pre-build step (do NOT free-hand this):** recon + written proposal answering — which layer owns the gliding element (a new transition layer in `H2HRecipientReveal`, vs. results owning it, vs. a portal); how it measures start coords (reveal cluster `getBoundingClientRect`) and end coords (name-row target rect); how it suppresses the crossfade's copies; and how it reconciles into the resting docked score at the end. Review that proposal before implementing.

**Ordering:** the glide ships in the first cut (no cross-dissolve interim). Build §5's structure with the docked-score *targets* in place, then the glide animates into them.

**Acceptance (device-verify, harness can't see any of this):**
- Glide reads as intentional motion, not a snap or a teleport.
- No double-render at any point in the 350ms.
- Strips do not shift; hero does not move; name truncates (not score) on a long name.
- Reveal still feels like one moment (the backing panel + unchanged cluster).

---

## 7. Commentary sourcing

The freed center is the home for the "story of why" copy. The bank already exists in `shared/commentary/chadChallenge.ts`:
- `selectChallengeResolution` — the substantive two-clause "why".
- `chadChallengeTactical` — heldAnchor-aware ("Held X for the anchor and X delivered…"); **currently rendered nowhere** — this is the "rode Vucevic" material, wire it in.
- Delta-aware framing folds the margin into the copy here (replacing the removed float).

Results currently renders only the local `selectHeadline()`. The rebuild wires the resolution/tactical lines into the freed center.

**Known seam (accepted):** the commentary voice is "loopy" right now and a voice-cleanup pass is pending. Ship the *structure* now and wire whatever copy exists — Results is simply the first place commentary gets a prominent slot, so until the voice pass lands, that slot shows the current copy. This is a known seam, not a surprise. (Matches the standing "ship the testable version, measure, don't over-polish first" rule.) The voice spine (relationship of any deterministic generator to `commentary-voice-system.md`) is decided before LANDING V2 starts, not here.

---

## 8. Gates & device-verify

**Per-task gates:** `npm test`; `npx tsc --noEmit`; `bash scripts/build-vercel.sh` (shared/ is touched); the harness `scripts/verify-h2h-play-layout.mjs`; function count 11/12. Worktree node_modules per the standing setup (root symlink for react + basketball pointed at the main worktree's real dir for the vite plugin). Warm re-run any cold-dev-server phantom timing failure before calling it a regression.

**Harness additions this workstream (assert the neighbors):**
- Strip cross-surface geometry assertion (§3) — must fail on a drifted constant.
- Docked-score row-height assertion — must fail if the score grows the name-row height.
- Hero-X / column-skeleton parity assertion across reveal→results.

**Device-verify (the live gate — green tests ≠ done):** recipient flow is verified on **PROD after merge**, not on a Vercel preview (per-origin anon session + dev-mock route stripped from previews). Wait for Vercel Production = the new merge hash, Ready, before checking (old-build trap). The glide, the backing panel, and "feels like one moment" are all feel items only a device shows. For controlled dev instrumentation, localhost + the dev-mock route.

---

## 9. Open items / deferred / seams

- **Parallel-terminal sequencing:** the strip lockdown and the score work touch `shared/`. While Results is the only live workstream this is safe. LANDING V2 must not start co-editing `shared/` score components until this lands and merges.
- **Last-set delta → results delta seam** (from the relay deferred list) is deliberately *not* touched here.
- **Opponent inspection** parked (v1 = no opponent flip; leave it able to go tappable later).
- **CTA copy margin-awareness** (loss_big vs photo_finish) not in scope this cut — headline/commentary owns framing.
- **ChatGPT-feedback material** ("Send Receipt" / "Run It Back" framing, NBA-Twitter copy) lands in the commentary/CTA copy, sequenced with the voice pass — structure first here.
