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
    // ?ftue=1 in URL forces FTUE mode (for testing / sharing onboarding link)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("ftue") === "1") return true;
    }
    try {
      // Already completed if KEY is "1" OR the legacy "ftue_completed" key exists
      return localStorage.getItem(KEY) !== "1" &&
             localStorage.getItem("ftue_completed") !== "true";
    } catch {
      return false;
    }
  });

  /** Call once when user completes the FTUE flow. */
  function completeFTUE() {
    try {
      localStorage.setItem(KEY, "1");
      localStorage.setItem("ftue_completed", "true");
    } catch {
      // ignore
    }
  }

  return { isFTUE, completeFTUE };
}