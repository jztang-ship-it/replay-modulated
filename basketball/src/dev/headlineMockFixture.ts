// basketball/src/dev/headlineMockFixture.ts
//
// Hand-edited CommentaryFacts fixtures for the Phase 3 step 1 smoke
// route. Each case mirrors a real production hand shape so the stubbed
// /api/headline response (and step 2's real authored output) can be
// eyeballed beside today's bank pick.
//
// DEV-only; the route mount in App.tsx gates on import.meta.env.DEV so
// the whole tree dead-code-eliminates from prod builds.

import type { CommentaryFacts } from "@shared/commentary/commentaryFacts";

export type HeadlineMockCase =
  | "rare_pull"          // Wade career-high (the real production row)
  | "choke_credited"     // anchor vindicated — Kobe delivered, Kidd tanked
  | "choke_neutral"      // Kobe mid-zone — the bug that started Phase 3
  | "big_score"          // Curry 65 FP
  | "miss";              // 7 FP short of ALL-STAR — no anchor

interface HeadlineMockFixture {
  label: string;
  facts: CommentaryFacts;
  /** What today's chadShareTrashTalk bank picks for this trigger — shown
   *  alongside the endpoint's output so the comparison is on-screen. */
  bankPick: string;
}

export const HEADLINE_MOCK_FIXTURES: Record<HeadlineMockCase, HeadlineMockFixture> = {
  rare_pull: {
    label: "rare_pull · Wade career night",
    facts: {
      surface: "challenge_headline",
      sport: "basketball",
      season: "0809",
      trigger: "rare_pull",
      verdict: "credited",
      anchor: {
        name: "Dwyane Wade",
        basePlayerId: "2548",
        nicknames: ["Flash", "D-Wade", "Three", "The Way of Wade"],
        knownFor: "Three-time NBA champion, Finals MVP at 24, the engine of every Heat era he was a part of.",
        tier: "RED",
        team: "MIA",
        statLine: { pts: 50, reb: 10, ast: 8, stl: 4, blk: 6, threes: 4, min: 41 },
        opponent: "UTA",
        homeAway: "H",
        date: "2009-02-22",
        topReason: { category: "pts", value: 50, label: "50 pts (career)" },
      },
    },
    bankPick: "Set the high. See if you can touch it.",
  },

  choke_credited: {
    label: "choke · Kobe credited (other tanked)",
    facts: {
      surface: "challenge_headline",
      sport: "basketball",
      season: "2425",
      trigger: "choke",
      verdict: "credited",
      anchor: {
        name: "Kobe Bryant",
        basePlayerId: "977",
        nicknames: ["Black Mamba", "Mamba", "Vino", "Kobe", "KB24", "Mamba Mentality"],
        knownFor: "Five-time NBA champion, 18-time All-Star, the closest spiritual successor to Jordan.",
        tier: "RED",
        team: "LAL",
        statLine: { pts: 38, reb: 6, ast: 5, stl: 2, blk: 1, threes: 3, min: 37 },
        opponent: "SAS",
        homeAway: "A",
        date: "2009-04-15",
      },
    },
    bankPick: "Brutal hand. See if they survive the same slate.",
  },

  choke_neutral: {
    label: "choke · Kobe mid-zone (the Phase-3 bug)",
    facts: {
      surface: "challenge_headline",
      sport: "basketball",
      season: "0809",
      trigger: "choke",
      verdict: "neutral",
      anchor: {
        name: "Kobe Bryant",
        basePlayerId: "977",
        nicknames: ["Black Mamba", "Mamba", "Vino", "Kobe", "KB24", "Mamba Mentality"],
        knownFor: "Five-time NBA champion, 18-time All-Star, the closest spiritual successor to Jordan.",
        tier: "ORANGE",
        team: "LAL",
        statLine: { pts: 24, reb: 5, ast: 4, min: 36 },
        opponent: "POR",
        homeAway: "A",
        date: "2009-01-08",
      },
    },
    bankPick: "Brutal hand. See if they survive the same slate.",
  },

  big_score: {
    label: "big_score · Curry 65 FP",
    facts: {
      surface: "challenge_headline",
      sport: "basketball",
      season: "2425",
      trigger: "big_score",
      verdict: "credited",
      anchor: {
        name: "Stephen Curry",
        basePlayerId: "201939",
        nicknames: ["Chef", "The Chef", "Steph", "Baby-Faced Assassin"],
        knownFor: "Four-time NBA champion, revolutionized basketball by extending the three-point line.",
        tier: "RED",
        team: "GSW",
        statLine: { pts: 42, reb: 5, ast: 7, threes: 9, min: 35 },
        opponent: "PHX",
        homeAway: "H",
        date: "2025-01-20",
        topReason: { category: "fp", value: 65.3, label: "65.3 FP" },
      },
    },
    bankPick: "You hit ALL-STAR. Same slate. Beat them.",
  },

  miss: {
    label: "miss · 7 FP short of ALL-STAR",
    facts: {
      surface: "challenge_headline",
      sport: "basketball",
      season: "2425",
      trigger: "miss",
      verdict: "neutral",
      nearMissGap: 7,
      nearMissNextTier: "ALL_STAR",
    },
    bankPick: "Almost. So close. Try the same slate.",
  },
};

export function getMockCaseFromUrl(): HeadlineMockCase {
  if (typeof window === "undefined") return "rare_pull";
  const sp = new URLSearchParams(window.location.search);
  const raw = (sp.get("case") ?? "rare_pull") as HeadlineMockCase;
  return (raw in HEADLINE_MOCK_FIXTURES) ? raw : "rare_pull";
}
