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
import {
  CARD_LAY_MS,
  CARD_TRAVEL_MS,
  ENERGY_PULSE_MS,
  BATTLEFIELD_TRAVEL_DURATION_MS,
  type EntranceStage,
} from "./useH2HReveal";

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
export type CardRenderer = (card: H2HCard, options?: { visibleFp?: number }) => React.ReactNode;

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

// ── Win/loss color treatment ─────────────────────────────────────────────
// Leading side reads as winning (green-shifted), trailing as dimmed.
// Matches "score+delta in right rail" + "leading bright, trailing dim"
// from the design doc.

const WINNING_COLOR = "#22C55E";   // green — leading total + positive delta
const TRAILING_COLOR = "#9CA3AF";  // grey — losing total
const DELTA_NEUTRAL = "#E5E7EB";   // off-white — tie state

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
const ZONE_HEADER_HEIGHT_PX = 24;
const ZONE_GAP_PX = 4;

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

// Right-rail score-column width (one column adjacent to each battlefield
// card row). Wider than the score text itself (~50px for "182.4" at
// 22px font) so the score reads as "centered in a defined right-rail
// column" rather than "tag attached to the card."
const SCORE_COLUMN_WIDTH_PX = 80;

// Left-rail reserved width. Matches SCORE_COLUMN_WIDTH_PX so the
// battlefield grid is symmetric: [80 left rail | 1fr center | 80 right
// rail]. With the hero card centered in the 1fr center column, the
// card sits at the visual center of the viewport (left rail + right
// rail balance the layout around the card).
//
// Phase 2: left rail is empty (no commentary content yet). Phase 5
// will populate the left rail with commentary; if commentary needs
// more horizontal space than 80px the layout must adapt — see the
// "left-rail expansion" followup in docs/h2h-reveal-arc-design.md.
const LEFT_RAIL_WIDTH_PX = 80;

// Vertical gap between battlefield rows (top card row, mid-rail row,
// bottom card row). Tight by design — the two cards + mid-rail should
// read as one matchup unit.
const BATTLEFIELD_ROW_GAP_PX = 6;

// ── Helpers ──────────────────────────────────────────────────────────────

function getSlotCard(hand: H2HHand, slotIndex: number): H2HCard | null {
  return hand.cards.find(c => c.slotIndex === slotIndex) ?? null;
}

// ── Zone panel — glass-chrome wrapper for hand-strip zones ───────────────
// Mirrors single-player's header-panel chrome (shared/views/GameView.tsx:2228-2235):
//   borderRadius: 16, border: 1px solid rgba(255,255,255,0.10),
//   background: rgba(255,255,255,0.05), boxShadow: 0 8px 24px rgba(0,0,0,0.28),
//   backdropFilter: blur(10px).
// Hand-strip zones (opponent + your) wrap in this panel; the battlefield
// zone stays "open" (no panel) to match single-player's card-stage pattern
// where cards are the focal element without surrounding chrome.

function ZonePanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        gap: ZONE_GAP_PX,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.05)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        padding: "8px 12px",
      }}
    >
      {children}
    </div>
  );
}

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

// Entrance "middle" scale and Y offsets — during the LAY/BEAT phases,
// the card is scaled up to hero size (~125px wide vs ~55px mini) and
// translated to the middle of the screen. Two Y offsets approximate the
// battlefield hero row positions (upper for sender, lower for recipient)
// — sender card visually appears at the upper-middle band and recipient
// at the lower-middle band, so they stack vertically rather than
// overlapping at a single point.
// Translate X is computed per-cell from viewport width so each card
// crosses to the horizontal center regardless of its strip column.
const HERO_CARD_SCALE = 0.83;
// Sender strip is near the top of the screen; cards translate DOWN
// (positive Y) into the upper battlefield slot. Recipient strip near
// the bottom; cards translate UP into the lower battlefield slot. The
// magnitudes are calibrated so the two visuals land in their
// respective battlefield rows rather than overlapping at viewport
// center — see docs/h2h-reveal-arc-design.md "Phase 3.8 — sequential
// dealing" for the positioning rationale.
const MIDDLE_TRANSLATE_Y_SENDER_PX = 110;
const MIDDLE_TRANSLATE_Y_RECIPIENT_PX = -110;

// Compute the translateX needed to bring a cell's scaled-visual center
// to viewport horizontal center. cell_left ≈ innerColLeft + 16 + 4 +
// displayPos*59 on mobile; we read viewport width at render time so
// desktop's wider inner column stays aligned.
function computeMiddleTranslateX(displayPos: number): number {
  if (typeof window === "undefined") return 0;
  const vw = window.innerWidth;
  const innerColW = Math.min(480, vw);
  const innerColLeft = (vw - innerColW) / 2;
  const cellLeft = innerColLeft + 16 + 4 + displayPos * 59;
  const scaledHeroHalfWidth = (STRIP_CARD_NATURAL_WIDTH_PX * HERO_CARD_SCALE) / 2;
  return vw / 2 - cellLeft - scaledHeroHalfWidth;
}

