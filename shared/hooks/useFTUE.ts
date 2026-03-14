/**
 * shared/hooks/useFTUE.ts
 * Sport-agnostic first-time user experience state.
 *
 * Tracks whether this is the user's first game via localStorage.
 * Each sport uses its own storage key so basketball FTUE and
 * soccer FTUE are independent.
 *
 * DEV shortcut: append ?ftue=1 to the URL to force FTUE mode
 * without clearing localStorage.
 *   e.g. http://localhost:5173/?ftue=1
 *
 * Debug reset: open browser console and run:
 *   localStorage.removeItem("replaymod_ftue_basketball")
 */

import { useState } from "react";

function isDevFTUEOverride(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("ftue") === "1";
  } catch {
    return false;
  }
}

export function useFTUE(sport: string) {
  const KEY = `replaymod_ftue_${sport}`;

  const [isFTUE] = useState<boolean>(() => {
    if (isDevFTUEOverride()) return true;
    try {
      return localStorage.getItem(KEY) !== "1";
    } catch {
      return false;
    }
  });

  function completeFTUE() {
    // Don't persist when using the dev override — keeps ?ftue=1 reusable
    if (isDevFTUEOverride()) return;
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  }

  return { isFTUE, completeFTUE };
}