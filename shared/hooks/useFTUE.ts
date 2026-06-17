/**
 * shared/hooks/useFTUE.ts
 * LAYER 1: Sport-agnostic first-time user experience state.
 *
 * FTUE KILLED (feat/kill-ftue-real-game, slice 1): the scripted tutorial
 * rail is removed — every user drops straight into the REAL game on hand 1.
 * `isFTUE` is now permanently false; this hook no longer consults
 * localStorage, URL params (?ftue=1 / ?skip=1), or AuthContext.ftueCompleted.
 *
 * The public shape `{ isFTUE, completeFTUE }` is preserved so existing call
 * sites keep compiling while the rail is removed step-by-step. `completeFTUE`
 * is a stable no-op — nothing reads the flag it used to write, and the
 * `replaymod:ftue-change` cross-instance event is gone (the season-reel
 * front door now fires for everyone via DailySeasonReelGate, not on an
 * FTUE→normal transition).
 *
 * AuthProvider's `ftueCompleted` machinery (field + B5 promotion) is left
 * INERT for a later cleanup slice; this hook simply no longer reads it.
 */

import { useCallback } from "react";

export function useFTUE(_sport: string) {
  // FTUE is permanently disabled — no tutorial rail, no gate. Stable no-op so
  // any caller still invoking completeFTUE() during its own removal stays
  // valid until that call site is deleted.
  const completeFTUE = useCallback(() => { /* no-op: FTUE removed */ }, []);
  const isFTUE: boolean = false;
  return { isFTUE, completeFTUE };
}
