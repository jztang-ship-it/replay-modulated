// shared/components/H2HRecipientPlay.tsx
//
// Phase 5b piece 2 — playing-mode layout rework (locked 2026-05-30,
// docs/h2h-reveal-arc-design.md, commit 18f6376 + corrections 63fcd8d).
// Supersedes the slot-by-slot drawing surface shipped in f38eee3.
//
// 4-state machine — Deal → Hold → Draw → arc:
//   pre_deal:          top 6 face-down, bottom 6 empty positional
//                      placeholders, Deal CTA.
//   deal_in:           bottom cards land one-by-one face-up from
//                      challengeCtx.initialRoster (the SERVER SNAPSHOT
//                      of the sender's deal — NOT a redraw, NOT a
//                      deterministic engine call). Top stays face-down.
//   hold_select:       6 face-up bottom cards, tap-to-toggle hold.
//                      Draw CTA.
//   redraw_running:    unheld flip face-down immediately on Draw tap;
//                      held stay face-up in place (S5 invariant).
//                      redrawRoster() runs ONCE, returns finalRoster
//                      which is held in component state — front faces
//                      for unheld slots are NOT mounted until the
//                      column-flip stage (path β no-flicker).
//   column_flip:       LEFT→RIGHT col 0→5. Held column: top flips up
//                      only. Replacement column: top + bottom flip up
//                      in unison — first time the replacement value
//                      is in the DOM.
//   handoff_resolving: 800ms hold, then resolveRoster() on
//                      finalRoster (NOT initialRoster), then mount
//                      H2HRecipientReveal with bypassGameStateGate.
//
// Engine reuse (per corrected lock 63fcd8d):
//   - dealInitialRoster() is NOT called from the recipient surface.
//     State 1 → 2 reads challengeCtx.initialRoster.
//   - redrawRoster() — state 2 → 3 (atomic; returns new roster; the
//     surface controls reveal timing).
//   - resolveRoster() — state 3 → 4 handoff, on the POST-REDRAW
//     finalRoster.
//
// Strip-sort contract scope: states 1–3 use this DEDICATED positional
// playing-mode strip (slotIndex order) by design per the S5 held-card
// position invariant. The reveal-participating strip-sort contract
// (revealOrder over slotIndex) governs HandStrip / ResultsStrip and is
// unchanged — see "Locked invariant — strip-component sort contract"
// in the design doc plus its 2026-05-30 EDIT for the scope statement.
//
// Held-position invariant (S5): held cards never change slot position
// across states 1–3. wasHeld carries into state 4's revealOrder which
// encodes "held revealed last" — position is anchor, not sequence.
//
// Timings: COLUMN_FLIP_DURATION_MS / COLUMN_FLIP_INTERSTITIAL_MS /
// DEAL_CASCADE_INTERVAL_MS are NOT design-locked. Starting values
// chosen for the rewrite are tunable in live verification.

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedCard } from "@shared/types";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import { H2HRecipientReveal } from "./H2HRecipientReveal";
import type { CardRenderer, H2HCard } from "./H2HRevealScreen";
import { setActiveSeason } from "@shared/engines/dataEngine";
import { isRealName } from "@shared/utils/isRealName";

const ROSTER_SIZE = 6;

/** Inter-card delay during the state-2 deal-in cascade. Each card
 *  lands one-by-one after Deal is tapped. Live-verification tunable. */
export const DEAL_CASCADE_INTERVAL_MS = 120;

/** Single column flip duration during the state-3 column-flip pass.
 *  Used by CSS rotateY transition + state-advance scheduling. */
export const COLUMN_FLIP_DURATION_MS = 250;

/** Delay between one column completing its flip and the next column
 *  beginning. Per design footer: not locked — live-verification tunable. */
export const COLUMN_FLIP_INTERSTITIAL_MS = 150;

/** Pause after the column-flip pass completes before transitioning to
 *  the arc. Same constant as the 2b+2c P9 hold; live-verification
 *  tunable. */
export const PRE_REVEAL_HOLD_MS = 800;

// Mini-cell dimensions — matches HAND_STRIP_HEIGHT_PX (80) and the
// derived STRIP_CARD_DISPLAY_WIDTH_PX ((80 * 329) / 478 ≈ 55) used by
// H2HRevealScreen's HandStrip. Same Y/X footprint so the eye doesn't
// reflow when the surface hands off to the arc.
const MINI_CELL_WIDTH_PX = 55;
const MINI_CELL_HEIGHT_PX = 80;
const STRIP_GAP_PX = 4;

