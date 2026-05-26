/**
 * shared/components/H2HRevealScreen.tsx
 *
 * Phase 2 of the H2H reveal arc — static end-state with mock data. No
 * animation, no per-matchup choreography, no real-data wiring. Locks
 * the visual structure before phase 3's animation work.
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

import React from "react";

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
 *  CardComponent at small sizes (shared/components/LandingPage.tsx:369). */
export type CardRenderer = (card: H2HCard) => React.ReactNode;

export interface H2HRevealScreenProps {
  sender: H2HHand;
  recipient: H2HHand;
  renderCard: CardRenderer;
  /** Which matchup pair to display in the battlefield zone. Defaults to
   *  the last slotIndex (the final reveal slot per the swap-then-held
   *  order). Phase 3 will animate through pairs; phase 2 just static-
   *  renders one. */
  battlefieldSlotIndex?: number;
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
  /** Which slotIndex is currently in the battlefield zone. The
   *  matching mini-cell in this strip dims to signal "this card is
   *  out of the hand, in battle." Phase 3 (animation choreography)
   *  will drive this dynamically as the reveal walks through
   *  matchups; in phase 2 it tracks the battlefield's static slot. */
  activeSlotIndex?: number;
}

function HandStrip({ cards, renderCard, activeSlotIndex }: HandStripProps) {
  const ordered = [...cards].sort((a, b) => a.slotIndex - b.slotIndex);
  return (
    <div
      data-h2h-hand-strip="true"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: HAND_STRIP_GAP_PX,
        height: HAND_STRIP_HEIGHT_PX,
        width: "100%",
      }}
    >
      {ordered.map(card => {
        const isActiveInBattlefield = activeSlotIndex !== undefined && card.slotIndex === activeSlotIndex;
        return (
          <div
            key={card.cardId}
            data-h2h-mini-cell="true"
            data-card-id={card.cardId}
            data-active-in-battlefield={isActiveInBattlefield ? "true" : "false"}
            style={{
              height: "100%",
              aspectRatio: "329 / 478",
              flexShrink: 1,
              minWidth: 0,
              position: "relative",
              overflow: "hidden",
              // Dim the mini-cell when its card is currently in the
              // battlefield zone. Subtle treatment — the cell stays in
              // its slot (no layout shift), but the eye reads it as
              // "moved out of the hand."
              opacity: isActiveInBattlefield ? 0.35 : 1,
              transition: "opacity 200ms ease",
            }}
          >
            {/* Render the renderCard output at its natural comfortable
                size, then apply transform: scale() so internal content
                (salary chip, headshot, name, FP, badges) scales
                proportionally to fit the cell. */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: STRIP_CARD_NATURAL_WIDTH_PX,
                height: STRIP_CARD_NATURAL_HEIGHT_PX,
                transform: `scale(${STRIP_CARD_SCALE})`,
                transformOrigin: "top left",
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
}

function BattlefieldCard({ card, renderCard }: BattlefieldCardProps) {
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
      {renderCard(card)}
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

function TeamScore({ total, isLeading }: { total: number; isLeading: boolean }) {
  return (
    <div
      data-h2h-team-score="true"
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
        {total.toFixed(1)}
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

function CardCenterCell({ card, renderCard }: { card: H2HCard | null; renderCard: CardRenderer }) {
  if (!card) return null;
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
          width: "100%",
          maxWidth: BATTLEFIELD_CARD_MAX_WIDTH,
        }}
      >
        <BattlefieldCard card={card} renderCard={renderCard} />
      </div>
    </div>
  );
}

function ScoreCell({ total, isLeading }: { total: number; isLeading: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <TeamScore total={total} isLeading={isLeading} />
    </div>
  );
}

// ── H2HRevealScreen ──────────────────────────────────────────────────────

export function H2HRevealScreen(props: H2HRevealScreenProps) {
  const { sender, recipient, renderCard, battlefieldSlotIndex } = props;
  const maxSlot = Math.max(...sender.cards.map(c => c.slotIndex), ...recipient.cards.map(c => c.slotIndex));
  const slotIdx = battlefieldSlotIndex ?? maxSlot;
  const senderBattle = getSlotCard(sender, slotIdx);
  const recipientBattle = getSlotCard(recipient, slotIdx);

  const recipientLeading = recipient.totalFp > sender.totalFp;
  const senderLeading = sender.totalFp > recipient.totalFp;

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
      data-h2h-reveal-phase="2-static-mock"
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
          <HandStrip cards={sender.cards} renderCard={renderCard} activeSlotIndex={slotIdx} />
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
          <CardCenterCell card={senderBattle} renderCard={renderCard} />
          {senderBattle ? <ScoreCell total={sender.totalFp} isLeading={senderLeading} /> : <div />}

          {/* Row 2: mid-rail in center column (cards' x-center) */}
          <div aria-hidden="true" />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MidRailContent
              senderCard={senderBattle}
              recipientCard={recipientBattle}
              senderTotal={sender.totalFp}
              recipientTotal={recipient.totalFp}
            />
          </div>
          <div aria-hidden="true" />

          {/* Row 3: recipient's battlefield card + score */}
          <div aria-hidden="true" />
          <CardCenterCell card={recipientBattle} renderCard={renderCard} />
          {recipientBattle ? <ScoreCell total={recipient.totalFp} isLeading={recipientLeading} /> : <div />}
        </div>

        {/* ── YOUR ZONE (bottom, glass panel) ────────────────────────── */}
        <ZonePanel>
          <HandStrip cards={recipient.cards} renderCard={renderCard} activeSlotIndex={slotIdx} />
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
