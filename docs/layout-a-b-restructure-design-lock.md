# Recipient Flow: Layout A / Layout B Restructure (DESIGN LOCK)

**Status:** PROPOSED — awaiting sign-off. No implementation until committed.
**Supersedes:** the fluid-restore model in `holdselect-vertical-budget-design-lock.md` (which treated hold_select as one fluid layout restoring to reveal). The responsive sizing + scroll-floor + harness work from that lock CARRIES FORWARD and now applies to BOTH named states below. The A→B *transition model* is what changes.
**Surface:** `H2HRecipientPlay` + `H2HBoardShell`. Reveal/results content and redraw logic adjust per the new sequence; `held` semantics and the #11 preview interaction are preserved.

---

## 1. What changes (summary)

The recipient flow becomes **two formal named layouts** with a defined transition:
- **Kill the pre-deal screen** (old img 1, "Hit deal to see your starting deck") entirely. Challenge entry goes straight into Layout A.
- **Layout A** = decision screen (deal-in + preview/hold/unhold). Opponent NAME ONLY, no opponent lineup.
- **Layout B** = reveal/results screen. Opponent lineup present (face-up), your lineup slid to bottom.
- **Kill the opponent card-flip** (old `column_flip` opponent reveal). Opponent cards appear already face-up in B — the recipient saw them on the challenge page before accepting, so they were never face-down here.
- **Keep your own replacement-card flip** (your redraw, back→front, regular-game motion).
- **Kill #14 (VS / "Ready Set Go")** — the settle-pause (§3 step 4) replaces it.
- **Fixes:** bottom label reads **"YOU"** (not the random handle); Layout B CTA clip (old img 5) resolved via the responsive budget rules applied to B.

---

## 2. Layout A — decision state (challenge entry → hold)

Top → bottom:
- **Opponent name only** (e.g. "JOHN TANG"). NO opponent strip, NO card-backs in A.
- **Explanation / intro text** (Stage 1 / Stage 2 / instructional — the canonical-voice banks, fluid-sized + 3-line clamp per the carried-forward budget lock).
- **Your single hero preview box** — empty bordered box; fills with the big previewed card on tap.
- **Your mini-slot lineup** (6 cells).
- **"YOU"** label (literal text "YOU", replacing the random handle).
- **CTA** (Draw).

**Explanation area = sequenced text surface (one region, content swaps by beat):**
The explanation slot in A is NOT a single static intro. It is a multi-state text region sharing one fluid-sized, 3-line-clamped slot. States in order:
- **Deal-intro** (during/right after the theatrical deal-in): a TEMPLATED line referencing opponent name + their target score — e.g. "This is the same lineup {opponent} started with. See if you can beat their {score}. Ready to go." Interpolates from `challengeCtx` (same data shown pre-accept / reused in B; no new fetch). Uses {opponent}/{score}-style tokens like the existing intro banks.
- **Stage 1 / Stage 2 / instructional** (existing flow, as the user previews/holds).
The deal-intro occupies the SAME slot as Stage 1, just earlier in the sequence — it is REPLACED (not added alongside) when the user starts previewing, via the same dismiss-on-first-preview trigger built for Stage 1. **Exact copy for every state is deferred to a later copy pass; what's locked here is the structure** (multi-state, deal beat writes first, all states must fit the fluid 3-line clamp, deal-intro is templated).