// Strip-scale factor — matches H2HRevealScreen's STRIP_CARD_SCALE so a
// hero-sized AthleteCard renders at strip footprint when injected via
// renderPlayingStripCard. The renderer itself is sport-agnostic; the
// container's scale determines the visual size (same model the arc
// HandStrip uses).
const STRIP_CARD_NATURAL_WIDTH_PX = 329;
const STRIP_CARD_SCALE = MINI_CELL_WIDTH_PX / STRIP_CARD_NATURAL_WIDTH_PX;

// Per piece 2a geometry (smoke artifact 2026-05-28): top strip
// marginBottom 18 / hero marginBottom 4 / bottom strip marginBottom 0 /
// reserved paddingTop 8. Same values as H2HResultsOverlay +
// H2HRevealScreen so the playing-mode surface visually anchors at the
// same Y positions for the top strip, hero zone, bottom strip, and CTA.
const TOP_STRIP_MARGIN_BOTTOM_PX = 18;
const HERO_ZONE_MARGIN_BOTTOM_PX = 4;
const BOTTOM_STRIP_MARGIN_BOTTOM_PX = 0;
const RESERVED_PADDING_TOP_PX = 8;
const RESERVED_MIN_HEIGHT_PX = 77;

// Hold-state visual — accent ring + light scale. Visual polish is
// 2d-scope (re-scoped to VISUAL refinement per the 2026-05-30 EDIT);
// the functional tap here is load-bearing for the state machine.
const HOLD_ACCENT_RING_PX = 2;

/** Sport-agnostic state model. */
type PlayingState =
  | { kind: "pre_deal" }
  | { kind: "deal_in"; cardsLanded: number }
  | { kind: "hold_select"; held: Set<number> }
  | { kind: "redraw_running"; held: Set<number> }
  | {
      kind: "column_flip";
      /** Number of columns whose flip animation has been kicked off. CSS
       *  rotateY transition handles the actual 250ms flip animation per
       *  column. Range: 0..ROSTER_SIZE. */
      revealedColumns: number;
      held: Set<number>;
      finalRoster: GeneratedCard[];
    }
  | { kind: "handoff_resolving"; finalRoster: GeneratedCard[]; held: Set<number> }
  | {
      kind: "arc";
      resolvedRoster: GeneratedCard[];
      resolvedScore: number;
      resolvedTier: string;
    };

export interface H2HRecipientPlayProps {
  challengeCtx: ChallengeCtx;
  sport: string;
  /** Sport-specific atomic redraw. Held positions preserved; unheld
   *  refilled. Returns full roster in one call (path β requires
   *  surface-controlled reveal timing). */
  redrawRoster: (args: {
    currentCards: GeneratedCard[];
    lockedCardIds: Set<string>;
  }) => Promise<{ roster?: GeneratedCard[]; cards?: GeneratedCard[] }>;
  /** Sport-specific roster resolver. Called once at handoff time on the
   *  post-redraw roster (NOT initialRoster) to populate actualFp for
   *  the arc. */
  resolveRoster: (args: { finalCards: GeneratedCard[] }) => Promise<{
    roster?: GeneratedCard[];
    cards?: GeneratedCard[];
    mvpCardId?: string;
  }>;
  /** Sport-specific win-tier calculator. */
  calculateWinTier: (totalFp: number) => string;
  /** Pre-reveal strip card renderer (photo, salary, position, AVG).
   *  Used as the front face of every playing-mode strip cell. The
   *  container applies STRIP_CARD_SCALE so a hero-sized renderer (e.g.
   *  basketball's h2hArcRenderer with revealed=false) renders at strip
   *  footprint. */
  renderPlayingStripCard: CardRenderer;
  /** Forwarded to the inner H2HRecipientReveal at handoff. */
  renderBattlefieldCard: CardRenderer;
  renderOverlayCard: CardRenderer;
  /** Reveal-overlay CTA handlers — forwarded to H2HRecipientReveal. */
  onSendItBack: () => void;
  onTryAgain: () => void;
  onPlayOwnHand: () => void;
  onDismiss: () => void;
}

