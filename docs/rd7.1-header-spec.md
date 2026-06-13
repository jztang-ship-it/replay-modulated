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

## Layout (locked) — brand lockup, premium-but-quiet
Single horizontal row, LEFT-ALIGNED, identical on all 5 screens. Premium-but-quiet: reads as a sports-challenge brand band, NOT as the loudest element on the page. It must NOT out-shout the instruction card on Hold or the verdict/connection-moment on Results. (We explicitly are NOT making the brand the loudest text on the page — that was considered and rejected because the same global component rides Reveal/Results, where the RD6.2 connection moment must own the eye.)

- LEFT: the REPLAY IFS logo (reuse the existing game logo — REPLAY white, IFS brand orange), sized as the prominent anchor of the lockup.
- RIGHT of the logo, same row, vertically centered against it: a TWO-LINE tagline. The two text rows SET the header height; the logo is centered against them.
  - Line 1: The STARS played
  - Line 2: Your TURN
  - NO periods.
  - "STARS" and "TURN" are ALL-CAPS and rendered in the brand orange (same orange as IFS), slightly heavier weight. The surrounding words ("The", "played", "Your") are normal case, soft white/grey, lighter weight — they recede so the orange words are the hook.
- Below the whole header: a faint GOLD/ORANGE hairline divider (~1px, low opacity, broadcast-package feel — NOT a hard UI rule line).
- IN-FLOW vertical shift only; framework unchanged; no redesign.

NOTE — copy treatment vs canon: the words are the locked line ("the stars played, your turn"); only the PRESENTATION differs (two lines, no periods, mixed case, orange STARS/TURN). This is intentional styling, not a copy change. Do NOT "correct" the casing/punctuation back to the canon sentence form.

## DON'T-BREAK
1. Shift via NORMAL FLOW, never a transform. The downward shift must come from the header taking layout space. Do NOT use transform: translateY(...) on any ancestor of the delta glyph or score cells. A transformed ancestor becomes the iOS containing block and reintroduces the RD6.2 delta-centering bug (the six-round saga). The RD6.2 anchor applies `top` relatively and re-measures — a new transformed ancestor skews it.
2. Framework frozen — mini-slots, reveal, center battle, results unchanged. Position only.
3. No landing leak. If the 5 screens and the landing page share a layout shell, mount the header INSIDE the challenge-flow subtree only, NOT the shared shell. If the structure is ambiguous, STOP and report it rather than risk leaking onto landing.

## Implementation shape
Reuse the EXISTING game logo (component/asset), do not re-create it. Single shared GlobalChallengeHeader component, restyled INTERNALLY ONLY — mounts/props/framework untouched. Use the existing brand-orange token for IFS and for STARS/TURN (one source of truth — do not introduce a new orange hex). Header height is whatever the two tagline rows + breathing room require (~mid-60s px); the logo grows to anchor, not to drive height.

Logo-source note (RD7.1 restyle, 2026-06-13): there is NO shared logo component or image asset — the REPLAY IFS logo is an ad-hoc inline lockup, canonical at `shared/components/AppHeader.tsx:90-91` (REPLAY white `#EAF0FF`; IFS brand orange `#FFB14A`, baseline-aligned), repeated with the same convention in LandingPage / GameView / AccessGate. The brand orange `#FFB14A` is itself an unnamed inline constant used in ~10 files — that established hex IS the "existing token"; the restyle uses it for IFS + STARS + TURN and introduces NO new orange. The restyle replicates the logo treatment inside GlobalChallengeHeader (the directive scopes the restyle to that one file; AppHeader is not refactored into a shared `<Logo>`).

## Glass (phone, address bar showing — NOT desktop)
1. Delta still centered on the phone in Reveal/battle (regression check for DON'T-BREAK #1).
2. Header correct on all 5 screens; ABSENT on landing.
3. All checks on phone, address bar showing.
4. Logo is the prominent anchor; tagline two rows to its right; STARS and TURN orange, no periods; surrounding words recede.
5. Faint gold divider reads as a show-package line, not app chrome.
6. Premium-but-quiet: on Hold the instruction card still reads as the action; on Results the verdict/connection moment still owns the eye — the header does not compete.
7. LOAD-BEARING (unchanged): Results fit on Pro Max (430px) with the ~mid-60s header height. If Results scrolls, the lever is parked RESERVED 24→20 or a hero-gap trim — do not chase elsewhere.
