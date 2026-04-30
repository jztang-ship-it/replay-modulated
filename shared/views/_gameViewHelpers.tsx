/**
 * shared/views/_gameViewHelpers.tsx
 *
 * Pure helpers extracted from per-sport GameView.tsx during the Phase 2 lift.
 * Each was duplicated identically in basketball + baseball; lifted here so
 * future GameView consolidation can build on a single source.
 *
 * NOTE: tierFromSalary uses basketball's thresholds (which include RED).
 * Baseball has no card with salary >= 73 TODAY where the fallback path
 * would actually fire: Tarik Skubal (salary=73) already carries tier="RED"
 * in players.json, so the data-tier path is taken and tierFromSalary is
 * never called for him. The RED branch is dead-but-harmless for baseball —
 * see docs/storage-keys-audit.md for the verified count.
 */

import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from "react";
import type { PlayerCard } from "../types/index";
import type { RevealableCard } from "../hooks/useEmotionalReveal";

// ── Utility ────────────────────────────────────────────────────────────────

export function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Salary-cutoff tier fallback ────────────────────────────────────────────
// Used only when a card lacks an authoritative `tier` field (players.json
// always sets one; this is a safety net for edge cases like custom test cards).

/** Set of all recognised tier strings. */
export const VALID_TIERS = new Set(["RED", "ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"]);

/** Salary-cutoff tier — fallback only. Player data should carry an authoritative `tier`. */
export function tierFromSalary(salary: number): string {
  const s = Number(salary ?? 0);
  return s >= 73 ? "RED" : s >= 58 ? "ORANGE" : s >= 44 ? "PURPLE" : s >= 30 ? "BLUE" : s >= 23 ? "GREEN" : "WHITE";
}

// ── Roster helpers ─────────────────────────────────────────────────────────

export function cardId(card: any): string {
  return String(card?.cardId ?? card?.basePlayerId ?? "");
}

export function sumSalary(roster: PlayerCard[]) {
  return roster.reduce((s, c: any) => s + Number(c?.salary ?? 0), 0);
}

export function toRevealableCards(cards: PlayerCard[]): RevealableCard[] {
  return cards.map(c => {
    const salary = Number((c as any).salary ?? 0);
    const dataTier = String((c as any).tier ?? "").toUpperCase();
    return {
      cardId: cardId(c),
      slotIndex: c.slotIndex ?? 0,
      actualFp: Number(c.actualFp ?? 0),
      projectedFp: Number(c.projectedFp ?? 0),
      salary,
      tier: VALID_TIERS.has(dataTier) ? dataTier : tierFromSalary(salary),
      wasHeld: (c as any).wasHeld ?? false,
      badges: (c.achievements ?? []).map((a: any) => ({
        id: a.id, icon: a.icon || "⭐", label: a.label, fp: a.fp || 0,
      })),
    };
  });
}

// ── RollingNumber — animates between numeric values ────────────────────────

export function RollingNumber({ value, decimals = 0, duration = 400 }: { value: number; decimals?: number; duration?: number }) {
  const [displayed, setDisplayed] = useState(value);
  const rafRef = useRef<number>(0);
  const prevRef = useRef(value);
  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (Math.abs(end - start) < 0.05) { setDisplayed(end); prevRef.current = end; return; }
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(start + (end - start) * eased);
      if (progress < 1) { rafRef.current = requestAnimationFrame(animate); }
      else { setDisplayed(end); prevRef.current = end; }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]); // eslint-disable-line
  return <>{displayed.toFixed(decimals)}</>;
}

// ── RosterGridScaleFit ─────────────────────────────────────────────────────

/** Scales the 2×3 roster so both rows always fit the middle grid row (no clipping onto Team FP). */
export function RosterGridScaleFit({ children }: { children: ReactNode }) {
  const portRef = useRef<HTMLDivElement>(null);
  const measRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const port = portRef.current;
    const meas = measRef.current;
    if (!port || !meas) return;
    const run = () => {
      const pw = port.clientWidth;
      const ph = port.clientHeight;
      const mw = meas.scrollWidth;
      const mh = meas.scrollHeight;
      if (!pw || !ph || !mw || !mh) return;
      // Cap at 1.15 to allow cards to scale UP and fill ghost space on tall
       // phones, not just scale down when parent is smaller than natural.
       setScale(Math.min(1.15, pw / mw, ph / mh));
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(port);
    ro.observe(meas);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div
      ref={portRef}
      data-ftue-anchor="roster"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        ref={measRef}
        data-ftue-anchor="roster-inner"
        style={{
          width: "100%",
          transform: `scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