export function H2HRecipientPlay(props: H2HRecipientPlayProps) {
  const {
    challengeCtx, sport,
    redrawRoster, resolveRoster, calculateWinTier,
    renderPlayingStripCard, renderBattlefieldCard, renderOverlayCard,
    onSendItBack, onTryAgain, onPlayOwnHand, onDismiss,
  } = props;

  // Pin the data engine to the challenge's season on mount —
  // DailySeasonReelGate normally does this for GameView, but the
  // playing-mode surface bypasses the gate.
  useEffect(() => {
    setActiveSeason(challengeCtx.season);
  }, [challengeCtx.season]);

  const initialRoster = challengeCtx.initialRoster;

  const [state, setState] = useState<PlayingState>({ kind: "pre_deal" });

  // Stable callback refs — prevent effect cleanups from clearing
  // pending timers when parent re-renders churn prop identity.
  const redrawRef = useRef(redrawRoster);
  const resolveRef = useRef(resolveRoster);
  const calcTierRef = useRef(calculateWinTier);
  useEffect(() => { redrawRef.current = redrawRoster; }, [redrawRoster]);
  useEffect(() => { resolveRef.current = resolveRoster; }, [resolveRoster]);
  useEffect(() => { calcTierRef.current = calculateWinTier; }, [calculateWinTier]);

  // ── deal_in cascade ──────────────────────────────────────────────
  // All 6 lay-down timers + the hold_select handoff are scheduled
  // up-front the first time state enters deal_in (cardsLanded === 0).
  // Timer IDs live on a ref so the effect's re-run (triggered by each
  // intermediate state advance) does NOT clear pending timers — early
  // versions used a cleanup that cancelled the whole cascade as soon
  // as the first card landed.
  const cascadeTimersRef = useRef<number[]>([]);
  useEffect(() => {
    if (state.kind !== "deal_in") return;
    if (state.cardsLanded !== 0) return;
    if (cascadeTimersRef.current.length > 0) return; // already scheduled
    const timers: number[] = [];
    for (let n = 1; n <= ROSTER_SIZE; n++) {
      const id = window.setTimeout(() => {
        setState((s) =>
          s.kind === "deal_in" ? { kind: "deal_in", cardsLanded: n } : s,
        );
      }, DEAL_CASCADE_INTERVAL_MS * n);
      timers.push(id);
    }
    const finalId = window.setTimeout(() => {
      setState((s) =>
        s.kind === "deal_in" && s.cardsLanded === ROSTER_SIZE
          ? { kind: "hold_select", held: new Set() }
          : s,
      );
    }, DEAL_CASCADE_INTERVAL_MS * (ROSTER_SIZE + 1));
    timers.push(finalId);
    cascadeTimersRef.current = timers;
  }, [state]);
  // Unmount-only cleanup for all cascade timers (Try Again key bump
  // remounts the surface; pending timers from a previous cascade get
  // cleared here).
  useEffect(() => () => {
    cascadeTimersRef.current.forEach(clearTimeout);
    cascadeTimersRef.current = [];
  }, []);

  // ── redraw_running → column_flip ────────────────────────────────
  // Held inside a ref so React 18 strict-mode double-invoke doesn't
  // double-fire the redraw API call. The effect captures the held set
  // at run time, fires redraw once, and transitions on resolution.
  const redrawFiredRef = useRef(false);
  useEffect(() => {
    if (state.kind !== "redraw_running") return;
    if (redrawFiredRef.current) return;
    redrawFiredRef.current = true;

    const heldSet = state.held;
    const lockedCardIds = new Set<string>();
    initialRoster.forEach((card, i) => {
      if (heldSet.has(i)) {
        const id = String((card as any).cardId ?? (card as any).basePlayerId ?? "");
        if (id) lockedCardIds.add(id);
      }
    });

    let cancelled = false;
    (async () => {
      let finalRoster: GeneratedCard[] = initialRoster;
      try {
        const res = await redrawRef.current({
          currentCards: initialRoster,
          lockedCardIds,
        });
        finalRoster = (res?.roster ?? res?.cards ?? initialRoster) as GeneratedCard[];
      } catch (err) {
        // Non-fatal: fall through to initialRoster. The column-flip
        // pass still runs; replacement cells reveal initialRoster
        // entries (visually identical to "no redraw happened"). The
        // recipient still hands off to the arc.
        // eslint-disable-next-line no-console
        console.warn("[h2h-play] redrawRoster failed; falling back to initialRoster:", err);
      }
      if (cancelled) return;
      setState({
        kind: "column_flip",
        revealedColumns: 0,
        held: heldSet,
        finalRoster,
      });
    })();

    return () => { cancelled = true; };
  }, [state, initialRoster]);

  // ── column_flip stepper ─────────────────────────────────────────
  // All 6 column-flip advances + the handoff_resolving transition are
  // scheduled up-front on entry (revealedColumns === 0). Timer IDs on
  // a ref + unmount-only cleanup, same pattern as the deal_in cascade.
  const columnTimersRef = useRef<number[]>([]);
  useEffect(() => {
    if (state.kind !== "column_flip") return;
    if (state.revealedColumns !== 0) return;
    if (columnTimersRef.current.length > 0) return;
    const timers: number[] = [];
    // Column N's flip kicks off when revealedColumns crosses N → N+1.
    // The first column fires at delay=0 (engine just returned; the
    // recipient doesn't need a pause before the cascade starts).
    for (let n = 1; n <= ROSTER_SIZE; n++) {
      const delay = (n - 1) * (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS);
      const id = window.setTimeout(() => {
        setState((s) =>
          s.kind === "column_flip" ? { ...s, revealedColumns: n } : s,
        );
      }, delay);
      timers.push(id);
    }
    const finalId = window.setTimeout(() => {
      setState((s) =>
        s.kind === "column_flip" && s.revealedColumns === ROSTER_SIZE
          ? {
              kind: "handoff_resolving",
              finalRoster: s.finalRoster,
              held: s.held,
            }
          : s,
      );
    }, ROSTER_SIZE * (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS));
    timers.push(finalId);
    columnTimersRef.current = timers;
  }, [state]);
  useEffect(() => () => {
    columnTimersRef.current.forEach(clearTimeout);
    columnTimersRef.current = [];
  }, []);

  // ── handoff_resolving: 800ms hold + resolveRoster ───────────────
  const handoffFiredRef = useRef(false);
  useEffect(() => {
    if (state.kind !== "handoff_resolving") return;
    if (handoffFiredRef.current) return;
    handoffFiredRef.current = true;

    const final = state.finalRoster;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      let resolved: GeneratedCard[] = final;
      try {
        const res = await resolveRef.current({ finalCards: final });
        resolved = (res?.roster ?? res?.cards ?? final) as GeneratedCard[];
      } catch (err) {
        // Non-fatal: fall through to finalRoster (may have stale
        // actualFp). Arc still mounts.
        // eslint-disable-next-line no-console
        console.warn("[h2h-play] resolveRoster failed; using finalRoster as-is:", err);
      }
      if (cancelled) return;
      const score = resolved.reduce((s, c: any) => s + Number(c.actualFp ?? 0), 0);
      const tier = calcTierRef.current(score) ?? "BUST";
      setState({
        kind: "arc",
        resolvedRoster: resolved,
        resolvedScore: score,
        resolvedTier: tier,
      });
    }, PRE_REVEAL_HOLD_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [state]);

  // ── Mount the reveal arc once resolved ──────────────────────────
  if (state.kind === "arc") {
    return (
      <H2HRecipientReveal
        challengeCtx={challengeCtx}
        myScore={state.resolvedScore}
        myRoster={state.resolvedRoster}
        myWinTier={state.resolvedTier}
        gameState={"REVEALING" as any}
        bypassGameStateGate
        sport={sport}
        renderBattlefieldCard={renderBattlefieldCard}
        renderOverlayCard={renderOverlayCard}
        onSendItBack={onSendItBack}
        onTryAgain={onTryAgain}
        onPlayOwnHand={onPlayOwnHand}
        onDismiss={onDismiss}
      />
    );
  }

  // ── Derived render state ────────────────────────────────────────
  const namedChallenger = isRealName(challengeCtx.challengerName)
    ? challengeCtx.challengerName
    : null;
  const headline = deriveHeadline(state, namedChallenger);
  const cta = deriveCta(state);

  const topCellFaceUp = (i: number): boolean => {
    if (state.kind === "column_flip") return i < state.revealedColumns;
    if (state.kind === "handoff_resolving") return true;
    return false;
  };

  const bottomCellSlot = (i: number): BottomSlot => {
    switch (state.kind) {
      case "pre_deal":
        return { mode: "empty" };
      case "deal_in":
        return i < state.cardsLanded
          ? { mode: "face_up", card: initialRoster[i], held: false }
          : { mode: "empty" };
      case "hold_select":
        return {
          mode: "face_up",
          card: initialRoster[i],
          held: state.held.has(i),
        };
      case "redraw_running": {
        if (state.held.has(i)) {
          return { mode: "face_up", card: initialRoster[i], held: true };
        }
        // Path β: unheld slots are face-down WITHOUT mounting any
        // replacement value on the front face. The replacement card
        // for this slot is held in component state but not bound to
        // the renderer until column_flip reaches it.
        return { mode: "face_down" };
      }
      case "column_flip": {
        if (state.held.has(i)) {
          return { mode: "face_up", card: initialRoster[i], held: true };
        }
        if (i < state.revealedColumns) {
          // First time the replacement enters the DOM.
          return {
            mode: "face_up",
            card: state.finalRoster[i],
            held: false,
          };
        }
        // Path β: still covered, still NOT in DOM.
        return { mode: "face_down" };
      }
      case "handoff_resolving": {
        if (state.held.has(i)) {
          return { mode: "face_up", card: initialRoster[i], held: true };
        }
        return { mode: "face_up", card: state.finalRoster[i], held: false };
      }
      default:
        return { mode: "empty" };
    }
  };

  // ── Event handlers ──────────────────────────────────────────────
  const handleDeal = () => {
    if (state.kind !== "pre_deal") return;
    setState({ kind: "deal_in", cardsLanded: 0 });
  };

  const handleDraw = () => {
    if (state.kind !== "hold_select") return;
    setState({ kind: "redraw_running", held: state.held });
  };

  const toggleHold = (i: number) => {
    if (state.kind !== "hold_select") return;
    setState((s) => {
      if (s.kind !== "hold_select") return s;
      const next = new Set(s.held);
      if (next.has(i)) next.delete(i); else next.add(i);
      return { kind: "hold_select", held: next };
    });
  };

  return (
    <div
      data-h2h-recipient-play="true"
      data-playing-state={state.kind}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
        color: "#EAF0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        userSelect: "none",
        overflow: "hidden",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "min(480px, 100%)",
          margin: "0 auto",
          padding: "0 12px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* Top strip — sender's roster, face-down until column-flip pass */}
        <div
          data-h2h-play-top-strip="true"
          style={{
            marginBottom: TOP_STRIP_MARGIN_BOTTOM_PX,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: STRIP_GAP_PX,
            height: MINI_CELL_HEIGHT_PX,
          }}
        >
          {Array.from({ length: ROSTER_SIZE }).map((_, i) => (
            <TopStripCell
              key={`top-${i}`}
              i={i}
              faceUp={topCellFaceUp(i)}
              card={
                topCellFaceUp(i)
                  // Top strip face-up content during column-flip is the
                  // SENDER'S hand. We don't have the sender's roster
                  // here in playing mode (it's threaded into the arc
                  // via challengeCtx.resolvedSenderHand) — for the
                  // playing-mode column-flip pass we render a generic
                  // face-up placeholder. The recipient's eye is on
                  // their own bottom strip during this beat; the
                  // sender's card faces in detail are the arc's
                  // responsibility (state 4). The flip itself signals
                  // "matchup formed", which is what we need.
                  ? null
                  : null
              }
            />
          ))}
        </div>

        {/* Hero zone — guidance copy */}
        <div
          data-h2h-play-hero-zone="true"
          style={{
            marginBottom: HERO_ZONE_MARGIN_BOTTOM_PX,
            flex: "1 1 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 20px",
            minHeight: 200,
          }}
        >
          <div
            data-h2h-play-headline="true"
            style={{
              fontSize: 22,
              fontWeight: 800,
              lineHeight: 1.3,
              maxWidth: 360,
              opacity:
                state.kind === "redraw_running" ||
                state.kind === "column_flip" ||
                state.kind === "handoff_resolving"
                  ? 0.7
                  : 1,
              transition: "opacity 200ms ease",
            }}
          >
            {headline}
          </div>
        </div>

        {/* Bottom strip — recipient's hand */}
        <div
          data-h2h-play-bottom-strip="true"
          style={{
            marginBottom: BOTTOM_STRIP_MARGIN_BOTTOM_PX,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: STRIP_GAP_PX,
            height: MINI_CELL_HEIGHT_PX,
          }}
        >
          {Array.from({ length: ROSTER_SIZE }).map((_, i) => {
            const slot = bottomCellSlot(i);
            return (
              <BottomStripCell
                key={`bottom-${i}`}
                i={i}
                slot={slot}
                renderCard={renderPlayingStripCard}
                tappable={state.kind === "hold_select"}
                onTap={() => toggleHold(i)}
              />
            );
          })}
        </div>

        {/* Reserved CTA space */}
        <div
          data-h2h-play-reserved="true"
          style={{
            paddingTop: RESERVED_PADDING_TOP_PX,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            minHeight: RESERVED_MIN_HEIGHT_PX,
          }}
        >
          <button
            data-h2h-play-cta="true"
            data-cta-label={cta.label}
            disabled={cta.disabled}
            onClick={cta.onClick === "deal" ? handleDeal : cta.onClick === "draw" ? handleDraw : undefined}
            style={{
              padding: "16px 32px",
              borderRadius: 14,
              background: cta.disabled ? "rgba(255,177,74,0.25)" : "#FFB14A",
              border: "none",
              color: "#070A12",
              fontSize: 17,
              fontWeight: 900,
              cursor: cta.disabled ? "default" : "pointer",
              minWidth: 200,
              fontFamily: "inherit",
              transition: "background 150ms ease",
            }}
          >
            {cta.label}
          </button>
        </div>
      </div>

      {/* Flip animation keyframe + 3D scaffold styles */}
      <style>{flipCss(COLUMN_FLIP_DURATION_MS)}</style>
    </div>
  );
}

