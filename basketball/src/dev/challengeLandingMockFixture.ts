// basketball/src/dev/challengeLandingMockFixture.ts
//
// Phase 2b dev fixtures for the localhost visual loop on the V2
// challenge landing. Five trigger cases + a legacy (holdsRecorded:false)
// variant for the graceful-degrade check. Shape matches what the
// /api/challenge/[id] endpoint returns post-Phase-0 enrichment, so the
// component renders against the same data the real fetch would
// produce — no path divergence.
//
// Used by /basketball/dev/challenge-landing-mock?case=<key>. DEV-only;
// gated by `import.meta.env.DEV` at the route mount site so prod builds
// dead-code-eliminate the whole tree.

import type { ChallengeLandingData } from "@shared/components/ChallengeTakeCardLanding";

// ── Roster snapshot shape (Phase 0 enriched) ───────────────────────────
// Six basketball cards per fixture; held subset determined per case.
// slotIndex preserved so the rendered grid matches the sender's order.

interface SnapshotCard {
  id: string;
  basePlayerId: string;
  personKey: string;
  cardId: string;
  name: string;
  team: string;
  season: string;
  position: string;
  photoCode: string | null;
  salary: number;
  tier: string;
  slotIndex: number;
  projectedFp: number;
  wasHeld: boolean;
  actualFp: number;
}

function card(
  basePlayerId: string,
  name: string,
  team: string,
  tier: string,
  salary: number,
  slotIndex: number,
  projectedFp: number,
  wasHeld: boolean,
  actualFp: number,
): SnapshotCard {
  return {
    id: basePlayerId,
    basePlayerId,
    personKey: basePlayerId,
    cardId: `${basePlayerId}_c`,
    name,
    team,
    season: "2425",
    position: "F",
    photoCode: null,
    salary,
    tier,
    slotIndex,
    projectedFp,
    wasHeld,
    actualFp,
  };
}

// Canonical six-card lineup. Tiers picked to exercise the full accent
// palette (RED / ORANGE / PURPLE / BLUE / GREEN / WHITE) so visual
// iteration covers every card-color state in one frame.
function baseSix(args: {
  heldPair?: [string, string] | null; // basePlayerIds to mark wasHeld
  heldOutcomes?: Record<string, number>; // basePlayerId → actualFp for held cards
}): SnapshotCard[] {
  const heldIds = new Set(args.heldPair ?? []);
  const fp = args.heldOutcomes ?? {};
  return [
    card("emb",  "Embiid",   "PHI", "RED",    80, 0, 50, heldIds.has("emb"),  fp.emb  ?? 0),
    card("voo",  "Vucevic",  "ORL", "PURPLE", 65, 1, 35, heldIds.has("voo"),  fp.voo  ?? 0),
    card("bro",  "Brown",    "BOS", "PURPLE", 55, 2, 30, heldIds.has("bro"),  fp.bro  ?? 0),
    card("cur",  "Curry",    "GSW", "RED",    75, 3, 42, heldIds.has("cur"),  fp.cur  ?? 0),
    card("bag",  "Bagley",   "WAS", "BLUE",   35, 4, 18, heldIds.has("bag"),  fp.bag  ?? 0),
    card("hol",  "Holiday",  "BOS", "GREEN",  25, 5, 14, heldIds.has("hol"),  fp.hol  ?? 0),
  ];
}

function rosterSnapshot(cards: SnapshotCard[], holdsRecorded: boolean): Record<string, unknown> {
  return {
    v: 1,
    sport: "basketball",
    holdsRecorded,
    cards,
  };
}

// ── Fixture cases ──────────────────────────────────────────────────────

export type LandingMockCase =
  | "choke"
  | "choke_anchor_tanked"
  | "choke_culture_rich"
  | "choke_generic_no_culture"
  | "miss"
  | "big_score"
  | "rare_pull"
  | "default"
  | "legacy_choke";

interface LandingMockFixture {
  /** ChallengeData shape, ready to pass into ChallengeTakeCardLanding's
   *  `data` prop. */
  data: ChallengeLandingData;
  /** Tiny stats line — passed through the prop so the visual matches
   *  the shell's composed-stats output. */
  statsLine: string | null;
  alreadyAttempted: boolean;
}

const baseAttribution = {
  challenger_name: "Mike",
  sport: "basketball",
  season: "2425",
  share_headline: "",
  roster_size: 6,
  best_user_name: null,
  attempt_count: 2,
  winner_count: 0,
  best_score: null,
};

