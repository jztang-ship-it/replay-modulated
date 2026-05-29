/**
 * shared/hooks/useFTUE.ts
 * LAYER 1: Sport-agnostic first-time user experience state.
 *
 * Phase 5b piece 1 — Item B (2026-05-28, doc lock edc58d9): the FTUE gate
 * now consults auth state. Signed-in users (isAnonymous === false) never
 * see FTUE regardless of localStorage state — their completion flag lives
 * on player_profiles and is fetched into AuthContext at session resolve.
 * Anonymous users continue to use the per-sport localStorage flag as
 * before. Per B7's bias rule: when a signed-in user's profile flag is
 * NULL (pre-rule existing account, or newly-signed-up without B5
 * promotion), FTUE does not fire — bias toward not re-firing FTUE for
 * existing users.
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
 * to replay the FTUE without clearing all storage. (Anonymous users only;
 * signed-in users' FTUE gate consults the server profile.)
 */

import { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "@shared/auth/AuthProvider";

const FTUE_CHANGE_EVENT = "replaymod:ftue-change";

function readLocalFtueActive(KEY: string): boolean {
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
  const { isAnonymous, ftueCompleted } = useContext(AuthContext);

  // Phase 5b piece 1 Item B B1/B4 (2026-05-28): signed-in users never see
  // FTUE under any condition. Local-storage state is ignored for them. Per
  // B7's bias: NULL ftueCompleted (pre-rule existing account or fresh
  // signup without B5 promotion) is treated as completed — only an
  // explicit `false` from the server would trigger FTUE for a signed-in
  // user, and no current code path writes false.
  const isFTUEForSignedIn = ftueCompleted === false;

  const [isFTUE, setIsFTUE] = useState<boolean>(() => {
    if (!isAnonymous) return isFTUEForSignedIn;
    return readLocalFtueActive(KEY);
  });

  // Recompute the gate whenever auth state shifts (anon → signed-in
  // mid-session, or the server-side flag finishes loading). Without this,
  // a user who signs up mid-session would keep the localStorage-derived
  // initial state.
  useEffect(() => {
    if (!isAnonymous) {
      setIsFTUE(isFTUEForSignedIn);
      return;
    }
    setIsFTUE(readLocalFtueActive(KEY));
  }, [isAnonymous, isFTUEForSignedIn, KEY]);

  // Subscribe to cross-instance change events. useFTUE is called from both
  // App.tsx (which owns DailySeasonReelGate.bypass) and GameView (which
  // calls completeFTUE when the user finishes the flow). Without this
  // subscription each instance has its own useState, so completing FTUE
  // in GameView wouldn't update App.tsx's bypass — the season reel would
  // never fire on the FTUE→normal transition. Anonymous-only; signed-in
  // users' state changes flow through AuthContext.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isAnonymous) return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.sport === sport) setIsFTUE(readLocalFtueActive(KEY));
    };
    window.addEventListener(FTUE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(FTUE_CHANGE_EVENT, onChange);
  }, [sport, KEY, isAnonymous]);

  /** Call once when user completes the FTUE flow. Writes localStorage in
   *  every case (cheap, no-op for signed-in users who don't read it). The
   *  signed-in user's server-side ftue_completed flag is promoted by
   *  AuthProvider's B5 logic at the next auth transition; an explicit
   *  server write on completion isn't needed because B1 already
   *  short-circuits FTUE for them. */
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