// ── Sub-types + sub-components ──────────────────────────────────────

type BottomSlot =
  | { mode: "empty" }
  | { mode: "face_down" }
  | { mode: "face_up"; card: GeneratedCard; held: boolean };

function deriveHeadline(
  state: PlayingState,
  namedChallenger: string | null,
): string {
  switch (state.kind) {
    case "pre_deal":
      return "Hit deal to see your starting deck.";
    case "deal_in":
      return `Here's the same starting hand as ${namedChallenger ?? "your friend"}.`;
    case "hold_select":
      return "Choose the cards you want to hold. Unheld cards will be replaced.";
    case "redraw_running":
    case "column_flip":
      return "Drawing…";
    case "handoff_resolving":
      return "Calculating…";
    case "arc":
      return "";
  }
}

function deriveCta(state: PlayingState): {
  label: string;
  disabled: boolean;
  onClick: "deal" | "draw" | null;
} {
  switch (state.kind) {
    case "pre_deal":
      return { label: "Deal", disabled: false, onClick: "deal" };
    case "deal_in":
      return { label: "Deal", disabled: true, onClick: null };
    case "hold_select":
      return { label: "Draw", disabled: false, onClick: "draw" };
    case "redraw_running":
    case "column_flip":
      return { label: "Drawing…", disabled: true, onClick: null };
    case "handoff_resolving":
      return { label: "Revealing…", disabled: true, onClick: null };
    case "arc":
      return { label: "", disabled: true, onClick: null };
  }
}

