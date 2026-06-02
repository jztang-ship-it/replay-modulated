// shared/components/ChallengeTakeCardLanding.tsx
//
// Phase 2b — the V2 recipient-facing challenge landing's presentational
// layer. Lock: docs/challenge-landing-v2-phase2b-landing-component-lock.md.
//
// Architecture: pure presentation. The shell (`ChallengeLandingScreen`)
// owns fetch / self-match routing / error / loading / onAccept wiring;
// this component receives already-fetched + deserialized data and
// renders the V2 hierarchy. Phase-0 enrichment is read off the raw
// snapshot (which carries `wasHeld` + `actualFp` per card + the
// top-level `holdsRecorded` flag); deserialization is the shell's job
// at accept time, not here.
//
// V2 hierarchy (top to bottom):
//   HOOK           — hookHeadline, the largest type, the provocation
//   STARTING HAND  — 6 cards as evidence; held cards visually prominent
//                    + inline actualFp chip; discards plain (NO "0")
//   STAMP + OUTCOME — TeamStamp adjacent to outcomeLine + score (so the
//                    2a "the stamp earned itself" copy works); score is
//                    legible but NOT the hero
//   DISAGREEMENT   — disagreementLine, room around it; this is where
//                    acceptance happens
//   CTA            — the "PLAY YOUR LINE" family button
//   Attribution    — "from {name}" + tiny stats below CTA
//
// The current screen's giant 68px-FP top-of-page treatment is the
// anti-pattern this component replaces.

import { TeamStamp } from "./TeamStamp";
import { generateChallengeTakeCard } from "@shared/challengeTakeCard/generateChallengeTakeCard";
import type { TakeCardInput, TakeCardTrigger } from "@shared/challengeTakeCard/types";
import { normalizeTriggerType } from "@shared/adapters/challengeTypes";
import { isRealName } from "@shared/utils/isRealName";

// ── Data shape coming in from the shell ────────────────────────────────
// Matches the existing `ChallengeData` interface in ChallengeLandingScreen
// 1:1 — typed locally to avoid an export gymnastics roundtrip on a type
// the shell already defines and that the component should be able to
// render in isolation (a dev mock route mounts this with fixture data).

export interface ChallengeLandingData {
  challenge_id: string;
  created_by: string | null;
  challenger_name: string;
  target_score: number;
  sport: string;
  season: string;
  trigger_type: string;
  share_headline: string;
  initial_roster: Record<string, unknown>;
  roster_size: number;
  attempt_count: number;
  winner_count: number;
  best_score: number | null;
  best_user_name: string | null;
  near_miss_gap?: number | null;
  near_miss_next_tier?: string | null;
  anchor_base_player_id?: string | null;
  top_game_tier?: "record" | "career" | "season" | null;
}

interface Props {
  data: ChallengeLandingData;
  /** Tiny stats line composed by the shell (`challengeStatsLine`). */
  statsLine: string | null;
  /** Localstorage hint from the shell — relabels the CTA "Play Again"
   *  when set. Replays are unlimited; this is just clarity. */
  alreadyAttempted: boolean;
  /** Wires to the shell's existing handleAccept. */
  onAccept: () => void;
}

// ── Roster snapshot shape (Phase 0 enrichment fields) ──────────────────
// The serializer writes these per-card; the deserializer in production
// fills defaults on legacy rows. Reading the raw snapshot here matches
// the shell's existing approach (it already grabs `initial_roster.cards`
// untyped for the existing card grid) and lets the component compute
// `heldCards` + `anchorName` without going through deserializeRoster
// (which is the shell's responsibility at accept time).

interface SnapshotCard {
  basePlayerId: string;
  name: string;
  team: string;
  tier: string;
  salary: number;
  slotIndex?: number;
  wasHeld?: boolean;
  actualFp?: number;
}

interface RosterSnapshot {
  cards?: SnapshotCard[];
  holdsRecorded?: boolean;
}

// ── Tier visuals ──────────────────────────────────────────────────────

const TIER_ACCENT: Record<string, string> = {
  RED: "#EF4444", ORANGE: "#FB923C", PURPLE: "#C084FC",
  BLUE: "#3B82F6", GREEN: "#22C55E", WHITE: "#9CA3AF",
};

// rare_pull sub-tier labels (from data.top_game_tier — Phase 5c S1).
// Used for the BIG-SCORE / RARE-PULL pill (these triggers have no
// TeamStamp variant on main; recon-3 option (a) — see the lock).
const RARE_PULL_TIER_LABEL: Record<string, string> = {
  record: "NEW RECORD",
  career: "CAREER HIGH",
  season: "SEASON HIGH",
};

