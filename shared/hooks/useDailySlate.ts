/**
 * shared/hooks/useDailySlate.ts
 *
 * UI hook: today's slate data + countdown to next UTC midnight rotation.
 * Re-ticks at rotation boundary so panel display refreshes automatically.
 */

import { useEffect, useMemo, useState } from "react";
import { getCachedSlate } from "../utils/slateSelector";
import { getMsUntilNextBonusRotation } from "../utils/dailyBonus";

type SlateHookAdapter = Parameters<typeof getCachedSlate>[0] & {
  getThemeForDate(date: Date): string | null;
};

export type DailySlatePlayer = {
  id: string;
  name: string;
  tier: string;
  isAnchor: boolean;
};

/**
 * Slate signature — Wordle-style daily identity. The number is days
 * since SLATE_EPOCH (UTC), so the same date produces the same number
 * everywhere. Stable, deterministic, no time-zone surprises.
 *
 * Epoch: 2026-01-01 UTC. Slate #1 is 2026-01-01 itself; 2026-01-02 is #2,
 * and so on. Pre-epoch dates clamp to #1.
 */
export type SlateSignature = { number: number; label: string };

/** UTC midnight on 2026-01-01. */
const SLATE_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0, 0);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Pure helper: derive slate signature from any Date. */
export function slateSignature(date: Date): SlateSignature {
  // Normalize to UTC midnight so partial-day arithmetic doesn't shift
  // the count across a date boundary.
  const utcMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0, 0, 0, 0,
  );
  const days = Math.floor((utcMidnight - SLATE_EPOCH_MS) / ONE_DAY_MS);
  // Day 0 → Slate #1 (1-based for human display).
  const number = Math.max(1, days + 1);
  return { number, label: `Slate #${number}` };
}

export function useDailySlate(
  adapter: SlateHookAdapter,
  resolvePlayer: (id: string) => { name: string; tier: string } | undefined,
): {
  players: DailySlatePlayer[];
  themeKey: string | null;
  msUntilRotation: number;
  signature: SlateSignature;
} {
  const [now, setNow] = useState(() => new Date());

  // Re-tick at next UTC midnight (~ms until next bonus rotation)
  useEffect(() => {
    const ms = getMsUntilNextBonusRotation(now);
    const timer = setTimeout(() => setNow(new Date()), ms + 100);
    return () => clearTimeout(timer);
  }, [now]);

  const themeKey = useMemo(() => adapter.getThemeForDate(now), [adapter, now]);

  const slateIds = useMemo(
    () => getCachedSlate(adapter, now, themeKey ?? undefined),
    [adapter, now, themeKey],
  );

  const players = useMemo<DailySlatePlayer[]>(() => {
    // Anchors set: take the top `anchorCount` from adapter.getAnchors()
    // intersected with current eligibility.
    const cfgAnchors = (adapter as any).config?.anchorCount ?? 10;
    const anchorIds = new Set(
      ((adapter as any).getAnchors?.() ?? []).slice(0, cfgAnchors)
    );
    return slateIds.map(id => {
      const meta = resolvePlayer(id);
      return {
        id,
        name: meta?.name ?? id,
        tier: meta?.tier ?? "WHITE",
        isAnchor: anchorIds.has(id),
      };
    });
  }, [adapter, slateIds, resolvePlayer]);

  const signature = useMemo(() => slateSignature(now), [now]);

  return {
    players,
    themeKey,
    msUntilRotation: getMsUntilNextBonusRotation(now),
    signature,
  };
}
