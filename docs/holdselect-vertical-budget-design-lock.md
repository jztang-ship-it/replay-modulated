# hold_select Vertical-Budget Fix (DESIGN LOCK — v2, responsive-adaptive)

**Status:** PROPOSED — awaiting sign-off. No implementation until committed.
**Closes in one pass:** #11 layout overflow (live regression on `da5af3b`), Area-G Draw-gap (deferred), #18 reserved-bottom fragility. Per the investigation these are one vertical-budget problem at `hold_select`.
**Surface:** `H2HRecipientPlay` + `H2HBoardShell`, `hold_select` state only. Reveal arc, redraw, resolve untouched. Layout-only — the #11 preview-then-hold interaction is not changed.

**Model (user decisions):** **Fit responsively to whatever screen we're on.** Don't optimize the whole experience for the smallest phone. Fluid sizing shrinks only as needed, down to a **comfortable floor**; below that floor, **scroll** (CTA pinned) takes over rather than shrinking into jank. So: generous no-scroll fit on normal phones, fully-reachable scroll on the worst phones, never janky-cramped, never stranded.

---

## 1. Root (px-quantified, from investigation)

`hold_select` needs ~759–824px of content; available inner height at real iOS URL-bar/webview viewports is ~543–579px → overflow 223–324px. `reserved-bottom` (flex, minHeight:0) collapses to 0, pushing recipient strip + Draw CTA off the bottom edge. Top zone grew +70–98px from #11 relocating intro text into it. Avoidable consumers: oversized/over-long text, unused hero floor, decorative opponent strip. Determinism bug: stage-text height randomizes 64↔92px by which bank line is picked.

## 2. The fix — fluid levers, state-scoped to hold_select (restored for reveal)

All sizing is **responsive** (`clamp()` / viewport-relative), not a fixed small format. Roomy viewports render generous; only tight ones tighten. Each lever scales between a comfortable max and a min within the floor.

**(1) Fluid intro text + 3-line clamp.** Font scales (e.g. `clamp(16px, ~4.2vw, 22px)`), line-height ~1.25–1.3 fluid. **Hard 3-line clamp with reserved max-height** so the budget is DETERMINISTIC regardless of which `selectRecipientIntro`/`DealNudge` line the anti-repeat picks (kills the 64↔92px randomization). Words unchanged — vetted canonical-voice banks; display only.

**(2) Drop opponent face-down strip during hold_select.** Six face-down backs = zero info. Conditionally render null in hold_select; **re-mount for column_flip** (flips face-up for reveal). +84px (+112 with label). Resolves the §10 text-placement question (no strip → text has room up top). *Impl caution:* confirm column_flip mount-then-flip works without prior DOM presence; if the animation assumes presence, keep it mounted but zero-height/hidden in hold_select instead.

**(3) Collapse hero floor during hold_select, fluid.** `HERO_MIN_HEIGHT_CSS` is sized for the reveal 2-card grid; during hold_select it reserves ~200px empty. Drop to a fluid one-card footprint; **restore for column_flip, animated into column_flip's existing duration** (no instant jump — preserves the #11 "strip doesn't lurch during reveal" invariant). ~+149–182px at the larger sizes.

**(4) Fluid inter-zone margins, hold_select-scoped.** `TOP_ZONE_MARGIN_BOTTOM_PX`, ZonePanel padding, etc. scale down on tight viewports; full spacing on roomy ones and all other states.

**(5) Proportional shrink.** Preview box + previewed card scale together with the hero footprint so nothing looks stranded.

## 3. The comfortable floor + scroll fallback

- Fluid sizing shrinks levers (1)–(5) only as far as the **comfortable floor** — the smallest sizing that still reads clean (NOT the absolute minimum; set generously so it never looks janky).
- **Above/at the floor:** everything fits, **no scroll.** This is the experience on essentially all normal phones.
- **Below the floor** (genuinely tiny / heavy-webview-chrome viewport where even floor-sized content overflows): the hold_select content area becomes **scrollable with the Draw CTA pinned (sticky) and always visible.** Shrink a little, then scroll — never shrink to ugly, never strand the CTA.
- The floor is the one tuned value; impl sets it, device pass confirms it reads well. No hard pixel viewport threshold — adaptation is automatic.

## 4. Invariants (unchanged)

- `held: Set<number>` semantics + downstream (redraw/column_flip/handoff) — untouched.
- #11 preview-then-hold interaction (truth table, markers, triggers, ref-pinning, `introSig` purity) — untouched; layout-only.
- All shrink/drop/scroll behavior is **state-scoped to hold_select**; reveal/redraw/resolve render exactly as today.

## 5. Pass/fail gate (two-part — THE anti-regression check)

At each target viewport, in hold_select AND after every tap state (preview / first-hold / move / unhold / multi-hold), with safe-area injected:

**(a) Above the floor (no-scroll fit):**
- `recipientStrip.bottom <= viewport.height`
- `ctaButton.bottom <= viewport.height`
- `topStrip.top >= 0`
- page does NOT scroll (scrollHeight <= viewport height)

**(b) At/below the floor (scroll fallback):**
- the CTA is **pinned and fully visible** (`ctaButton.bottom <= viewport.height` AND not clipped) at all scroll positions
- the recipient strip is **reachable** (present in the scrollable content; appears in viewport when scrolled)
- no content is unreachable / clipped-and-unscrollable

Target viewports: **390×844, 390×700, 390×664, 360×590, 320×520, 390×580 (webview ~90px top chrome, inset-bottom 0)**. The larger ones must pass (a) no-scroll; the smallest/webview may legitimately land in (b). Implementation reports which viewports landed in (a) vs (b) so we can see where the floor falls.

## 6. Harness fix — SHIPS WITH THE FIX (non-negotiable)

The regression went live green because `verify-h2h-play-layout.mjs` runs ONE viewport (390×844), NO safe-area injection, and asserts only zone-relative rects — never viewport containment/reachability. Fix all three:

1. **Viewport sweep loop** over §5 list (promote the #18 `/tmp/measure-cta-overlap-ios.mjs` pattern).
2. **Safe-area injection** per viewport (override the shell's `calc(env(safe-area-inset-*)+20px)` paddings).
3. **Containment/reachability assertions** (§5a and §5b) at each viewport across all tap states S1…S7 — branching on whether the viewport fit no-scroll (assert 5a) or fell to scroll (assert 5b).

After this, the regression class cannot pass green again, and Area-G/#18 inherit a harness guarding the real mobile budget.

## 7. Out of scope (logged)

- Copy-shortening the intro banks (display clamp handles budget; revisit only if device pass says it reads "too wordy").
- Misfiring "Failed to create challenge — make sure you're signed in" (preview-origin session; housekeeping).
- `supabase/.temp/` gitignore; `docs/4b-balanced-win-curation.md` untracked.
