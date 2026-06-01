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

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { UseH2HRevealReturn } from "./useH2HReveal";
import type { ShakeType } from "@shared/components/types";
import {
  CARD_LAY_MS,
  CARD_TRAVEL_MS,
  ENERGY_PULSE_MS,
  BATTLEFIELD_TRAVEL_DURATION_MS,
  planRevealBeats,
  type EntranceStage,
} from "./useH2HReveal";
import { CardBackGeneric } from "./CardBackGeneric";
import { H2HBoardShell } from "./H2HBoardShell";
import {
  ScoreCell,
  RIGHT_RAIL_WIDTH_PX,
  LEFT_RAIL_WIDTH_PX,
  WINNING_COLOR,
  TRAILING_COLOR,
  DELTA_NEUTRAL,
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

// Hand strip total height. Derived from the constraint "6 mini-cards
// must fit within the mobile content width (390 - 32 padding = 358px)
// without clipping." Each cell width = strip_height × 329/478. Solving
// for cells×6 + gaps×5 ≤ 358:
//   80 × (329/478) ≈ 55px per cell. 6×55 + 5×4 gap = 350px. Fits 358.
// Wider viewports get the same 80px-tall strip (cells stay 55×80);
// extra horizontal room ends up as flex padding around the centered
// strip, NOT as wider cells (which would lose the "mini" register).
const HAND_STRIP_HEIGHT_PX = 80;
const HAND_STRIP_GAP_PX = 4;
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
const STRIP_CARD_NATURAL_WIDTH_PX = 150;
const STRIP_CARD_NATURAL_HEIGHT_PX = (STRIP_CARD_NATURAL_WIDTH_PX * 478) / 329;
const STRIP_CARD_DISPLAY_WIDTH_PX = (HAND_STRIP_HEIGHT_PX * 329) / 478;
const STRIP_CARD_SCALE = STRIP_CARD_DISPLAY_WIDTH_PX / STRIP_CARD_NATURAL_WIDTH_PX;

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
const BATTLEFIELD_CARD_MAX_WIDTH = "min(145px, 32vw)";

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
const BATTLEFIELD_ROW_GAP_PX = 14;

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
        const slotTransform = `scale(${STRIP_CARD_SCALE})`;
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
@media (prefers-reduced-motion: reduce) {
  [data-h2h-bf-anim], [data-h2h-pulse], [data-h2h-mid-rail-flash], [data-h2h-momentum-tag] { animation: none !important; }
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
  const matchupSign = matchupDelta > 0 ? "+" : matchupDelta < 0 ? "" : "";
  const deltaColor =
    matchupDelta > 0 ? WINNING_COLOR : matchupDelta < 0 ? TRAILING_COLOR : DELTA_NEUTRAL;
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
        key={finalGapOverride !== undefined ? "final" : `set-${flashKey ?? 0}`}
        data-h2h-mid-rail-flash={finalGapOverride !== undefined ? "final" : "set"}
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: deltaColor,
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
          lineHeight: 1.1,
          animation:
            finalGapOverride === undefined && flashKey !== undefined
              ? `h2h-mid-rail-flash 280ms ease-out 1`
              : "none",
          transformOrigin: "center center",
        }}
      >
        <div>{matchupSign}{matchupDelta.toFixed(1)}</div>
        <div style={{ fontSize: 7, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase" }}>
          {finalGapOverride !== undefined ? "final" : "matchup"}
        </div>
      </div>
    </div>
  );
}

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
  const { sender, recipient, renderCard, battlefieldSlotIndex, reveal } = props;
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
      }}
    >
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
          {senderBattle && !showEntranceDeck
            ? <ScoreCell total={sender.totalFp} displayTotal={senderDisplayTotal} state={senderState} sizeProgress={senderSizeProgress} surface="reveal" pop={popState.senderPop} />
            : <div />}

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
          {recipientBattle && !showEntranceDeck
            ? <ScoreCell total={recipient.totalFp} displayTotal={recipientDisplayTotal} state={recipientState} sizeProgress={recipientSizeProgress} surface="reveal" pop={popState.recipientPop} />
            : <div />}

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
                top: "50%",
                right: 0,
                width: RIGHT_RAIL_WIDTH_PX,
                transform: "translateY(-50%)",
                pointerEvents: "none",
              }}
            >
              <MidRailContent
                senderCard={senderBattle}
                recipientCard={recipientBattle}
                flashKey={popState.deltaLandedKey}
                deltaRunning={reveal?.deltaRunning}
                finalGapOverride={
                  reveal && (reveal.phase === "done" || reveal.phase === "end-hold")
                    ? recipient.totalFp - sender.totalFp
                    : undefined
                }
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
        </div>
  );

  return (
    <>
      <H2HBoardShell
        surfaceKind="reveal"
        topLabel={sender.displayName}
        bottomLabel={recipient.displayName}
        topStrip={topStripSlot}
        bottomStrip={bottomStripSlot}
        hero={heroSlot}
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