function pillLabelForTrigger(trigger: TakeCardTrigger, topGameTier: string | null | undefined): string | null {
  if (trigger === "big_score") return "BIG SCORE";
  if (trigger === "rare_pull") return topGameTier ? (RARE_PULL_TIER_LABEL[topGameTier] ?? "RARE PULL") : "RARE PULL";
  return null; // choke/miss render TeamStamp; default renders nothing.
}

// ── The component ─────────────────────────────────────────────────────

export function ChallengeTakeCardLanding({ data, statsLine, alreadyAttempted, onAccept }: Props) {
  const trigger = normalizeTriggerType(data.trigger_type) ?? "default";
  const snapshot = (data.initial_roster ?? {}) as RosterSnapshot;
  const cards: SnapshotCard[] = snapshot.cards ?? [];
  const holdsRecorded = snapshot.holdsRecorded === true;
  const namedChallenger = isRealName(data.challenger_name);

  // anchorName lookup — the lock's confirmed pattern. Mirrors
  // H2HRecipientPlay.tsx:390-396's selectIntroAnchor. Null when
  // anchor_base_player_id is missing (legacy/default) or doesn't
  // resolve in the roster.
  const anchorName = data.anchor_base_player_id
    ? (cards.find(c => c.basePlayerId === data.anchor_base_player_id)?.name ?? null)
    : null;

  // heldCards for the take-card generator. Only meaningful when
  // holdsRecorded is true; pre-Phase-0 snapshots set every card to
  // wasHeld:false and the generator's no-anchor path takes over.
  const heldCards = holdsRecorded
    ? cards
        .filter(c => c.wasHeld === true)
        .map(c => ({ name: c.name, actualFp: c.actualFp ?? 0, tier: c.tier }))
    : [];

  // The take card (deterministic — same challengeId → same output on
  // refresh, OG image, etc.).
  const takeCardInput: TakeCardInput = {
    trigger: trigger as TakeCardTrigger,
    challengerName: namedChallenger ? data.challenger_name : null,
    targetScore: data.target_score,
    // generateChallengeTakeCard doesn't substitute {winTier} anywhere
    // today (recon #2); pass a safe placeholder. If a future bank
    // line adds it, the App mount site will need to thread winTiersMap
    // down to derive it from target_score — flagged in the lock.
    winTier: "",
    holdsRecorded,
    heldCards,
    anchorName,
    nearMissGap: data.near_miss_gap ?? null,
    nearMissNextTier: data.near_miss_next_tier ?? null,
    challengeId: data.challenge_id,
  };
  const takeCard = generateChallengeTakeCard(takeCardInput);

  // Stamp placement: choke / miss get the Phase-1 TeamStamp (no thud
  // entrance on a cold landing — leans subtle per the lock's "DECISION
  // NEEDED" note; pass delayMs=0 and let the stamp render statically).
  // big_score / rare_pull get a CSS pill; default → no badge.
  const pillLabel = pillLabelForTrigger(trigger as TakeCardTrigger, data.top_game_tier ?? null);

  return (
    <div data-testid="challenge-take-card-landing">
      {/* HOOK — top textual element, the largest type. Lock §
          "Component spec → Hook." This is where the user lands. */}
      <h1
        data-testid="hook-headline"
        style={{
          fontSize: 26,
          lineHeight: 1.22,
          fontWeight: 900,
          color: "#EAF0FF",
          margin: "8px 0 22px",
          maxWidth: 560,
        }}
      >
        {takeCard.hookHeadline}
      </h1>

      {/* STARTING HAND — the hero visual. Held cards bright + chip;
          discards dim + no chip. holdsRecorded:false → 6 plain cards
          (lock §2 graceful degrade). slotIndex order preserved so the
          recipient sees the sender's hand the same way the sender did. */}
      <div
        data-testid="starting-hand"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 22,
          justifyContent: "center",
        }}
      >
        {cards.map((card, i) => {
          const accent = TIER_ACCENT[card.tier] ?? "#9CA3AF";
          const isHeld = holdsRecorded && card.wasHeld === true;
          return (
            <div
              key={card.basePlayerId ?? i}
              data-testid={isHeld ? "hand-card-held" : "hand-card-plain"}
              data-was-held={isHeld ? "true" : "false"}
              style={{
                position: "relative",
                background: isHeld
                  ? `${accent}22` // ~13% tier-accent fill on held
                  : "rgba(255,255,255,0.03)",
                border: isHeld ? `2px solid ${accent}` : `1px solid ${accent}55`,
                borderRadius: 10,
                padding: "10px 12px",
                minWidth: 108,
                flex: "0 1 auto",
                textAlign: "center",
                opacity: isHeld ? 1 : 0.55,
                // Subtle held-only lift so the prominence reads at a glance.
                boxShadow: isHeld ? `0 1px 0 ${accent}33 inset, 0 4px 10px rgba(0,0,0,0.25)` : "none",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 1.4,
                  color: accent,
                  textTransform: "uppercase",
                  marginBottom: 4,
                  opacity: isHeld ? 1 : 0.7,
                }}
              >
                {card.tier}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#EAF0FF",
                  lineHeight: 1.15,
                }}
              >
                {card.name}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.4)",
                  marginTop: 2,
                }}
              >
                {card.team} · ${card.salary}
              </div>

              {/* Inline actualFp chip — held cards only. Never renders
                  "0" on a discard (discards have actualFp:0 because they
                  were never played; rendering the chip with "0" would
                  read as "this card scored zero" — the lock-§ component-
                  spec rule). Rounded integer to keep the chip tight at
                  phone widths. */}
              {isHeld && (
                <div
                  data-testid="held-actualfp-chip"
                  style={{
                    position: "absolute",
                    top: -8,
                    right: -6,
                    background: accent,
                    color: "#070A12",
                    borderRadius: 999,
                    padding: "2px 7px",
                    fontSize: 11,
                    fontWeight: 900,
                    lineHeight: 1.2,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                    minWidth: 26,
                  }}
                >
                  {Math.round(card.actualFp ?? 0)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* STAMP + OUTCOME row — the stamp sits adjacent to the outcome
          line so the 2a copy reference ("the stamp earned itself")
          works. Score visible but subordinate: smaller than hook,
          aligned to the outcome line as a trailing chip. The lock
          forbids reintroducing the 68px top-of-page score treatment. */}
      <div
        data-testid="outcome-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        {/* Badge / stamp slot — choke + miss use TeamStamp; big_score /
            rare_pull use a CSS pill (no TeamStamp variant for those
            triggers on main per recon #3). delayMs=0 → no thud
            entrance on cold landing (lock §). */}
        {(trigger === "choke" || trigger === "miss") && (
          <span data-testid="team-stamp" style={{ display: "inline-block" }}>
            <TeamStamp
              kind={trigger}
              missTier={trigger === "miss" ? (data.near_miss_next_tier ?? "") : undefined}
              delayMs={0}
            />
          </span>
        )}
        {pillLabel && (
          <span
            data-testid="trigger-pill"
            style={{
              display: "inline-block",
              padding: "5px 10px",
              borderRadius: 4,
              background: trigger === "rare_pull"
                ? "linear-gradient(135deg, #7FFF00 0%, #5BBE00 100%)"
                : "linear-gradient(135deg, #FFB14A 0%, #F59E0B 100%)",
              color: "#070A12",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              fontFamily: "'Rajdhani','Oswald','Arial Narrow',sans-serif",
              boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
            }}
          >
            {pillLabel}
          </span>
        )}
        <span
          data-testid="outcome-line"
          style={{
            fontSize: 14,
            color: "rgba(234,240,255,0.85)",
            lineHeight: 1.4,
            flex: "1 1 200px",
          }}
        >
          {takeCard.outcomeLine}
        </span>
      </div>

      {/* DISAGREEMENT — the acceptance moment. Roomy spacing; sits
          between the hand evidence above and the CTA below. */}
      <div
        data-testid="disagreement-line"
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "#EAF0FF",
          lineHeight: 1.4,
          marginBottom: 24,
          maxWidth: 560,
        }}
      >
        {takeCard.disagreementLine}
      </div>

      {/* CTA — the take card's ctaText (from the "PLAY YOUR LINE"
          family). Already-attempted relabels to "Play Again" — replays
          are unlimited; the relabel is the lock's "already-attempted"
          clarity. The shell handles the click → onAccept → ChallengeCtx
          wiring; this component is purely the visible button. */}
      <button
        data-testid="accept-cta"
        onClick={onAccept}
        style={{
          width: "100%",
          padding: "16px",
          borderRadius: 14,
          background: "#FFB14A",
          border: "none",
          color: "#070A12",
          fontSize: 17,
          fontWeight: 900,
          letterSpacing: 0.5,
          cursor: "pointer",
          marginBottom: 10,
        }}
      >
        {alreadyAttempted ? "Play Again" : takeCard.ctaText}
      </button>

      {/* Attribution + stats — kept minor, below the CTA. Same as the
          v1 layout: "from {name}" when named + the tiny stats line. */}
      <div
        data-testid="attribution"
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.35)",
          textAlign: "center",
        }}
      >
        {namedChallenger && <span>from {data.challenger_name}</span>}
        {namedChallenger && statsLine && <span> · </span>}
        {statsLine && <span>{statsLine}</span>}
      </div>
    </div>
  );
}
