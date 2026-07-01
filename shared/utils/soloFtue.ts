// shared/utils/soloFtue.ts
//
// Single source of truth for "is this the first-ever solo hand" — the
// localStorage half of the scripted-FTUE gate. Used by BOTH shared GameView
// (the ftueActive gate) and the basketball App (skip the season reel on
// first-run). Keeping it here prevents the two call sites from drifting.
//
// Anon-safe (localStorage, NOT the profile-backed ftueCompleted). Read once at
// mount by callers so it stays stable across the first hand (the post-resolve
// replaymod_hand_count increment must not flip the gate mid-hand).

export function isSoloFtueFirstRun(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    if (localStorage.getItem("rm_solo_ftue_done") === "1") return false;
    return (parseInt(localStorage.getItem("replaymod_hand_count") ?? "0", 10) || 0) === 0;
  } catch {
    return false;
  }
}
