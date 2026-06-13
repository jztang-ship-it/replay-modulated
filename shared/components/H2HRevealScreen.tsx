/**
 * shared/components/H2HRevealScreen.tsx
 *
 * H2H reveal arc screen. Renders the head-to-head matchup visual:
 * battlefield with two heroes + per-side hand strips + running totals.
 *
 * Two render modes:
 * - Static (phase 2 default): pass `sender`, `recipient`, `renderCard`.
 *   Renders the end-state (final matchup + final totals).
 * - Animated (phase 3): pass a `reveal` from `useH2HReveal`. Battlefield
 *   cards walk through matchups, FPs roll up, scores tick, mini-cards
 *   dim during their matchup. Falls back to the static end-state when
 *   `reveal.phase === "done"`.
 *
 * Full-viewport. Owns the entire screen — no header, no nav, no profile
 * chrome. Same "takeover" model as a single-player win celebration.
 *
 * Vertical Clash-Royale-style battlefield layout. Three zones top-to-
 * bottom (opponent / battlefield / your), two rails (right scores+delta /
 * left commentary-reserved).
 *
 *   ┌──────────────────────────────────────────┐
 *   │ OPPONENT ZONE (top, content-sized)       │
 *   │   name · tier · running FP               │
 *   │   [c][c][c][c][c][c]   ← strip ~90px tall│
 *   ├──┬───────────────────────────────────────┤
 *   │  │   BATTLEFIELD ZONE (middle, hero)     │
 *   │  │   ┌────────────────┐                  │
 *   │ L│   │  Sender card   │  ◀ 178.4         │  ← total anchored to top card's right
 *   │ E│   │  (single-player│                  │
 *   │ F│   │   size)        │                  │
 *   │ T│   └────────────────┘                  │
 *   │  │           ┌────────┐                  │
 *   │ R│           │ +14.6  │                  │  ← matchup delta + final margin in gap
 *   │ A│           │ +4.0YOU│                  │
 *   │ I│           └────────┘                  │
 *   │ L│   ┌────────────────┐                  │
 *   │  │   │  Recipient     │  ◀ 182.4         │  ← total anchored to bottom card's right
 *   │ 28│  │  card          │                  │
 *   │  │   └────────────────┘                  │
 *   ├──┴───────────────────────────────────────┤
 *   │ YOUR ZONE (bottom, content-sized)        │
 *   │   [c][c][c][c][c][c]                     │
 *   │   name · tier · running FP               │
 *   └──────────────────────────────────────────┘
 *
 * Visual hierarchy lock: battlefield cards are the hero, sized to match
 * the single-player AthleteCard render. Hand-strip cards are small
 * context indicators (~90px tall), height-capped so wide viewports
 * don't inflate them into the dominant element.
 *
 * Sport-agnostic. The component owns layout only; per-sport card
 * rendering is delegated to the renderCard prop. Hand-strip cells AND
 * battlefield cells both call renderCard — they use the same card
 * component (e.g. basketball's AthleteCard), just sized by their
 * container. This guarantees the mini-cards visually read as the same
 * game cards, not as separate abstract chips.
 *
 * See docs/h2h-reveal-arc-design.md "Phase 2 integration anchors" for
 * the locked decisions this component encodes.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { UseH2HRevealReturn } from "./useH2HReveal";
import type { ShakeType } from "@shared/components/types";
import {
  CARD_LAY_MS,
  CARD_TRAVEL_MS,
  ENERGY_PULSE_MS,
  BATTLEFIELD_TRAVEL_DURATION_MS,
  planRevealBeats,
  // RD6.2-C revision (2026-06-12): restored — the gap layer in
  // RightColumnRail uses this helper to gate "once-pre-final-decisive"
  // (same gate the retired AnchorFrame used). Pre-revision: removed
  // when the gap was mis-generalized to fire on every set.
  isFinalSetDecisive,
  type EntranceStage,
} from "./useH2HReveal";
import { CardBackGeneric } from "./CardBackGeneric";
import { H2HBoardShell, TargetCornerScore } from "./H2HBoardShell";
import {
  ScoreCell,
  RIGHT_RAIL_WIDTH_PX,
  LEFT_RAIL_WIDTH_PX,
  WINNING_COLOR,
  DELTA_NEUTRAL,
  // RD6.2-A: LOSING_COLOR (red) for negative delta highlight on both
  // per-set and FINAL states; SCORE_CELL_FONT_SIZE_PX wires the delta
  // size to the team-total FP size (single source of truth — see
  // H2HScoreRail.tsx). TRAILING_COLOR retired from this file —
  // post-A-revision FINAL inherits per-set treatment with LOSING_COLOR
  // (red), not the muted TRAILING grey.
  LOSING_COLOR,
  SCORE_CELL_FONT_SIZE_PX,
  // RD6.2-B: BLINK_DURATION_MS exported by H2HScoreRail. Caller passes
  // it through the `blink` prop on both corner ScoreCells (Mike top +
  // YOU bottom) keyed off popState.deltaLandedKey so both fire on the
  // same render commit. BLINK_FLOOR is consumed only inside ScoreCell.
  BLINK_DURATION_MS,
} from "./H2HScoreRail";
// Phase 2.5 dev-only instrumentation. The import is referenced ONLY
// from inside a `{import.meta.env.DEV && ...}` JSX gate below; Vite
// constant-folds `import.meta.env.DEV` to `false` in prod and tree-
// shakes the import away. The runtime querystring check inside the
// overlay itself is the second layer of gating.
import { RelayDebugOverlay, isRelayDebugEnabled } from "./RelayDebugOverlay";

// ── Public types ─────────────────────────────────────────────────────────

/** Per-card shape matches the phase-1 endpoint payload's sender.cards[]
 *  element (see docs/h2h-reveal-arc-design.md "Endpoint shape"). Mock
 *  fixtures + real endpoint use the same shape. */
export interface H2HCard {
  id: string;
  basePlayerId: string;
  personKey: string;
  cardId: string;
  name: string;
  team: string;
  season: string;
  position: string;
  photoCode: string | null;
  salary: number;
  tier: "RED" | "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE";
  projectedFp: number;
  slotIndex: number;
  wasHeld: boolean;
  actualFp: number;
  fpDelta: number;
  gameInfo: { date: string; opponent: string; homeAway?: string };
  statLine: Record<string, any>;
  achievements: Array<{ id: string; icon: string; label: string; fp: number }>;
}

/** Envelope for one side of the H2H. Mirrors phase-1 `sender` payload
 *  shape + a displayName the real flow sources from challenge.challenger_name
 *  (sender) and challenge_attempts.user_name (recipient). */
export interface H2HHand {
  handId: string;
  totalFp: number;
  tier: "BUST" | "ROOKIE" | "STARTER" | "ALL_STAR" | "MVP" | "LEGEND";
  cards: H2HCard[];
  displayName: string;
}

/** Sport-provided card renderer. Called for BOTH battlefield slots and
 *  hand-strip cells. The same component renders in both zones; the
 *  container's size determines the visual scale. Basketball passes its
 *  AthleteCard, matching how LandingPage already mounts the same
 *  CardComponent at small sizes (shared/components/LandingPage.tsx:369).
 *
 *  `options.visibleFp` (phase 3): when set, drives the card's FP
 *  rollup animation. Hand-strip cells render with options=undefined
 *  (static); battlefield cells during reveal pass the current
 *  animated FP from useH2HReveal's visibleFpMap. The renderer is
 *  responsible for forwarding the value to its sport-card's
 *  `visibleFp` prop (basketball: AthleteCard.visibleFp → CardFront's
 *  internal RAF interpolation). */
export type CardRenderer = (
  card: H2HCard,
  options?: {
    visibleFp?: number;
    flipped?: boolean;
    revealed?: boolean;
    /** Live shake signal (post-amend6 shake/blast rule, 2026-05-27).
     *  Drives PCS's `pcs-shake-*` CSS class for the duration this is
     *  non-null. Passed only at the active hero card; strip cells and
     *  deck cards leave it undefined. */
    shakeType?: ShakeType | null;
    /** Blast (tier-colored radial burst) — set true while the active
     *  hero card's blast is animating. Pairs with `glowTier` and
     *  `glowDurationMs` to drive PlayerCardShell's `pcs-glow-*` class. */
    glowActive?: boolean;
    glowTier?: string;
    glowDurationMs?: number;
  },
) => React.ReactNode;

export interface H2HRevealScreenProps {
  sender: H2HHand;
  recipient: H2HHand;
  renderCard: CardRenderer;
  /** Which matchup pair to display in the battlefield zone. Defaults to
   *  the last slotIndex (the final reveal slot per the swap-then-held
   *  order). Phase 2 static path; ignored when `reveal` is provided. */
  battlefieldSlotIndex?: number;
  /** Phase 3 animation state from `useH2HReveal`. When provided,
   *  overrides battlefieldSlotIndex: battlefield cards come from
   *  `reveal.activeMatchup`, scores tick from
   *  `reveal.{sender,recipient}RunningTotal`, and battlefield cards'
   *  FP rolls up from `reveal.visibleFpMap`. Hand strip dims the
   *  mini-card whose cardId matches the active matchup. When
   *  `reveal.phase === "done"`, this renders the same end-state as
   *  the phase-2 static path. */
  reveal?: UseH2HRevealReturn;
  /** RD7.1 (2026-06-13): optional in-flow global challenge header,
   *  forwarded to the reveal surface's H2HBoardShell. Passed ONLY by
   *  H2HRecipientReveal (the recipient challenge flow); the sender
   *  reveal and the dev mock route omit it so the header renders only on
   *  the recipient's Reveal screen. Plain flow node — no transform
   *  (DON'T-BREAK #1 — the RD6.2 delta anchor re-measures the shifted
   *  totals). */
  globalHeader?: React.ReactNode;
}

// ── Tier colors ──────────────────────────────────────────────────────────
// Inlined to match the existing pattern at ChallengeLandingScreen.tsx:59
// and PostHandSheet.tsx:10. Drift acknowledged — followup tracked in
// docs/h2h-reveal-arc-design.md "What's not designed yet" to centralize.

const TIER_ACCENT: Record<string, string> = {
  RED: "#EF4444", ORANGE: "#FB923C", PURPLE: "#C084FC",
  BLUE: "#3B82F6", GREEN: "#22C55E", WHITE: "#9CA3AF",
};

// Win/loss colors (WINNING_COLOR, TRAILING_COLOR, DELTA_NEUTRAL) are
// imported from H2HScoreRail and shared with H2HResultsOverlay.

// ── Layout sizing constants ──────────────────────────────────────────────
// Set explicitly so visual hierarchy (battlefield hero, hand strips
// compact) survives any viewport width.

// Hand strip total height — the unified mini-slot anchor for the H2H
// surface. Derived from the constraint "6 mini-cards must fit within
// the mobile content width (390 - 32 padding = 358px) without
// clipping." Each cell width = strip_height × 329/478. At 80:
//   80 × (329/478) ≈ 55px per cell. 6×55 + 5×4 gap = 350px. Fits 358.
// Wider viewports get the same 80px-tall strip (cells stay 55×80);
// extra horizontal room ends up as flex padding around the centered
// strip, NOT as wider cells (which would lose the "mini" register).
//
// RD2 unified-80 lock (2026-06-08, supersedes the same-day 40 shrink
// — see docs/h2h-reveal-arc-design.md "Amendment 2026-06-08 — RD2
// unified at 80px"): one mini-slot geometry shared across all four
// states of the H2H surface — hold/draw → play → reveal → results.
// Results is the canonical reference: results-overlay cells are #7
// tap targets (tap-to-flip) and Apple's ~44px hit-target minimum is
// the floor. 80 is the value results already shipped at, so matching
// it removes the reveal→results crossfade pop without touching the
// shipped results surface.
//
// Exported and consumed by all three H2H surfaces:
//   - H2HRevealScreen.tsx (this file) — strip wrapper height + mini
//     cells (cqw-derived scale post-RD2.1).
//   - H2HRecipientPlay.tsx — MINI_CELL_HEIGHT_PX alias (the strip
//     wrapper's height; cells themselves derive their width from
//     aspect-ratio + flex now, no hardcoded width post-RD2.1).
//   - H2HResultsOverlay.tsx — its strip-cell height (the results
//     surface that defines the floor).
// Single source of truth. Drift across surfaces is impossible without
// removing an import — value-agnostic coupling tests gate the lock.
export const HAND_STRIP_HEIGHT_PX = 80;
const HAND_STRIP_GAP_PX = 4;