/** Top strip cell — sender slot. Face-down by default. Flips face-up
 *  during the column_flip pass per column index. Path β: the face-up
 *  content during playing mode is intentionally generic — the sender's
 *  detailed face is the arc's responsibility (state 4). */
function TopStripCell({
  i,
  faceUp,
  card: _card,
}: {
  i: number;
  faceUp: boolean;
  card: H2HCard | null;
}) {
  // testId is dual-purpose: tests assert that face-down cells exist
  // during pre-arc states, and face-up sender cells appear after the
  // column-flip pass for each index.
  const testId = faceUp ? `top-strip-up-${i}` : `top-strip-back-${i}`;
  return (
    <div
      data-testid={testId}
      data-h2h-play-top-cell={i}
      data-face-up={faceUp ? "true" : "false"}
      style={{
        width: MINI_CELL_WIDTH_PX,
        height: MINI_CELL_HEIGHT_PX,
        perspective: 600,
      }}
    >
      <div
        className="h2h-play-flip-inner"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transform: faceUp ? "rotateY(0deg)" : "rotateY(180deg)",
        }}
      >
        <CardBack side="front-when-down" />
        <SenderUpPlaceholder />
      </div>
    </div>
  );
}

/** Bottom strip cell. Owns the 3D flip wrapper. Front face renders the
 *  sport-provided playing-strip card (only mounted when face-up — path
 *  β). Back face is the card-back visual. Tap-to-toggle hold during
 *  state 2 hold_select. */