Behavior:
- **Theatrical deal-in:** on entry, your starting hand deals left→right into your mini slots. KEEP this motion (it's theatrical only, but wanted). The deal-intro text shows here.
- **Preview / hold / unhold:** the #11 interaction, UNTOUCHED. Tap non-previewed → preview big; tap previewed-not-held → hold (yellow mini border + H mark on big); tap previewed-held → unhold; move resets cycle.
- Draw always enabled.

## 3. The Draw → reveal sequence (ORDERED — this is the dizziness fix)

The current code fires hero-expand + strip-drop + opponent-unwrap + flip simultaneously at T=0 (collision = dizzy). Replace with this ordered sequence so the eye tracks one thing at a time:

1. **Hit Draw.** Your held players stay in place.
2. **Your replacement (non-held) cards flip** back→front in your mini strip — your redraw resolving. Regular-game flip motion. (KEEP. This is the only flip that survives.)
3. **Simultaneous A→B transition** (one coordinated ~250–300ms beat):
   - Your hero box + mini strip **slide DOWN** to their Layout B positions.
   - The explanation text is **replaced by the opponent's mini strip + opponent hero slot, appearing face-up** (NO flip — match the fade/slide motion the replacement cards use, for consistency).
   - Opponent **name stays fixed** in place throughout.
4. **Settle-pause (~1000ms).** Layout B fully composed — both lineups present, both hero slots still EMPTY. Stillness. This is the clear divider between pre-reveal and reveal, and REPLACES the VS / Ready-Set-Go beat (#14 killed).
5. **Reveal.** Cards populate into each other's hero slots; scores tally → final result headline ("Cooked. +31.3 over …" etc.).

No jumping at any step — every position change is animated, never a hard cut.

## 4. Layout B — reveal / results state

- **Opponent name** (fixed, same position as A).
- **Opponent mini lineup** (face-up) + **opponent hero slot**.
- **Your mini lineup** (slid down from A) + **your hero slot**.
- **"YOU"** label on your lineup.
- Scores per side; result headline.
- **CTA** (Try Again / next — outcome-aware per the later #17 work, out of scope here).

B is the DENSER layout (two full lineups + two hero slots + scores). Per §6 it follows the SAME responsive rule as A: fit responsively, scroll with pinned CTA only below the comfortable floor. The old img-5 CTA clip is exactly this — fixed by applying the budget rules to B.

## 5. Keep / kill ledger

| Item | Disposition |
|---|---|
| Pre-deal screen (img 1) | **KILL** — enter straight into A |
| Theatrical deal-in (cards into your mini slots on entry) | **KEEP** |
| #11 preview/hold/unhold interaction | **KEEP, untouched** |
| Your replacement-card flip (redraw, back→front) | **KEEP** |
| Opponent card-flip (old column_flip opponent reveal) | **KILL** — opponent appears face-up in B, never face-down |
| #14 VS / "Ready Set Go" beat | **KILL** — settle-pause (§3.4) replaces it |
| Random handle as your label | **KILL** → literal **"YOU"** |
| Responsive sizing + scroll floor (prior budget lock) | **KEEP, applies to both A and B** |

## 6. Carried-forward budget rules (apply to A AND B)

From the superseded lock, still in force: fluid `clamp()` sizing, 3-line deterministic text clamp, comfortable floor, scroll-with-pinned-CTA only below the floor. Now applied to BOTH layouts. B is denser, so B is where the floor is most likely to engage — the img-5 CTA clip is the symptom; the fix is B fitting responsively and scrolling (CTA pinned) on tight viewports.

## 7. Invariants (must not break)

- `held: Set<number>` semantics + downstream redraw payload — unchanged. The reorder is presentational; the redraw still locks held indices and replaces the rest.
- The replacement-card flip in §3.2 is YOUR redraw result rendering — must reflect the actual redrawn roster, not a cosmetic flip of stale cards.
- `introSig` purity / ref-pinning — unchanged.
- Opponent lineup data in B is the same sender-hand data already in `challengeCtx` (shown pre-accept) — no new fetch.

## 8. Pass/fail gate (extends the prior harness)

Two-part containment/reachability (§5a no-scroll above floor / §5b pinned-scroll below floor) from the prior lock, now asserted in **BOTH Layout A states (deal, preview, hold, unhold) AND Layout B states (post-transition settled, and reveal/results)**. The harness must:
- assert Layout B's your-mini-strip and CTA are contained-or-reachable (catches the img-5 clip);
- assert the A→B transition end-state matches Layout B's spec (positions settled, no overflow);
- continue to fail on the pre-fix broken layouts.

Animation *timing/smoothness* (the flip, the simultaneous slide, the pause) is NOT harness-checkable — that's the **device pass**: confirm the sequence reads as flip → coordinated slide → stillness → reveal, with no jump and no dizzying overlap.

## 9. Sequence timing (pin)

- Replacement-card flip: regular-game flip duration (match existing).
- A→B simultaneous slide + opponent-appear: ~250–300ms, one beat.
- Settle-pause: **1000ms** (tunable on device pass).
- Reveal: existing reveal/tally timing.

## 10. Out of scope (logged)

- #17 outcome-aware CTA / comeback timer in Layout B (later).
- Results-screen scorer/MVP layout (#15/#16, later).
- The "Failed to create challenge — signed in" misfire (preview-origin; housekeeping).
- `supabase/.temp/` gitignore; `docs/4b-balanced-win-curation.md` untracked; depth-independent worktree symlink note.
