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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GeneratedCard } from "@shared/types";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import { H2HRecipientReveal } from "./H2HRecipientReveal";
import type { CardRenderer, H2HCard } from "./H2HRevealScreen";
import { setActiveSeason, ensureLoaded, isLoaded } from "@shared/engines/dataEngine";
import { isRealName } from "@shared/utils/isRealName";
import { getNickname } from "@shared/utils/playerIdentity";
import { H2HBoardShell } from "./H2HBoardShell";

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

/** Cross-fade window for the playing-strip inner content when state
 *  advances to "arc" (Fix C2). Matches H2HRecipientReveal's own
 *  HOLD_TO_ARC_CROSSFADE_MS so the playing fade-out and the reveal
 *  fade-in finish in lockstep on the same canvas. */
export const ARC_COMPOSITE_CROSSFADE_MS = 250;

// Mini-cell dimensions — matches HAND_STRIP_HEIGHT_PX (80) and the
// derived STRIP_CARD_DISPLAY_WIDTH_PX ((80 * 329) / 478 ≈ 55) used by
// H2HRevealScreen's HandStrip. Same Y/X footprint so the eye doesn't
// reflow when the surface hands off to the arc.
const MINI_CELL_WIDTH_PX = 55;
const MINI_CELL_HEIGHT_PX = 80;
const STRIP_GAP_PX = 4;

