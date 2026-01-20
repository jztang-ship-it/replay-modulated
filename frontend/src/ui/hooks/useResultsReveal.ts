import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Phase = "HOLD" | "RESULTS";

/**
 * UI-only reveal sequencing for RESULTS.
 * - No dependency on app types (so no path issues)
 * - Uses only fields we read at runtime: cardId/id/playerId/basePlayerId/name + actualFp
 */
function getCardKey(c: any): string {
  return String(c?.cardId ?? c?.id ?? c?.playerId ?? c?.basePlayerId ?? c?.uid ?? c?.name ?? "");
}

export function useResultsReveal(params: {
  phase: Phase;
  roster: any[];
  revealDelayMs?: number;
  order?: "roster" | "bestFirst";
}) {
  const { phase, roster, revealDelayMs = 450, order = "roster" } = params;

  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [runningTotalFp, setRunningTotalFp] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);

  const timersRef = useRef<number[]>([]);
  const cancelledRef = useRef(false);

  const revealList = useMemo(() => {
    const list = (roster ?? [])
      .map((c) => ({ c, id: getCardKey(c) }))
      .filter((x) => x.id);

    if (order === "bestFirst") {
      list.sort((a, b) => Number(b.c?.actualFp ?? 0) - Number(a.c?.actualFp ?? 0));
    }
    return list;
  }, [roster, order]);

  const clearTimers = useCallback(() => {
    cancelledRef.current = true;
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    cancelledRef.current = false;
    setIsRevealing(false);
    setRevealedIds(new Set());
    setRunningTotalFp(0);
  }, [clearTimers]);

  const skipToEnd = useCallback(() => {
    clearTimers();
    cancelledRef.current = false;

    const all = new Set(revealList.map((x) => x.id));
    setRevealedIds(all);

    const total = revealList.reduce((acc, x) => acc + Number(x.c?.actualFp ?? 0), 0);
    setRunningTotalFp(total);

    setIsRevealing(false);
  }, [clearTimers, revealList]);

  useEffect(() => {
    // Only run in RESULTS
    if (phase !== "RESULTS") {
      reset();
      return;
    }

    reset();
    setIsRevealing(true);

    let cumulative = 0;

    revealList.forEach((item, idx) => {
      const t = window.setTimeout(() => {
        if (cancelledRef.current) return;

        setRevealedIds((prev) => {
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });

        cumulative += Number(item.c?.actualFp ?? 0);
        setRunningTotalFp(cumulative);

        if (idx === revealList.length - 1) {
          setIsRevealing(false);
        }
      }, idx * revealDelayMs);

      timersRef.current.push(t);
    });

    return () => clearTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, revealList, revealDelayMs]);

  return { revealedIds, runningTotalFp, isRevealing, skipToEnd, reset };
}