export const LANDING_MOCK_FIXTURES: Record<LandingMockCase, LandingMockFixture> = {
  // Choke — ANCHOR DELIVERED case (Phase 2d anchor-vindicated path).
  // Embiid is the anchor; he showed up (47/50 = 0.94 ratio, DELIVERED);
  // Vucevic tanked (17/35 = 0.49 ratio, TANKED). The take should read
  // "EMBIID WASN'T THE PROBLEM" / "DON'T BLAME EMBIID" / etc. — the
  // anchor-vindicated bank. Plain stakes: target 142.0 < 173 → BUSTED.
  // Evidence line: just "BUSTED." (take already names anchor, no fuse).
  choke: {
    data: {
      challenge_id: "ch_mock_choke",
      created_by: "u_mike",
      ...baseAttribution,
      target_score: 142.0,
      trigger_type: "choke",
      initial_roster: rosterSnapshot(
        baseSix({
          heldPair: ["emb", "voo"],
          heldOutcomes: { emb: 47.0, voo: 17.0 },
        }),
        true,
      ),
      anchor_base_player_id: "emb",
      near_miss_gap: null,
      near_miss_next_tier: null,
      top_game_tier: null,
    },
    statsLine: "Unbeaten so far · 2 attempts",
    alreadyAttempted: false,
  },

  // Choke — ANCHOR TANKED case (Phase 2d anchor-blamed path). Embiid
  // is the anchor; he tanked (18/50 = 0.36 ratio, TANKED). The take
  // should read "EVEN EMBIID COULDN'T SAVE IT" / etc. — the
  // anchor-blamed bank. Same target → BUSTED stakes.
  choke_anchor_tanked: {
    data: {
      challenge_id: "ch_mock_choke_anchor_tanked",
      created_by: "u_mike",
      ...baseAttribution,
      target_score: 142.0,
      trigger_type: "choke",
      initial_roster: rosterSnapshot(
        baseSix({
          heldPair: ["emb", "voo"],
          heldOutcomes: { emb: 18.0, voo: 24.0 },
        }),
        true,
      ),
      anchor_base_player_id: "emb",
      near_miss_gap: null,
      near_miss_next_tier: null,
      top_game_tier: null,
    },
    statsLine: "Unbeaten so far · 2 attempts",
    alreadyAttempted: false,
  },

  // Phase 2e — CULTURE-RICH anchor. Uses Kobe Bryant's REAL basePlayerId
  // (977 → key bryant_977) so the landing's lookupCulture call hits the
  // basketball culture DB and returns Kobe's culture with iconic
  // nicknames ["Black Mamba", "Mamba", "Vino", "KB24", "Mamba Mentality"].
  // Anchor = Kobe (DELIVERED, 47/50 = 0.94); other held = Kidd (TANKED,
  // 13/35 = 0.37) → anchor-vindicated. With a nickname available, the
  // generator routes to TAKES_CHOKE_CULTURE_VINDICATED → "MAMBA DID HIS
  // PART" / "DON'T BLAME BLACK MAMBA" / etc.
  choke_culture_rich: {
    data: {
      challenge_id: "ch_mock_choke_culture_rich",
      created_by: "u_mike",
      ...baseAttribution,
      target_score: 142.0,
      trigger_type: "choke",
      initial_roster: rosterSnapshot(
        [
          // Slot 0 — Kobe (RED, the anchor, DELIVERED)
          {
            id: "kobe", basePlayerId: "977", personKey: "977", cardId: "kobe_c",
            name: "Kobe Bryant", team: "LAL", season: "2425", position: "G",
            photoCode: null, salary: 95, tier: "RED", slotIndex: 0,
            projectedFp: 50, wasHeld: true, actualFp: 47.0,
          },
          // Slot 1 — Kidd (RED, held, TANKED — the "other" indicted)
          {
            id: "kidd", basePlayerId: "467", personKey: "467", cardId: "kidd_c",
            name: "Jason Kidd", team: "DAL", season: "2425", position: "G",
            photoCode: null, salary: 60, tier: "RED", slotIndex: 1,
            projectedFp: 35, wasHeld: true, actualFp: 13.0,
          },
          // Discards — use the other base-six entries verbatim
          ...baseSix({}).slice(2),
        ],
        true,
      ),
      anchor_base_player_id: "977",
      near_miss_gap: null,
      near_miss_next_tier: null,
      top_game_tier: null,
    },
    statsLine: "Unbeaten so far · 2 attempts",
    alreadyAttempted: false,
  },

  // Phase 2e — GENERIC anchor, NO culture. Synthetic IDs (no DB match)
  // + MID-zone ratios (both held in [0.60, 0.90), neither delivered nor
  // tanked) → anchor-truth = generic → take = "THESE CARDS SHOULD NOT
  // HAVE LOST" + evidence = "HELD THE STARS. BUSTED." This is the path
  // where the bare-stakes form would read flat; the conditional prefix
  // earns its keep here. The user's explicit screenshot ask.
  choke_generic_no_culture: {
    data: {
      challenge_id: "ch_mock_choke_generic",
      created_by: "u_mike",
      ...baseAttribution,
      target_score: 142.0,
      trigger_type: "choke",
      initial_roster: rosterSnapshot(
        baseSix({
          heldPair: ["emb", "voo"],
          heldOutcomes: { emb: 38.0, voo: 26.0 }, // 0.76 MID, 0.74 MID
        }),
        true,
      ),
      anchor_base_player_id: "emb",
      near_miss_gap: null,
      near_miss_next_tier: null,
      top_game_tier: null,
    },
    statsLine: "Unbeaten so far · 2 attempts",
    alreadyAttempted: false,
  },

  // Miss — sender hit STARTER, 7 FP short of ALL-STAR. Tatum was the
  // anchor (highest-actualFp held). Tier-prefixed MISS stamp.
  miss: {
    data: {
      challenge_id: "ch_mock_miss",
      created_by: "u_mike",
      ...baseAttribution,
      target_score: 218.0,
      trigger_type: "miss",
      initial_roster: rosterSnapshot(
        baseSix({
          heldPair: ["bro", "cur"],
          heldOutcomes: { bro: 38.5, cur: 51.0 },
        }),
        true,
      ),
      anchor_base_player_id: "cur",
      near_miss_gap: 7,
      near_miss_next_tier: "ALL_STAR",
      top_game_tier: null,
    },
    statsLine: "1 attempt · still unbeaten",
    alreadyAttempted: false,
  },

  // Big score — sender cleared ALL_STAR clean. Curry led; full lineup
  // hit. Held subset is the credit-take. Renders the BIG SCORE pill.
  big_score: {
    data: {
      challenge_id: "ch_mock_big_score",
      created_by: "u_mike",
      ...baseAttribution,
      target_score: 232.5,
      trigger_type: "big_score",
      initial_roster: rosterSnapshot(
        baseSix({
          heldPair: ["cur", "emb"],
          heldOutcomes: { cur: 58.5, emb: 48.0 },
        }),
        true,
      ),
      anchor_base_player_id: "cur",
      near_miss_gap: null,
      near_miss_next_tier: null,
      top_game_tier: null,
    },
    statsLine: null,
    alreadyAttempted: false,
  },

  // Rare pull — sender caught Wembanyama (record game). Renders the
  // RECORD pill via data.top_game_tier="record". (Wemby substituted in
  // for Embiid on this fixture so the rare_pull narrative names him.)
  rare_pull: {
    data: {
      challenge_id: "ch_mock_rare_pull",
      created_by: "u_mike",
      ...baseAttribution,
      target_score: 268.0,
      trigger_type: "rare_pull",
      initial_roster: rosterSnapshot(
        (() => {
          const cards = baseSix({
            heldPair: ["emb", "cur"],
            heldOutcomes: { emb: 78.5, cur: 50.0 },
          });
          // Rebrand slot 0 to Wembanyama for the rare_pull narrative.
          cards[0] = {
            ...cards[0],
            basePlayerId: "wem",
            id: "wem",
            personKey: "wem",
            cardId: "wem_c",
            name: "Wembanyama",
            team: "SAS",
            tier: "RED",
            salary: 85,
            actualFp: 78.5,
          };
          return cards;
        })(),
        true,
      ),
      anchor_base_player_id: "wem",
      near_miss_gap: null,
      near_miss_next_tier: null,
      top_game_tier: "record",
    },
    statsLine: null,
    alreadyAttempted: false,
  },

  // Default — comfortable STARTER, no notable trigger. No stamp,
  // no pill, neutral disagreement copy. The "everything else" path.
  default: {
    data: {
      challenge_id: "ch_mock_default",
      created_by: "u_mike",
      ...baseAttribution,
      target_score: 184.5,
      trigger_type: "default",
      initial_roster: rosterSnapshot(
        baseSix({
          heldPair: ["bro", "hol"],
          heldOutcomes: { bro: 28.0, hol: 16.5 },
        }),
        true,
      ),
      anchor_base_player_id: null,
      near_miss_gap: null,
      near_miss_next_tier: null,
      top_game_tier: null,
    },
    statsLine: null,
    alreadyAttempted: false,
  },

  // Legacy choke — pre-Phase-0 row, holdsRecorded:false. No held cards,
  // no chips, no anchor name leak. Six plain cards. Graceful-degrade
  // proof: the take card generator falls back to the no-anchor /
  // no-holds choke disagreement, and the component renders 6 plain
  // cards. The hook + outcome still read as choke; the disagreement
  // skips named players (the "Same hand, same trap" frame).
  legacy_choke: {
    data: {
      challenge_id: "ch_mock_legacy_choke",
      created_by: "u_mike",
      ...baseAttribution,
      target_score: 142.0,
      // Wire: a real legacy row stores trigger_type:"bad_beat" — the
      // shell's normalizeTriggerType aliases it to "choke" so the
      // landing renders the new vocabulary. Pin that path through the
      // fixture so the mock route exercises the alias too.
      trigger_type: "bad_beat",
      initial_roster: rosterSnapshot(
        // All wasHeld:false on a legacy row. Even if anchor_base_player_id
        // is null (pre-Phase-5c-S1), the generator's no-anchor route
        // fires and the rendered output is the holds-agnostic frame.
        baseSix({ heldPair: null }),
        false,
      ),
      anchor_base_player_id: null,
      near_miss_gap: null,
      near_miss_next_tier: null,
      top_game_tier: null,
    },
    statsLine: "3 attempts · 67% failed",
    alreadyAttempted: false,
  },
};

export function getMockCaseFromUrl(): LandingMockCase {
  if (typeof window === "undefined") return "choke";
  const sp = new URLSearchParams(window.location.search);
  const raw = (sp.get("case") ?? "choke") as LandingMockCase;
  return (raw in LANDING_MOCK_FIXTURES) ? raw : "choke";
}
