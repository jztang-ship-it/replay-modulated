/**
 * RelayDebugOverlay — dev-only instrumentation for the relay-tension feature.
 *
 * The relay's effects (Z1 size growth, Z2 leader glow, scaled pops, lead-
 * change pops, momentum tag) are motion-based and currently only verifiable
 * by eyeball on a moving screen, with no numeric reference. This overlay
 * exposes the live runtime values so the spec's "two-channel" claim
 * (size and glow as INDEPENDENT signals) becomes measurable: e.g. is Z1
 * size perceptibly doing anything, or is glow carrying everything?
 *
 * DEV-ONLY gating, belt-and-suspenders:
 *   1. Render-level: an early return when `import.meta.env.DEV` is falsy
 *      OR when the `?relayDebug=1` querystring flag is absent.
 *   2. Mount-level: the parent (H2HRevealScreen) JSX-gates the import on
 *      `import.meta.env.DEV` so Vite's tree-shaker can eliminate the
 *      component entirely from the prod bundle.
 *   3. The whole overlay carries `pointer-events: none` so it can't trap
 *      interaction even if it slipped through somehow.
 *
 * Observation model: the overlay READS — it never writes. It does NOT add
 * state to the relay components. Two sources of truth:
 *   (a) The `reveal` hook return passed in via props — running totals,
 *       phase, matchupIndex, activeMatchup.
 *   (b) DOM data-attributes + computed styles on `[data-h2h-team-score]`
 *       cells (during reveal) and `[data-h2h-overlay-score]` cells (post-
 *       crossfade). Per-cell state, pop kind/magnitude/duration, applied
 *       scale, font size — all read at ~30fps via an internal RAF loop.
 *
 * Not observable without instrumenting the relay path:
 *   - Set-boundary `flipped` truth — derivable from running totals at
 *     boundary, which the overlay computes itself with its own prevLeader
 *     ref. NOT read from H2HRevealScreen's internal `popMemoryRef`.
 *   - Pop magnitude per-side — exposed via the data-h2h-score-pop-
 *     magnitude attribute on ScoreCell (added in the same pass; it's a
 *     read-only attribute, zero behavior impact).
 *
 * Cross-surface: the overlay queries BOTH `data-h2h-team-score` (reveal
 * surface) AND `data-h2h-overlay-score` (results surface) so it stays
 * informative through the reveal → results crossfade — exactly the
 * handoff the relay's cross-surface invariant turns on.
 */

import React, { useEffect, useRef, useState } from "react";
import type { UseH2HRevealReturn } from "./useH2HReveal";

const RELAY_DEBUG_QUERY_FLAG = "relayDebug";

/** Belt-and-suspenders enablement check. Called from both the parent
 *  JSX gate AND the component itself. The parent gate lets Vite tree-
 *  shake; the component gate makes it impossible to ship visible debug
 *  output even in a dev build without the explicit flag. */
export function isRelayDebugEnabled(): boolean {
  // The `import.meta.env.DEV` reference is statically replaced by Vite
  // at build time. In prod builds the expression becomes `false` and
  // this function returns false unconditionally → the parent's
  // `{isRelayDebugEnabled() && <RelayDebugOverlay ... />}` JSX gate
  // becomes dead code that tree-shakes the import away.
  const isDev = ((import.meta as any).env?.DEV ?? false) === true;
  if (!isDev) return false;
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has(RELAY_DEBUG_QUERY_FLAG);
  } catch {
    return false;
  }
}

interface ObservedCell {
  /** Source surface tag — "reveal" if found via [data-h2h-team-score],
   *  "overlay" if found via [data-h2h-overlay-score], or "none". */
  source: "reveal" | "overlay" | "none";
  /** From data-h2h-score-state — "leading" / "trailing" / "tied" / null. */
  state: string | null;
  /** From data-h2h-score-pop-kind — "scaled" / "lead-change" / "none" / null. */
  popKind: string | null;
  /** From data-h2h-score-pop-magnitude — numeric string or "none". */
  popMagnitude: string | null;
  /** From data-h2h-score-pop-duration-ms — numeric string or "none". */
  popDurationMs: string | null;
  /** From data-h2h-score-rest-scale — the Phase 1 resting scale. */
  restScale: string | null;
  /** From data-h2h-score-size-progress — 0..1 monotonic w/ running total. */
  sizeProgress: string | null;
  /** Parsed from getComputedStyle(inner).transform — the LIVE applied
   *  scale, which is the WAAPI pop value during a pop and the inline
   *  resting scale otherwise. This is the load-bearing readout —
   *  answers "is Z1 actually doing anything." */
  appliedScale: number;
  /** From getComputedStyle(inner).fontSize — the constant 22 px today;
   *  exposed so the overlay can report effective rendered size
   *  (fontSize × appliedScale). */
  fontSizePx: number;
  /** From getComputedStyle(outer).filter — "none" or "drop-shadow(...)".
   *  Whether Z2 leader glow is active on this cell. */
  outerFilter: string | null;
}

