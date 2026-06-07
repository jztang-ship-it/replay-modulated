// shared/components/ChallengeTakeCardLanding.tsx
//
// Phase 2c — V2 recipient-facing challenge landing, rebuilt to the
// TAKE → EVIDENCE → DARE argument hierarchy. Lock: docs/challenge-
// landing-v2-phase2c-take-evidence-dare-lock.md. Supersedes the 2b
// hook/outcome/disagreement/cta presentation (which was a faithful
// build of the 2a hierarchy but landed as a recap — three text blocks
// telling the same story three ways).
//
// Architecture (unchanged from 2b): pure presentation. The shell
// (`ChallengeLandingScreen`) owns fetch / self-match routing / error /
// loading / onAccept; this component receives already-fetched data and
// renders the hierarchy.
//
// Layout (top → bottom):
//   IN-FLOW BADGE — choke/miss/big_score/rare_pull tag, inline, rotated
//                   -5deg for the slant aesthetic. NO absolute, NO
//                   negative-translate, NO anchor. The Phase-2b clip-
//                   off-the-left-edge bug came from reusing
//                   TeamStamp's thud/absolute positioning here; this
//                   surface gets its own simple in-flow tag. TeamStamp
//                   itself is untouched (the results-screen panel keeps
//                   thud + absolute).
//   TAKE          — generator's `take`, largest type, the claim. The
//                   page exists to publish this argument.
//   USP LINE      — generator's `subHeadline` ("Same starting hand.
//                   Different decisions."). Real visual weight — the
//                   fairness mechanic + differentiator. Directly under
//                   the TAKE.
//   EVIDENCE      — six cards. Held bright + HOLD badge + name +
//                   salary + rarity. Discards dim. NO per-card FP chip
//                   in either mode (the FP-spoiler rule).
//   HELD LIST     — labeled "John held: X, Y" — structured names from
//                   generator's `heldCards`. Omitted when [] (legacy).
//   EVIDENCE LINE — generator's `evidenceLine` (the hand TOTAL, mode-
//                   aware framing). Stakes in correction; "the wall"
//                   in competition.
//   DARE          — generator's `dare`, the challenge.
//   CTA           — generator's `ctaText`, the "PLAY YOUR LINE" family.
//   Attribution   — minor below CTA.

import { generateChallengeTakeCard } from "@shared/challengeTakeCard/generateChallengeTakeCard";
import type { TakeCardInput, TakeCardTrigger } from "@shared/challengeTakeCard/types";
import { normalizeTriggerType } from "@shared/adapters/challengeTypes";
import { isRealName } from "@shared/utils/isRealName";
import { lookupCulture } from "@shared/commentary/selectCommentary";
import type { CultureShape } from "@shared/commentary/selectCommentary";

// ── Data shape coming in from the shell ────────────────────────────────

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
  /** Phase 3.2 (lock: docs/challenge-landing-v2-phase3.2-...-lock.md,
   *  ac4b032). The /api/headline-authored line stored at create time.
   *  When present, the TAKE renders this verbatim (uppercase via CSS)
   *  instead of takeCard.take. When null/undefined (legacy rows or any
   *  generation failure), the TAKE falls back to the take card output
   *  exactly as it did pre-Phase-3.2. The client NEVER writes a bank
   *  pick into this field, so the fallback is the only path that can
   *  surface a take-card string here. */
  authored_headline?: string | null;
}

interface Props {
  data: ChallengeLandingData;
  /** Tiny stats line composed by the shell (`challengeStatsLine`). */
  statsLine: string | null;
  alreadyAttempted: boolean;
  onAccept: () => void;
  /** Phase 2e — optional supporting culture line below the take.
   *  OFF by default per the lock §"Optional supporting culture line" —
   *  the localhost loop screenshots it ON to decide keep/cut. Renders
   *  the anchor's knownFor (always) or a controversySafe pick (when
   *  curated; ships empty). Drops cleanly when no culture available. */
  showCultureLine?: boolean;
}

// ── Snapshot card shape (Phase 0 enrichment fields) ────────────────────

