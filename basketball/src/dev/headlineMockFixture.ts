// basketball/src/dev/headlineMockFixture.ts
//
// Hand-edited CommentaryFacts fixtures for the Phase 3 smoke route +
// eval loop. Five primary cases mirror real production hand shapes;
// four retro adversarial cases probe the anti-anachronism and obey-
// verdict rules under pressure (the model wants to reach for modern
// arena names, post-game awards, future ring counts).
//
// Each fixture carries winTier (Phase 3 step 2 — threaded into the
// router's per-tier KV key + the grader's "Result tier:" context line).
//
// DEV-only; the route mount in App.tsx gates on import.meta.env.DEV so
// the whole tree dead-code-eliminates from prod builds. The eval
// harness (scripts/smoke-headline.mjs) imports this same file directly
// from Node so the fixture set is the single source of truth.

import type { CommentaryFacts } from "@shared/commentary/commentaryFacts";

export type HeadlineMockCase =
  // Primary five (the production hand shapes — also the gates in step 1)
  | "rare_pull"          // Wade career-high (the real production row)
  | "choke_credited"     // anchor vindicated — Kobe delivered, other tanked
  | "choke_neutral"      // Kobe mid-zone — the Phase-3 reason-for-existing
  | "big_score"          // Curry 65 FP, modern season
  | "miss"               // 7 FP short of ALL-STAR — no anchor
  // Retro adversarial set — anti-anachronism + verdict-discipline probes
  | "retro_shaq_0001"    // Shaq 2000-01 Lakers — pre-Heat/Suns/Cavs/Celtics arc
  | "retro_jordan_9596"  // Jordan 95-96 (4 rings at the time, not 6)
  | "retro_arenas_0607"  // Arenas 06-07 (pre-injury, pre-controversy era)
  | "retro_kobe_neutral_0708"; // Kobe 07-08 mid-zone (verdict discipline)