const EMPTY_OBSERVED: ObservedCell = {
  source: "none",
  state: null,
  popKind: null,
  popMagnitude: null,
  popDurationMs: null,
  restScale: null,
  sizeProgress: null,
  appliedScale: 1,
  fontSizePx: 0,
  outerFilter: null,
};

interface BoundaryLogEntry {
  matchupIndex: number;
  flipped: boolean;
  prevLeader: string | null;
  newLeader: string | null;
  senderPopKind: string | null;
  senderPopMagnitude: string | null;
  recipientPopKind: string | null;
  recipientPopMagnitude: string | null;
  senderRunningTotal: number;
  recipientRunningTotal: number;
}

interface RelayDebugOverlayProps {
  reveal: UseH2HRevealReturn | undefined;
  senderFinalTotal: number;
  recipientFinalTotal: number;
}

function parseScaleFromMatrix(transform: string | null): number {
  if (!transform || transform === "none") return 1;
  // matrix(a, b, c, d, e, f) — for a pure scale(N), a === d === N.
  const m = transform.match(/matrix\(\s*([-0-9.]+)\s*,/);
  return m ? parseFloat(m[1]) : 1;
}

function observeCell(outer: Element | null): ObservedCell {
  if (!outer) return EMPTY_OBSERVED;
  const inner = outer.firstElementChild as HTMLElement | null;
  const isReveal = outer.hasAttribute("data-h2h-team-score");
  const innerCs = inner ? getComputedStyle(inner) : null;
  const outerCs = getComputedStyle(outer);
  return {
    source: isReveal ? "reveal" : "overlay",
    state: outer.getAttribute("data-h2h-score-state"),
    popKind: outer.getAttribute("data-h2h-score-pop-kind"),
    popMagnitude: outer.getAttribute("data-h2h-score-pop-magnitude"),
    popDurationMs: outer.getAttribute("data-h2h-score-pop-duration-ms"),
    restScale: outer.getAttribute("data-h2h-score-rest-scale"),
    sizeProgress: outer.getAttribute("data-h2h-score-size-progress"),
    appliedScale: parseScaleFromMatrix(innerCs?.transform ?? null),
    fontSizePx: innerCs ? parseFloat(innerCs.fontSize) : 0,
    outerFilter: outerCs.filter,
  };
}

function findScoreCells(): { opp: Element | null; you: Element | null } {
  // Reveal surface first; if absent fall back to overlay (post-crossfade).
  let cells = document.querySelectorAll<HTMLElement>("[data-h2h-team-score]");
  if (cells.length < 2) {
    cells = document.querySelectorAll<HTMLElement>("[data-h2h-overlay-score]");
  }
  return { opp: cells[0] ?? null, you: cells[1] ?? null };
}

export function RelayDebugOverlay({
  reveal,
  senderFinalTotal,
  recipientFinalTotal,
}: RelayDebugOverlayProps) {
  const enabled = isRelayDebugEnabled();

  // ── Per-frame observation state ────────────────────────────────────
  const [opp, setOpp] = useState<ObservedCell>(EMPTY_OBSERVED);
  const [you, setYou] = useState<ObservedCell>(EMPTY_OBSERVED);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let lastTick = 0;
    const tick = (t: number) => {
      // ~30fps cap — the relay's animations are smooth at 60fps but the
      // overlay only needs to keep up with the human reading it.
      if (t - lastTick > 33) {
        lastTick = t;
        const { opp: oppEl, you: youEl } = findScoreCells();
        const nextOpp = observeCell(oppEl);
        const nextYou = observeCell(youEl);
        // Only re-render when something changed — avoids needless React
        // commits during the static end-state hold.
        setOpp((prev) => (cellEquals(prev, nextOpp) ? prev : nextOpp));
        setYou((prev) => (cellEquals(prev, nextYou) ? prev : nextYou));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  // ── Set-boundary log ───────────────────────────────────────────────
  //
  // Triggered by reveal.phase entering "paused" or "end-hold" at a new
  // matchupIndex. Mirrors the same flip-detect logic H2HRevealScreen
  // uses (read-only — the overlay derives its OWN prevLeader/newLeader
  // from the reveal hook's running totals; it does NOT read or set
  // H2HRevealScreen's popMemoryRef).
  const [log, setLog] = useState<BoundaryLogEntry[]>([]);
  const lastBoundaryIdxRef = useRef<number>(-1);
  const prevLeaderRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !reveal) return;
    if (reveal.phase !== "paused" && reveal.phase !== "end-hold") return;
    const idx = reveal.matchupIndex;
    if (idx < 0 || idx <= lastBoundaryIdxRef.current) return;
    lastBoundaryIdxRef.current = idx;

    const sR = reveal.senderRunningTotal;
    const rR = reveal.recipientRunningTotal;
    const tiedNow =
      Math.abs(sR - rR) < 0.05 && sR > 0 && rR > 0;
    const newLeader: string | null = tiedNow
      ? "tied"
      : sR > rR
        ? "sender"
        : rR > sR
          ? "recipient"
          : null;
    const prev = prevLeaderRef.current;
    prevLeaderRef.current = newLeader;
    const flipped =
      prev !== null &&
      prev !== "tied" &&
      newLeader !== null &&
      newLeader !== "tied" &&
      prev !== newLeader;

    // Read the per-cell pop attrs right now. They were set by the same
    // React commit that updated matchupIndex/phase — by the time this
    // effect fires they reflect the just-resolved set.
    const { opp: oppEl, you: youEl } = findScoreCells();
    const entry: BoundaryLogEntry = {
      matchupIndex: idx,
      flipped,
      prevLeader: prev,
      newLeader,
      senderPopKind: oppEl?.getAttribute("data-h2h-score-pop-kind") ?? null,
      senderPopMagnitude:
        oppEl?.getAttribute("data-h2h-score-pop-magnitude") ?? null,
      recipientPopKind: youEl?.getAttribute("data-h2h-score-pop-kind") ?? null,
      recipientPopMagnitude:
        youEl?.getAttribute("data-h2h-score-pop-magnitude") ?? null,
      senderRunningTotal: sR,
      recipientRunningTotal: rR,
    };
    setLog((prevLog) => [...prevLog.slice(-7), entry]);
  }, [
    enabled,
    reveal,
    reveal?.phase,
    reveal?.matchupIndex,
    reveal?.senderRunningTotal,
    reveal?.recipientRunningTotal,
  ]);

  if (!enabled) return null;

  const sR = reveal?.senderRunningTotal ?? 0;
  const rR = reveal?.recipientRunningTotal ?? 0;
  const gap = (rR - sR).toFixed(1);
  const gapSign = rR > sR ? "+" : "";

  const matchupCount = reveal?.matchupCount ?? 0;
  const matchupIndex = reveal?.matchupIndex ?? -1;
  const phase = reveal?.phase ?? "—";

  // Effective rendered size in CSS px = fontSize × appliedScale. The
  // load-bearing comparison the relay spec turns on: leader > trailer?
  const oppEffective =
    opp.fontSizePx > 0 ? (opp.fontSizePx * opp.appliedScale).toFixed(1) : "—";
  const youEffective =
    you.fontSizePx > 0 ? (you.fontSizePx * you.appliedScale).toFixed(1) : "—";

  const glowOn = (cell: ObservedCell) =>
    cell.outerFilter != null && cell.outerFilter !== "none";

  return (
    <div
      data-h2h-relay-debug="true"
      style={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: 99999,
        padding: "8px 10px",
        background: "rgba(6, 10, 18, 0.82)",
        color: "#0AFCB8",
        font: '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        lineHeight: 1.4,
        borderRadius: 6,
        border: "1px solid rgba(10, 252, 184, 0.4)",
        pointerEvents: "none",
        whiteSpace: "pre",
        maxWidth: 360,
        boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ color: "#FFD86B", marginBottom: 4 }}>
        RELAY DEBUG  phase={phase}  set={matchupIndex < 0 ? "—" : `${matchupIndex + 1}/${matchupCount}`}
      </div>
      <div>
        OPP  {labelState(opp.state)}  glow={glowOn(opp) ? "ON " : "off"}
        {"  "}pop={fmtPop(opp.popKind, opp.popMagnitude, opp.popDurationMs)}
      </div>
      <div style={{ paddingLeft: 5, opacity: 0.85 }}>
        running={sR.toFixed(1)} (final {senderFinalTotal.toFixed(1)})
        {"  "}size {fmtFloat(opp.sizeProgress)}
      </div>
      <div style={{ paddingLeft: 5, opacity: 0.85 }}>
        scale  rest={fmtFloat(opp.restScale)}  applied={opp.appliedScale.toFixed(3)}
        {"  "}eff={oppEffective}px
      </div>
      <div style={{ marginTop: 4 }}>
        ME   {labelState(you.state)}  glow={glowOn(you) ? "ON " : "off"}
        {"  "}pop={fmtPop(you.popKind, you.popMagnitude, you.popDurationMs)}
      </div>
      <div style={{ paddingLeft: 5, opacity: 0.85 }}>
        running={rR.toFixed(1)} (final {recipientFinalTotal.toFixed(1)})
        {"  "}size {fmtFloat(you.sizeProgress)}
      </div>
      <div style={{ paddingLeft: 5, opacity: 0.85 }}>
        scale  rest={fmtFloat(you.restScale)}  applied={you.appliedScale.toFixed(3)}
        {"  "}eff={youEffective}px
      </div>
      <div style={{ marginTop: 4 }}>
        GAP  {gapSign}{gap}  (me − opp)
      </div>
      <div style={{ color: "#FFD86B", marginTop: 6, marginBottom: 2 }}>
        SET-BOUNDARY LOG (latest last)
      </div>
      {log.length === 0 ? (
        <div style={{ opacity: 0.6 }}>  (no boundaries yet)</div>
      ) : (
        log.map((e) => (
          <div key={e.matchupIndex} style={{ opacity: 0.9 }}>
            {"  set "}{(e.matchupIndex + 1).toString().padStart(2, " ")}
            {"  "}{e.flipped ? "FLIP" : "----"}
            {"  "}{(e.prevLeader ?? "—").padEnd(9)}
            {"→ "}{(e.newLeader ?? "—").padEnd(9)}
            {"  opp:"}{fmtLogPop(e.senderPopKind, e.senderPopMagnitude)}
            {"  me:"}{fmtLogPop(e.recipientPopKind, e.recipientPopMagnitude)}
          </div>
        ))
      )}
    </div>
  );
}