interface SnapshotCard {
  basePlayerId: string;
  name: string;
  team: string;
  tier: string;
  salary: number;
  slotIndex?: number;
  wasHeld?: boolean;
  actualFp?: number;
  /** Phase 2d — needed to thread anchor-truth ratio into the generator.
   *  Persisted by the adapter post-enrichment; defaults to 0 on legacy
   *  rows (the holdsRecorded:false gate routes those to generic before
   *  the ratio is computed). */
  projectedFp?: number;
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

const RARE_PULL_TIER_LABEL: Record<string, string> = {
  record: "NEW RECORD",
  career: "CAREER HIGH",
  season: "SEASON HIGH",
};

// ── In-flow badge (the stamp's permanent home on this surface) ─────────
//
// Phase 2b reused TeamStamp's thud/absolute wrapper here and the
// translate(-50%, -50%) bled the chip off the viewport at every width
// it touched. 2c builds a separate inline tag for the landing — pure
// CSS pill, rotate(-5deg) for the slant aesthetic, no animation, no
// absolute, no negative-translate, no anchor. Cannot bleed off the edge
// at any viewport width because it occupies normal document flow.
//
// TeamStamp.tsx itself is NOT modified — the results-screen panel keeps
// its existing thud + absolute behavior. The badge label and color
// family mirror TeamStamp's so the visual identity (CHOKE / {TIER} MISS
// / BIG SCORE / RARE PULL) reads as the same vocabulary.

interface InFlowBadgeProps {
  trigger: TakeCardTrigger;
  missTier?: string | null;
  topGameTier?: "record" | "career" | "season" | null;
}

function InFlowBadge({ trigger, missTier, topGameTier }: InFlowBadgeProps) {
  let label: string | null = null;
  let background = "linear-gradient(135deg, #ef4444 0%, #b91c1c 60%, #7f1d1d 100%)";
  let color = "#fff5f5";

  if (trigger === "choke") {
    label = "CHOKE";
    // background defaults to the savage-red gradient
  } else if (trigger === "miss") {
    const prefix = (missTier ?? "").replace(/_/g, " ").trim().toUpperCase();
    label = prefix ? `${prefix} MISS` : "MISS";
    background = "linear-gradient(135deg, #fde68a 0%, #f59e0b 55%, #b45309 100%)";
    color = "#3a2000";
  } else if (trigger === "big_score") {
    label = "BIG SCORE";
    background = "linear-gradient(135deg, #FFB14A 0%, #F59E0B 100%)";
    color = "#070A12";
  } else if (trigger === "rare_pull") {
    label = topGameTier ? (RARE_PULL_TIER_LABEL[topGameTier] ?? "RARE PULL") : "RARE PULL";
    background = "linear-gradient(135deg, #7FFF00 0%, #5BBE00 100%)";
    color = "#070A12";
  }

  if (!label) return null; // default → no badge

  return (
    <span
      data-testid="landing-badge"
      data-trigger={trigger}
      style={{
        display: "inline-block",
        padding: "5px 11px",
        borderRadius: 3,
        background,
        color,
        fontFamily: "'Rajdhani','Oswald','Arial Narrow',sans-serif",
        fontSize: 13,
        fontWeight: 900,
        letterSpacing: 1.4,
        lineHeight: 1,
        textTransform: "uppercase",
        // The slant aesthetic, applied as a static rotate. No translate,
        // no animation — purely in-flow.
        transform: "rotate(-5deg)",
        border: "1.5px solid currentColor",
        boxShadow: "0 3px 7px rgba(0,0,0,0.45)",
        marginRight: 4,
      }}
    >
      {label}
    </span>
  );
}

// ── Held card view ─────────────────────────────────────────────────────
// The 2c spoiler rule: held cards show name + salary + rarity ONLY. The
// HOLD badge marks them. The bright color treatment from 2b stays. The
// per-card FP chip is gone (it leaked the result). Discards stay plain
// and dim, also without any FP chip.

interface HandCardProps {
  card: SnapshotCard;
  isHeld: boolean;
}

// Phase 2d: held cards saturated, unheld muted — but ALL six get their
// TIER color. The 2c treatment of "unheld = near-black" read as
// "disabled," not "cards you'll also get." The new contrast is
// saturated-vs-muted within the same tier hue, so all six read as the
// real hand being dealt; the HOLD badge + saturation gap still marks
// the held subset.

function HandCard({ card, isHeld }: HandCardProps) {
  const accent = TIER_ACCENT[card.tier] ?? "#9CA3AF";
  // muted = same hue, lower saturation/opacity. Keeping accent-derived
  // background + border, dialing alpha down so the card reads as the
  // same tier color, just dimmer.
  const background = isHeld ? `${accent}26` : `${accent}10`;
  const border = isHeld ? `2px solid ${accent}` : `1px solid ${accent}55`;
  const opacity = isHeld ? 1 : 0.68;
  return (
    <div
      data-testid={isHeld ? "hand-card-held" : "hand-card-plain"}
      data-was-held={isHeld ? "true" : "false"}
      data-tier-accent={accent}
      style={{
        position: "relative",
        background,
        border,
        borderRadius: 10,
        padding: "10px 12px",
        minWidth: 108,
        flex: "0 1 auto",
        textAlign: "center",
        opacity,
        boxShadow: isHeld ? `0 1px 0 ${accent}33 inset, 0 4px 10px rgba(0,0,0,0.25)` : "none",
      }}
    >
      {isHeld && (
        <div
          data-testid="hold-badge"
          style={{
            position: "absolute",
            top: -8,
            right: -6,
            background: accent,
            color: "#070A12",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: 1.1,
            lineHeight: 1.2,
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
        >
          HOLD
        </div>
      )}
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
        {card.team}
      </div>
    </div>
  );
}

// ── Phase 2e culture helpers ───────────────────────────────────────────

/** FNV-1a 32-bit hash of the challengeId — same scheme the generator
 *  uses for the deterministic seed. Returned as a JS number for the
 *  lookupCulture PURPLE-tier 30% gate. The gate is keyed off `seed/13`
 *  so any stable integer derived from the challenge works. */
function stableSeedFromId(challengeId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < challengeId.length; i++) {
    h ^= challengeId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pick the supporting culture line. knownFor takes precedence (always
 *  safe — single line, image summary). Falls back to the first entry in
 *  controversySafe (curated landing-safe lines; ships empty so this
 *  never fires until user-ratified curation populates the list).
 *  Returns null when no line is available. */
function pickSupportingCultureLine(culture: CultureShape | null): string | null {
  if (!culture) return null;
  if (culture.knownFor && culture.knownFor.trim().length > 0) return culture.knownFor.trim();
  const safe = culture.controversySafe ?? [];
  if (safe.length > 0 && safe[0] && safe[0].trim().length > 0) return safe[0].trim();
  return null;
}

// ── The component ─────────────────────────────────────────────────────

export function ChallengeTakeCardLanding({ data, statsLine, alreadyAttempted, onAccept, showCultureLine = false }: Props) {
  const trigger = (normalizeTriggerType(data.trigger_type) ?? "default") as TakeCardTrigger;
  const snapshot = (data.initial_roster ?? {}) as RosterSnapshot;
  const cards: SnapshotCard[] = snapshot.cards ?? [];
  const holdsRecorded = snapshot.holdsRecorded === true;
  const namedChallenger = isRealName(data.challenger_name);

  // Locate the anchor card up-front — the lookup hits both anchorName and
  // anchorCulture branches. Find by basePlayerId match against the snapshot.
  const anchorCard = data.anchor_base_player_id
    ? (cards.find(c => c.basePlayerId === data.anchor_base_player_id) ?? null)
    : null;
  const anchorName = anchorCard?.name ?? null;

  // Phase 2e — culture lookup on the anchor. Gated by holdsRecorded
  // (don't resolve culture for legacy rows; the generator's anchor-truth
  // branch would route to generic anyway). lookupCulture handles the
  // tier gate internally (BLUE/GREEN/WHITE → null; PURPLE iconic+30%).
  // Returns null cleanly when no entry → generator falls through to 2d
  // anchor banks (or further to generic). No broken {nickname} token.
  const anchorCulture: CultureShape | null =
    holdsRecorded && anchorCard
      ? lookupCulture(
          anchorCard.name,
          data.sport,
          anchorCard.tier,
          // Seed the PURPLE 30% gate off the challengeId so different
          // challenges with PURPLE anchors get different gate outcomes.
          // RED/ORANGE bypass this gate entirely.
          stableSeedFromId(data.challenge_id),
          anchorCard.basePlayerId,
          anchorCard.team,
        )
      : null;

  const heldCardsForGenerator = holdsRecorded
    ? cards
        .filter(c => c.wasHeld === true)
        .map(c => ({
          name: c.name,
          actualFp: c.actualFp ?? 0,
          projectedFp: c.projectedFp ?? 0,
          tier: c.tier,
          basePlayerId: c.basePlayerId,
          team: c.team,
        }))
    : [];

  const takeCardInput: TakeCardInput = {
    trigger,
    challengerName: namedChallenger ? data.challenger_name : null,
    targetScore: data.target_score,
    winTier: "",
    holdsRecorded,
    heldCards: heldCardsForGenerator,
    anchorName,
    nearMissGap: data.near_miss_gap ?? null,
    nearMissNextTier: data.near_miss_next_tier ?? null,
    bestScore: data.best_score,
    attemptCount: data.attempt_count,
    winnerCount: data.winner_count,
    challengeId: data.challenge_id,
    anchorCulture,
  };
  const takeCard = generateChallengeTakeCard(takeCardInput);

  // Phase 2e — optional supporting culture line. Prefers knownFor (always
  // safe — single-line image summary); falls back to controversySafe[0]
  // (ships empty → never fires until curation). Drops cleanly when
  // showCultureLine is false OR no culture / no usable line.
  const supportingCultureLine = showCultureLine ? pickSupportingCultureLine(anchorCulture) : null;

  return (
    <div data-testid="challenge-take-card-landing">
      {/* TAKE — largest type at the top, the claim. The Phase-2d
          layout moves the stamp INLINE at the end of the headline (it
          flows after the headline text wherever the wrap lands, not
          stacked above and not absolutely positioned). Inline-block
          on the badge means it sits at the end of the last line of
          the heading regardless of how the take wraps.
          textTransform forces substituted tokens (e.g. {anchorName} or
          {challengerName}) into caps for one-voice presentation. */}
      <h1
        data-testid="take-headline"
        style={{
          fontSize: 32,
          lineHeight: 1.15,
          fontWeight: 950,
          color: "#FFB14A",
          letterSpacing: 0.3,
          margin: "4px 0 16px",
          maxWidth: 600,
          textTransform: "uppercase",
        }}
      >
        {/* Phase 3.2 (lock: docs/challenge-landing-v2-phase3.2-...-
            lock.md, ac4b032): render the /api/headline-authored line
            when present; fall back to the take card generator's TAKE
            field when null/undefined. textTransform:uppercase above
            renders both at the same visual register. The client never
            writes a bank pick into authored_headline, so the take-
            card fallback path is the ONLY way a non-authored string
            can land here. */}
        {data.authored_headline || takeCard.take || "THIS IS THE LINE."}
        {trigger !== "default" && (
          <>
            {" "}
            <span
              data-testid="badge-row"
              style={{ display: "inline-block", verticalAlign: "middle" }}
            >
              <InFlowBadge
                trigger={trigger}
                missTier={data.near_miss_next_tier}
                topGameTier={data.top_game_tier}
              />
            </span>
          </>
        )}
      </h1>

      {/* Phase 2e — OPTIONAL supporting culture line. Off by default;
          shipped behind `showCultureLine` prop. Drops in below the
          headline, above the USP. Mixed-case prose (the take is the
          uppercase argument; this is the image). Reads as a quote /
          texture, not another header. The localhost loop screenshots
          both states to decide keep/cut. */}
      {supportingCultureLine && (
        <div
          data-testid="supporting-culture-line"
          style={{
            fontSize: 13,
            fontStyle: "italic",
            color: "rgba(234,240,255,0.75)",
            lineHeight: 1.4,
            margin: "0 0 14px",
            maxWidth: 560,
          }}
        >
          {supportingCultureLine}
        </div>
      )}

      {/* USP / subHeadline — "Same starting hand. Different decisions."
          Real visual weight per the lock §"Same starting hand — make
          the USP unmissable." Distinct style from the TAKE so it reads
          as the fairness mechanic, not buried prose. */}
      <div
        data-testid="usp-subheadline"
        style={{
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: 0.2,
          color: "rgba(234,240,255,0.5)",
          lineHeight: 1.4,
          marginBottom: 24,
          maxWidth: 560,
        }}
      >
        {takeCard.subHeadline}
      </div>

      {/* EVIDENCE — the six cards. Held bright + HOLD badge + name +
          salary + rarity (no per-card FP chip — spoiler rule). Discards
          dim, also no chip. */}
      <div
        data-testid="starting-hand"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
          justifyContent: "center",
        }}
      >
        {cards.map((card, i) => {
          const isHeld = holdsRecorded && card.wasHeld === true;
          return <HandCard key={card.basePlayerId ?? i} card={card} isHeld={isHeld} />;
        })}
      </div>

      {/* EVIDENCE LINE — Phase 2d plain-language stakes. NO raw FP.
          Correction → "KOBE AND KIDD. BUSTED." (fused, generic choke)
          or just "BUSTED." (when anchor-aware take names the anchor).
          Competition → "UNBEATEN" / "{N} TRIED. {N} FAILED."
          Neutral → "A NUMBER ON THE BOARD. BEAT IT." */}
      <div
        data-testid="evidence-line"
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "rgba(234,240,255,0.55)",
          fontFamily: "'Rajdhani','Oswald','Arial Narrow',sans-serif",
          letterSpacing: 0.6,
          textAlign: "center",
          textTransform: "uppercase",
          marginBottom: 16,
        }}
      >
        {takeCard.evidenceLine}
      </div>

      {/* DARE — mode-aware. Correction is pure-hypothetical (no
          outcome reference); competition is "beat the receipt"; neutral
          is "beat the number." */}
      <div
        data-testid="dare-line"
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: "#EAF0FF",
          lineHeight: 1.35,
          textAlign: "center",
          marginBottom: 22,
          maxWidth: 560,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {takeCard.dare}
      </div>

      {/* CTA — generator's ctaText (the "PLAY YOUR LINE" family).
          alreadyAttempted relabels — replays unlimited, relabel is
          just clarity. */}
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

      {/* Attribution — sender + optional stats line. #4a declutter
          removed the inline "X'S LINE / HOLD: …" exhibit, so this is
          now the sole sender mention. Renders whenever there's a real
          challenger name or a stats line; anonymous + no-stats stays
          empty (nothing to attribute). */}
      {(namedChallenger || statsLine) && (
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
      )}
    </div>
  );
}
