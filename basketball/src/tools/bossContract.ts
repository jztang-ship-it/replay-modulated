/**
 * bossContract.ts — the consumable BOSS OUTPUT CONTRACT (definition only).
 *
 * This is the boundary the (undesigned, out-of-scope) social rails consume. It is
 * NOT a consumer. It defines three shapes + the reference materializers, and maps
 * the daily instance onto the EXISTING challenge receive path (shared_challenges →
 * /api/challenge/[id] → ChallengeLandingScreen) with a non-human sender — no
 * parallel path. See docs/boss-contract-v1.md.
 *
 * Design (per the contract decisions):
 *  (1) BossIdentity (immutable) is split from BossDailyInstanceSeed (date+slot key).
 *  (2) The instance projects to a challenge with a non-human sender, mirroring the
 *      existing challenge/isRealName receive path (challenger_name = boss name +
 *      sender_kind="boss"); isRealName stays the PLAYER-name gate, untouched.
 *  (3) The instance persists SEED+PARAMS for deterministic regeneration — NOT the
 *      rolled blob. The sender-facing fields are DERIVED on demand via the generator.
 *  (4) Each instance stamps the bank version it was produced against.
 *  (5) The sender-facing projection exposes ONLY: presented five, total-to-beat,
 *      name/flavor, tough-day flag. No rejection/ceiling/floor/band/attempt internals.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { rollBoss, K, P_LO, P_HI, type Boss, type RollMode } from "./bossGenerator";
import { REPO } from "./bossData";

export const BOSS_CONTRACT_VERSION = "boss-contract-v1";

// ── (1) Immutable boss identity (stable across days; changes only with the bank). ──
export type BossPresentedStarter = { name: string; pos: string }; // identity only — no FP here
export type BossIdentity = {
  identityId: string;        // e.g. "BOS-2324" (bank id)
  seasonCode: string;        // "2324"
  teamCode: string;          // "BOS"
  eraId: string;             // scheduling anti-repeat unit
  tier: "champ" | "iconic";  // recognizability/eligibility axis
  display: string;           // authored name ("Banner 18")
  flavor: string;            // authored one-liner
  starters: BossPresentedStarter[]; // the nominal five (identity), display labels
  bankVersion: string;       // (4) which bank produced this identity
};

// ── (1)+(3) Date+slot-keyed daily instance — SEED ONLY, regenerable, no blob. ──
export type BossDailyInstanceSeed = {
  instanceId: string;        // `${date}|${slot}|${identityId}` — the daily key
  identityId: string;        // → BossIdentity
  date: string;              // ISO yyyy-mm-dd (seed input)
  slot: number;              // seed input (v1: 0)
  bankVersion: string;       // (4) regenerate against the SAME bank
  // seed params — everything needed to deterministically re-roll. NOT the result.
  seedParams: { mode: RollMode; band: [number, number]; k: number; pLo: number; pHi: number };
  route: "daily" | "raid";   // instance category (internal/scheduling — NOT sender-facing)
};

// ── (5) Sender-facing projection — the ONLY fields a consumer may read. ──────────
export type BossSenderFacing = {
  sender: { kind: "boss"; name: string; flavor: string }; // (2) non-human sender
  totalToBeat: number;                                     // the score to beat
  presentedFive: { name: string; pos: string; fp: number }[]; // the rolled five (no game index)
  toughDay: boolean;                                       // headliner couldn't hit band this day
  // NOTHING ELSE. No attempts/K/band/ceiling/floor/rejection/dailyHit/raidHit/route.
};

// ── Materializers (reference; pure, deterministic). ───────────────────────────
export function loadBankVersion(): string {
  const bank = JSON.parse(fs.readFileSync(path.resolve(REPO, "docs/boss-bank-v1.json"), "utf8"));
  return String(bank?._meta?.version ?? "unknown");
}

/** Extract the immutable identity from a bank Boss (drops the per-game pools). */
export function materializeIdentity(boss: Boss, bankVersion: string): BossIdentity {
  return {
    identityId: boss.key, seasonCode: boss.season, teamCode: boss.team,
    eraId: boss.era_id, tier: boss.tier as "champ" | "iconic",
    display: boss.display, flavor: boss.flavor,
    starters: boss.starters.map(s => ({ name: s.name, pos: s.pos })),
    bankVersion,
  };
}

/** Build the date+slot daily instance SEED (no rolled blob). */
export function dailyInstanceSeed(
  identityId: string, date: string, slot: number, mode: RollMode,
  band: [number, number], bankVersion: string, route: "daily" | "raid",
): BossDailyInstanceSeed {
  return {
    instanceId: `${date}|${slot}|${identityId}`, identityId, date, slot, bankVersion,
    seedParams: { mode, band, k: K, pLo: P_LO, pHi: P_HI }, route,
  };
}

/**
 * (3)+(5) Regenerate the sender-facing projection from (boss, seed) — the rolled
 * result is DERIVED here, never stored. Exposes only the allowed fields; every
 * generator internal (attempts, K, band, ceiling, floor, rejection, hit-rates,
 * per-game index, route) is dropped at this boundary.
 */
export function projectSenderFacing(boss: Boss, seed: BossDailyInstanceSeed): BossSenderFacing {
  const roll = rollBoss(boss, seed.date, seed.slot, seed.seedParams.mode, seed.seedParams.band, seed.seedParams.k);
  return {
    sender: { kind: "boss", name: boss.display, flavor: boss.flavor },
    totalToBeat: Math.round(roll.total * 10) / 10,
    presentedFive: roll.picks.map(p => ({ name: p.name, pos: p.pos, fp: Math.round(p.fp * 10) / 10 })),
    toughDay: roll.status === "tough_day",
  };
}

/**
 * (2) Map the sender-facing projection onto the EXISTING challenge receive shape
 * (shared_challenges columns), with a non-human sender. Reuses the player receive
 * path verbatim — challenger_name carries the boss name; sender_kind="boss" is the
 * ONLY added marker so the landing presents it as a boss (authored identity), and
 * isRealName stays the untouched player-name gate. initial_roster mirrors the
 * player snapshot shape ({ cards: [...] }). Documents the integration; does not
 * write to the DB (that is the social-rail consumer's job, out of scope).
 */
export function toSharedChallengeRow(
  proj: BossSenderFacing, instance: BossDailyInstanceSeed, identity: BossIdentity, sport: string,
): Record<string, unknown> {
  return {
    challenge_id: instance.instanceId,
    sender_kind: "boss",                    // NEW marker (default 'player' for human challenges)
    challenger_name: proj.sender.name,      // existing column — boss display
    share_headline: proj.sender.flavor,     // existing column — boss flavor
    target_fp: proj.totalToBeat,            // existing column — total to beat
    initial_roster: { cards: proj.presentedFive }, // existing snapshot shape
    sport,
    season: identity.seasonCode,
    trigger_type: "boss",                   // existing column — boss vs player triggers
    // boss-instance provenance (regeneration + audit; not sender-facing UI)
    boss_identity_id: identity.identityId,
    boss_bank_version: instance.bankVersion,
    tough_day: proj.toughDay,
  };
}
