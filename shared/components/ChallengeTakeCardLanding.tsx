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
//   EVIDENCE      — five cards. Held bright + HOLD badge + name +
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

import { useEffect } from "react";
import type { TakeCardTrigger } from "@shared/challengeTakeCard/types";
import { normalizeTriggerType } from "@shared/adapters/challengeTypes";
import { isRealName } from "@shared/utils/isRealName";
import { lookupCulture } from "@shared/commentary/selectCommentary";
import type { CultureShape } from "@shared/commentary/selectCommentary";
import type { WinTierKey } from "@shared/utils/payoutLogic";
import { track } from "@shared/analytics/analytics";
import { pickHeadlineAndCta, FALLBACK_CTA, type SealVisual } from "./landingHeadlines";

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
  /** RD5.1 v3 — sport-bound win-tier resolver, threaded from the sport
   *  adapter via the landing shell. The take card uses it to resolve
   *  big_score's seal (LEGEND / MVP / ALL-STAR) from the persisted
   *  target_score. Mirrors how H2HRecipientPlay receives it from the
   *  same adapter. */
  calculateWinTier: (totalFp: number) => string;
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

// ── Evidence seal — TierGauge vocabulary, slanted stamp ────────────────
//
// RD5.1 v3 — the seal label + colors come from landingHeadlines.resolveSeal,
// which mirrors TierGauge.tsx's in-game stamp vocabulary (CHOKE / {TIER}
// MISS / win-tier label / sub-tier label). The pre-v3 invented strings
// "BIG SCORE" and "NEW RECORD" are RETIRED — they live in no other live
// surface in the codebase. The visual shell (slanted stamp, no thud, no
// translate) is unchanged from 2b — only the label + color sourcing
// changed.

interface EvidenceSealProps {
  seal: SealVisual | null;
  trigger: TakeCardTrigger;
}

