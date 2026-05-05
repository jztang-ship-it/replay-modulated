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

export function useDailySlate(
  adapter: SlateHookAdapter,
  resolvePlayer: (id: string) => { name: string; tier: string } | undefined,
): {
  players: DailySlatePlayer[];
  themeKey: string | null;
  msUntilRotation: number;
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

  return {
    players,
    themeKey,
    msUntilRotation: getMsUntilNextBonusRotation(now),
  };
}
