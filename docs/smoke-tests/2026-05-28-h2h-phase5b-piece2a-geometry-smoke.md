# Piece 2a geometry re-lock — smoke artifact

**Date:** 2026-05-28
**Commit:** piece 2a implementation (see commit message for SHA after push)
**Doc lock:** `a5d7e43` (Phase 5b piece 2a — geometry re-lock + CTA clipping fix)
**Strategy:** α (G1 alone — no G4 hero shrink invoked)

## Summary

Pre-existing CTA clipping bug (since phase 4) is resolved. Bottom strip moves up by 14px; bottom-strip → reserved gap eliminated (0px); reserved paddingTop reduced 16 → 8. Net 40px more vertical room for the bottom CTA on safe-area-inset devices.

Geometry change applied to:
- `H2HResultsOverlay.tsx` (results overlay — visible CTA)
- `H2HRevealScreen.tsx` (reveal arc — empty reserved space; no visible change to arc itself, but Y positions mirror the overlay per G5)

## Geometry table

| Constant / dimension | Old | New | Delta | Locked? |
|---|---|---|---|---|
| Outer column `gap` | 18 | 0 | — | (replaced by explicit marginBottom per child) |
| Top strip marginBottom | (was via gap) 18 | 18 | 0 | **YES** — preserves hero Y |
| Top strip Y from viewport | unchanged | unchanged | 0 | **YES** |
| Top strip height | 124 | 124 | 0 | **YES** |
| Hero zone marginBottom | (was via gap) 18 | 4 | −14 | NEW: gap reduced |
| Hero zone Y | unchanged | unchanged | 0 | **YES** |
| Hero card max-width | min(145, 32vw) | min(145, 32vw) | 0 | **YES** (G4 NOT invoked) |
| Hero card height (390px viewport) | 181 | 181 | 0 | **YES** |
| Hero zone height | 376 | 376 | 0 | **YES** |
| Bottom strip top Y (390×844 safe-area device) | ≈540 | ≈526 | **−14** | NEW |
| Bottom strip marginBottom | (was via gap) 18 | 0 | −18 | NEW: no gap to reserved |
| Bottom strip height | 124 | 124 | 0 | **YES** |
| Reserved space paddingTop | 16 | 8 | −8 | NEW |
| Reserved structural height (safe-area device) | 45 | ≈77 | +32 | NEW |
| CTA usable height inside reserved | 29 | ≈69 | +40 | NEW |
| CTA button height | 52 | 52 | 0 | **YES** |
| CTA fully unclipped on 390×844 safe-area device | NO (clipped 23px) | **YES** | — | ✓ bug fixed |
| Sync PvP forward-looking headroom | n/a | **~17px** | — | ⚠️ below G2's 30-40 target |
| Strip-component sort contract (revealOrder over slotIndex) | passing | passing | — | **YES** (G6 invariant) |

## Sync PvP headroom — G2 deviation

The G2 target was 30-40px headroom for the future sync PvP indicator. Strategy α delivers ~17px — short of the target. This is the explicit deviation:

- The visible bug (CTA clipping) is fully resolved.
- G4 (hero shrink) is NOT invoked per the lock's "last resort only" guidance.
- Phase 8 / when sync PvP actually ships, the implementation session must re-derive geometry. 17px is enough for a small badge/dot indicator (~15-20px) but not the medium-sized indicator G2 anticipated.
- Future sync PvP CANNOT assume the full reserved space; ~17px is the actual available vertical room above the CTA before the bottom strip.

This deviation is documented intentionally so a future session reading the design doc + commit history understands the geometry budget.

## Verification

- ✅ `npm test` — see commit message for count.
- ✅ `npm --prefix basketball run build` — production Rollup clean.
- ✅ `bash scripts/build-vercel.sh` — all sports build clean.
- ✅ `tsc --noEmit` — clean.
- ✅ Strip-component sort contract tests (`H2HResultsOverlay.test.tsx`, `H2HRevealScreen.test.tsx`) — pass unchanged (G6 invariant honored).

## Screenshots — pending live capture

This commit ships the code change. Visual screenshots are pending live verification on the running app at the dev mock routes:

- `/basketball/dev/h2h-reveal-mock?variant=WIN&phase=2` — overlay WIN state.
- `/basketball/dev/h2h-reveal-mock?variant=LOSS_CLOSED&phase=2` — overlay LOSS state.
- `/basketball/dev/h2h-reveal-mock?variant=WIN&phase=1` — arc mid-reveal.

Recommended capture: 390px viewport (mobile reference) on a safe-area-inset device (e.g., iPhone simulator at 390×844 with home indicator). The CTA should render fully visible above the bottom safe-area; the bottom strip should sit 14px higher than prior; the top strip + hero zone should be unchanged from prior.

If live capture surfaces any rendering surprise (e.g., a subtle visual artifact from the new spacing), surface as amendment.