function cellEquals(a: ObservedCell, b: ObservedCell): boolean {
  return (
    a.source === b.source &&
    a.state === b.state &&
    a.popKind === b.popKind &&
    a.popMagnitude === b.popMagnitude &&
    a.popDurationMs === b.popDurationMs &&
    a.restScale === b.restScale &&
    a.sizeProgress === b.sizeProgress &&
    Math.abs(a.appliedScale - b.appliedScale) < 0.001 &&
    a.fontSizePx === b.fontSizePx &&
    a.outerFilter === b.outerFilter
  );
}

function labelState(s: string | null): string {
  if (s === "leading") return "LEAD";
  if (s === "trailing") return "trail";
  if (s === "tied") return "TIED";
  return "—   ";
}

function fmtPop(
  kind: string | null,
  magnitude: string | null,
  durationMs: string | null,
): string {
  if (!kind || kind === "none") return "none";
  const mag = magnitude && magnitude !== "none" ? magnitude : "?";
  const dur = durationMs && durationMs !== "none" ? `${durationMs}ms` : "?ms";
  return `${kind} ×${mag} ${dur}`;
}

function fmtLogPop(kind: string | null, magnitude: string | null): string {
  if (!kind || kind === "none") return "none";
  const mag = magnitude && magnitude !== "none" ? magnitude : "?";
  return `${kind} ×${mag}`;
}

function fmtFloat(v: string | null): string {
  if (v == null || v === "none") return "—";
  const f = parseFloat(v);
  return Number.isFinite(f) ? f.toFixed(3) : "—";
}