// RD6.2-prep-A2 (2026-06-12): natural horizontal span of the strip's
// card content — the width occupied by 6 cells (each = strip_height
// × 329/478 at natural aspect-ratio) plus 5 inter-cell gaps. The
// strip wrapper itself is width:100% with justifyContent:center, so
// at viewports wider than this constant the cards center with flex
// padding on both sides and the strip's container box (= ZonePanel
// content box) is WIDER than the actual card span. The box-header
// row above the strip uses this constant as a maxWidth so the
// header's outer edges align to the FIRST and LAST card edges,
// not to the ZonePanel content box (which would bulge past the
// cards on the wider viewports). At narrow viewports the cells
// flex-shrink to fit the panel width and the header also clamps to
// 100% of the panel content — the two track each other naturally.
// Exported so H2HBoardShell + H2HResultsOverlay's ZoneHeaders can
// import a single source of truth.
export const HAND_STRIP_CARD_CONTENT_WIDTH_PX =
  6 * ((HAND_STRIP_HEIGHT_PX * 329) / 478) + 5 * HAND_STRIP_GAP_PX;
// ZONE_HEADER_HEIGHT_PX and ZONE_GAP_PX now live in H2HBoardShell (the
// chrome owns them — H2HRevealScreen only uses HandStrip-cell geometry
// below this point).

// Mini-card "natural" rendering size — the inner AthleteCard renders at
// this width and a CSS transform: scale() shrinks it to fit the strip
// cell. Without the scale wrapper, AthleteCard's absolute-pixel font
// sizes (16px salary, 22px FP, 32px initials fallback) don't track the
// container — the salary chip ends up taking ~half the card height on a
// 62px-wide cell, and the initials placeholder dominates the card body.
// With the scale wrapper, every internal element shrinks uniformly with
// the container, just like a CSS zoom would.
//
// 150px chosen so the scale factor is ≈ 0.45 (cell_width / 150) — at
// that scale, the 16px salary text renders at ~7px effective, 22px FP
// at ~10px effective, and 32px initials at ~14px effective. Visible
// but proportionally small, matching the user's "clearly smaller
// version of the same card" intent.
//
// RD2.1 (2026-06-09, lock: docs/replaymod-design-decisions.md "RD2.1 —
// strip-cell overflow"): the inner card's scale is no longer a fixed
// constant. The cell box has `container-type: inline-size`, and the
// inner uses `transform: scale(calc(100cqw / 150px))` — `100cqw`
// reads the cell's actual content-box width at paint, so the scaled
// inner tracks the flex-resolved cell width (52 in tight space, 55
// when the cell fits its natural size). The old `STRIP_CARD_SCALE`
// constant derived from `HAND_STRIP_HEIGHT_PX × 329/478 / 150` is
// gone — it was the divorce that produced the 3px overhang. Validated
// in Chromium + WebKit before commit. NOTE: requires the cell box to
// have no internal border/padding (content box must equal border box)
// — all three H2H strip surfaces satisfy this.
const STRIP_CARD_NATURAL_WIDTH_PX = 150;
const STRIP_CARD_NATURAL_HEIGHT_PX = (STRIP_CARD_NATURAL_WIDTH_PX * 478) / 329;
const STRIP_CARD_SCALE_CSS = `calc(100cqw / ${STRIP_CARD_NATURAL_WIDTH_PX}px)`;

// Battlefield card max-width. Matches the natural single-player card
// width — single-player renders 3 cards across in a roster grid, so
// each card is ~1/3 of viewport width on mobile portrait (e.g. ~125px
// on a 390px viewport). On wider viewports single-player's cards grow
// proportionally, but H2H has two cards stacked vertically + a mid-
// rail + two zones, so a hard cap is needed or the stack overflows
// shorter desktop viewports. Two layers: `32vw` tracks single-player
// scale on mobile (390→124.8, 414→132.5, 768→245.8 capped); `145px`
// caps the value on viewports >= ~450px wide so the vertical stack
// stays under 800px viewport height.
//
// CSS expression value so it can be passed as the `maxWidth` style on
// the card column wrapper. The `BATTLEFIELD_CARD_MAX_WIDTH_PX` name is
// retained from the prior numeric constant for grep continuity, but
// the value now drives the CSS directly.
// RD6.2-prep-C (2026-06-12): shrunk min(145px, 32vw) → min(125px, 28vw)
// for real-phone vertical fit. MUST stay in lockstep with
// H2HResultsOverlay.HERO_CARD_MAX_WIDTH (and the shell's HERO_MIN_HEIGHT_*
// constants that derive from this value) or the reveal→results crossfade
// snaps. The aspect-ratio derived row height drops proportionally.
const BATTLEFIELD_CARD_MAX_WIDTH = "min(125px, 28vw)";

// Right-rail score-column width (RIGHT_RAIL_WIDTH_PX) and left-rail
// reserved width (LEFT_RAIL_WIDTH_PX) are imported from H2HScoreRail
// and shared with H2HResultsOverlay so the two surfaces share IDENTICAL
// rail geometry. The arc's right rail wraps each battlefield card row
// adjacent to its ScoreCell; the left rail is empty here today (no
// commentary content) but matches the overlay's headline + trash-talk
// column width so the surfaces line up cleanly. The "SCORE_COLUMN_
// WIDTH_PX" name was retired in the rail-unify refactor — same value,
// shared symbol.

// Vertical gap between the two hero rows. Phase 4 fix 3 amend2
// (2026-05-27): bumped to 14px because the matchup-delta readout
// now FLOATS in this gap via absolute positioning (it does not
// contribute to row heights). 14px is the visible sliver between
// the two hero cards — the user-requested "thin sliver, don't
// touch" target.
// Earlier history: 6 → 2 when the mid-rail moved to the right rail
// (still as a grid row), and 2 → 14 when it became absolutely
// positioned so it no longer contributed to row height.
// Exported so the H2HRecipientPlay armed rail (RD3) can match the arc
// battlefield's vertical row geometry — its 2-row right-column overlay
// uses the same row gap so the armed ScoreCells sit at identical Y as
// the arc's ScoreCells at first revealing frame (no-snap on handoff).
export const BATTLEFIELD_ROW_GAP_PX = 14;

// ── Helpers ──────────────────────────────────────────────────────────────

function getSlotCard(hand: H2HHand, slotIndex: number): H2HCard | null {
  return hand.cards.find(c => c.slotIndex === slotIndex) ?? null;
}

// ZonePanel + ZoneHeader live in H2HBoardShell (the shared shell that
// owns the framed-board chrome). This file's render uses H2HBoardShell
// directly and passes content slots — the panels and headers come from
// the shell, not from local sub-components.

// ── Hand strip — height-capped flex row, same renderCard as battlefield ──

interface HandStripProps {
  cards: H2HCard[];
  renderCard: CardRenderer;
  /** Cell whose `cardId` matches dims to signal "this card is out of
   *  the hand, in battle." Phase 2 derives this from the static
   *  battlefield slot; phase 3 from `reveal.activeMatchup`. Matching by
   *  cardId (not slotIndex) survives the case where deal order and
   *  reveal order differ — phase 4's real data is deal-ordered, but
   *  the reveal walks in (wasHeld, salary) order. */
  activeCardId?: string | null;
  /** Per-card revealed status from `useH2HReveal.revealedCardIds`.
   *  Drives both (a) the renderer's pre-reveal vs post-reveal visual
   *  via `options.revealed`, and (b) Option β brightness — pre-reveal
   *  cards stay bright, post-reveal-non-active cards dim to 0.35. */
  revealedCardIds?: Set<string>;
  /** Per-stage_index entrance stage array from useH2HReveal. Length =
   *  cards.length. When omitted (static phase 2 path), all cells
   *  render as "settled." stage_index 0 = first to lay (cheapest swap
   *  per the reveal order). */
  entranceStages?: EntranceStage[];
  /** Reveal-order array for THIS side. Same array exposed by the hook
   *  as `senderRevealOrder` / `recipientRevealOrder`. Used to map
   *  each card → its stage_index in entranceStages. Pass-through from
   *  the static phase-2 path is undefined, in which case all cells
   *  fall through to "settled". */
  revealOrder?: H2HCard[];
  /** Drives entrance Y direction. Sender strip is at the top of the
   *  viewport; sender cards translate DOWN into the upper battlefield
   *  slot during the middle phase. Recipient strip is at the bottom;
   *  cards translate UP into the lower battlefield slot. */
  side: "sender" | "recipient";
  /** When true, the entrance animation is skipped (per
   *  prefers-reduced-motion). Cells render directly at landed state. */
  reducedMotion: boolean;
  /** Phase 3.9 anticipation beat — when true, each cell applies a
   *  tier-colored glow pulse animation. Hook gates this flag to the
   *  ENERGY_PULSE_MS window of the anticipating phase. */
  pulseActive: boolean;
}

// Phase 4 fix 1 (2026-05-27) — DECK-METAPHOR ENTRANCE. Two face-down
// card-back deck stacks render at the top and bottom hero-card
// positions during the entering phase. Cards fly OUT of the deck
// during their LAY stage and land at their hand-strip slot. The deck
// visualization provides the missing context for the "card appears in
// the middle of the screen" motion — without it, cards looked like
// they emerged from nowhere (the reason we reverted phase 3.8 in
// phase 3.10). With the deck visual, cards visibly emerge from the
// stack and zoom to their strip slots.
const HERO_CARD_SCALE = 0.83;
// Vertical offset from a strip cell's slot position to its side's
// deck position. Sender (top strip) deck sits BELOW the top strip in
// the hero zone (positive Y); recipient (bottom strip) deck sits
// ABOVE the bottom strip in the hero zone (negative Y).
const ENTRANCE_DECK_TRANSLATE_Y_TOP_PX = 110;
const ENTRANCE_DECK_TRANSLATE_Y_BOTTOM_PX = -110;

// Compute translateX needed to bring a strip cell's scaled-visual
// center to viewport horizontal center (= deck center X). cell_left ≈
// innerColLeft + 16 + 4 + displayPos*59 on mobile.
function computeDeckTranslateX(displayPos: number): number {
  if (typeof window === "undefined") return 0;
  const vw = window.innerWidth;
  const innerColW = Math.min(480, vw);
  const innerColLeft = (vw - innerColW) / 2;
  const cellLeft = innerColLeft + 16 + 4 + displayPos * 59;
  const scaledHeroHalfWidth = (STRIP_CARD_NATURAL_WIDTH_PX * HERO_CARD_SCALE) / 2;
  return vw / 2 - cellLeft - scaledHeroHalfWidth;
}

