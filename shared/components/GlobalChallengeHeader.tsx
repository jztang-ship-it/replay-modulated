// shared/components/GlobalChallengeHeader.tsx
//
// RD7.1 — Global Challenge Header. The single source of truth for the
// brand lockup + tagline that frames the challenge on entry. One
// component, consumed by the recipient challenge flow's three surfaces
// (the play shell, the reveal shell, and the results overlay) so the 5
// challenge screens — Hold, Challenge intro, Draw, Reveal, Results —
// all render IDENTICAL header content at an identical height.
//
// Layout (RD7.1 FINAL brand lockup, 2026-06-13 — docs/rd7.1-header-spec.md):
//   A single LEFT-ALIGNED row, premium-but-quiet (a sports-challenge
//   brand band, NOT the loudest element — the same component rides
//   Reveal/Results where the RD6.2 connection moment must own the eye):
//
//     REPLAY IFS    The STARS played
//                   Your TURN
//     ───────────────────────────────  (faint gold hairline, show-package)
//
//   - Logo: the game's canonical REPLAY (white #EAF0FF) + IFS (brand
//     orange #FFB14A) inline lockup (treatment from AppHeader.tsx:90-91),
//     sized UP here to anchor the lockup. Vertically centered against the
//     two tagline rows.
//   - Tagline: TWO rows to the logo's right; the rows SET the header
//     height (logo centers against them). UNIFORM all-caps, color-ONLY
//     emphasis: THE STARS PLAYED / YOUR TURN, every word same case /
//     weight / size / letter-spacing — only COLOR varies (STARS & TURN
//     brand orange, the rest soft grey). NO periods. The WORDS are the
//     locked line ("the stars played, your turn") — only the PRESENTATION
//     differs (two lines, all-caps, color-only orange hooks). This is
//     styling, not a copy change — do not "correct" it to sentence form.
//   - Header indents to the SHARED LEFT RAIL (the card/strip left edge),
//     so its text never starts tighter to the screen edge than the cards.
//   - Brand orange #FFB14A is the established game token (IFS + STARS +
//     TURN all use it — one source, no new orange hex).
//
// DON'T-BREAK contract (see docs/rd7.1-header-spec.md):
//   1. IN-FLOW ONLY. Plain flow element (no transform, no fixed/sticky).
//      First child of each surface's inner flex column → pushes the
//      screen DOWN via normal layout. MUST NOT introduce a transformed
//      ancestor over the delta glyph / score cells (RD6.2 iOS
//      containing-block bug).
//   2. CONSTANT HEIGHT across surfaces. Fixed type sizes + flexShrink:0
//      → identical rendered height on the reveal shell and the results
//      overlay; that equal shift preserves the reveal→results no-snap.
//   3. RECIPIENT FLOW ONLY. Mounted via explicit props from
//      H2HRecipientPlay + H2HRecipientReveal. NEVER by landing, the
//      sender reveal, or the shared shell unconditionally — no leak.

import React from "react";

// Brand orange — the established inline game token (#FFB14A), shared by
// IFS and the STARS / TURN hooks. One source of truth; no new orange.
const BRAND_ORANGE = "#FFB14A";

// RD7.1 tagline amendment (2026-06-13): UNIFORM all-caps, color-ONLY
// emphasis. Every word is the same case (caps), same weight, same size,
// same letter-spacing — set once on the line below. The ONLY per-word
// variable is COLOR (soft grey vs brand orange). Varying weight/size
// word-to-word was the source of the "messy" ragged-line look; do not
// reintroduce it.
const softWord: React.CSSProperties = { color: "rgba(234, 240, 255, 0.55)" };
const orangeWord: React.CSSProperties = { color: BRAND_ORANGE };

// Shared tagline-row typography — uniform across ALL words.
const taglineRow: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
  letterSpacing: "0.14em",
  lineHeight: 1.2,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

// Shared left rail: the card/strip content sits 13px inside the inner
// column's content edge — ZonePanel border (1px) + paddingLeft (12px),
// stable across 390 & 430 (cards center WITHIN the strip; the strip
// wrapper rail is fixed). The header indents to the SAME rail so its
// text never starts tighter to the screen edge than the cards below it.
const SHARED_LEFT_RAIL_PX = 13;

export function GlobalChallengeHeader() {
  return (
    <div
      data-h2h-global-header="true"
      aria-hidden="false"
      style={{
        // In-flow column (lockup row + hairline divider). No transform,
        // no fixed/sticky — occupies layout space, shifts content down.
        flexShrink: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        paddingTop: 14,
        // Shared left rail — header text aligns to the card/strip left
        // edge below it (see SHARED_LEFT_RAIL_PX).
        paddingLeft: SHARED_LEFT_RAIL_PX,
        marginBottom: 8,
        fontFamily: "'Inter', system-ui, sans-serif",
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      {/* Lockup row: logo (left, anchor) + two-line tagline (right). The
          two tagline rows set the height; logo centers against them. */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "nowrap",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 12,
          paddingBottom: 10,
        }}
      >
        {/* REPLAY IFS logo — canonical treatment (AppHeader.tsx:90-91),
            sized up to anchor. White REPLAY + orange IFS, baseline. */}
        <div
          data-h2h-global-header-logo="true"
          style={{ display: "flex", alignItems: "baseline", gap: 2, flexShrink: 0 }}
        >
          <span
            data-h2h-global-header-wordmark="true"
            style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.5, color: "#EAF0FF" }}
          >
            REPLAY
          </span>
          <span
            style={{ fontSize: 24, fontWeight: 900, letterSpacing: 2, color: BRAND_ORANGE, marginLeft: 2 }}
          >
            IFS
          </span>
        </div>
        {/* Two-line tagline — UNIFORM all-caps; only COLOR varies
            (grey recedes, orange STARS/TURN are the hooks). */}
        <div
          data-h2h-global-header-tagline="true"
          style={{ display: "flex", flexDirection: "column", gap: 1 }}
        >
          <div style={taglineRow}>
            <span style={softWord}>THE </span>
            <span style={orangeWord}>STARS</span>
            <span style={softWord}> PLAYED</span>
          </div>
          <div style={taglineRow}>
            <span style={softWord}>YOUR </span>
            <span style={orangeWord}>TURN</span>
          </div>
        </div>
      </div>
      {/* Faint gold hairline — broadcast-package feel, left-bright fade.
          ~1px, low opacity; NOT a hard UI rule line. */}
      <div
        data-h2h-global-header-divider="true"
        style={{
          height: 1,
          width: "100%",
          // Fainter than the prior pass — ~18% peak opacity.
          background:
            "linear-gradient(90deg, rgba(255,177,74,0.18) 0%, rgba(255,177,74,0.06) 55%, rgba(255,177,74,0) 100%)",
        }}
      />
    </div>
  );
}