function BottomStripCell({
  i,
  slot,
  renderCard,
  tappable,
  onTap,
}: {
  i: number;
  slot: BottomSlot;
  renderCard: CardRenderer;
  tappable: boolean;
  onTap: () => void;
}) {
  if (slot.mode === "empty") {
    return (
      <div
        data-testid={`bottom-strip-empty-${i}`}
        data-h2h-play-bottom-cell={i}
        data-face-up="false"
        data-empty="true"
        style={{
          width: MINI_CELL_WIDTH_PX,
          height: MINI_CELL_HEIGHT_PX,
          borderRadius: 6,
          border: "1px dashed rgba(255,255,255,0.18)",
          background: "transparent",
        }}
      />
    );
  }

  const faceUp = slot.mode === "face_up";
  const heldRing = faceUp && slot.held;
  const testId = faceUp ? `bottom-strip-up-${i}` : `bottom-strip-down-${i}`;
  // path-β assertion-friendly: when face_down, the front face's
  // renderer subtree is NOT mounted (no replacement value in DOM).
  return (
    <div
      data-testid={testId}
      data-h2h-play-bottom-cell={i}
      data-face-up={faceUp ? "true" : "false"}
      data-held={heldRing ? "true" : "false"}
      onClick={tappable ? onTap : undefined}
      style={{
        width: MINI_CELL_WIDTH_PX,
        height: MINI_CELL_HEIGHT_PX,
        perspective: 600,
        cursor: tappable ? "pointer" : "default",
      }}
    >
      <div
        className="h2h-play-flip-inner"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transform: faceUp ? "rotateY(0deg)" : "rotateY(180deg)",
        }}
      >
        {/* Back face (card-back). Always mounted so it covers during
            face-down. Sits at rotateY(180) so it's visible when wrapper
            is rotated 180deg. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <CardBack side="back" />
        </div>
        {/* Front face (sport renderer). ONLY mounted when face-up —
            path β: replacement values must not be in the DOM until the
            column-flip exposes them. */}
        {faceUp && (
          <div
            data-h2h-play-front="true"
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              border: heldRing
                ? `${HOLD_ACCENT_RING_PX}px solid #FFB14A`
                : "1px solid rgba(255,255,255,0.10)",
              borderRadius: 6,
              boxSizing: "border-box",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: STRIP_CARD_NATURAL_WIDTH_PX,
                transform: `scale(${STRIP_CARD_SCALE})`,
                transformOrigin: "top left",
              }}
            >
              {renderCard(slot.card as unknown as H2HCard, { revealed: false })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Card-back visual — diagonal stripe + deep navy gradient. Matches
 *  the prior FaceDownCell visual (preserved for visual continuity). */
function CardBack({ side: _side }: { side: "back" | "front-when-down" }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.18)",
        background: `
          repeating-linear-gradient(45deg,
            rgba(255,255,255,0.05) 0,
            rgba(255,255,255,0.05) 2px,
            transparent 2px,
            transparent 6px),
          linear-gradient(135deg, #1a2540 0%, #0d1530 50%, #1a2540 100%)
        `,
        boxShadow: "inset 0 0 8px rgba(0,0,0,0.4)",
      }}
    />
  );
}

/** Generic face-up placeholder for top strip during column-flip pass.
 *  The sender's per-card visual is the arc's job (state 4); here we
 *  only need a visible flip target. */
function SenderUpPlaceholder() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        borderRadius: 6,
        border: "1px solid rgba(255,177,74,0.55)",
        background: "linear-gradient(160deg, #2a1f10 0%, #1a140a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(255,177,74,0.85)",
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 0.6,
        textTransform: "uppercase",
      }}
    >
      ?
    </div>
  );
}

function flipCss(durationMs: number) {
  return `
    .h2h-play-flip-inner {
      transition: transform ${durationMs}ms cubic-bezier(0.4, 0.0, 0.2, 1);
    }
  `;
}