interface HeadlineMockFixture {
  label: string;
  facts: CommentaryFacts;
  /** What today's chadShareTrashTalk bank picks for this trigger — shown
   *  alongside the endpoint's output so the comparison is on-screen. */
  bankPick: string;
  /** Per-fixture eval hint — what specifically this case is checking.
   *  Shown in the smoke harness output and helps reviewers know what
   *  to look for when reading the model's headline. */
  evalHint?: string;
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
      winTier: "MVP",
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
    evalHint: "Should name Wade + 50 pts + UTA. No mention of Kaseya Center (modern); 0809 Heat played at American Airlines Arena.",
  },

  choke_credited: {
    label: "choke · Kobe credited (other tanked)",
    facts: {
      surface: "challenge_headline",
      sport: "basketball",
      season: "2425",
      trigger: "choke",
      verdict: "credited",
      winTier: "BUST",
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
    evalHint: "Anchor vindicated — Kobe is hero, not villain. Line indicts the rest of the hand without naming the others (no anchor for them in facts).",
  },

  choke_neutral: {
    label: "choke · Kobe mid-zone (the Phase-3 reason-for-existing)",
    facts: {
      surface: "challenge_headline",
      sport: "basketball",
      season: "0809",
      trigger: "choke",
      verdict: "neutral",
      winTier: "BUST",
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
    evalHint: "CRITICAL: verdict=neutral. Must NOT name Kobe as hero (no MAMBA DELIVERED) or villain (no MAMBA FORGOT). Line lives on the hand or the stakes — not on a player as cause.",
  },

  big_score: {
    label: "big_score · Curry 65 FP",
    facts: {
      surface: "challenge_headline",
      sport: "basketball",
      season: "2425",
      trigger: "big_score",
      verdict: "credited",
      winTier: "ALL_STAR",
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
    evalHint: "Modern season — Chase Center is OK as written, but cleanest is no venue at all (v1 rule: venue not provided in facts).",
  },

  miss: {
    label: "miss · 7 FP short of ALL-STAR",
    facts: {
      surface: "challenge_headline",
      sport: "basketball",
      season: "2425",
      trigger: "miss",
      verdict: "neutral",
      winTier: "STARTER",
      nearMissGap: 7,
      nearMissNextTier: "ALL_STAR",
    },
    bankPick: "Almost. So close. Try the same slate.",
    evalHint: "No anchor — line is about the hand / the gap. Must NOT invent a player to credit or blame.",
  },

  // ── Retro adversarial fixtures ───────────────────────────────────────────
  // Probe the anti-anachronism + obey-verdict rules under the most likely
  // failure conditions. Reviewers should read these knowing what trap the
  // model is being walked toward.

  retro_shaq_0001: {
    label: "retro · Shaq 2000-01 Lakers (anti-anachronism)",
    facts: {
      surface: "challenge_headline",
      sport: "basketball",
      season: "0001",
      trigger: "big_score",
      verdict: "credited",
      winTier: "MVP",
      anchor: {
        name: "Shaquille O'Neal",
        basePlayerId: "406",
        nicknames: ["Shaq", "The Big Diesel", "Shaq Diesel", "The Big Aristotle", "Superman"],
        knownFor: "Most physically dominant center of his era — four rings, three Finals MVPs, 15-time All-Star.",
        tier: "RED",
        team: "LAL",
        statLine: { pts: 41, reb: 18, ast: 5, blk: 5, min: 42 },
        opponent: "POR",
        homeAway: "H",
        date: "2001-05-19",
      },
    },
    bankPick: "You hit MVP. Same slate. Beat them.",
    evalHint: "0001 season Lakers played at STAPLES Center, NOT Crypto.com Arena. Shaq had ONE ring at this point (not four). Heat/Suns/Cavs/Celtics tenures hadn't happened. Watch for any of those leaks.",
  },

  retro_jordan_9596: {
    label: "retro · Jordan 95-96 Bulls (4 rings ≠ 6)",
    facts: {
      surface: "challenge_headline",
      sport: "basketball",
      season: "9596",
      trigger: "rare_pull",
      verdict: "credited",
      winTier: "LEGEND",
      anchor: {
        name: "Michael Jordan",
        basePlayerId: "893",
        nicknames: ["MJ", "Air Jordan", "His Airness", "Black Cat"],
        knownFor: "Six-time NBA champion, the GOAT in most conversations, the verb in sneaker culture.",
        tier: "RED",
        team: "CHI",
        statLine: { pts: 53, reb: 8, ast: 4, stl: 4, min: 38 },
        opponent: "WAS",
        homeAway: "A",
        date: "1996-04-05",
        topReason: { category: "pts", value: 53, label: "53 pts (season top-5)" },
      },
    },
    bankPick: "You pulled a legendary game. Challenge someone to beat this.",
    evalHint: "95-96 season: Jordan had 3 rings (returning from baseball, 6th about to be won). The knownFor field SAYS six-time — model must still write to the season's truth. Watch for '6 rings' / 'final ring' / Wizards reference (still 5+ years away).",
  },

  retro_arenas_0607: {
    label: "retro · Arenas 06-07 Wizards (pre-controversy, pre-injury)",
    facts: {
      surface: "challenge_headline",
      sport: "basketball",
      season: "0607",
      trigger: "rare_pull",
      verdict: "credited",
      winTier: "MVP",
      anchor: {
        name: "Gilbert Arenas",
        basePlayerId: "2240",
        nicknames: ["Agent Zero", "Hibachi", "Gilbertology"],
        knownFor: "The gunslinger who dropped 60 on Kobe, then brought actual guns to work.",
        tier: "RED",
        team: "WAS",
        statLine: { pts: 60, reb: 8, ast: 8, stl: 1, min: 49 },
        opponent: "LAL",
        homeAway: "A",
        date: "2006-12-17",
        topReason: { category: "pts", value: 60, label: "60 pts (career)" },
      },
    },
    bankPick: "You pulled a legendary game. Challenge someone to beat this.",
    evalHint: "December 2006: Arenas was still pre-injury, pre-locker-room-gun incident (2009). knownFor mentions guns — the §3 denylist must block any line that surfaces that (or 'arrest', 'suspension' references). Also: post-Wizards career didn't happen yet.",
  },

  retro_kobe_neutral_0708: {
    label: "retro · Kobe 07-08 mid-zone (verdict-discipline probe)",
    facts: {
      surface: "challenge_headline",
      sport: "basketball",
      season: "0708",
      trigger: "choke",
      verdict: "neutral",
      winTier: "BUST",
      anchor: {
        name: "Kobe Bryant",
        basePlayerId: "977",
        nicknames: ["Black Mamba", "Mamba", "Vino", "Kobe", "KB24", "Mamba Mentality"],
        knownFor: "Five-time NBA champion, 18-time All-Star, the closest spiritual successor to Jordan.",
        tier: "RED",
        team: "LAL",
        statLine: { pts: 26, reb: 5, ast: 4, min: 38 },
        opponent: "HOU",
        homeAway: "H",
        date: "2008-02-26",
      },
    },
    bankPick: "Brutal hand. See if they survive the same slate.",
    evalHint: "Second mid-zone Kobe case (different season + opponent) so the verdict-discipline check isn't single-fixture luck. Same rule: must NOT name Kobe as hero or villain. Also: 0708 Kobe had FOUR rings (5th came in 2009-10), and his knownFor's '5-time champ' is a lie if the model reaches for it from facts.",
  },
};

export function getMockCaseFromUrl(): HeadlineMockCase {
  if (typeof window === "undefined") return "rare_pull";
  const sp = new URLSearchParams(window.location.search);
  const raw = (sp.get("case") ?? "rare_pull") as HeadlineMockCase;
  return (raw in HEADLINE_MOCK_FIXTURES) ? raw : "rare_pull";
}
