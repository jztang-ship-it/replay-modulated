/**
 * footballConfig.ts — Layer 2 (Football — World Cup '26 launch competition)
 * FP weights: 5x scaled, baked in.
 * Salary: position-balanced (within-position scaling).
 * Badges: position-specific, data-validated thresholds.
 */

import type { SportConfigShape } from "@shared/types";

export const FootballSportConfig: SportConfigShape = {
  sportKey: "football",
  sportLabel: "Football",
  competition: "world_cup",   // launch competition

  // ── Roster ────────────────────────────────────────────────────────────────
  rosterSize: 5,
  maxPlayers: 5,
  rosterSlots: ["GK", "DEF", "MID", "FWD", "FLEX"],
  excludeFromFlex: ["GK"],
  salaryCap: 180,

  // ── Positions ─────────────────────────────────────────────────────────────
  positions: ["GK", "DEF", "MID", "FWD"],
  positionAliases: {
    "Goalkeeper": "GK",
    "Center Back": "DEF", "Left Back": "DEF", "Right Back": "DEF",
    "Left Wing Back": "DEF", "Right Wing Back": "DEF",
    "Defensive Midfield": "MID", "Central Midfield": "MID",
    "Left Midfield": "MID", "Right Midfield": "MID",
    "Attacking Midfield": "MID", "Left Wing": "MID", "Right Wing": "MID",
    "Center Forward": "FWD", "Left Center Forward": "FWD", "Right Center Forward": "FWD",
    "Secondary Striker": "FWD",
  },

  // ── Economy ────────────────────────────────────────────────────────────────
  economyConfig: {
    capMax: 180,
    capMin: 140,
    salaryMin: 10,
    salaryMax: 60,
  },

  // ── FP weights — position-specific (FPL/DraftKings design principle) ────────
  // Each position has different weights for the same stats because:
  // - Rarity matters: a GK goal is rarer than a FWD goal, so worth more
  // - Role matters: tackles are core to DEF value, not FWD value
  // - Calibrated so avg game ≈ 16-25 FP, elite game ≈ 68-73 FP (badges add 10-45)
  // This is the correct architecture for any multi-position sport (hockey, NFL, etc.)
  //
  // projectionWeights is required by SportConfigShape — used as fallback only
  projectionWeights: {
    goals: 12.0, assists: 8.0, saves: 20.0,
  },

  positionProjectionWeights: {
    GK: {
      saves:              20.0,  // avg 1.14 saves → 22.8 FP (primary GK stat)
      goals_conceded:     -6.0,  // avg 1.14 GA → -6.8 FP
      clearances:          4.0,  // bonus
      goals:              60.0,  // extremely rare — massive reward
      yellow_cards:       -5.0,
      red_cards:         -15.0,
    },
    DEF: {
      goals:              18.0,  // rare for DEF — heavily rewarded
      assists:             7.0,
      tackles:             5.0,  // avg 0.84 → 4.2 FP
      interceptions:       6.0,  // avg 0.66 → 4.0 FP
      clearances:          1.5,  // avg 2.96 → 4.4 FP (high volume, low weight)
      blocked_shots:       3.0,
      pressures:           0.4,  // avg 9.35 → 3.7 FP
      dribbles_completed:  2.0,
      shots_on_target:     2.0,
      key_passes:          3.0,
      yellow_cards:       -5.0,
      red_cards:         -15.0,
    },
    MID: {
      goals:              12.0,  // avg 0.10 → 1.2 FP
      assists:             8.0,  // avg 0.07 → 0.56 FP
      shots_on_target:     3.0,  // avg 0.57 → 1.7 FP
      key_passes:          5.0,  // avg 0.72 → 3.6 FP
      tackles:             4.0,  // avg 0.85 → 3.4 FP
      interceptions:       5.0,  // avg 0.56 → 2.8 FP
      clearances:          1.5,  // avg 1.08 → 1.6 FP
      pressures:           0.6,  // avg 14.51 → 8.7 FP (high volume)
      dribbles_completed:  2.0,  // avg 0.73 → 1.46 FP
      yellow_cards:       -5.0,
      red_cards:         -15.0,
    },
    FWD: {
      goals:              22.0,  // avg 0.24 → 5.3 FP (primary FWD stat)
      assists:             8.0,  // avg 0.10 → 0.8 FP
      shots_on_target:     4.0,  // avg 1.14 → 4.56 FP
      key_passes:          3.0,  // avg 0.91 → 2.73 FP
      dribbles_completed:  2.0,  // avg 1.22 → 2.44 FP
      pressures:           0.2,  // avg 13.7 → 2.74 FP
      tackles:             2.0,  // avg 0.53 → 1.06 FP
      yellow_cards:       -5.0,
      red_cards:         -15.0,
    },
  },


  // ── Position FP multipliers ───────────────────────────────────────────────
  // Normalizes raw FP output so top-tier players at every position produce
  // a comparable FP range. DEF/MID/FWD top games already land ~88–102 FP;
  // GK top games land ~22–24 FP because save weight (20) and conceded
  // penalty (-6) net out lower than outfield goal+assist+contribution
  // accumulation. Multiplier of 4.0 takes a 23 FP top-GK game to ~92 FP,
  // matching outfield top games. Badge bonuses are NOT scaled (applied
  // after in the resolve pipeline).
  positionMultipliers: {
    // GK 2.5× — calibrated against 2022-only pool simulation. Earlier
    // 4.0 over-corrected: GK p99 reached 280 FP vs outfield p99 ~65,
    // breaking per-anchor LEGEND-rate parity (only GK-anchored hands
    // could hit LEGEND). 2.5× brings GK averages comparable to outfield
    // (raw GK avg ~19 FP × 2.5 = 48; outfield avg ~17–21 FP) while
    // preserving the "GK has a path to LEGEND too" property.
    GK: 2.5,
  },

  // ── Active player pool ────────────────────────────────────────────────────
  // Source data ships 2018 + 2022 World Cup squads (1191 players, 3096
  // logs). At launch we ship 2022 only — most recent, brand-aligned with
  // WC '26, ~622 players, ~1648 logs. To add 2026 (when it ships): append
  // "2026". To add a "Vintage" 2018 event: ["2018"]. To open everything
  // (testing): ["2018", "2022"]. The 2018 data stays in the JSON files;
  // this list is the single switch that scopes which seasons are live.
  activeSeasons: ["2022"],

  // ── Tier thresholds (salary-based) ────────────────────────────────────────
  tierThresholds: [
    { tier: "ORANGE", minSalary: 52 },
    { tier: "PURPLE", minSalary: 40 },
    { tier: "BLUE",   minSalary: 28 },
    { tier: "GREEN",  minSalary: 16 },
    { tier: "WHITE",  minSalary: 0  },
  ],

  // ── Win tiers — calibrated against 10k-hand simulator on 2022 pool ──────
  // Pool: 622 players, 1623 logs (2022 WC squads only). GK 2.5× scaling.
  // Team FP distribution: P25=114, Median=140, P75=168, P90=199, P99=282.
  // Thresholds chosen to land at spec hit-rate targets:
  //   SUB     ~25% (≈ P75)
  //   STARTER ~12% (≈ P88)
  //   CAPTAIN ~5%  (≈ P95)
  //   MOTM    ~1.5% (≈ P98.5)
  //   LEGEND  ~0.3% (≈ P99.7)
  // Multipliers carry over from prior calibration round; re-tuned if EV
  // drifts outside TARGET ZONE (0.78–0.92).
  winTiers: [
    { name: "SUB",      minFp: 168, multiplier: 0.75, color: "#94A3B8" },
    { name: "STARTER",  minFp: 190, multiplier: 2,    color: "#10B981" },
    { name: "CAPTAIN",  minFp: 225, multiplier: 5,    color: "#3B82F6" },
    { name: "MOTM",     minFp: 265, multiplier: 12,   color: "#F59E0B" },
    { name: "LEGEND",   minFp: 310, multiplier: 75,   color: "#EF4444" },
  ],

  // ── Badges ────────────────────────────────────────────────────────────────
  // Suppression rules (only highest fires):
  //   FWD:  HAT_TRICK > BRACE > POACHER  (goal-based)
  //         CREATOR independent
  //         SHARP independent (no goals)
  //   MID:  MAESTRO > DYNAMO > PLAYMAKER (goal/assist/kp)
  //         BOX_TO_BOX independent
  //         PRESS_KING independent
  //   DEF:  STOPPER > GUARDIAN > BULLDOZER (defensive combo)
  //         OVERLAP independent
  //         CLEAN_SHEET independent
  //   GK:   WALL > KEEPER (save-based)
  //         CLEAN_SHEET independent
  badges: [

    // ── FWD ────────────────────────────────────────────────────────────────
    {
      id: "HAT_TRICK",
      position: "FWD",
      icon: "🎩",
      label: "HAT-TRICK",
      fp: 30,
      suppressedBy: [],
      suppresses: ["BRACE", "POACHER"],
      trigger: (s: Record<string, number>) => s.goals >= 3,
    },
    {
      id: "BRACE",
      position: "FWD",
      icon: "⚡",
      label: "BRACE",
      fp: 15,
      suppressedBy: ["HAT_TRICK"],
      suppresses: ["POACHER"],
      trigger: (s: Record<string, number>) => s.goals === 2,
    },
    {
      id: "POACHER",
      position: "FWD",
      icon: "🎯",
      label: "POACHER",
      fp: 15,
      suppressedBy: ["HAT_TRICK", "BRACE"],
      suppresses: [],
      trigger: (s: Record<string, number>) => s.goals >= 1 && s.assists >= 1,
    },
    {
      id: "CREATOR",
      position: "FWD",
      icon: "🪄",
      label: "CREATOR",
      fp: 18,
      suppressedBy: [],
      suppresses: [],
      trigger: (s: Record<string, number>) => s.assists >= 2,
    },
    {
      id: "SHARP",
      position: "FWD",
      icon: "🔫",
      label: "SHARP",
      fp: 8,
      suppressedBy: [],
      suppresses: [],
      trigger: (s: Record<string, number>) => s.shots_on_target >= 2 && s.goals === 0,
    },

    // ── MID ────────────────────────────────────────────────────────────────
    {
      id: "MAESTRO",
      position: "MID",
      icon: "🎼",
      label: "MAESTRO",
      fp: 20,
      suppressedBy: [],
      suppresses: ["DYNAMO", "PLAYMAKER"],
      trigger: (s: Record<string, number>) => s.goals >= 1 && s.key_passes >= 2,
    },
    {
      id: "DYNAMO",
      position: "MID",
      icon: "⚡",
      label: "DYNAMO",
      fp: 18,
      suppressedBy: ["MAESTRO"],
      suppresses: ["PLAYMAKER"],
      trigger: (s: Record<string, number>) => s.assists >= 2,
    },
    {
      id: "PLAYMAKER",
      position: "MID",
      icon: "🧠",
      label: "PLAYMAKER",
      fp: 12,
      suppressedBy: ["MAESTRO", "DYNAMO"],
      suppresses: [],
      trigger: (s: Record<string, number>) => s.key_passes >= 2,
    },
    {
      id: "BOX_TO_BOX",
      position: "MID",
      icon: "💪",
      label: "BOX-TO-BOX",
      fp: 10,
      suppressedBy: [],
      suppresses: [],
      trigger: (s: Record<string, number>) => s.tackles >= 1 && s.key_passes >= 1,
    },
    {
      id: "PRESS_KING",
      position: "MID",
      icon: "🔥",
      label: "PRESS KING",
      fp: 10,
      suppressedBy: [],
      suppresses: [],
      trigger: (s: Record<string, number>) => s.pressures >= 20,
    },

    // ── DEF ────────────────────────────────────────────────────────────────
    {
      id: "STOPPER",
      position: "DEF",
      icon: "🔒",
      label: "STOPPER",
      fp: 20,
      suppressedBy: [],
      suppresses: ["GUARDIAN", "BULLDOZER"],
      trigger: (s: Record<string, number>) => s.tackles >= 2 && s.interceptions >= 1 && s.clearances >= 2,
    },
    {
      id: "GUARDIAN",
      position: "DEF",
      icon: "🛡️",
      label: "GUARDIAN",
      fp: 15,
      suppressedBy: ["STOPPER"],
      suppresses: ["BULLDOZER"],
      trigger: (s: Record<string, number>) => s.tackles >= 2 && s.interceptions >= 2,
    },
    {
      id: "BULLDOZER",
      position: "DEF",
      icon: "🏗️",
      label: "BULLDOZER",
      fp: 12,
      suppressedBy: ["STOPPER", "GUARDIAN"],
      suppresses: [],
      trigger: (s: Record<string, number>) => s.clearances >= 6,
    },
    {
      id: "OVERLAP",
      position: "DEF",
      icon: "🚀",
      label: "OVERLAP",
      fp: 15,
      suppressedBy: [],
      suppresses: [],
      trigger: (s: Record<string, number>) => s.goals >= 1 || s.assists >= 1,
    },
    {
      id: "CLEAN_SHEET_DEF",
      position: "DEF",
      icon: "🧱",
      label: "CLEAN SHEET",
      fp: 10,
      suppressedBy: [],
      suppresses: [],
      trigger: (s: Record<string, number>) => s.goals_conceded === 0 && s.minutes_played >= 60,
    },

    // ── GK ─────────────────────────────────────────────────────────────────
    {
      id: "WALL",
      position: "GK",
      icon: "🧱",
      label: "THE WALL",
      fp: 10,
      suppressedBy: [],
      suppresses: ["KEEPER"],
      trigger: (s: Record<string, number>) => s.saves >= 3,
    },
    {
      id: "KEEPER",
      position: "GK",
      icon: "🧤",
      label: "KEEPER",
      fp: 5,
      suppressedBy: ["WALL"],
      suppresses: [],
      trigger: (s: Record<string, number>) => s.saves >= 1 && s.saves <= 2,
    },
    {
      id: "CLEAN_SHEET_GK",
      position: "GK",
      icon: "✨",
      label: "CLEAN SHEET",
      fp: 10,
      suppressedBy: [],
      suppresses: [],
      trigger: (s: Record<string, number>) => s.goals_conceded === 0 && s.minutes_played >= 60,
    },

    // ── Discipline (all positions, visual only) ────────────────────────────
    {
      id: "YELLOW",
      position: "ALL",
      icon: "🟨",
      label: "BOOKED",
      fp: 0,
      suppressedBy: [],
      suppresses: [],
      trigger: (s: Record<string, number>) => s.yellow_cards >= 1,
    },
    {
      id: "RED",
      position: "ALL",
      icon: "🟥",
      label: "SENT OFF",
      fp: 0,
      suppressedBy: [],
      suppresses: [],
      trigger: (s: Record<string, number>) => s.red_cards >= 1,
    },
  ],

  // ── Stat display (card back, position-specific) ───────────────────────────
  statDisplay: {
    GK: [
      { key: "saves",          label: "SV"  },
      { key: "goals_conceded", label: "GC"  },
      { key: "clearances",     label: "CLR" },
      { key: "minutes_played", label: "MIN" },
    ],
    DEF: [
      { key: "goals",          label: "G"   },
      { key: "assists",        label: "A"   },
      { key: "tackles",        label: "TKL" },
      { key: "interceptions",  label: "INT" },
      { key: "clearances",     label: "CLR" },
    ],
    MID: [
      { key: "goals",          label: "G"   },
      { key: "assists",        label: "A"   },
      { key: "key_passes",     label: "KP"  },
      { key: "tackles",        label: "TKL" },
      { key: "pressures",      label: "PRS" },
    ],
    FWD: [
      { key: "goals",          label: "G"   },
      { key: "assists",        label: "A"   },
      { key: "shots_on_target",label: "SOT" },
      { key: "key_passes",     label: "KP"  },
      { key: "dribbles_completed", label: "DRB" },
    ],
    default: [
      { key: "goals",          label: "G"   },
      { key: "assists",        label: "A"   },
      { key: "minutes_played", label: "MIN" },
    ],
  },

  // ── Headshots ─────────────────────────────────────────────────────────────
  // Resolves to the API-Football CDN when the player has an apiFootballId
  // in football/src/data/playerImageManifest.ts. Unmanifested players
  // return null → SoccerCard's FootballHero renders flag + last-name
  // initials as the fallback.
  //
  // The full resolver (with confidence/source metadata) is called directly
  // by SoccerCard for richer rendering decisions; this slot is the minimal
  // string-or-null contract preserved for legacy consumers.
  headshotUrl: (playerId: string) => {
    // Inline import-style call — `import` is a top-level keyword so we use
    // require-style dynamic resolution. Football's bundler handles both.
    // (Use lazy resolution to avoid a top-level import cycle with the
    // adapter; manifest only ever has plain data, no circular refs.)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getExternalIds } = require("../data/playerImageManifest");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resolvePlayerImage } = require("@shared/media/playerImages");
      const externalIds = getExternalIds(playerId);
      if (!externalIds) return null;
      const result = resolvePlayerImage({ sport: "football", playerId, externalIds });
      return result.confidence === "fallback" ? null : result.src;
    } catch {
      return null;
    }
  },
};