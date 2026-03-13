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

import { useState } from "react";

export function useFTUE(sport: string) {
  const KEY = `replaymod_ftue_${sport}`;

  const [isFTUE] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) !== "1";
    } catch {
      // Private browsing or storage blocked — skip FTUE silently
      return false;
    }
  });

  /** Call once after the user completes their first post-game screen. */
  function completeFTUE() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // ignore
    }
  }

  return { isFTUE, completeFTUE };
}