/**
 * shared/hooks/useFTUE.ts
 * LAYER 1: Sport-agnostic first-time user experience state.
 *
 * Tracks whether this is the user's first game via localStorage.
 * Each sport uses its own storage key so basketball FTUE and
 * soccer FTUE are independent.
 *
 * Usage in basketball/src/App.tsx:
 *   import { useFTUE } from "../../../shared/hooks/useFTUE";
 *   const { isFTUE, completeFTUE } = useFTUE("basketball");
 *
 * Usage in worldcup/src/App.tsx:
 *   import { useFTUE } from "../../../shared/hooks/useFTUE";
 *   const { isFTUE, completeFTUE } = useFTUE("soccer");
 *
 * Debug: open browser console and run:
 *   localStorage.removeItem("replaymod_ftue_basketball")
 * to replay the FTUE without clearing all storage.
 */

import { useCallback, useEffect, useState } from "react";

const FTUE_CHANGE_EVENT = "replaymod:ftue-change";

function readFtueActive(KEY: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    // ?ftue=1 forces FTUE on (overrides everything else).
    if (params.get("ftue") === "1") return true;
    // QA bypasses — any of these turns FTUE off synchronously, no
    // localStorage write needed for the in-memory flag. App.tsx also
    // writes localStorage on these so subsequent reloads without the
    // param stay skipped. `?debug=1` is bundled because the debug
    // panel + FTUE coexist poorly during QA — testers always want
    // both at once.
    if (params.get("skip") === "1") return false;
    if (params.get("skipFtue") === "1") return false;
    if (params.get("skip_ftue") === "1") return false;
    if (params.get("debug") === "1") return false;
    if (localStorage.getItem(KEY) === "1") return false;
    return true;
  } catch {
    return true;
  }
}

export function useFTUE(sport: string) {
  const KEY = `replaymod_ftue_${sport}`;

  const [isFTUE, setIsFTUE] = useState<boolean>(() => readFtueActive(KEY));

  // Subscribe to cross-instance change events. useFTUE is called from both
  // App.tsx (which owns DailySeasonReelGate.bypass) and GameView (which calls
  // completeFTUE when the user finishes the flow). Without this subscription
  // each instance has its own useState, so completing FTUE in GameView
  // wouldn't update App.tsx's bypass — the season reel would never fire on
  // the FTUE→normal transition.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.sport === sport) setIsFTUE(readFtueActive(KEY));
    };
    window.addEventListener(FTUE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(FTUE_CHANGE_EVENT, onChange);
  }, [sport, KEY]);

  /** Call once when user completes the FTUE flow. */
  const completeFTUE = useCallback(() => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setIsFTUE(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(FTUE_CHANGE_EVENT, { detail: { sport } }));
    }
  }, [KEY, sport]);

  return { isFTUE, completeFTUE };
}