function HandStrip({ cards, renderCard, activeCardId, entranceStages, revealOrder, side, reducedMotion, pulseActive }: HandStripProps) {
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
        // Stage_index is the card's position in the REVEAL ORDER (same
        // direction on both sides — cheapest swap = stage_index 0).
        // Both strips' stage_index 0 cards animate together. The
        // displayPos comes from slotIndex order, which may differ from
        // reveal order in phase 4 — the lookup via revealOrder keeps
        // the entrance order consistent with the reveal arc.
        const stageIndex = stageIndexByCardId.get(card.cardId) ?? displayPos;
        const stage: EntranceStage = stages[stageIndex] ?? "settled";

        // Compute the "middle of screen" transform target for this cell.
        // Each cell shifts to the viewport horizontal center + a Y
        // offset toward the battlefield row.
        const middleTranslateX = computeMiddleTranslateX(displayPos);
        const middleTranslateY = side === "sender"
          ? MIDDLE_TRANSLATE_Y_SENDER_PX
          : MIDDLE_TRANSLATE_Y_RECIPIENT_PX;
        const middleTransform =
          `translate(${middleTranslateX}px, ${middleTranslateY}px) scale(${HERO_CARD_SCALE})`;
        const slotTransform = `scale(${STRIP_CARD_SCALE})`;

        // Stage → visual mapping.
        // pre:      invisible, pre-positioned at middle (no transition)
        // lay:      fade in at middle (opacity transition)
        // beat:     hold at middle, full opacity
        // travel:   transform animates from middle to slot
        // settled:  at slot, normal opacity (dimmed if in-battlefield)
        let cardOpacity: number;
        let cardTransform: string;
        let cardTransition: string;
        let placeholderOpacity: number;
        let placeholderTransition: string;
        let cardZIndex: number;
        switch (stage) {
          case "pre":
            cardOpacity = 0;
            cardTransform = middleTransform;
            cardTransition = "none";
            placeholderOpacity = 1;
            placeholderTransition = "none";
            cardZIndex = 1;
            break;
          case "lay":
            cardOpacity = 1;
            cardTransform = middleTransform;
            cardTransition = reducedMotion ? "none" : `opacity ${CARD_LAY_MS}ms ease-out`;
            placeholderOpacity = 1;
            placeholderTransition = "none";
            cardZIndex = 100;
            break;
          case "beat":
            cardOpacity = 1;
            cardTransform = middleTransform;
            cardTransition = "none";
            placeholderOpacity = 1;
            placeholderTransition = "none";
            cardZIndex = 100;
            break;
          case "travel":
            cardOpacity = 1;
            cardTransform = slotTransform;
            cardTransition = reducedMotion ? "none" : `transform ${CARD_TRAVEL_MS}ms cubic-bezier(0.4, 0.0, 0.2, 1)`;
            placeholderOpacity = 1;
            placeholderTransition = "none";
            cardZIndex = 100;
            break;
          case "settled":
          default:
            cardOpacity = isActiveInBattlefield ? 0.35 : 1;
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
              {renderCard(card)}
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
@media (prefers-reduced-motion: reduce) {
  [data-h2h-bf-anim], [data-h2h-pulse] { animation: none !important; }
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
// renders next to its battlefield card via TeamScore, so the header
// total was a duplicate; (2) the tier label sat in the visually-central
// position, and the small 13px displayName at the left edge was easy
// to miss, making the tier look like the zone's primary identifier
// (the user said "MIKE/YOU not visible; there's a stray ROOKIE label").
// Reduced to just the display name at a more prominent 18px so the
// zone identity reads cleanly.

interface ZoneHeaderProps {
  hand: H2HHand;
}

function ZoneHeader({ hand }: ZoneHeaderProps) {
  return (
    <div
      style={{
        padding: "0 6px",
        height: ZONE_HEADER_HEIGHT_PX,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 18,
          fontWeight: 900,
          color: "rgba(255,255,255,0.95)",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {hand.displayName}
      </span>
    </div>
  );
}

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
}

function BattlefieldCard({ card, renderCard, visibleFp }: BattlefieldCardProps) {
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
      {renderCard(card, { visibleFp })}
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

// ── Score block (anchored next to a battlefield card) ────────────────────
// Single team-total number, sized to read at-a-glance, color-coded by
// win/loss state. Rendered inside a right-rail grid cell; the cell's
// flex centering positions the score vertically next to its card.

function TeamScore({ total, displayTotal, isLeading }: { total: number; displayTotal?: number; isLeading: boolean }) {
  // `displayTotal` is the currently-animated value driven by useH2HReveal
  // (running total ticking as each matchup's FP rolls). When undefined
  // (phase 2 static path), fall back to `total` (the final FP).
  const shown = displayTotal !== undefined ? displayTotal : total;
  return (
    <div
      data-h2h-team-score="true"
      data-h2h-team-score-display={shown.toFixed(1)}
      style={{
        textAlign: "center",
        lineHeight: 1.05,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 950,
          color: isLeading ? WINNING_COLOR : TRAILING_COLOR,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -0.5,
        }}
      >
        {shown.toFixed(1)}
      </div>
    </div>
  );
}

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
  senderTotal: number;
  recipientTotal: number;
}

function MidRailContent({ senderCard, recipientCard, senderTotal, recipientTotal }: MidRailContentProps) {
  const recipientLeading = recipientTotal > senderTotal;
  const senderLeading = senderTotal > recipientTotal;
  const finalMargin = Math.round(Math.abs(recipientTotal - senderTotal) * 10) / 10;
  const matchupDelta = senderCard && recipientCard
    ? Math.round((recipientCard.actualFp - senderCard.actualFp) * 10) / 10
    : 0;
  const matchupSign = matchupDelta > 0 ? "+" : matchupDelta < 0 ? "" : "";
  return (
    <div
      data-h2h-mid-rail="true"
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      {/* Matchup delta */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: matchupDelta > 0 ? WINNING_COLOR : matchupDelta < 0 ? TRAILING_COLOR : DELTA_NEUTRAL,
          fontVariantNumeric: "tabular-nums",
          opacity: senderCard && recipientCard ? 1 : 0,
          textAlign: "right",
          lineHeight: 1.1,
        }}
      >
        {senderCard && recipientCard ? (
          <>
            <div>{matchupSign}{matchupDelta.toFixed(1)}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase" }}>
              matchup
            </div>
          </>
        ) : null}
      </div>
      {/* Final-margin pill */}
      <div
        style={{
          padding: "3px 8px",
          borderRadius: 6,
          background:
            recipientLeading || senderLeading
              ? "rgba(34,197,94,0.12)"
              : "rgba(255,255,255,0.05)",
          border: `1px solid ${
            recipientLeading || senderLeading
              ? "rgba(34,197,94,0.35)"
              : "rgba(255,255,255,0.15)"
          }`,
          textAlign: "center",
          minWidth: 50,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 950,
            color: WINNING_COLOR,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {finalMargin === 0 ? "TIE" : `+${finalMargin.toFixed(1)}`}
        </div>
        <div
          style={{
            fontSize: 7,
            fontWeight: 700,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: 1,
            textTransform: "uppercase",
            marginTop: 1,
          }}
        >
          {recipientLeading ? "you" : senderLeading ? "opp" : "even"}
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
  side,
  reducedMotion,
}: {
  card: H2HCard | null;
  renderCard: CardRenderer;
  visibleFp?: number;
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
  side: "top" | "bottom";
  reducedMotion: boolean;
}

function BattlefieldSlot({ card, renderCard, visibleFp, side, reducedMotion }: BattlefieldSlotProps) {
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
            <BattlefieldCard card={exitingCard} renderCard={renderCard} visibleFp={undefined} />
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
            <BattlefieldCard card={renderedCard} renderCard={renderCard} visibleFp={visibleFp} />
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreCell({ total, displayTotal, isLeading }: { total: number; displayTotal?: number; isLeading: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <TeamScore total={total} displayTotal={displayTotal} isLeading={isLeading} />
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

  // Leading/trailing color tracks the CURRENT animated totals, not the
  // finals — the user sees the score colors flip as the running totals
  // overtake each other during the reveal.
  const recipientLeading = recipientDisplayTotal > senderDisplayTotal;
  const senderLeading = senderDisplayTotal > recipientDisplayTotal;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        // Same gradient as single-player GameView (shared/views/GameView.tsx:2181):
        // 0% / 38% / 100% color stops. Brings the visual language of the game
        // to the H2H takeover screen — same background, same product family.
        background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
        color: "#EAF0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        userSelect: "none",
        overflow: "hidden",
        // Safe-area-aware vertical padding. Additive: env(safe-area-inset)
        // + a 24px floor, so notched iOS devices get notch height + 24
        // (e.g. ~71px on iPhone 14) while non-notched and headless test
        // environments get 24px. Helps clear iOS Safari URL bar overlay
        // on initial page load before user scrolls to dismiss it.
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        boxSizing: "border-box",
      }}
      data-h2h-reveal-phase={reveal !== undefined ? `3-${reveal.phase}` : "2-static-mock"}
      data-h2h-matchup-index={reveal !== undefined ? String(reveal.matchupIndex) : undefined}
    >
      {/* Inner column — caps content at 480px on wide viewports and
          centers it horizontally. Matches single-player's GameView
          (shared/views/GameView.tsx:2212): `maxWidth: min(480px, 100%);
          margin: 0 auto`. Above 480px viewports, the H2H composition
          sits in a 480px-wide column with the gradient bg flanking on
          either side — same column shape as single-player. */}
      <div
        style={{
          width: "100%",
          maxWidth: "min(480px, 100%)",
          height: "100%",
          margin: "0 auto",
          paddingLeft: 16,
          paddingRight: 16,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "stretch",
          gap: 14,
        }}
      >
        {/* ── OPPONENT ZONE (top, glass panel) ───────────────────────── */}
        <ZonePanel>
          <ZoneHeader hand={sender} />
          <HandStrip
            cards={sender.cards}
            renderCard={renderCard}
            activeCardId={senderActiveCardId}
            entranceStages={reveal?.entranceStages}
            revealOrder={reveal?.senderRevealOrder}
            side="sender"
            reducedMotion={reducedMotion}
            pulseActive={!!reveal?.pulseActive}
          />
        </ZonePanel>

        {/* ── BATTLEFIELD (hero, open — no panel) ────────────────────── */}
        {/* 3-column × 3-row grid:
              ┌────────────┬───────────────┬────────────┐
              │ left rail  │  hero card    │ right rail │  row 1: top card + score
              ├────────────┼───────────────┼────────────┤
              │ (empty)    │  mid-rail     │ (empty)    │  row 2: matchup info
              ├────────────┼───────────────┼────────────┤
              │ left rail  │  hero card    │ right rail │  row 3: bottom card + score
              └────────────┴───────────────┴────────────┘
            Symmetric left/right rail widths put the center column at
            viewport horizontal center; hero cards in the center column
            are visually centered. Matches single-player's card-stage
            pattern: cards in the open with no panel chrome. */}
        <div
          data-h2h-battlefield="true"
          style={{
            flex: "0 0 auto",
            display: "grid",
            gridTemplateColumns: `${LEFT_RAIL_WIDTH_PX}px 1fr ${SCORE_COLUMN_WIDTH_PX}px`,
            rowGap: BATTLEFIELD_ROW_GAP_PX,
            width: "100%",
          }}
        >
          {/* Row 1: opponent's battlefield card + score */}
          <div aria-hidden="true" />
          <CardCenterCell
            card={senderBattle}
            renderCard={renderCard}
            visibleFp={senderVisibleFp}
            side="top"
            reducedMotion={reducedMotion}
          />
          {senderBattle
            ? <ScoreCell total={sender.totalFp} displayTotal={senderDisplayTotal} isLeading={senderLeading} />
            : <div />}

          {/* Row 2: mid-rail in center column (cards' x-center) */}
          <div aria-hidden="true" />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MidRailContent
              senderCard={senderBattle}
              recipientCard={recipientBattle}
              senderTotal={senderDisplayTotal}
              recipientTotal={recipientDisplayTotal}
            />
          </div>
          <div aria-hidden="true" />

          {/* Row 3: recipient's battlefield card + score */}
          <div aria-hidden="true" />
          <CardCenterCell
            card={recipientBattle}
            renderCard={renderCard}
            visibleFp={recipientVisibleFp}
            side="bottom"
            reducedMotion={reducedMotion}
          />
          {recipientBattle
            ? <ScoreCell total={recipient.totalFp} displayTotal={recipientDisplayTotal} isLeading={recipientLeading} />
            : <div />}
        </div>

        {/* ── YOUR ZONE (bottom, glass panel) ────────────────────────── */}
        <ZonePanel>
          <HandStrip
            cards={recipient.cards}
            renderCard={renderCard}
            activeCardId={recipientActiveCardId}
            entranceStages={reveal?.entranceStages}
            revealOrder={reveal?.recipientRevealOrder}
            side="recipient"
            reducedMotion={reducedMotion}
            pulseActive={!!reveal?.pulseActive}
          />
          <ZoneHeader hand={recipient} />
        </ZonePanel>
      </div>
    </div>
  );
}

export default H2HRevealScreen;

// TIER_ACCENT is exported only for tests / future callers that need the
// canonical tier→color map. Internal usage in this component is limited
// to the win/loss treatment in TeamScore + MidRail.
export { TIER_ACCENT };