// Strip-scale factor — VALUES COPIED FROM H2HRevealScreen.tsx:215-218
// (the working strip scaffold). Do not hand-derive: the natural-width
// constant + transform-origin combo is layout-sensitive, and JSDOM
// tests don't catch off-cell rendering caused by divergent values.
// 150 (not 329) is the deliberate strip-pattern wrap width — the
// renderer's intrinsic content sizes against 150 × 218, then a CSS
// scale shrinks the rendered output to MINI_CELL_WIDTH_PX × MINI_CELL_HEIGHT_PX.
// See the "Visual / layout changes" rule in CLAUDE.md.
const STRIP_CARD_NATURAL_WIDTH_PX = 150;
const STRIP_CARD_NATURAL_HEIGHT_PX = (STRIP_CARD_NATURAL_WIDTH_PX * 478) / 329;
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

  // FIX 1 — data-engine load gate. The playing surface mounts OUTSIDE
  // DailySeasonReelGate (App.tsx left-branches into H2HRecipientPlay
  // when h2hPlayingMode && challengeCtx), so the data engine is NOT
  // pre-loaded by the gate. setActiveSeason() invalidates whatever
  // was previously loaded (when seasons differ — or freshly null on
  // first mount), so we must call ensureLoaded() before any engine
  // call (redrawRoster, resolveRoster). State machine is gated on
  // dataReady; engineError surfaces a recoverable error state to the
  // user. ensureLoaded is idempotent (dataEngine has isLoaded() guard
  // at shared/engines/dataEngine.ts:119), so a same-season remount
  // doesn't re-fetch.
  // dataReady starts true if the engine is ALREADY loaded for this
  // season (e.g., the user previously navigated through DailySeasonReelGate
  // with a matching season). Synchronous short-circuit avoids a
  // useless re-render and lets the tests render → tap Deal without a
  // microtask flush in between.
  const [dataReady, setDataReady] = useState(() => isLoaded());
  const [dataLoadError, setDataLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    setActiveSeason(challengeCtx.season);
    // setActiveSeason invalidates the cache when keys differ — re-check
    // and short-circuit if we're still loaded after the pin.
    if (isLoaded()) {
      setDataReady(true);
      setDataLoadError(false);
      return;
    }
    let cancelled = false;
    setDataReady(false);
    setDataLoadError(false);
    ensureLoaded()
      .then(() => { if (!cancelled) setDataReady(true); })
      .catch((err) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[h2h-play] dataEngine load failed:", err);
        setDataLoadError(true);
      });
    return () => { cancelled = true; };
  }, [challengeCtx.season, loadAttempt]);
  // FIX 2 — engine error guardrail. Set when redrawRoster or
  // resolveRoster throws (or returns invalid). Surfaces the same
  // error state on the shell so the user is never dropped into a
  // degenerate zeroed reveal.
  const [engineError, setEngineError] = useState<null | "redraw" | "resolve">(null);
  const retryDataLoad = useCallback(() => {
    setEngineError(null);
    setLoadAttempt((n) => n + 1);
  }, []);

  // Recipient's starting hand carries NO held state — invariant.
  // challengeCtx.initialRoster is the SENDER's serialized initial deal;
  // in production basketball's deserializeRoster already zeros wasHeld,
  // but the dev mock route bypasses that path AND any future snapshot
  // regression could re-introduce wasHeld. Zeroing here is the source-
  // of-truth guarantee: the recipient never inherits hold flags.
  // lockedCardIds below builds off this array via cardId, so the zeroed
  // hand still resolves correctly to the engine's held-set logic.
  const initialRoster = useMemo(
    () => challengeCtx.initialRoster.map((c) => ({ ...c, wasHeld: false })),
    [challengeCtx.initialRoster],
  );

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
      let redrawThrew = false;
      try {
        const res = await redrawRef.current({
          currentCards: initialRoster,
          lockedCardIds,
        });
        finalRoster = (res?.roster ?? res?.cards ?? initialRoster) as GeneratedCard[];
      } catch (err) {
        // FIX 2 guardrail: a redraw throw means the engine is unavailable
        // (most often dataEngine not loaded — but covers any future
        // failure mode). We do NOT fall through to a zeroed reveal —
        // setEngineError surfaces the error state to the user via the
        // shell's hero copy + retry CTA below.
        // eslint-disable-next-line no-console
        console.error("[h2h-play] redrawRoster failed:", err);
        redrawThrew = true;
      }
      if (cancelled) return;
      if (redrawThrew) {
        setEngineError("redraw");
        return;
      }
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
      let resolveThrew = false;
      try {
        const res = await resolveRef.current({ finalCards: final });
        resolved = (res?.roster ?? res?.cards ?? final) as GeneratedCard[];
      } catch (err) {
        // FIX 2 guardrail: resolve throw → same surface treatment as
        // redraw throw. Do NOT fall through to a degenerate reveal
        // where actualFp is silently 0 on every card.
        // eslint-disable-next-line no-console
        console.error("[h2h-play] resolveRoster failed:", err);
        resolveThrew = true;
      }
      if (cancelled) return;
      if (resolveThrew) {
        setEngineError("resolve");
        return;
      }
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

  // ── Arc-composite flag (state 4) ────────────────────────────────
  // Per Fix C2 (lock rationale "without changing surfaces / single
  // coherent experience"; doc EDIT 2026-05-30 clarifying that S4
  // "mounts the existing reveal surface" means REUSE the
  // H2HRevealScreen COMPONENT, not unmount the playing canvas):
  // when state.kind === "arc", we DO NOT early-return / unmount the
  // playing canvas. The root <div data-h2h-recipient-play> stays
  // mounted with its locked piece-2a geometry, and
  // <H2HRecipientReveal> renders as a child later in DOM order. The
  // playing inner content fades to opacity 0 in parallel with the
  // reveal's own opacity-0→1 crossfade so the user sees a single
  // canvas transitioning, not two surfaces swapping.
  const arcComposite = state.kind === "arc";

  // ── Derived render state ────────────────────────────────────────
  const namedChallenger = isRealName(challengeCtx.challengerName)
    ? challengeCtx.challengerName
    : null;
  // Headline + CTA default to the state-machine-derived values. The
  // load gate (Fix 1) and engine-error guardrail (Fix 2) override them
  // when those flags are set, replacing the normal pre_deal copy with
  // a loading or error treatment. Same shell, same labels, only the
  // hero copy + CTA shift — the user never sees a separate "loading
  // screen."
  let headline: ReactNode = deriveHeadline(state, namedChallenger);
  let cta = deriveCta(state);
  if (dataLoadError || engineError !== null) {
    headline = "Couldn't load challenge data. Try again.";
    cta = { label: "Try again", disabled: false, onClick: "retry" };
  } else if (!dataReady) {
    headline = "Loading challenge data…";
    cta = { label: "Deal", disabled: true, onClick: null };
  }

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
    // FIX 1: don't allow the cascade to start until data is loaded.
    // The CTA is disabled in that state, but belt-and-suspenders.
    if (!dataReady) return;
    if (dataLoadError || engineError !== null) return;
    setState({ kind: "deal_in", cardsLanded: 0 });
  };

  const handleRetry = () => {
    // FIX 2: on Try Again, route through the parent's onTryAgain so
    // the playing root is remounted with a clean state (parent bumps
    // h2hPlayKey). The new mount re-runs the ensureLoaded effect from
    // scratch. For transient data-load failures (network blip) this
    // recovers cleanly; for persistent failures the user sees the
    // same error state again. Either way, no degenerate reveal.
    onTryAgain();
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

  // Compute name labels once near the top of the render so they're
  // byte-identical to what H2HRecipientReveal computes downstream
  // (no flicker across the S3→S4 boundary). Per doc EDIT B3 (lock
  // e6fe662): name labels show in ALL states, not only at reveal.
  const topLabel = isRealName(challengeCtx.challengerName)
    ? (challengeCtx.challengerName as string)
    : "your friend";
  const bottomLabel = getNickname() || "You";

  // Top strip slot — sender's roster cells inside the shell's top frame.
  // Per doc EDIT B1, the bottom container's slots ARE the playing-mode
  // "strip" — no parallel bare strip. The cells (TopStripCell /
  // BottomStripCell) keep their Fix B scaffold; only WHERE they
  // render moves into the shell.
  const topStripSlot = (
    <div
      data-h2h-play-top-strip="true"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: STRIP_GAP_PX,
        height: MINI_CELL_HEIGHT_PX,
      }}
    >
      {Array.from({ length: ROSTER_SIZE }).map((_, i) => {
        const senderCard = challengeCtx.resolvedSenderHand?.cards[i] ?? null;
        return (
          <TopStripCell
            key={`top-${i}`}
            i={i}
            faceUp={topCellFaceUp(i)}
            card={senderCard as unknown as H2HCard | null}
            renderCard={renderPlayingStripCard}
          />
        );
      })}
    </div>
  );

  const bottomStripSlot = (
    <div
      data-h2h-play-bottom-strip="true"
      style={{
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
  );

  // Hero slot — guidance copy in states 1–3. The shell's hero region
  // has a locked minHeight so the bottom zone never jumps up when the
  // copy is short. At state="arc", the hero copy is empty ("") and the
  // arc-composite (H2HRecipientReveal) renders its battlefield grid
  // INSIDE the shell's same hero region via its own H2HBoardShell
  // mount (Fix C2 + EDIT B2 — no layout change at the S3→S4 boundary).
  const heroSlot = (
    <div
      data-h2h-play-hero-zone="true"
      style={{
        flex: "1 1 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "0 20px",
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
            state.kind === "column_flip"
              ? 0.7
              : 1,
          transition: "opacity 200ms ease",
        }}
      >
        {headline}
      </div>
    </div>
  );

  // Reserved CTA — sits BELOW the bottom zone, inside the shell's
  // reserved-bottom spacer region (via H2HBoardShell's belowBoard slot).
  const belowBoardSlot = (
    <div
      data-h2h-play-reserved="true"
      style={{
        paddingTop: RESERVED_PADDING_TOP_PX,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        minHeight: RESERVED_MIN_HEIGHT_PX,
        width: "100%",
      }}
    >
      <button
        data-h2h-play-cta="true"
        data-cta-label={cta.label}
        disabled={cta.disabled}
        onClick={
          cta.onClick === "deal" ? handleDeal
            : cta.onClick === "draw" ? handleDraw
            : cta.onClick === "retry" ? handleRetry
            : undefined
        }
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
  );

  // State-4 composite — Fix C2: <H2HRecipientReveal/> mounts INSIDE
  // the playing shell's outer fixed div (via the compositeOverlay slot)
  // so the reveal is a DESCENDANT of the playing root (Fix C2 assertion
  // `playingRoot.contains(revealRoot)`). The reveal then renders its
  // own H2HBoardShell internally via H2HRevealScreen — identical chrome,
  // identical labels (via challengeCtx threading through the same
  // isRealName + getNickname paths). The user sees one coherent framed
  // board across the S3→S4 boundary; only the slot CONTENTS visibly
  // transition (playing-inner fades to 0; reveal arc fades in).
  const compositeOverlay = arcComposite && state.kind === "arc" ? (
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
  ) : null;

  return (
    <>
      <H2HBoardShell
        surfaceKind="playing"
        topLabel={topLabel}
        bottomLabel={bottomLabel}
        topStrip={topStripSlot}
        bottomStrip={bottomStripSlot}
        hero={heroSlot}
        belowBoard={belowBoardSlot}
        rootDataAttrs={{
          "data-h2h-recipient-play": "true",
          "data-playing-state": state.kind,
        }}
        innerOpacity={arcComposite ? 0 : 1}
        innerTransitionMs={ARC_COMPOSITE_CROSSFADE_MS}
        innerDataAttr="data-h2h-play-inner"
        compositeOverlay={compositeOverlay}
      />
      {/* Flip animation keyframe + 3D scaffold styles. Lives outside
          the shell so the <style> element doesn't interact with the
          shell's flex children — it's a sibling of the shell. */}
      <style>{flipCss(COLUMN_FLIP_DURATION_MS)}</style>
    </>
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
): ReactNode {
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
      // #3 (2026-05-30): VS separator. During the existing handoff_resolving
      // beat (~1250ms, the pre-reveal hold), replace the "Calculating…"
      // copy with a "VS" treatment — large weight-900 "VS" + small
      // "Comparing…" sub-label, centered in the existing hero slot.
      // Inline only; no new state, no new timer.
      return (
        <div
          data-h2h-play-vs="true"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span
            data-h2h-play-vs-glyph="true"
            style={{
              fontSize: 56,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: "0.04em",
            }}
          >
            VS
          </span>
          <span
            data-h2h-play-vs-sub="true"
            style={{
              fontSize: 14,
              fontWeight: 600,
              opacity: 0.75,
            }}
          >
            Comparing…
          </span>
        </div>
      );
    case "arc":
      return "";
  }
}

function deriveCta(state: PlayingState): {
  label: string;
  disabled: boolean;
  onClick: "deal" | "draw" | "retry" | null;
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
 *  during the column_flip pass per column index. Face-up content is a
 *  pre-reveal render of the sender's card via the SAME renderer the
 *  bottom strip uses — photo / salary / position / AVG, no FP / badges
 *  / fire-ice (those are state-4's job). Mirrors the bottom strip's
 *  3D flip scaffold (back face rotated 180 + backface-visibility hidden;
 *  front face mounted only when face-up).
 *
 *  When card is null (sender hand not yet present in challengeCtx —
 *  rare in production; the prefetch typically lands before the
 *  recipient finishes hold_select), falls back to a generic
 *  "?" placeholder. */
function TopStripCell({
  i,
  faceUp,
  card,
  renderCard,
}: {
  i: number;
  faceUp: boolean;
  card: H2HCard | null;
  renderCard: CardRenderer;
}) {
  // testId is dual-purpose: tests assert face-down cells exist during
  // pre-arc states, and face-up sender cells appear after each column's
  // flip stage.
  const testId = faceUp ? `top-strip-up-${i}` : `top-strip-back-${i}`;
  return (
    <div
      data-testid={testId}
      data-h2h-play-top-cell={i}
      data-face-up={faceUp ? "true" : "false"}
      style={{
        width: MINI_CELL_WIDTH_PX,
        height: MINI_CELL_HEIGHT_PX,
        flexShrink: 0,
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
        {/* Back face (card-back). Rotated 180 + backface-hidden so it's
            visible only when the wrapper itself is at rotateY(180deg). */}
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
        {/* Front face — sender card pre-reveal, mounted only when face-up.
            Matches BottomStripCell's front-face scaffold byte-for-byte
            (see comment there for the rationale on the absolute /
            top-left / explicit-height scaffold). */}
        {faceUp && (
          <div
            data-h2h-play-top-front="true"
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 6,
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            {card ? (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: STRIP_CARD_NATURAL_WIDTH_PX,
                  height: STRIP_CARD_NATURAL_HEIGHT_PX,
                  transform: `scale(${STRIP_CARD_SCALE})`,
                  transformOrigin: "top left",
                  pointerEvents: "none",
                }}
              >
                {renderCard(card, { revealed: false })}
              </div>
            ) : (
              <SenderUpPlaceholder />
            )}
          </div>
        )}
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
          flexShrink: 0,
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
        flexShrink: 0,
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
            column-flip exposes them.
            Inner scaffold matches H2HRevealScreen.tsx:575-591 exactly:
            position:absolute + top/left:0 + explicit natural width AND
            height + transform:scale + transformOrigin:"top left". The
            outer is NOT a flex container — flex-centering with
            transformOrigin:top-left positions the scaled card off the
            visible cell (negative coords clipped by overflow:hidden). */}
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
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: STRIP_CARD_NATURAL_WIDTH_PX,
                height: STRIP_CARD_NATURAL_HEIGHT_PX,
                transform: `scale(${STRIP_CARD_SCALE})`,
                transformOrigin: "top left",
                pointerEvents: "none",
              }}
            >
              {/* H badge is wired to slot.held (the user's tap state) by
                  overriding wasHeld on the card object handed to the
                  renderer. CardFront's H indicator reads card.wasHeld via
                  h2hArcRenderer's `locked` mapping; left to the snapshot,
                  the badge tracks the SENDER's holds, not the recipient's
                  taps. State 2 starts with state.held empty (no badges);
                  taps toggle slot.held; H badge follows. The
                  redraw/resolve chain is unaffected — lockedCardIds is
                  built from state.held above and still resolves cardIds
                  off the zeroed initialRoster. */}
              {renderCard(
                { ...(slot.card as unknown as H2HCard), wasHeld: slot.held },
                { revealed: false },
              )}
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

/** Fallback for the rare case where challengeCtx.resolvedSenderHand
 *  is not yet populated when the top strip first flips face-up. Rendered
 *  inside the TopStripCell front-face container, so positioning + flip
 *  scaffolding are owned by the parent — this is content only. */
function SenderUpPlaceholder() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 6,
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
