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
- Add header at top of each of the 5 screens; everything else shifts DOWN. Vertical shift only.
- IN-FLOW: header occupies normal document flow and pushes content down. NOT fixed/sticky — it scrolls with the page.
- Do NOT modify the challenge framework. Opponent mini-slots, reveal layout, center battle area, user mini-slots, results framework: structure unchanged. Only vertical position moves. No redesign.

## DON'T-BREAK
1. Shift via NORMAL FLOW, never a transform. The downward shift must come from the header taking layout space. Do NOT use transform: translateY(...) on any ancestor of the delta glyph or score cells. A transformed ancestor becomes the iOS containing block and reintroduces the RD6.2 delta-centering bug (the six-round saga). The RD6.2 anchor applies `top` relatively and re-measures — a new transformed ancestor skews it.
2. Framework frozen — mini-slots, reveal, center battle, results unchanged. Position only.
3. No landing leak. If the 5 screens and the landing page share a layout shell, mount the header INSIDE the challenge-flow subtree only, NOT the shared shell. If the structure is ambiguous, STOP and report it rather than risk leaking onto landing.

## Implementation shape
Single shared header component consumed by all 5 screens (one source of truth for the locked copy). Minimal footprint: existing type tokens/scale, REPLAY as wordmark, tagline secondary, centered, smallest clean vertical height. No new design system. John glasses the look.

## Glass (phone, address bar showing — NOT desktop)
1. LOAD-BEARING — Results fit on Pro Max (430px). Header adds height to the ~700px-tuned results screen. Does Results now scroll on Pro Max? If yes, the lever is parked RESERVED 24→20 or a hero-gap trim — do not chase elsewhere.
2. Delta still centered on the phone in Reveal/battle (regression check for DON'T-BREAK #1).
3. Header correct on all 5 screens; ABSENT on landing.
4. All checks on phone, address bar showing.
