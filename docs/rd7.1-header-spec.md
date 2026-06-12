# RD7.1 — Global Challenge Header

## Objective lens
More understandable. Frames the challenge emotionally on entry ("the stars played, your turn") before any mechanics are read. No new mechanics.

## Locked content (exact, two lines)
REPLAY
The stars played. Your turn.

REPLAY = wordmark/brand line. Second line = tagline beneath it.

## Applies to (5 screens)
Hold, Challenge intro, Draw, Reveal, Results.

## Does NOT apply to
Challenge landing page. Header must not render on landing.

## Layout (locked)
- Header is a single horizontal row, LEFT-ALIGNED.
- Left: the game's REPLAY IFS logo (same logo the normal game / landing uses — REPLAY white, IFS brand orange).
- Right of the logo, same row: tagline "The stars played. Your turn." extending rightward, vertically centered against the logo, secondary/muted styling.
- Goal of the horizontal layout: MINIMAL vertical height (less than the prior stacked version) so Results fits better on Pro Max.
- Still in-flow, still pushes content down. Framework unchanged.
- Add header at top of each of the 5 screens; everything else shifts DOWN. Vertical shift only.
- IN-FLOW: header occupies normal document flow and pushes content down. NOT fixed/sticky — it scrolls with the page.
- Do NOT modify the challenge framework. Opponent mini-slots, reveal layout, center battle area, user mini-slots, results framework: structure unchanged. Only vertical position moves. No redesign.

## DON'T-BREAK
1. Shift via NORMAL FLOW, never a transform. The downward shift must come from the header taking layout space. Do NOT use transform: translateY(...) on any ancestor of the delta glyph or score cells. A transformed ancestor becomes the iOS containing block and reintroduces the RD6.2 delta-centering bug (the six-round saga). The RD6.2 anchor applies `top` relatively and re-measures — a new transformed ancestor skews it.
2. Framework frozen — mini-slots, reveal, center battle, results unchanged. Position only.
3. No landing leak. If the 5 screens and the landing page share a layout shell, mount the header INSIDE the challenge-flow subtree only, NOT the shared shell. If the structure is ambiguous, STOP and report it rather than risk leaking onto landing.

## Implementation shape
Single shared header component consumed by all 5 screens (one source of truth for the locked copy). Reuse the EXISTING game logo (component or asset), do not re-create it. Single shared GlobalChallengeHeader component, restyled internally only — mounts/props/framework untouched. No new design system. John glasses the look.

Logo-source note (RD7.1 restyle, 2026-06-13): there is NO shared logo component or image asset — the REPLAY IFS logo is an ad-hoc inline lockup, canonical at `shared/components/AppHeader.tsx:90-91` (REPLAY `fontSize:16 / fontWeight:950 / letterSpacing:-0.5 / #EAF0FF`; IFS `fontSize:10 / fontWeight:900 / letterSpacing:2 / #FFB14A / marginLeft:2`; baseline-aligned), repeated with the same color convention in LandingPage / GameView / AccessGate. The restyle replicates this exact treatment verbatim inside GlobalChallengeHeader (the directive scopes the restyle to that one file, so AppHeader is not refactored into a shared `<Logo>`).

## Glass (phone, address bar showing — NOT desktop)
1. LOAD-BEARING — Results fit on Pro Max (430px). Header adds height to the ~700px-tuned results screen. Does Results now scroll on Pro Max? If yes, the lever is parked RESERVED 24→20 or a hero-gap trim — do not chase elsewhere.
2. Delta still centered on the phone in Reveal/battle (regression check for DON'T-BREAK #1).
3. Header correct on all 5 screens; ABSENT on landing.
4. All checks on phone, address bar showing.
5. Header look matches the normal-game REPLAY IFS logo (white REPLAY + orange IFS), left-aligned, tagline on the same row to its right.
6. Fits as a single row on BOTH 390px and 430px (Pro Max) with no clip and no awkward wrap.
7. Header height is now SHORTER — re-confirm the load-bearing Results-fit-on-Pro-Max (this should improve).