function HandStrip({ cards, renderCard, activeCardId, revealedCardIds, entranceStages, revealOrder, side, reducedMotion, pulseActive }: HandStripProps) {
  // #4 (2026-05-30): strip LAYOUT is slotIndex-only. revealOrder is the
  // TEMPORAL contract (used below for stage-index keying + by the hook
  // for buildMatchups / activeMatchup / revealedCardIds), never spatial.
  // Held cards stay in their slotIndex positions (S5 invariant); the
  // reveal sequence advances over time independently. Prior code laid
  // cells in revealOrder when provided, which dragged held cards to the
  // rightmost slots since `buildRevealOrder` puts held last — visually
  // wrong per S5 and reported in production verification of 2a95718.
  // See docs/h2h-reveal-arc-design.md "Strip-component sort contract"
  // (EDIT note appended 2026-05-30).
  const ordered = [...cards].sort((a, b) => a.slotIndex - b.slotIndex);
  const N = ordered.length;
  // Default to "all settled" when the static phase-2 caller doesn't pass
  // entrance state.
  const stages = entranceStages ?? new Array(N).fill("settled" as const);
  // Build cardId → reveal-order index lookup. When revealOrder isn't
  // provided (static phase 2), fall back to slotIndex order — which
  // for the mock fixture happens to match reveal order (slot 0 =
  // cheapest swap). Phase 4 real data passes revealOrder explicitly.
  const stageIndexByCardId = useMemo(() => {
    const map = new Map<string, number>();
    if (revealOrder) {
      for (let i = 0; i < revealOrder.length; i++) {
        map.set(revealOrder[i].cardId, i);
      }
    } else {
      ordered.forEach((c, i) => map.set(c.cardId, i));
    }
    return map;
  }, [revealOrder, ordered]);
  return (
    <div
      data-h2h-hand-strip="true"
      data-side={side}
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: HAND_STRIP_GAP_PX,
        height: HAND_STRIP_HEIGHT_PX,
        width: "100%",
      }}
    >
      {ordered.map((card, displayPos) => {
        const isActiveInBattlefield = !!activeCardId && card.cardId === activeCardId;
        const isRevealed = revealedCardIds?.has(card.cardId) ?? false;
        // Phase 4 post-amend6 (2026-05-27): Option β brightness —
        // bright = active card OR pre-reveal card; dim = post-revealed
        // card that is not currently active. Pre-reveal cards stay
        // bright so the user's eye tracks "what's yet to be revealed"
        // alongside the active hero. At end-state (no active rolling
        // card), only the matchup hero stays bright; all 5 others on
        // the strip are post-revealed-non-active → dim, matching
        // amend5's end-state visual.
        const settledCardOpacity =
          isActiveInBattlefield || !isRevealed ? 1 : 0.35;
        // Stage_index is the card's position in the REVEAL ORDER (same
        // direction on both sides — cheapest swap = stage_index 0).
        // Both strips' stage_index 0 cards animate together. The
        // displayPos comes from slotIndex order, which may differ from
        // reveal order in phase 4 — the lookup via revealOrder keeps
        // the entrance order consistent with the reveal arc.
        const stageIndex = stageIndexByCardId.get(card.cardId) ?? displayPos;
        const stage: EntranceStage = stages[stageIndex] ?? "settled";

        // Deck-metaphor entrance (phase 4 fix 1, 2026-05-27). Cards
        // fly from the deck position (hero zone, scaled to hero size)
        // to the strip slot (mini scale). Each side has its own deck:
        // sender→top deck, recipient→bottom deck.
        const deckTranslateX = computeDeckTranslateX(displayPos);
        const deckTranslateY = side === "sender"
          ? ENTRANCE_DECK_TRANSLATE_Y_TOP_PX
          : ENTRANCE_DECK_TRANSLATE_Y_BOTTOM_PX;
        const slotTransform = `scale(${STRIP_CARD_SCALE_CSS})`;
        const deckTransform =
          `translate(${deckTranslateX}px, ${deckTranslateY}px) scale(${HERO_CARD_SCALE})`;

        // Stage → visual mapping (deck-flight).
        // pre:      invisible at deck position (deck visual covers).
        // lay:      fade in + animate from deck → slot.
        // beat:     hold at slot, full opacity.
        // travel:   visually identical to settled (legacy stage,
        //           preserved for timing-budget continuity).
        // settled:  at slot, normal opacity (dimmed if in-battlefield).
        let cardOpacity: number;
        let cardTransform: string;
        let cardTransition: string;
        let placeholderOpacity: number;
        let placeholderTransition: string;
        let cardZIndex: number;
        switch (stage) {
          case "pre":
            // Card hidden at the deck position. The deck visual at
            // that position covers it.
            cardOpacity = 0;
            cardTransform = deckTransform;
            cardTransition = "none";
            placeholderOpacity = 1;
            placeholderTransition = "none";
            cardZIndex = 1;
            break;
          case "lay":
            // Fade in + fly from deck to slot. cardZIndex above the
            // deck (z=10 below) so the flying card renders on top.
            cardOpacity = 1;
            cardTransform = slotTransform;
            cardTransition = reducedMotion
              ? "none"
              : `opacity ${CARD_LAY_MS}ms ease-out, transform ${CARD_LAY_MS}ms cubic-bezier(0.4, 0.0, 0.2, 1)`;
            placeholderOpacity = 1;
            placeholderTransition = "none";
            cardZIndex = 100;
            break;
          case "beat":
            cardOpacity = 1;
            cardTransform = slotTransform;
            cardTransition = "none";
            placeholderOpacity = 1;
            placeholderTransition = "none";
            cardZIndex = 1;
            break;
          case "travel":
            // Visually identical to settled (no-op in slot-direct path).
            // Kept distinct so the hook's state machine stays unchanged.
            cardOpacity = 1;
            cardTransform = slotTransform;
            cardTransition = "none";
            placeholderOpacity = 1;
            placeholderTransition = "none";
            cardZIndex = 1;
            break;
          case "settled":
          default:
            cardOpacity = settledCardOpacity;
            cardTransform = slotTransform;
            cardTransition = "none";
            placeholderOpacity = 0;
            placeholderTransition = reducedMotion ? "none" : `opacity ${CARD_LAY_MS}ms ease-out`;
            cardZIndex = 1;
            break;
        }
        // Pulse animation: fires once when pulseActive flips true.
        // CSS var(--h2h-pulse-color) carries this card's tier color
        // into the @keyframes h2h-card-pulse box-shadow + scale ramp.
        const pulseColor = TIER_ACCENT[card.tier] ?? "rgba(255,255,255,0.5)";
        const pulseAnimation = (pulseActive && stage === "settled" && !reducedMotion)
          ? `h2h-card-pulse ${ENERGY_PULSE_MS}ms ease-in-out 1`
          : "none";
        return (
          <div
            key={card.cardId}
            data-h2h-mini-cell="true"
            data-card-id={card.cardId}
            data-active-in-battlefield={isActiveInBattlefield ? "true" : "false"}
            data-h2h-cell-stage={stage}
            data-h2h-cell-stage-index={String(stageIndex)}
            data-h2h-pulse={pulseActive ? "true" : "false"}
            style={{
              height: "100%",
              aspectRatio: "329 / 478",
              flexShrink: 1,
              minWidth: 0,
              // RD2.1: container query unit source for the inner card's
              // scale (slotTransform reads 100cqw against this cell).
              containerType: "inline-size",
              position: "relative",
              // overflow visible so card content in LAY/BEAT/TRAVEL
              // phases can render outside its strip cell (at the
              // middle of the screen and along the travel path).
              overflow: "visible",
              boxSizing: "border-box",
              borderRadius: 6,
              animation: pulseAnimation,
              // Per-card tier color piped into the pulse keyframe.
              ["--h2h-pulse-color" as any]: pulseColor,
            }}
          >
            {/* Placeholder layer — dim outline anchored at the slot
                position. Visible BEFORE the card settles (through
                pre/lay/beat/travel); fades out when the card lands
                at the slot. */}
            <div
              data-h2h-mini-placeholder="true"
              style={{
                position: "absolute",
                inset: 0,
                border: "1px dashed rgba(255,255,255,0.18)",
                borderRadius: 6,
                background: "rgba(255,255,255,0.04)",
                opacity: placeholderOpacity,
                transition: placeholderTransition,
                pointerEvents: "none",
                boxSizing: "border-box",
              }}
            />
            {/* Card content — walks through pre → lay → beat → travel
                → settled. During LAY/BEAT it renders at the middle of
                the screen, scaled to hero size; during TRAVEL it
                transitions to the slot position + mini scale; on
                SETTLE the placeholder fades out beneath it. */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: STRIP_CARD_NATURAL_WIDTH_PX,
                height: STRIP_CARD_NATURAL_HEIGHT_PX,
                transform: cardTransform,
                transformOrigin: "top left",
                opacity: cardOpacity,
                transition: cardTransition,
                zIndex: cardZIndex,
                pointerEvents: "none",
              }}
            >
              {renderCard(card, { revealed: isRevealed })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── prefers-reduced-motion hook ──────────────────────────────────────────
// All H2H phase-3 animations (entrance lay-down, battlefield card-pull)
// gate on this. CardFront's internal FP rollup is unaffected — it
// belongs to the single-player animation system, and the user spec
// scoped reduced-motion fixes to "only the new phase-3 animations".

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    // Safari fallback
    mq.addListener?.(handler);
    return () => mq.removeListener?.(handler);
  }, []);
  return reduced;
}

// ── Battlefield card-pull keyframes ──────────────────────────────────────
// Inlined as a singleton <style> tag at the top of H2HRevealScreen. Each
// matchup-card swap mounts a fresh wrapper with `animation: h2h-bf-enter-*`,
// which fires the keyframe sequence (slide+grow into position). The
// previous matchup's card stays mounted for BATTLEFIELD_TRAVEL_DURATION_MS
// with `animation: h2h-bf-exit-*` (slide+shrink away), then unmounts.
//
// translateY direction: top card flies in from above (-110px), bottom
// card flies in from below (+110px). Scale 0.4→1 mimics "card grew as it
// approached" without needing per-card DOM measurements.
//
// Outgoing uses ease-in (accelerate away); incoming uses ease-out
// (decelerate into position). Combined: feels like cards continuously
// flowing in and out of the battlefield rather than discrete reveals.

const BATTLEFIELD_TRAVEL_OFFSET_PX = 110;
const BATTLEFIELD_TRAVEL_SCALE_FROM = 0.4;

const BF_KEYFRAMES_CSS = `
@keyframes h2h-bf-enter-top {
  from { transform: translateY(-${BATTLEFIELD_TRAVEL_OFFSET_PX}px) scale(${BATTLEFIELD_TRAVEL_SCALE_FROM}); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes h2h-bf-enter-bottom {
  from { transform: translateY(${BATTLEFIELD_TRAVEL_OFFSET_PX}px) scale(${BATTLEFIELD_TRAVEL_SCALE_FROM}); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes h2h-bf-exit-top {
  from { transform: translateY(0) scale(1); opacity: 1; }
  to { transform: translateY(-${BATTLEFIELD_TRAVEL_OFFSET_PX}px) scale(${BATTLEFIELD_TRAVEL_SCALE_FROM}); opacity: 0; }
}
@keyframes h2h-bf-exit-bottom {
  from { transform: translateY(0) scale(1); opacity: 1; }
  to { transform: translateY(${BATTLEFIELD_TRAVEL_OFFSET_PX}px) scale(${BATTLEFIELD_TRAVEL_SCALE_FROM}); opacity: 0; }
}
/* Pre-reveal anticipation pulse — single rise/peak/fade. Each cell
   sets its own --h2h-pulse-color (tier-keyed) via inline style, so
   the same keyframe drives different colors across cards. */
@keyframes h2h-card-pulse {
  0% { box-shadow: 0 0 0 0 transparent; transform: scale(1); }
  50% { box-shadow: 0 0 18px 6px var(--h2h-pulse-color, transparent); transform: scale(1.025); }
  100% { box-shadow: 0 0 0 0 transparent; transform: scale(1); }
}
/* Relay-tension Phase 1: per-set delta flash. The element is keyed by
   matchupIndex so React remounts it on each set boundary, retriggering
   this animation. Result: a quick scale pulse + brightness ramp that
   reads as "this leg landed" — the sign of the delta (green/red) is
   already in the steady color; this keyframe just punches it visually
   for ~280ms. The element settles back to its steady color/scale at
   100%. Reduced-motion path below disables the punch. */
@keyframes h2h-mid-rail-flash {
  0%   { transform: scale(1.0); filter: brightness(1.0); }
  35%  { transform: scale(1.15); filter: brightness(1.6); }
  100% { transform: scale(1.0); filter: brightness(1.0); }
}
/* Relay-tension Phase 2 — momentum tag on set-boundary flip. Fades
   IN starting at 80ms (stagger from the delta flash at t=0 so the two
   transients don't visually fight), holds for ~250ms, then fades OUT
   over 150ms. Animation total = 480ms; the element is unmounted by
   the parent after that via setTimeout. */
@keyframes h2h-momentum-tag-anim {
  0%    { opacity: 0; transform: translate(0, 4px); }
  16.7% { opacity: 0; transform: translate(0, 4px); }   /* 80ms stagger */
  29.2% { opacity: 1; transform: translate(0, 0); }     /* 140ms — fade in done */
  68.8% { opacity: 1; transform: translate(0, 0); }     /* 330ms — hold ends */
  100%  { opacity: 0; transform: translate(0, -2px); }  /* 480ms — fade out done */
}
/* Phase 3 — anchor-moment frame. Fades in over 240ms when mounted
   (during paused before the final set, only when game still alive).
   Unmount is handled by React when the gating predicate flips false;
   exit is unanimated because the final-set reveal kicks in
   immediately and the eye is drawn to the cards moving. */
@keyframes h2h-anchor-frame-enter {
  0%   { opacity: 0; transform: translateY(4px); }
  100% { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  [data-h2h-bf-anim], [data-h2h-pulse], [data-h2h-mid-rail-flash], [data-h2h-momentum-tag], [data-h2h-anchor-frame] { animation: none !important; }
}
`;

// One-shot keyframes injection. Idempotent — re-mounts of H2HRevealScreen
// don't duplicate the style tag.
let bfKeyframesInjected = false;
function ensureKeyframesInjected() {
  if (bfKeyframesInjected) return;
  if (typeof document === "undefined") return;
  const tag = document.createElement("style");
  tag.setAttribute("data-h2h-keyframes", "true");
  tag.textContent = BF_KEYFRAMES_CSS;
  document.head.appendChild(tag);
  bfKeyframesInjected = true;
}

// ── Zone header — just the display name ──────────────────────────────────
// Earlier iterations rendered `displayName + tier + totalFp` in the
// header. Two problems surfaced in visual smoke: (1) the totalFp ALSO
// renders next to its battlefield card via ScoreCell, so the header
// total was a duplicate; (2) the tier label sat in the visually-central
// position, and the small 13px displayName at the left edge was easy
// to miss, making the tier look like the zone's primary identifier
// (the user said "MIKE/YOU not visible; there's a stray ROOKIE label").
// Reduced to just the display name at a more prominent 18px so the
// zone identity reads cleanly.

// ZoneHeader props live in H2HBoardShell now.

// ── Entrance deck ────────────────────────────────────────────────────────
// Phase 4 fix 1 (2026-05-27, corrected). Two REAL face-UP deck stacks
// render at the top and bottom hero positions during
// `phase === "entering"`. Each stack shows the cards that haven't been
// dealt yet, layered with a small Y offset so the stack reads as a
// pile of depth. The TOP of each stack shows the FRONT of the
// next-to-deal card (player photo + tier + stats). As that card's
// stage transitions pre → lay, it flies out (rendered in HandStrip
// using deckTransform) and the next card becomes the new visible top.
//
// Visual model: a dealer's stack. The dealer's hand shows the next
// card; as it's dealt, the next one underneath becomes visible.

interface EntranceDeckProps {
  /** Side's reveal-ordered cards. Index in this array = stage_index. */
  cards: H2HCard[];
  /** Per-stage-index entrance state. */
  entranceStages: EntranceStage[];
  /** Same renderer the rest of the screen uses — renders the card front. */
  renderCard: CardRenderer;
}

function EntranceDeck({ cards, entranceStages, renderCard }: EntranceDeckProps) {
  // Pre-stage cards remaining in the deck, paired with stage_index.
  // Lowest stage_index = next to deal = top of the stack.
  const remaining: Array<{ card: H2HCard; stageIndex: number }> = [];
  for (let i = 0; i < cards.length; i++) {
    if (entranceStages[i] === "pre") {
      remaining.push({ card: cards[i], stageIndex: i });
    }
  }
  if (remaining.length === 0) return null;

  // Render bottom-of-stack first → top-of-stack last so DOM order
  // matches z-order. Each card gets a small downward offset relative
  // to the TOP card so the stack reads as a pile peeking out.
  const OFFSET_PER_LAYER_PX = 4;
  return (
    <div
      data-h2h-entrance-deck="true"
      data-cards-remaining={String(remaining.length)}
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minWidth: 0,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: BATTLEFIELD_CARD_MAX_WIDTH,
          aspectRatio: "329 / 478",
        }}
      >
        {remaining
          .slice()
          .reverse() // bottom of pile rendered first
          .map(({ card, stageIndex }, depthFromTop) => {
            // depthFromTop=0 is the visible TOP. Higher = deeper in
            // the pile.
            const layerFromTop = remaining.length - 1 - depthFromTop;
            const isTop = layerFromTop === 0;
            return (
              <div
                key={card.cardId}
                data-h2h-deck-card-stage={String(stageIndex)}
                data-h2h-deck-card-top={isTop ? "true" : "false"}
                style={{
                  position: "absolute",
                  inset: 0,
                  transform: `translateY(${layerFromTop * OFFSET_PER_LAYER_PX}px)`,
                  // Top of stack on TOP (highest z). Cards below it
                  // get progressively lower z so the visible peek is
                  // just the offset.
                  zIndex: 100 - layerFromTop,
                  // Cards under the top get a small opacity dim so
                  // the pile reads as a real stack rather than a
                  // single card with a weird shadow.
                  opacity: isTop ? 1 : 0.92,
                  pointerEvents: "none",
                }}
              >
                {renderCard(card, { revealed: false })}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ZoneHeader moved to H2HBoardShell (the shared chrome).

// ── Battlefield card frame ───────────────────────────────────────────────
// Wrapper matches single-player's RosterGrid card-slot pattern:
//   width: 100%; aspectRatio: 329/478; position: relative
// (RosterGrid.tsx:206-210). Card width is determined by the parent
// container's max-width cap; aspect-ratio derives height. Same
// invocation as single-player so the rendered card sizing tracks
// single-player's natural scale.

interface BattlefieldCardProps {
  card: H2HCard;
  renderCard: CardRenderer;
  /** Optional animated FP. When set, the sport renderer forwards it
   *  to the card's `visibleFp` prop (CardFront's internal RAF
   *  interpolation runs and the FP digit ticks up). When undefined
   *  (phase 2 static), the card shows its final actualFp. */
  visibleFp?: number;
  /** Per-card revealed flag (from `useH2HReveal.revealedCardIds`).
   *  Forwarded to the renderer; mid-rollup hero cards pass false until
   *  the rollup terminal write flips it true. */
  revealed?: boolean;
  /** Live shake signal — drives PCS's pcs-shake-* CSS class. Non-null
   *  while this card is shaking. Pre-rollup shake (band-tier or
   *  hype) fires on matchup entry; legendary post-rollup celebration
   *  shake fires at rollup terminal. */
  shakeType?: ShakeType | null;
  /** Blast props — only meaningful for band-tier cards; dead-band
   *  cards leave glowActive=false (no blast). */
  glowActive?: boolean;
  glowTier?: string;
  glowDurationMs?: number;
}

function BattlefieldCard({ card, renderCard, visibleFp, revealed, shakeType, glowActive, glowTier, glowDurationMs }: BattlefieldCardProps) {
  return (
    <div
      data-h2h-battlefield-card="true"
      data-card-id={card.cardId}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "329 / 478",
        overflow: "visible",
      }}
    >
      {renderCard(card, { visibleFp, revealed, shakeType, glowActive, glowTier, glowDurationMs })}
      {/* SWAP indicator — top-right corner pill on non-held cards. The
          held indicator (gold corner triangle) is drawn inside CardFront
          itself when locked={card.wasHeld} is passed. The SWAP pill's
          visual is deliberately quieter than the held triangle so the
          two indicators read as a clear distinction: bold gold = held;
          subtle pill = swap. */}
      {!card.wasHeld && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            zIndex: 70,
            padding: "2px 6px",
            background: "rgba(0,0,0,0.65)",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 999,
            fontSize: 8,
            fontWeight: 900,
            color: "rgba(255,255,255,0.85)",
            letterSpacing: 1.2,
            pointerEvents: "none",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        >
          SWAP
        </div>
      )}
    </div>
  );
}

// Score block (per-team total number, win/loss colored) is now the
// shared ScoreCell imported from H2HScoreRail. The local TeamScore +
// ScoreCell wrappers retired in the rail-unify refactor.

// ── Matchup delta + final margin block (sits in the battlefield gap) ─────
// Renders inside the center column of the battlefield grid (the same
// column the hero cards live in). The grid's `justify-items: center`
// on this row centers the matchup content horizontally at the cards'
// x-center — i.e., at viewport center, since the grid's symmetric
// left/right rails put the center column at viewport horizontal
// center.

interface MidRailContentProps {
  senderCard: H2HCard | null;
  recipientCard: H2HCard | null;
  /** Relay-tension Phase 1 + 2.6: drives a one-shot color flash + scale
   *  pulse on the delta block. Phase 1 keyed this on `matchupIndex` so
   *  the flash fired at SET START. Phase 2.6 changed the timing model
   *  — the delta is held at 0 through cards-reveal + totals-roll, then
   *  rolls 0→target as its own beat. The flash now fires when the
   *  DELTA LANDS (parent passes `deltaLandedKey`, which it sets when
   *  phase enters paused/end-hold post-delta-RAF), so the punch
   *  lands on a value the user can read, not on the 0 that was just
   *  reset for the new set. Undefined on the phase-2 static-mock path
   *  (no reveal hook wired) — no flash. */
  flashKey?: number;
  /** Relay-tension Phase 1, cross-surface handoff: at `phase === "done"
   *  | "end-hold"`, the reveal-side delta switches from per-set sign
   *  to FINAL-GAP sign so the color the user sees at the last reveal
   *  frame matches what the results overlay will render at the first
   *  results frame. Caller computes
   *    finalGap = recipient.totalFp − sender.totalFp
   *  and passes it; otherwise undefined (per-set mode). */
  finalGapOverride?: number;
  /** Relay-tension Phase 2.6 — the animated per-set delta value from
   *  the hook's `deltaRunning`. When defined, it OVERRIDES the per-
   *  card computation: the delta starts at 0 at set start, climbs to
   *  `recipientCard.actualFp − senderCard.actualFp` via the hook's
   *  delta RAF after the totals land. Undefined on the static phase-2
   *  mock path — falls back to per-card computation. `finalGapOverride`
   *  still takes precedence at end-hold/done for the crossfade
   *  invariant. */
  deltaRunning?: number;
}

function MidRailContent({
  senderCard,
  recipientCard,
  flashKey,
  finalGapOverride,
  deltaRunning,
}: MidRailContentProps) {
  // Phase 4 fix 2 (2026-05-27): renders ONLY the per-matchup delta in
  // the right rail between the two FP totals. The prior final-margin
  // pill (TIE / EVEN / +N pill) was removed — it caused a transient
  // "TIE / EVEN" flash at the start of `revealing` when both running
  // totals were still 0, before the rolling totals had ticked. The
  // overall margin is conveyed by the two FP totals themselves; the
  // user does not need a separate readout.
  if (!senderCard || !recipientCard) {
    return <div aria-hidden="true" />;
  }
  // Value resolution (priority order):
  //   1. finalGapOverride — caller passes at phase===done|end-hold for
  //      cross-surface handoff continuity (Phase 1).
  //   2. deltaRunning — caller passes the hook's animated per-set delta
  //      (Phase 2.6). Starts at 0 each set, rolls to per-set target
  //      after the totals land. This is the load-bearing change vs
  //      Phase 2: the delta no longer snaps at set start.
  //   3. Per-card computation — only the static mock path (no reveal
  //      hook wired) takes this branch.
  const rawDelta = finalGapOverride !== undefined
    ? finalGapOverride
    : deltaRunning !== undefined
      ? deltaRunning
      : recipientCard.actualFp - senderCard.actualFp;
  const matchupDelta = Math.round(rawDelta * 10) / 10;
  // RD6.2-A (2026-06-12): delta beef-up — new copy, new color, new
  // size wired to SCORE_CELL_FONT_SIZE_PX. Source calc unchanged.
  // RD6.2-A revision (2026-06-12, post-first-glass): FINAL state
  // INHERITS the per-set treatment (size + color logic) but with
  // distinct terminal copy: "Won X.X FP" / "Lost X.X FP" / "Even"
  // (per-set says "Gained" / "Lost" / "Even" — same verb shape, but
  // "Won" marks the whole-game vs per-card-swing distinction). The
  // "final" eyebrow sublabel is retired; the new copy already signals
  // terminal. h2h-mid-rail-flash still suppressed on FINAL — gating
  // unchanged (steady-state, not a set transition).
  const isFinal = finalGapOverride !== undefined;
  const copy =
    matchupDelta > 0
      ? `${isFinal ? "Won" : "Gained"} ${matchupDelta.toFixed(1)} FP`
      : matchupDelta < 0
        ? `Lost ${Math.abs(matchupDelta).toFixed(1)} FP`
        : "Even";
  const deltaColor =
    matchupDelta > 0
      ? WINNING_COLOR
      : matchupDelta < 0
        ? LOSING_COLOR
        : DELTA_NEUTRAL;
  return (
    <div
      data-h2h-mid-rail="true"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Inner block is keyed by flashKey so React remounts it on each
          set boundary, retriggering the h2h-mid-rail-flash keyframe.
          Per-set color + scale pulse fires once for ~250ms then settles
          to the steady delta color. finalGapOverride mode (done/end-
          hold) suppresses the flash by reusing flashKey as 'final' — no
          remount → no animation. */}
      <div
        key={isFinal ? "final" : `set-${flashKey ?? 0}`}
        data-h2h-mid-rail-flash={isFinal ? "final" : "set"}
        style={{
          // RD6.2-A: both per-set AND final share the team-total FP
          // size (SCORE_CELL_FONT_SIZE_PX = 20) — single source of
          // truth. Same fontWeight, color logic, copy shape across
          // both states; only the verb token (Won vs Gained) differs.
          fontSize: SCORE_CELL_FONT_SIZE_PX,
          fontWeight: 900,
          color: deltaColor,
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
          lineHeight: 1.1,
          letterSpacing: -0.3,
          animation:
            !isFinal && flashKey !== undefined
              ? `h2h-mid-rail-flash 280ms ease-out 1`
              : "none",
          transformOrigin: "center center",
        }}
      >
        {copy}
      </div>
    </div>
  );
}

// ── RD6.2-C — right-column narrative rail ────────────────────────────────
//
// Hosts the per-set delta AND the once-pre-final-decisive gap in a
// single fixed-height slot. Crossfade via opacity only — both layers
// are absolute-positioned inside the slot so swaps don't move the
// column.
//
// State machine, keyed off (reveal.phase, reveal.matchupIndex):
//   - Every NON-final non-pre-final-decisive set: delta only. Gap layer
//     stays at opacity 0 / unmounted.
//   - Penultimate paused window WITH isFinalSetDecisive().decisive:
//     delta dwells PRE_FINAL_DELTA_DWELL_MS, then crossfades to gap
//     (RAIL_CROSSFADE_MS). Gap holds until phase advances to the final
//     set's "revealing".
//   - Penultimate paused, sealed/blowout (decisive === false): no gap —
//     same as a regular non-final pause.
//   - phase === "end-hold" or "done": delta renders the FINAL verdict
//     (MidRailContent's finalGapOverride path).
//
// Gap source: same as the retired AnchorFrame — finalRecipientCard.name
// and isFinalSetDecisive().{framing, needPoints}. NOT a per-set
// "next-opponent" abstraction.
//
// RD6.2-C revision (2026-06-12): the first C pass over-generalized this
// to a per-set gap with senderRevealOrder[matchupIndex + 1] sourcing,
// which surfaced the FINAL recipient card's name + final-set need on
// every intermediate pause (stale / wrong) and added ~3.9s of paused-
// window tax to every 6-set arc. Reverted to the original
// AnchorFrame gate — once-pre-final-decisive only.

// RD6.2-C-rev2 (2026-06-12): 400 → 900. The 400ms first-pass clipped
// the per-set delta — the user could barely read "Gained X.X FP" before
// the slot crossfaded to the gap layer. Pre-final IS the climax; the
// delta deserves a full read. The widened pre-final paused window
// (ANCHOR_HOLD_MS = 2000) accommodates 900 + 250 (crossfade) + ~850
// (gap readable hold).
const PRE_FINAL_DELTA_DWELL_MS = 900;
const RAIL_CROSSFADE_MS = 250;
// RD6.2-C-rev3 closeout CORRECTED (2026-06-12): back to 80. The 110px
// bump in the mis-build pass was sized to fit a 3-line "Giannis
// Antetokounmpo" wrap. The corrected design drops the player name
// from the gap entirely (gap now reads just "LAST CARD / Need +X.X",
// two lines ≈ 32px), so the slot doesn't need to grow.
const RAIL_SLOT_HEIGHT_PX = 80;

interface RightColumnRailProps {
  reveal:
    | {
        phase: "idle" | "revealing" | "paused" | "end-hold" | "done";
        matchupIndex: number;
        matchupCount: number;
        senderRunningTotal: number;
        recipientRunningTotal: number;
        senderRevealOrder: H2HCard[];
        recipientRevealOrder: H2HCard[];
        deltaRunning?: number;
      }
    | undefined;
  sender: H2HHand;
  recipient: H2HHand;
  senderBattle: H2HCard | null;
  recipientBattle: H2HCard | null;
  flashKey?: number;
}

function RightColumnRail({
  reveal,
  sender,
  recipient,
  senderBattle,
  recipientBattle,
  flashKey,
}: RightColumnRailProps) {
  const [showGap, setShowGap] = useState(false);
  const phase = reveal?.phase ?? "idle";
  const matchupIndex = reveal?.matchupIndex ?? 0;
  const matchupCount = reveal?.matchupCount ?? 0;
  const isPaused = phase === "paused";

  // Pre-final gate — penultimate paused window with a valid final
  // recipient card. RD6.2-C-rev2 (2026-06-12): the
  // `isFinalSetDecisive().decisive` condition is DROPPED — the gap now
  // shows on every penultimate paused window regardless of whether the
  // game is mathematically alive. Rationale: consistent closing beat,
  // and absence-of-gap previously leaked that the arc was already
  // decided. The helper is still called to drive copy (framing →
  // Need / Hold / TIED) and color, but its `decisive` flag is no
  // longer a UI gate. With finalSenderActualFp=0 (RD3-C: JOHN fixed)
  // the helper returns sensible framing+needPoints on every game.
  const finalRecipientCard =
    reveal && reveal.recipientRevealOrder.length === reveal.matchupCount
      ? reveal.recipientRevealOrder[reveal.matchupCount - 1]
      : null;
  const isPreFinalPause =
    isPaused && matchupCount >= 2 && matchupIndex === matchupCount - 2;
  const anchor =
    isPreFinalPause && finalRecipientCard && reveal
      ? isFinalSetDecisive({
          senderRunningTotal: reveal.senderRunningTotal,
          recipientRunningTotal: reveal.recipientRunningTotal,
          finalSenderActualFp: 0,
          finalRecipientActualFp: finalRecipientCard.actualFp,
        })
      : null;
  const gapShouldFire = !!(isPreFinalPause && finalRecipientCard);

  // State machine — entering a pre-final-decisive paused window starts
  // a short dwell on the per-set delta, then crossfades to the gap.
  // Any other state (including penultimate paused without decisive,
  // and every non-penultimate paused) keeps the slot on delta — no
  // gap. matchupIndex dependency resets the timer on each set boundary.
  useEffect(() => {
    if (gapShouldFire) {
      setShowGap(false);
      const t = setTimeout(() => setShowGap(true), PRE_FINAL_DELTA_DWELL_MS);
      return () => clearTimeout(t);
    }
    setShowGap(false);
    return undefined;
  }, [gapShouldFire, matchupIndex]);

  // Gap-layer copy/color via the helper's `framing`, matching the
  // retired AnchorFrame's behavior verbatim:
  //   overtake → "Need: +X.X" (green — recipient must climb)
  //   hold     → "Hold: X.X"  (amber — recipient must defend)
  //   tie      → "TIED"       (neutral)
  const gapFraming = anchor?.framing ?? "overtake";
  const gapNeedPoints = anchor?.needPoints ?? 0;
  const gapStatLine =
    gapFraming === "tie"
      ? "TIED"
      : gapFraming === "overtake"
        ? `Need: +${gapNeedPoints.toFixed(1)}`
        : `Hold: ${gapNeedPoints.toFixed(1)}`;
  const gapStatColor =
    gapFraming === "overtake"
      ? WINNING_COLOR
      : gapFraming === "hold"
        ? "#FFB14A" // amber — defend
        : DELTA_NEUTRAL;

  return (
    <div
      data-h2h-rail-slot="true"
      data-h2h-rail-state={showGap ? "gap" : "delta"}
      style={{
        position: "relative",
        width: "100%",
        height: RAIL_SLOT_HEIGHT_PX,
      }}
    >
      {/* Delta layer — always mounted; opacity 0 only when the gap is
          visible during the pre-final-decisive window. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: showGap ? 0 : 1,
          transition: `opacity ${RAIL_CROSSFADE_MS}ms ease`,
          pointerEvents: "none",
        }}
      >
        <MidRailContent
          senderCard={senderBattle}
          recipientCard={recipientBattle}
          flashKey={flashKey}
          deltaRunning={reveal?.deltaRunning}
          finalGapOverride={
            reveal && (phase === "done" || phase === "end-hold")
              ? recipient.totalFp - sender.totalFp
              : undefined
          }
        />
      </div>
      {/* Gap layer — mounted only during the pre-final-decisive window,
          so the DOM is clean on every other paused/revealing frame.
          Retains the data attrs the retired AnchorFrame emitted
          (data-h2h-anchor-framing / data-h2h-anchor-need) — same
          semantic role, just relocated. */}
      {gapShouldFire && finalRecipientCard && (
        <div
          data-h2h-rail-gap="true"
          data-h2h-anchor-framing={gapFraming}
          data-h2h-anchor-need={gapNeedPoints.toFixed(2)}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            opacity: showGap ? 1 : 0,
            transition: `opacity ${RAIL_CROSSFADE_MS}ms ease`,
            pointerEvents: "none",
            padding: "0 4px",
            textAlign: "center",
          }}
        >
          {/* RD6.2-C-rev3 closeout CORRECTED (2026-06-12): the eyebrow
              copy is "LAST CARD" (was "NEXT"). The gap layer no longer
              renders finalRecipientCard.name — John's decision: keep
              the moment focal on the stake ("the last card needs +X"),
              not the player. Dropping the name eliminates the long-
              name overflow problem at the root. */}
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 1.5,
              color: "rgba(255,255,255,0.55)",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            Last card
          </div>
          <div
            data-h2h-rail-gap-need-line="true"
            style={{
              // RD6.2-C-rev3 (2026-06-12): need fontSize 12 → matches
              // SCORE_CELL_FONT_SIZE_PX, consistent with the name
              // and the per-set delta.
              fontSize: SCORE_CELL_FONT_SIZE_PX,
              fontWeight: 800,
              color: gapStatColor,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: 0.5,
              lineHeight: 1,
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            {gapStatLine}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Phase 3 — anchor-moment frame (RETIRED in RD6.2-C) ───────────────────
// The AnchorFrame center overlay that covered the battlefield during
// the pre-final paused window is retired. Its "next opponent + need"
// data moved into the right-column rail's gap layer (see
// RightColumnRail above), sequenced AFTER the per-set delta. The
// `isFinalSetDecisive` helper in useH2HReveal stays exported (sealed/
// blowout detector); it just no longer gates a UI element.

// ── Card-cell helpers for the battlefield grid ───────────────────────────
// Each helper renders into one grid cell (center column of the 3-col
// battlefield grid). Grid handles layout positioning; these just
// center their contents within their cell and apply the card's
// max-width cap.

function CardCenterCell({
  card,
  renderCard,
  visibleFp,
  revealed,
  shakeType,
  glowActive,
  glowTier,
  glowDurationMs,
  side,
  reducedMotion,
}: {
  card: H2HCard | null;
  renderCard: CardRenderer;
  visibleFp?: number;
  revealed?: boolean;
  shakeType?: ShakeType | null;
  glowActive?: boolean;
  glowTier?: string;
  glowDurationMs?: number;
  /** "top" = sender row (card flies in from above). "bottom" =
   *  recipient row (card flies in from below). */
  side: "top" | "bottom";
  reducedMotion: boolean;
}) {
  return (
    <BattlefieldSlot
      card={card}
      renderCard={renderCard}
      visibleFp={visibleFp}
      revealed={revealed}
      shakeType={shakeType}
      glowActive={glowActive}
      glowTier={glowTier}
      glowDurationMs={glowDurationMs}
      side={side}
      reducedMotion={reducedMotion}
    />
  );
}

// ── BattlefieldSlot — card-pull motion wrapper ───────────────────────────
// Tracks the currently-rendered card AND the previously-rendered card
// during a transition. When `card` prop changes from a non-null value
// to another non-null value (matchup → matchup transition), the old
// card stays mounted with an exit animation while the new card mounts
// with an enter animation. After BATTLEFIELD_TRAVEL_DURATION_MS, the
// old card unmounts.
//
// Null → card or card → null transitions skip the cross-fade and just
// mount/unmount immediately (no card to fly away from / to).
//
// The exiting card renders with `visibleFp` undefined so CardFront's
// phase=RESULTS path displays actualFp statically (no fresh RAF rollup
// on a re-mounted CardFront instance). The entering card carries the
// hook's sentinel from visibleFpMap → CardFront rolls 0 → actualFp as
// usual.

interface BattlefieldSlotProps {
  card: H2HCard | null;
  renderCard: CardRenderer;
  visibleFp?: number;
  revealed?: boolean;
  shakeType?: ShakeType | null;
  glowActive?: boolean;
  glowTier?: string;
  glowDurationMs?: number;
  side: "top" | "bottom";
  reducedMotion: boolean;
}

function BattlefieldSlot({ card, renderCard, visibleFp, revealed, shakeType, glowActive, glowTier, glowDurationMs, side, reducedMotion }: BattlefieldSlotProps) {
  // Singleton keyframes for h2h-bf-enter-*/exit-* — injected lazily
  // on first render of any BattlefieldSlot.
  useEffect(() => {
    ensureKeyframesInjected();
  }, []);

  const [renderedCard, setRenderedCard] = useState<H2HCard | null>(card);
  const [exitingCard, setExitingCard] = useState<H2HCard | null>(null);
  const exitTimerRef = useRef<number>(0);
  // Tracks whether THIS slot has processed a real card transition.
  // False on initial mount (the end-state cards render at their final
  // positions without an entry keyframe — otherwise the user sees them
  // "fly in from outside" before the arc has even started). Flips true
  // the first time the card prop changes, so all subsequent matchup
  // transitions get the full card-pull keyframe.
  const hasTransitionedRef = useRef(false);

  useEffect(() => {
    const newId = card?.cardId ?? null;
    const oldId = renderedCard?.cardId ?? null;
    if (newId === oldId) return;

    // First real transition unlocks the keyframes. Set before scheduling
    // any state update so the next render reads the new value.
    hasTransitionedRef.current = true;

    // Cancel any outstanding exit cleanup — a rapid second transition
    // shouldn't leave a stale exiting card around.
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = 0;
    }

    if (renderedCard !== null && card !== null && !reducedMotion) {
      // Matchup → matchup transition: outgoing card overlays incoming
      // for BATTLEFIELD_TRAVEL_DURATION_MS, then unmounts.
      setExitingCard(renderedCard);
      setRenderedCard(card);
      exitTimerRef.current = window.setTimeout(() => {
        setExitingCard(null);
        exitTimerRef.current = 0;
      }, BATTLEFIELD_TRAVEL_DURATION_MS);
      return () => {
        if (exitTimerRef.current) {
          clearTimeout(exitTimerRef.current);
          exitTimerRef.current = 0;
        }
      };
    }

    // null↔card transition, or reduced-motion path: skip cross-fade.
    setRenderedCard(card);
    setExitingCard(null);
  }, [card, renderedCard, reducedMotion]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
  }, []);

  // When card transitions to null (entering phase, replay), bail out
  // immediately on the visible card layer — but render an invisible
  // placeholder of the same dimensions so the battlefield grid row
  // keeps its height. Without this, the row collapses to 0 during
  // entering, pulling the hand strips toward each other and breaking
  // the strip-relative coordinates the entrance translateY values
  // calibrate against.
  if ((card === null && exitingCard === null) || (!renderedCard && !exitingCard)) {
    return (
      <div
        data-h2h-bf-placeholder="true"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: BATTLEFIELD_CARD_MAX_WIDTH,
            aspectRatio: "329 / 478",
            visibility: "hidden",
          }}
        />
      </div>
    );
  }

  const animationsEnabled = hasTransitionedRef.current && !reducedMotion;
  const enterAnimation = animationsEnabled
    ? `h2h-bf-enter-${side} ${BATTLEFIELD_TRAVEL_DURATION_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1)`
    : "none";
  const exitAnimation = animationsEnabled
    ? `h2h-bf-exit-${side} ${BATTLEFIELD_TRAVEL_DURATION_MS}ms cubic-bezier(0.6, 0, 0.8, 0.3) forwards`
    : "none";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minWidth: 0,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: BATTLEFIELD_CARD_MAX_WIDTH,
        }}
      >
        {/* Exiting card: absolute-positioned overlay. Renders only
            during the transition window. visibleFp deliberately
            undefined so CardFront's RESULTS+undefined path shows the
            actualFp statically — no fresh RAF rollup on this mount. */}
        {exitingCard && (
          <div
            key={`exit-${exitingCard.cardId}`}
            data-h2h-bf-anim="exit"
            style={{
              position: "absolute",
              inset: 0,
              animation: exitAnimation,
              willChange: "transform, opacity",
              pointerEvents: "none",
            }}
          >
            <BattlefieldCard card={exitingCard} renderCard={renderCard} visibleFp={undefined} revealed={true} />
          </div>
        )}
        {/* Entering / settled card. `key` forces remount on cardId
            change so the keyframe animation re-fires for each new
            matchup. visibleFp is the live sentinel from the hook. */}
        {renderedCard && (
          <div
            key={`enter-${renderedCard.cardId}`}
            data-h2h-bf-anim="enter"
            style={{
              animation: enterAnimation,
              willChange: "transform, opacity",
            }}
          >
            <BattlefieldCard
              card={renderedCard}
              renderCard={renderCard}
              visibleFp={visibleFp}
              revealed={revealed}
              shakeType={shakeType}
              glowActive={glowActive}
              glowTier={glowTier}
              glowDurationMs={glowDurationMs}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── H2HRevealScreen ──────────────────────────────────────────────────────

export function H2HRevealScreen(props: H2HRevealScreenProps) {
  const { sender, recipient, renderCard, battlefieldSlotIndex, reveal, globalHeader } = props;
  const reducedMotion = usePrefersReducedMotion();

  // Resolve battlefield + display state from either the reveal hook
  // (phase 3 animated) or the static slot fallback (phase 2). Branches
  // are explicit so the static path stays untouched when no reveal is
  // wired; phase 3 mocks pass `reveal` and inherit the animated values.
  let senderBattle: H2HCard | null;
  let recipientBattle: H2HCard | null;
  let senderDisplayTotal: number;
  let recipientDisplayTotal: number;
  let senderVisibleFp: number | undefined;
  let recipientVisibleFp: number | undefined;
  let senderActiveCardId: string | null;
  let recipientActiveCardId: string | null;

  if (reveal !== undefined) {
    senderBattle = reveal.activeMatchup.sender;
    recipientBattle = reveal.activeMatchup.recipient;
    senderDisplayTotal = reveal.senderRunningTotal;
    recipientDisplayTotal = reveal.recipientRunningTotal;
    senderVisibleFp = senderBattle ? reveal.visibleFpMap.get(senderBattle.cardId) : undefined;
    recipientVisibleFp = recipientBattle ? reveal.visibleFpMap.get(recipientBattle.cardId) : undefined;
    senderActiveCardId = senderBattle?.cardId ?? null;
    recipientActiveCardId = recipientBattle?.cardId ?? null;
  } else {
    const maxSlot = Math.max(...sender.cards.map(c => c.slotIndex), ...recipient.cards.map(c => c.slotIndex));
    const slotIdx = battlefieldSlotIndex ?? maxSlot;
    senderBattle = getSlotCard(sender, slotIdx);
    recipientBattle = getSlotCard(recipient, slotIdx);
    senderDisplayTotal = sender.totalFp;
    recipientDisplayTotal = recipient.totalFp;
    senderVisibleFp = undefined;
    recipientVisibleFp = undefined;
    senderActiveCardId = senderBattle?.cardId ?? null;
    recipientActiveCardId = recipientBattle?.cardId ?? null;
  }

  // Relay-tension Phase 1: three-state lead treatment + Z1 sizeProgress.
  //
  // Both sides share the same `referenceTotal` (the larger of the two
  // finals) so the leader's sizeProgress hits 1.0 at end-of-game while
  // the trailer's sits at `trailer.final / leader.final < 1.0`. This
  // makes "leader grows bigger" fall out of the formula naturally — no
  // separate boost on top.
  //
  // Tie predicate uses a 0.05 FP tolerance to avoid a single-frame
  // floating-point miss during the rollup tick (totals are eased reals,
  // not integers). Requires both sides > 0 so the pre-reveal zero state
  // isn't treated as a tie.
  //
  // At `phase === "done" | "end-hold"`, both displayTotals equal the
  // finals — the same values the overlay surface computes — so the
  // resting ScoreCell on the last reveal frame matches the overlay's
  // first frame, by construction. No snap at the crossfade.
  const referenceTotal = Math.max(sender.totalFp, recipient.totalFp, 0.0001);
  const senderSizeProgress = senderDisplayTotal / referenceTotal;
  const recipientSizeProgress = recipientDisplayTotal / referenceTotal;
  const tied =
    Math.abs(senderDisplayTotal - recipientDisplayTotal) < 0.05 &&
    senderDisplayTotal > 0 &&
    recipientDisplayTotal > 0;
  const senderState: "leading" | "trailing" | "tied" = tied
    ? "tied"
    : senderDisplayTotal > recipientDisplayTotal
      ? "leading"
      : "trailing";
  const recipientState: "leading" | "trailing" | "tied" = tied
    ? "tied"
    : recipientDisplayTotal > senderDisplayTotal
      ? "leading"
      : "trailing";

  // ── Relay-tension Phase 2: set-boundary pops + momentum tag ──────────
  //
  // Detection: the hook lands in phase "paused" (or "end-hold" for the
  // final matchup) AFTER the rollup RAF locks the running totals at the
  // settled values. `popMemoryRef.lastResolvedIndex` is keyed to
  // matchupIndex so the boundary fires exactly once per set even though
  // the effect's deps re-evaluate on every running-total tick.
  //
  // Flip detection: prevLeader is held in the same ref and compared
  // against the new leader derived from the just-settled running totals.
  // "Flip" requires both sides to be CONCRETE non-tied leaders (i.e.,
  // not the first-set case where prevLeader is null, not a tie-to-X
  // emergence). Conservative on purpose — keeps the swap meaningful;
  // device-revisit can loosen later.
  //
  // Per-side scaled magnitude via `planRevealBeats(card).shakeType`
  // (legendary/big → 1.15×280ms; hype/null → 1.06×200ms; cold/frozen →
  // 1.03×180ms — locked in the design doc). On a flip, the new leader's
  // pop is overridden with the lead-change values (1.20×300ms — bigger
  // and longer than legendary so the swap is unmistakable). The
  // previous leader (now trailer) keeps its own scaled pop.
  //
  // Cross-surface handoff: all pops settle inside the inter-matchup
  // pause (max 300ms) or the end-of-arc hold (1700ms) before the
  // reveal→results crossfade. Web Animations API runs with `fill:
  // "none"` (see H2HScoreRail.tsx), so the inner glyph reverts to its
  // inline `scale(restScale)` when each pop completes — no leftover
  // transform at done phase.
  type FlipLeader = "sender" | "recipient" | "tied" | null;
  const popMemoryRef = useRef<{
    lastResolvedIndex: number;
    prevLeader: FlipLeader;
  }>({ lastResolvedIndex: -1, prevLeader: null });
  const [popState, setPopState] = useState<{
    senderPop?: { magnitude: number; durationMs: number; kind: "scaled" | "lead-change"; key: number };
    recipientPop?: { magnitude: number; durationMs: number; kind: "scaled" | "lead-change"; key: number };
    momentumTag?: { copy: string; key: number };
    /** Phase 2.6 — set this when the delta lands (phase enters paused/
     *  end-hold for a new matchupIndex). MidRailContent uses it as its
     *  flash retrigger key so the delta's color-pop fires WHEN THE
     *  DELTA LANDS on its per-set value, not at the start of the set
     *  (when the value is still 0 and the punch would land on nothing). */
    deltaLandedKey?: number;
  }>({});

  // RD6.2-C-rev3 ROOT-CAUSE FIX rev2 (2026-06-13): MEASURED delta anchor
  // that targets the GLYPH, not the wrapper box.
  //
  // rev1 centered the float WRAPPER (height ≈ RAIL_SLOT_HEIGHT_PX = 80,
  // sized for the gap layer) on the totals-midpoint via floatRect.height/2.
  // But the box is taller than the 1-line delta glyph that flex-centers
  // inside it; centering the BOX equals centering the GLYPH only if the
  // glyph's rendered center coincides with the box center — which depends
  // on line-box metrics + the flex chain + device font rendering. The
  // thing the user sees is the GLYPH ("Lost 12.3 FP"), so anchor the
  // glyph directly.
  //
  // Method (rigid translation): measure the glyph's rendered center, then
  // shift the wrapper by Δ = midpoint − glyphCenter. Because the glyph is
  // rigidly offset from the wrapper, moving the wrapper by Δ moves the
  // glyph by Δ → glyph center lands on the midpoint regardless of any
  // internal box/text offset. Device/font/structure independent.
  const railFloatRef = useRef<HTMLDivElement | null>(null);
  const [railFloatTopPx, setRailFloatTopPx] = useState<number | null>(null);
  // appliedTopRef mirrors the COMMITTED railFloatTopPx so measure() can
  // read the float's current applied `top` synchronously (the effect deps
  // intentionally exclude railFloatTopPx, so a state-closure read would be
  // stale). The coordinate-independent apply below nudges THIS value.
  const appliedTopRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    let rafId = 0;
    // RD6.2-C-rev3 rev4 (2026-06-13): COORDINATE-INDEPENDENT apply.
    // The phone crop showed the delta biased toward the top total even
    // though the glyph rects + midpoint were correct: the old apply
    // converted viewport→CSS-top through floatEl.offsetParent, but a CSS
    // `top` resolves against the CONTAINING BLOCK (nearest positioned OR
    // transformed ancestor), which a transformed-but-static ancestor on
    // iOS hijacks while offsetParent ignores it → wrong coord origin →
    // bias. Desktop has no such ancestor so it looked perfect.
    //
    // measure() returns the residual |midpoint − glyphCenter| it observed
    // (or null if it bailed). The relative apply needs NO offsetParent:
    // a 1px change in `top` moves the glyph 1px in the viewport (pure
    // translate + scroll preserve 1:1), so newTop = currentAppliedTop +
    // (midpoint − glyphCenterNow). offsetParent is used ONCE to bootstrap
    // the very first placement, then every correction is relative.
    const measure = (): number | null => {
      const floatEl = railFloatRef.current;
      if (!floatEl) return null;
      const opponentCell = document.querySelector<HTMLElement>(
        '[data-h2h-team-score-position="opponent"]',
      );
      const userCell = document.querySelector<HTMLElement>(
        '[data-h2h-team-score-position="user"]',
      );
      if (!opponentCell || !userCell) return null;

      // Measure each total at its TIGHT number glyph
      // ([data-h2h-team-score-glyph]) — the rendered digit the user sees,
      // not the ScoreCell box (inflated by ZoneHeader band / "Target:"
      // chrome). Fall back to the cell box only if the glyph is absent.
      const glyphRectOf = (cell: HTMLElement): DOMRect => {
        const glyph = cell.querySelector<HTMLElement>(
          '[data-h2h-team-score-glyph]',
        );
        return (glyph ?? cell).getBoundingClientRect();
      };
      const opponentRect = glyphRectOf(opponentCell);
      const userRect = glyphRectOf(userCell);
      const floatRect = floatEl.getBoundingClientRect();
      const opponentCenterY = opponentRect.top + opponentRect.height / 2;
      const userCenterY = userRect.top + userRect.height / 2;
      const midpointViewportY = (opponentCenterY + userCenterY) / 2;

      // Anchor the GLYPH the user sees (the delta text), not the wrapper.
      const glyphEl = floatEl.querySelector<HTMLElement>(
        '[data-h2h-mid-rail-flash]',
      );
      const glyphRect = glyphEl ? glyphEl.getBoundingClientRect() : floatRect;
      const anchorCenterY = glyphRect.top + glyphRect.height / 2;

      const residual = midpointViewportY - anchorCenterY;

      // Coordinate-independent apply (relative nudge from the current
      // applied top). Bootstrap the FIRST placement via offsetParent.
      let newTop: number;
      const offsetParent = floatEl.offsetParent as HTMLElement | null;
      if (appliedTopRef.current !== null) {
        newTop = appliedTopRef.current + residual;
      } else {
        if (!offsetParent) return null;
        const parentRect = offsetParent.getBoundingClientRect();
        newTop = floatRect.top + residual - parentRect.top;
      }

      setRailFloatTopPx((prev) => {
        let v: number;
        if (prev === null) v = newTop;
        else if (Math.abs(prev - newTop) < 0.5) v = prev;
        else v = newTop;
        appliedTopRef.current = v;
        return v;
      });
      return Math.abs(residual);
    };

    // Bounded rAF settle loop: re-measure after each apply (the static
    // mock never changes phase, so the relative correction must
    // self-trigger) and stop once the residual is < 0.5px or after 6
    // frames. Converges in 1–2 frames when already close.
    const runSettle = () => {
      if (rafId) cancelAnimationFrame(rafId);
      let frames = 0;
      const step = () => {
        const r = measure();
        frames += 1;
        if (r !== null && r > 0.5 && frames < 6) {
          rafId = requestAnimationFrame(step);
        }
      };
      step();
    };

    runSettle();
    window.addEventListener("resize", runSettle);
    // document.fonts.ready — text baselines shift on font swap; re-settle.
    const fontsReady = (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
    if (fontsReady && typeof fontsReady.then === "function") {
      fontsReady.then(runSettle).catch(() => undefined);
    }
    return () => {
      window.removeEventListener("resize", runSettle);
      if (rafId) cancelAnimationFrame(rafId);
    };
    // Deps: re-settle when the glyph first appears and on each set
    // boundary (phase/matchupIndex). The relative apply + 0.5px guard
    // keep it convergent; appliedTopRef persists the applied top across
    // re-runs so corrections stay relative.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.phase, reveal?.matchupIndex]);

  useEffect(() => {
    if (!reveal) return;
    const settled = reveal.phase === "paused" || reveal.phase === "end-hold";
    if (!settled) return;
    const idx = reveal.matchupIndex;
    if (idx < 0) return;
    if (popMemoryRef.current.lastResolvedIndex >= idx) return;
    popMemoryRef.current.lastResolvedIndex = idx;

    const sR = reveal.senderRunningTotal;
    const rR = reveal.recipientRunningTotal;
    const tiedNow = Math.abs(sR - rR) < 0.05 && sR > 0 && rR > 0;
    const newLeader: FlipLeader =
      tiedNow ? "tied" : sR > rR ? "sender" : rR > sR ? "recipient" : null;
    const prevLeader = popMemoryRef.current.prevLeader;
    popMemoryRef.current.prevLeader = newLeader;
    const flipped =
      prevLeader !== null && prevLeader !== "tied" &&
      newLeader !== null && newLeader !== "tied" &&
      prevLeader !== newLeader;

    const scaledFor = (
      shakeType: ShakeType | null,
    ): { magnitude: number; durationMs: number } => {
      if (shakeType === "legendary" || shakeType === "big") {
        return { magnitude: 1.15, durationMs: 280 };
      }
      if (shakeType === "cold" || shakeType === "frozen") {
        return { magnitude: 1.03, durationMs: 180 };
      }
      // hype + null (dead-band) fall here — small but always-present
      // punch so every set has SOMETHING.
      return { magnitude: 1.06, durationMs: 200 };
    };
    const senderCard = reveal.activeMatchup.sender;
    const recipientCard = reveal.activeMatchup.recipient;
    const senderScaled = senderCard ? scaledFor(planRevealBeats(senderCard).shakeType) : null;
    const recipientScaled = recipientCard ? scaledFor(planRevealBeats(recipientCard).shakeType) : null;

    const LEAD_CHANGE_MAGNITUDE = 1.20;
    const LEAD_CHANGE_DURATION_MS = 300;

    const senderPop = senderScaled ? {
      magnitude: flipped && newLeader === "sender"
        ? Math.max(senderScaled.magnitude, LEAD_CHANGE_MAGNITUDE)
        : senderScaled.magnitude,
      durationMs: flipped && newLeader === "sender"
        ? Math.max(senderScaled.durationMs, LEAD_CHANGE_DURATION_MS)
        : senderScaled.durationMs,
      kind: (flipped && newLeader === "sender" ? "lead-change" : "scaled") as "scaled" | "lead-change",
      key: idx,
    } : undefined;
    const recipientPop = recipientScaled ? {
      magnitude: flipped && newLeader === "recipient"
        ? Math.max(recipientScaled.magnitude, LEAD_CHANGE_MAGNITUDE)
        : recipientScaled.magnitude,
      durationMs: flipped && newLeader === "recipient"
        ? Math.max(recipientScaled.durationMs, LEAD_CHANGE_DURATION_MS)
        : recipientScaled.durationMs,
      kind: (flipped && newLeader === "recipient" ? "lead-change" : "scaled") as "scaled" | "lead-change",
      key: idx,
    } : undefined;

    const momentumTag = flipped ? { copy: "TAKES THE LEAD", key: idx } : undefined;
    setPopState({ senderPop, recipientPop, momentumTag, deltaLandedKey: idx });
  }, [
    reveal,
    reveal?.phase,
    reveal?.matchupIndex,
    reveal?.senderRunningTotal,
    reveal?.recipientRunningTotal,
    reveal?.activeMatchup,
  ]);

  // Auto-clear the momentum tag after its visible window. The tag's
  // CSS keyframe has 80ms in-stagger + 250ms hold + 150ms fade-out =
  // 480ms total. After that the element can be unmounted; this guards
  // against the (rare) case where back-to-back boundaries fire faster
  // than the tag can fade — the next set's setPopState will replace
  // the tag with a fresh key, retriggering the animation cleanly.
  useEffect(() => {
    if (!popState.momentumTag) return;
    const id = window.setTimeout(() => {
      setPopState(prev => (prev.momentumTag ? { ...prev, momentumTag: undefined } : prev));
    }, 480);
    return () => window.clearTimeout(id);
  }, [popState.momentumTag?.key]);

  // Per-card revealed status from the hook (post-amend6 pre-reveal rule,
  // 2026-05-27). Strips consume the full Set for both renderer-options
  // gating and the Option β brightness rule. Hero cells consume the
  // per-side flag derived from the active matchup's cardId.
  //
  // Static phase-2 path (no `reveal` hook wired): all cards are treated
  // as revealed because the static path renders the end-state of the
  // arc — the battlefield shows the chosen matchup, all 12 mini-cards
  // show post-reveal content, and the brightness rule's dim-others
  // behavior depends on every non-active card being in the revealed
  // set. Phase 3+ path: use the hook's live Set.
  const revealedCardIds = useMemo(() => {
    if (reveal?.revealedCardIds !== undefined) return reveal.revealedCardIds;
    const set = new Set<string>();
    for (const c of sender.cards) set.add(c.cardId);
    for (const c of recipient.cards) set.add(c.cardId);
    return set;
  }, [reveal?.revealedCardIds, sender.cards, recipient.cards]); // eslint-disable-line react-hooks/exhaustive-deps
  const senderBattleRevealed = senderBattle ? revealedCardIds.has(senderBattle.cardId) : false;
  const recipientBattleRevealed = recipientBattle ? revealedCardIds.has(recipientBattle.cardId) : false;

  // Per-side shake + glow (post-amend6 shake/blast rule, 2026-05-27).
  // Pulled from the reveal hook's per-side slots so both cards in a
  // matchup can animate simultaneously. Strip cells receive no shake/glow
  // — only the hero zone reads these.
  const senderShakeType = reveal?.senderShakeInfo?.type ?? null;
  const recipientShakeType = reveal?.recipientShakeInfo?.type ?? null;
  const senderGlowActive = reveal?.senderGlowState != null;
  const recipientGlowActive = reveal?.recipientGlowState != null;
  const senderGlowTier = reveal?.senderGlowState?.tier;
  const recipientGlowTier = reveal?.recipientGlowState?.tier;
  const senderGlowDurationMs = reveal?.senderGlowState?.durationMs;
  const recipientGlowDurationMs = reveal?.recipientGlowState?.durationMs;

  // Phase 4 amend5 fix 1 (2026-05-27): the deck visual renders ONLY
  // while at least one card is still in "pre" stage. Once the deck
  // is empty (last card already in flight to its strip), we switch
  // to CardCenterCell with matchup-0 hero cards (`useH2HReveal`
  // returns matchups[0] in activeMatchup as soon as deck empties).
  // This eliminates the empty-middle window between deck depletion
  // and matchup 0 starting — the hero zone is occupied by the deck
  // OR the matchup-0 cards at every instant of the arc.
  const isEntering = reveal !== undefined && reveal.phase === "entering";
  const deckHasPreCards =
    reveal !== undefined && (reveal.entranceStages ?? []).some(s => s === "pre");
  const showEntranceDeck = isEntering && deckHasPreCards;

  // Top + bottom strips and the battlefield grid render as content slots
  // INSIDE H2HBoardShell. The shell owns the chrome — outer fixed
  // gradient div, inner column, framed top/bottom containers with name
  // labels, hero region with locked minHeight, reserved-bottom spacer.
  // All reveal-specific behavior (deck-metaphor entrance, matchup
  // state, MidRail, glow/shake) stays here, flowing through the slots.

  const topStripSlot = (
    <HandStrip
      cards={sender.cards}
      renderCard={renderCard}
      activeCardId={senderActiveCardId}
      revealedCardIds={revealedCardIds}
      entranceStages={reveal?.entranceStages}
      revealOrder={reveal?.senderRevealOrder}
      side="sender"
      reducedMotion={reducedMotion}
      pulseActive={!!reveal?.pulseActive}
    />
  );

  const bottomStripSlot = (
    <HandStrip
      cards={recipient.cards}
      renderCard={renderCard}
      activeCardId={recipientActiveCardId}
      revealedCardIds={revealedCardIds}
      entranceStages={reveal?.entranceStages}
      revealOrder={reveal?.recipientRevealOrder}
      side="recipient"
      reducedMotion={reducedMotion}
      pulseActive={!!reveal?.pulseActive}
    />
  );

  const heroSlot = (
    <div
      data-h2h-battlefield="true"
      data-h2h-reveal-phase={reveal !== undefined ? `3-${reveal.phase}` : "2-static-mock"}
      data-h2h-matchup-index={reveal !== undefined ? String(reveal.matchupIndex) : undefined}
      style={{
        position: "relative",
        flex: "0 0 auto",
        display: "grid",
        gridTemplateColumns: `${LEFT_RAIL_WIDTH_PX}px 1fr ${RIGHT_RAIL_WIDTH_PX}px`,
        gridTemplateRows: "auto auto",
        rowGap: BATTLEFIELD_ROW_GAP_PX,
        width: "100%",
        // RD6.1: the score panel (formerly the only negative-z
        // descendant) is gone. `isolation:isolate` is kept as a
        // defensive stacking boundary — zero layout impact — so any
        // future absolute-positioned children with explicit z-index
        // (delta float, momentum tag, anchor frame) can't leak
        // upward into surrounding chrome.
        isolation: "isolate",
      }}
    >
          {/* RD6.1 (2026-06-11): the reveal-side score-cluster backing
              panel (data-h2h-reveal-score-panel) was deleted with the
              right-rail ScoreCells. Both team totals now live in the
              box corners via H2HBoardShell.ZoneHeader's `score` slot
              (see senderScoreCell / recipientScoreCell below).
              The delta float + momentum tag stay anchored to the
              right grid column. This subsumes the parked RD3.1
              ticket (panel downsize) — RD3.1 is now moot. */}

          {/* Left rail — empty on the arc. Spans both hero rows so the
              overlay's headline + trash-talk land at the same vertical
              bounds. */}
          <div aria-hidden="true" style={{ gridRow: "1 / span 2" }} />

          {/* Row 1: opponent's battlefield card + score */}
          {showEntranceDeck && reveal !== undefined
            ? <EntranceDeck
                cards={reveal.senderRevealOrder}
                entranceStages={reveal.entranceStages}
                renderCard={renderCard}
              />
            : <CardCenterCell
                card={senderBattle}
                renderCard={renderCard}
                visibleFp={senderVisibleFp}
                revealed={senderBattleRevealed}
                shakeType={senderShakeType}
                glowActive={senderGlowActive}
                glowTier={senderGlowTier}
                glowDurationMs={senderGlowDurationMs}
                side="top"
                reducedMotion={reducedMotion}
              />}
          {/* RD6.1: the row-1 right-column ScoreCell is deleted —
              opponent total now renders in the top box's name band
              via H2HBoardShell.topScore (built once below as
              senderScoreCell). This placeholder reserves the grid
              cell so the row layout + delta-float anchor are
              unchanged. */}
          <div aria-hidden="true" />

          {/* Row 2: recipient's battlefield card + score */}
          {showEntranceDeck && reveal !== undefined
            ? <EntranceDeck
                cards={reveal.recipientRevealOrder}
                entranceStages={reveal.entranceStages}
                renderCard={renderCard}
              />
            : <CardCenterCell
                card={recipientBattle}
                renderCard={renderCard}
                visibleFp={recipientVisibleFp}
                revealed={recipientBattleRevealed}
                shakeType={recipientShakeType}
                glowActive={recipientGlowActive}
                glowTier={recipientGlowTier}
                glowDurationMs={recipientGlowDurationMs}
                side="bottom"
                reducedMotion={reducedMotion}
              />}
          {/* RD6.1: row-2 right-column ScoreCell deleted; user total
              renders in the bottom box's name band via
              H2HBoardShell.bottomScore (recipientScoreCell below). */}
          <div aria-hidden="true" />

          {/* Matchup delta — floats in the right-rail GAP between the
              two score cells. Absolute so it does not push the hero
              rows apart. Visible during revealing / paused / end-hold
              / done (i.e. whenever an active matchup exists). */}
          {(!reveal
            || reveal.phase === "revealing"
            || reveal.phase === "paused"
            || reveal.phase === "end-hold"
            || reveal.phase === "done") && (
            <div
              ref={railFloatRef}
              data-h2h-mid-rail-float="true"
              // Phase 2.5 dev-overlay-readability data-attr. Lets
              // RelayDebugOverlay read the animating delta value via
              // DOM without coupling to React state. Read-only, zero
              // behavior impact. Mirrors data-h2h-team-score-display
              // on the score cells.
              data-h2h-mid-rail-rolling-value={
                reveal?.deltaRunning !== undefined
                  ? reveal.deltaRunning.toFixed(2)
                  : "none"
              }
              style={{
                position: "absolute",
                // RD6.2-C-rev3 ROOT-CAUSE FIX (2026-06-12): no more
                // translateY magic literal. Initial render uses
                // top:50% + translateY(-50%) so the float isn't
                // off-screen during the very first commit; the
                // useLayoutEffect above runs synchronously before
                // paint, measures the two corner ScoreCells, and
                // commits `railFloatTopPx` — switching to an absolute
                // top in px that puts the float's center on the
                // measured midpoint of Mike's and YOU's totals. The
                // user only ever sees the measured position.
                ...(railFloatTopPx !== null
                  ? { top: `${railFloatTopPx}px` }
                  : { top: "50%", transform: "translateY(-50%)" }),
                right: 0,
                width: RIGHT_RAIL_WIDTH_PX,
                pointerEvents: "none",
              }}
            >
              {/* RD6.2-C: the float now hosts a state-machine rail
                  (RightColumnRail) instead of just MidRailContent.
                  RightColumnRail keeps the MidRailContent delta as one
                  layer and adds a "Next: <Player> / Need +X.X" gap
                  layer; per-set paused phases dwell ~1500ms on delta
                  then crossfade to gap. */}
              <RightColumnRail
                reveal={reveal}
                sender={sender}
                recipient={recipient}
                senderBattle={senderBattle}
                recipientBattle={recipientBattle}
                flashKey={popState.deltaLandedKey}
              />
            </div>
          )}

          {/* Relay-tension Phase 2 — momentum tag on a set-boundary
              flip. Mounted only when popState.momentumTag is non-
              undefined (i.e., a flip just committed); auto-unmounted
              ~480ms later by the parent setTimeout. Placement: top:
              30%, right: 0 — ABOVE the delta float at top: 50%. Width
              matches the right rail so the tag is visually anchored to
              the score column. `key` ties to the matchup index so a
              back-to-back flip remounts cleanly (animation re-fires
              from 0%). Pointer-events disabled because the tag is
              visual-only. */}
          {popState.momentumTag && (
            <div
              key={popState.momentumTag.key}
              data-h2h-momentum-tag="true"
              style={{
                position: "absolute",
                top: "30%",
                right: 0,
                width: RIGHT_RAIL_WIDTH_PX,
                transform: "translateY(-50%)",
                pointerEvents: "none",
                fontSize: 9,
                fontWeight: 800,
                color: WINNING_COLOR,
                textAlign: "center",
                letterSpacing: 1,
                textTransform: "uppercase",
                lineHeight: 1.1,
                textShadow: `0 0 6px rgba(34, 197, 94, 0.55)`,
                animation: `h2h-momentum-tag-anim 480ms ease-out 1`,
              }}
            >
              {popState.momentumTag.copy}
            </div>
          )}

          {/* RD6.2-C (2026-06-12): the Phase 3 anchor-moment center
              overlay (AnchorFrame mount) is RETIRED. The "next opponent
              + need" data it conveyed lives in the right-column rail's
              gap layer now (see RightColumnRail above), sequenced
              AFTER the per-set delta. The center column stays clean.
              isFinalSetDecisive is still exported from useH2HReveal —
              the sealed/blowout detector remains available if a future
              feature wants it — but no longer gates a UI element. */}
        </div>
  );

  return (
    <>
      {/* RD6.1 (2026-06-11): team totals now render in the box-corner
          name bands instead of the right rail. Same ScoreCell
          component, same value/state derivation, new DOM home —
          leader-glow, scale-pop, sizeProgress, and the per-team
          data-attrs all carry over unchanged. The reveal→results
          no-snap upgrades from value-equal to component+geometric
          identity (the overlay's ZoneHeader renders an identically-
          positioned ScoreCell). The right grid column persists for
          the MidRailContent delta float + momentum tag (see :1790+).
          Static-mock path (no `reveal` hook): senderBattle /
          recipientBattle may be null at idle/entering — the cells
          still render against the prop totals so the box corners
          show the final values, matching the static end-state path
          the dev mock route exercises. */}
      <H2HBoardShell
        surfaceKind="reveal"
        globalHeader={globalHeader}
        topLabel={sender.displayName}
        bottomLabel={recipient.displayName}
        topStrip={topStripSlot}
        bottomStrip={bottomStripSlot}
        hero={heroSlot}
        topScore={
          // RD6.1-c: Mike's corner total reads "Target: X" — same
          // ScoreCell, wrapped in the static label. The ScoreCell DOM
          // (data-h2h-team-score-position="opponent") is unchanged so
          // the reveal→results no-snap gate still asserts on the inner
          // value node.
          <TargetCornerScore
            scoreCell={
              <ScoreCell
                total={sender.totalFp}
                displayTotal={senderDisplayTotal}
                state={senderState}
                sizeProgress={senderSizeProgress}
                surface="reveal"
                pop={popState.senderPop}
                teamPosition="opponent"
                // RD6.2-B (2026-06-12): synchronized dual-blink. Both
                // corner totals consume the SAME key
                // (popState.deltaLandedKey), so the React commit that
                // flips deltaLandedKey ALSO mounts both ScoreCells with
                // the new blink.key — both useEffects fire on the same
                // commit → both WAAPI animations start on the same
                // frame. Suppressed under reduced motion (the prop is
                // omitted, the useEffect short-circuits).
                blink={
                  reducedMotion
                    ? undefined
                    : { key: popState.deltaLandedKey, durationMs: BLINK_DURATION_MS }
                }
              />
            }
          />
        }
        bottomScore={
          <ScoreCell
            total={recipient.totalFp}
            displayTotal={recipientDisplayTotal}
            state={recipientState}
            sizeProgress={recipientSizeProgress}
            surface="reveal"
            pop={popState.recipientPop}
            teamPosition="user"
            // RD6.2-B: see senderScoreCell above — same key drives
            // both corner totals' blinks in sync.
            blink={
              reducedMotion
                ? undefined
                : { key: popState.deltaLandedKey, durationMs: BLINK_DURATION_MS }
            }
          />
        }
      />
      {/* Phase 2.5 dev-only relay debug overlay. JSX-gated on
          `import.meta.env.DEV` so Vite constant-folds the expression
          to `false && ...` in prod, tree-shaking both this element
          and the RelayDebugOverlay import out of the bundle. The
          `isRelayDebugEnabled()` runtime check inside the component
          itself is the belt-and-suspenders second layer (requires
          `?relayDebug=1` querystring even in dev). The overlay is
          position:fixed + pointer-events:none, so it doesn't reach
          relay layout or interaction. The values it consumes
          (running totals, phase, matchupIndex, activeMatchup) are
          already in this component's scope; no new state is added to
          feed it. Per-cell scale / state / pop are DOM-observed by
          the overlay itself via data-attributes + computed styles. */}
      {((import.meta as any).env?.DEV === true) && isRelayDebugEnabled() && (
        <RelayDebugOverlay
          reveal={reveal}
          senderFinalTotal={sender.totalFp}
          recipientFinalTotal={recipient.totalFp}
        />
      )}
    </>
  );
}

export default H2HRevealScreen;

// TIER_ACCENT is exported only for tests / future callers that need the
// canonical tier→color map. Internal usage in this component is limited
// to the win/loss treatment in ScoreCell (H2HScoreRail) + MidRail.
export { TIER_ACCENT };