function EvidenceSeal({ seal, trigger }: EvidenceSealProps) {
  if (!seal) return null; // default trigger → no seal
  return (
    <span
      data-testid="landing-badge"
      data-trigger={trigger}
      style={{
        display: "inline-block",
        padding: "5px 11px",
        borderRadius: 3,
        background: seal.background,
        color: seal.color,
        fontFamily: "'Rajdhani','Oswald','Arial Narrow',sans-serif",
        fontSize: 13,
        fontWeight: 900,
        letterSpacing: 1.4,
        lineHeight: 1,
        textTransform: "uppercase",
        transform: "rotate(-5deg)",
        border: "1.5px solid currentColor",
        boxShadow: "0 3px 7px rgba(0,0,0,0.45)",
        marginRight: 4,
      }}
    >
      {seal.label}
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
        overflow: "hidden", // contains the yellow-H corner glyph inside the rounded card
      }}
    >
      {isHeld && (
        // RD5.1 hold indicator — same yellow-H corner glyph the live game /
        // H2H card uses (CardFront.tsx:872-883). Triangle in the top-left
        // corner + "H" letter. Reuses the real glyph rather than a separate
        // red "HOLD" pill so the landing's "you held these" reads as the
        // same visual vocabulary the recipient will see during play.
        <div
          data-testid="hold-badge"
          style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}
        >
          <svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            aria-hidden
          >
            <polygon points="0,0 0.30,0 0,0.45" fill="#F5C850" />
          </svg>
          <span
            style={{
              position: "absolute",
              top: 2,
              left: 4,
              fontSize: 10,
              fontWeight: 950,
              color: "rgba(0,0,0,0.85)",
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            H
          </span>
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

export function ChallengeTakeCardLanding({ data, statsLine, alreadyAttempted, calculateWinTier, onAccept, showCultureLine = false }: Props) {
  const trigger = (normalizeTriggerType(data.trigger_type) ?? "default") as TakeCardTrigger;
  const snapshot = (data.initial_roster ?? {}) as RosterSnapshot;
  const cards: SnapshotCard[] = snapshot.cards ?? [];
  const holdsRecorded = snapshot.holdsRecorded === true;
  const namedChallenger = isRealName(data.challenger_name);

  // Locate the anchor card up-front — needed for the supporting culture
  // line's lookupCulture call below. RD5 retired the take-engine call
  // on this surface, so anchorName is no longer plumbed into a take.
  const anchorCard = data.anchor_base_player_id
    ? (cards.find(c => c.basePlayerId === data.anchor_base_player_id) ?? null)
    : null;

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

  // Phase 2e — optional supporting culture line. Prefers knownFor (always
  // safe — single-line image summary); falls back to controversySafe[0]
  // (ships empty → never fires until curation). Drops cleanly when
  // showCultureLine is false OR no culture / no usable line.
  // RD5 retired the take-engine call on this surface — the deterministic
  // hero replaces takeCard.take; held names + dare + CTA are computed
  // locally below from data + the heldCardsForGenerator filter. The
  // generator stays available to non-landing surfaces.
  const supportingCultureLine = showCultureLine ? pickSupportingCultureLine(anchorCulture) : null;

  // RD5.1 v3 — decision-frame headline + frame-aware CTA + standalone
  // seal that mirrors TierGauge vocabulary. Spec: docs/rd5-1-headline-
  // system-spec.md (v3). The win tier for big_score is resolved here
  // from target_score via the sport-adapter prop — the only trigger
  // whose seal depends on a derived value, since the others get their
  // tier via persisted columns (near_miss_next_tier, top_game_tier).
  // Resolve up-front so the assertion (big_score must have a winTier)
  // lives at one site.
  const challengerDisplay = namedChallenger ? data.challenger_name : "THE CHALLENGER";
  const heldDisplayNames = heldCardsForGenerator.map(c => c.name);
  const resolvedWinTier: WinTierKey | null = trigger === "big_score"
    ? (calculateWinTier(data.target_score) as WinTierKey)
    : null;
  const headlineOutput = pickHeadlineAndCta({
    trigger,
    challengerName: challengerDisplay,
    heldNamesList: heldDisplayNames,
    challengeId: data.challenge_id,
    missTier: data.near_miss_next_tier ?? null,
    topGameTier: data.top_game_tier ?? null,
    winTier: resolvedWinTier,
  });

  // Analytics — fire-once per mount with the selected variant key so
  // per-line acceptance rates can be correlated later. Keyed on
  // (challenge_id + variantKey) so re-renders don't double-count; the
  // selection is deterministic for a given challenge so variantKey is
  // stable across re-renders of the same hand.
  useEffect(() => {
    track("challenges", "challenge_landing_variant", {
      challenge_id: data.challenge_id,
      sport: data.sport,
      trigger,
      variant_key: headlineOutput.variantKey,
    });
  }, [data.challenge_id, data.sport, trigger, headlineOutput.variantKey]);

  // Target line — the one place the score appears on this screen.
  // Mirrors the spec §"Score rule": never in a headline; sole numeric.
  const targetFpFixed = data.target_score.toFixed(1);

  // Recipient CTA = frame-aware (from the headline system). Owner /
  // alreadyAttempted path keeps its existing "Play Again" copy
  // verbatim — out of scope for RD5.1 (spec §"CTA rule" and directive
  // §"CTA — frame-aware, recipient path only").
  const recipientCta = headlineOutput.ctaLabel || FALLBACK_CTA;
  const ctaLabel = alreadyAttempted ? "Play Again" : recipientCta;

  return (
    <div data-testid="challenge-take-card-landing">
      {/* HEADLINE — the argument. RD5.1: decision-frame prose only;
          the seal is rendered as a standalone element below. The h1
          no longer carries an inline badge. textTransform:uppercase
          covers any future template that emits mixed-case tokens;
          landingHeadlines.ts pre-uppercases everything today. */}
      <h1
        data-testid="take-headline"
        style={{
          fontSize: 32,
          lineHeight: 1.15,
          fontWeight: 950,
          color: "#FFB14A",
          letterSpacing: 0.3,
          margin: "4px 0 12px",
          maxWidth: 600,
          textTransform: "uppercase",
        }}
      >
        {headlineOutput.headline}
      </h1>

      {/* SEAL — evidence, set apart from the headline. Label + colors
          mirror TierGauge.tsx's in-game stamp vocabulary; resolved in
          landingHeadlines.resolveSeal. Rendered only for triggers that
          have a seal; `default` is the intentional no-seal case
          (spec §"default — clean direct challenge, no stamp"). */}
      {headlineOutput.seal !== null && (
        <div
          data-testid="evidence-seal"
          style={{ margin: "0 0 18px" }}
        >
          <EvidenceSeal seal={headlineOutput.seal} trigger={trigger} />
        </div>
      )}

      {/* Phase 2e — OPTIONAL supporting culture line. Off by default;
          shipped behind `showCultureLine` prop. RD5.1 carries the prop
          through unchanged — auto-generation of player-specific
          cultural copy stays LOCKED OUT (spec §"Cultural trash-talk
          banks — LOCKED OUT"), but the `knownFor` path the prop
          surfaces is human-ratified, so the optional surface stays
          available behind the explicit flag. */}
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

      {/* EVIDENCE — the five cards (proof of what was held). Held =
          yellow-H corner glyph (same as live game / H2H per spec
          §"Layout"). No per-card FP chip. */}
      <div
        data-testid="starting-hand"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 18,
          justifyContent: "center",
        }}
      >
        {cards.map((card, i) => {
          const isHeld = holdsRecorded && card.wasHeld === true;
          return <HandCard key={card.basePlayerId ?? i} card={card} isHeld={isHeld} />;
        })}
      </div>

      {/* TARGET LINE — sole numeric on the screen (spec §"Score rule").
          Sits directly above the CTA so the recipient sees the number
          to beat at the point of decision. */}
      <div
        data-testid="target-line"
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "rgba(234,240,255,0.85)",
          fontFamily: "'Rajdhani','Oswald','Arial Narrow',sans-serif",
          letterSpacing: 0.6,
          textAlign: "center",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        Target to beat: {targetFpFixed} FP
      </div>

      {/* CTA — RD5.1 frame-aware on the recipient (fresh) path; the
          owner path (`alreadyAttempted === true`) is OUT OF SCOPE and
          keeps the existing "Play Again" copy verbatim (directive
          §"CTA — frame-aware, recipient path only").
          RD6.2-prep-A (2026-06-12): marginTop adds breathing room
          between the target line and the CTA. Pre-RD6.2-prep-A the
          two pressed against each other — visually the CTA was the
          terminal beat of the target line rather than an isolated
          decision affordance. The target line still owns its own
          marginBottom (12) so the pair reads as "target … BUTTON". */}
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
          marginTop: 12,
          marginBottom: 10,
          textTransform: "uppercase",
        }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
