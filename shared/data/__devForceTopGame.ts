// DEV-ONLY: Remove before merging the polish PR.
// URL param `?forceTopGame=all_time|season|career` injects a synthetic TopGameResult
// so every hand renders the chosen tier regardless of draw. No-op in prod builds.

import type { TopGameResult } from "../commentary/types";

export function __devForceTopGame(): TopGameResult | null {
  if (typeof window === "undefined") return null;
  if (!(import.meta as any).env?.DEV) return null;
  const param = new URLSearchParams(window.location.search).get("forceTopGame");
  switch (param) {
    case "all_time":
      return {
        tier: "all_time",
        primaryReason: { category: "pts", label: "73+ point game — top-thirty ever", value: 73 },
        allReasons: [{ category: "pts", label: "73+ point game — top-thirty ever", value: 73 }],
      };
    case "season":
      return {
        tier: "season",
        primaryReason: { category: "pts", label: "Top-10 scoring game of the season (52 pts)", value: 52 },
        allReasons: [{ category: "pts", label: "Top-10 scoring game of the season (52 pts)", value: 52 }],
      };
    case "career":
      return {
        tier: "career",
        primaryReason: { category: "pts", label: "best scoring night of the season so far (42 pts)", value: 42 },
        allReasons: [{ category: "pts", label: "best scoring night of the season so far (42 pts)", value: 42 }],
      };
    default:
      return null;
  }
}
