// shared/components/ChallengeLandingScreen.tsx
//
// SHELL — owns fetch / self-match routing / error / loading / accept
// wiring. The accept-flow render BODY (the V2 hierarchy: hook → hand →
// outcome → disagreement → CTA) lives in ChallengeTakeCardLanding per
// the Phase 2b lock. This file delegates to it; do not re-implement the
// V2 hierarchy here.

import { useEffect, useState } from "react";
import { type ChallengeCtx, normalizeTriggerType, normalizeSenderKind } from "@shared/adapters/challengeTypes";
import type { GeneratedCard } from "@shared/types/index";
import { track } from "@shared/analytics/analytics";
import { chDebug } from "@shared/lib/chDebug";
import { hasAttemptedChallenge } from "@shared/hooks/useChallengeShare";
// (replays are unlimited — hasAttemptedChallenge is still imported below as
//  a hint label for the CTA, never as a block.)
import { isRealName } from "@shared/utils/isRealName";
import { ChallengeTakeCardLanding } from "./ChallengeTakeCardLanding";
import type { CardRenderer } from "./H2HRevealScreen";

export interface ChallengeData {
  challenge_id: string;
  /** Challenger's auth user_id. Used to detect self-match — when the
   *  current viewer is the original challenger, we render an alternate
   *  surface instead of the accept flow. */
  created_by: string | null;
  /** Phase 2 boss delivery (2026-06-21): "player" for human challenges
   *  (default), "boss" for the daily boss instance. Optional on the wire
   *  for backward compat; the GET handler defaults it to "player".
   *  Normalized via normalizeSenderKind at the render boundary. */
  sender_kind?: string;
  /** Boss claim-prompt (2026-06-26): the boss bank id (e.g. "DET-0304"), returned
   *  by the GET handler (api/challenge/[id].ts). null on human rows. Threaded to
   *  ChallengeCtx.bossIdentityId so the post-win claim card has its {team} token. */
  boss_identity_id?: string | null;
  /** Boss "tough day" flag (sender-facing flavor); null on human rows. */
  tough_day?: boolean | null;
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
  // Phase 5c S1 (2026-05-31): trigger-detail fields. Optional on the wire
  // for backward compat with legacy clients/responses; null on legacy
  // rows (pre-migration 012) and on rows where the trigger didn't emit
  // the field.
  near_miss_gap?: number | null;
  near_miss_next_tier?: string | null;
  anchor_base_player_id?: string | null;
  top_game_tier?: "record" | "career" | "season" | null;
  /** Phase 3.2 (lock: docs/challenge-landing-v2-phase3.2-...-lock.md,
   *  ac4b032). Authored line from /api/headline at create time. NULL
   *  on legacy rows (pre-migration 013) and on rows where generation
   *  failed (client correctly skips writing a bank pick into this
   *  field). The take-card-landing's TAKE renders this when present
   *  and falls back to takeCard.take otherwise. */
  authored_headline?: string | null;
}

/**
 * Build the recipient-side ChallengeCtx from a fetched challenge row. Extracted
 * from handleAccept (Consolidation Phase 3 step 1) so the IN-APP boss-direct
 * path (BossScreen.onTakeBoss → App) builds the SAME ctx the cold landing does,
 * without duplicating the field map. PURE — no telemetry, no state. Returns null
 * when the roster snapshot is invalid (caller surfaces the error / degrades).
 * The cold landing's handleAccept keeps its track() calls inline so its behavior
 * is byte-identical; only the field map moves here.
 */
export function buildChallengeCtx(
  data: ChallengeData,
  deps: {
    deserializeRoster: (snapshot: Record<string, unknown>) => GeneratedCard[];
    validateRosterSnapshot: (snapshot: Record<string, unknown>) => boolean;
  },
): ChallengeCtx | null {
  if (!deps.validateRosterSnapshot(data.initial_roster)) return null;
  const initialRoster = deps.deserializeRoster(data.initial_roster);
  return {
    challengeId: data.challenge_id,
    initialRoster,
    targetScore: data.target_score,
    challengerName: data.challenger_name,
    sport: data.sport,
    season: data.season,
    triggerType: normalizeTriggerType(data.trigger_type),
    nearMissGap: data.near_miss_gap ?? null,
    nearMissNextTier: data.near_miss_next_tier ?? null,
    anchorBasePlayerId: data.anchor_base_player_id ?? null,
    topGameTier: data.top_game_tier ?? null,
    senderKind: normalizeSenderKind(data.sender_kind),
    bossIdentityId: data.boss_identity_id ?? undefined,
    marquee: (data.initial_roster as { marquee?: boolean } | null)?.marquee === true,
  };
}

interface Props {
  challengeId: string;
  /** boss-result-share-payload (Option B): the sharer's attempt uuid off the
   *  forwarded link's &attempt param. Threaded to the boss take-card so it can
   *  read + render the sharer's result as a taunt overlay. Undefined ⇒ no overlay. */
  attemptRef?: string;
  sport: string;
  /** Current signed-in user's auth uid, or null for anonymous viewers.
   *  When non-null and matches challenge.created_by, the screen renders
   *  the self-match surface ("This is your challenge"). Anonymous
   *  viewers always fall through to the normal accept flow — the
   *  server's anti-self-farm guard still protects counter integrity. */
  currentUserId?: string | null;
  deserializeRoster: (snapshot: Record<string, unknown>) => GeneratedCard[];
  validateRosterSnapshot: (snapshot: Record<string, unknown>) => boolean;
  /** RD5.1 v3 — sport-bound win-tier resolver. Used by the take-card
   *  landing to resolve the big_score seal (LEGEND / MVP / ALL-STAR)
   *  from the persisted target_score. Mirrors how H2HRecipientPlay
   *  receives it from the same sport adapter (H2HRecipientPlay.tsx:289).
   *  Returns the win-tier string in the WinTierKey vocabulary
   *  (LEGEND / MVP / ALL_STAR / STARTER / ROOKIE / BUST). */
  calculateWinTier: (totalFp: number) => string;
  onAccept: (ctx: ChallengeCtx) => void;
  onClose: () => void;
  /** Consolidation Phase 3 step 3 — sport real-card renderer, threaded
   *  from App (basketball `h2hArcRenderer`). Forwarded to the converged
   *  take-card surface so its BOSS branch renders real cards on the cold
   *  link, matching the hub. Optional — absent → neutral-chip fallback;
   *  the human take-card path never reads it. */
  renderBossCard?: CardRenderer;
}

function challengeStatsLine(data: ChallengeData): string | null {
  const { attempt_count, winner_count, best_score, best_user_name } = data;
  // Zero attempts: omit the line entirely — the invitation's job is to make
  // the recipient tap Accept, not push generic "be the first" copy.
  if (attempt_count === 0) return null;
  if (attempt_count === 1 && winner_count === 0) return "1 attempt · still unbeaten";
  if (attempt_count >= 2 && winner_count === 0) return `Unbeaten so far · ${attempt_count} attempts`;
  const failedCount = attempt_count - winner_count;
  const failureRate = Math.round((failedCount / attempt_count) * 100);
  if (attempt_count >= 3 && winner_count > 0) return `${attempt_count} attempts · ${failureRate}% failed`;
  return `${attempt_count} attempts · best ${best_score?.toFixed(1) ?? "?"} FP by ${best_user_name ?? "someone"}`;
}

const TIER_ACCENT: Record<string, string> = {
  RED: "#EF4444", ORANGE: "#FB923C", PURPLE: "#C084FC",
  BLUE: "#3B82F6", GREEN: "#22C55E", WHITE: "#9CA3AF",
};

export function ChallengeLandingScreen({ challengeId, attemptRef, sport, currentUserId, deserializeRoster, validateRosterSnapshot, calculateWinTier, onAccept, onClose, renderBossCard }: Props) {
  const [data, setData] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alreadyAttempted, setAlreadyAttempted] = useState(false);

  useEffect(() => {
    track("challenges", "challenge_link_open", { challenge_id: challengeId, sport });
    setAlreadyAttempted(hasAttemptedChallenge(challengeId));
    fetch(`/api/challenge/${challengeId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setData(d); setLoading(false); })
      .catch((reason) => {
        chDebug("ChallengeLandingScreen:fetchCatch", {
          challengeId,
          status: typeof reason === "number" ? reason : null,
          reason: String(reason),
        });
        setError("Challenge not found."); setLoading(false);
      });
  }, [challengeId, sport]);

  function handleAccept() {
    if (!data) return;
    // Field map extracted to buildChallengeCtx (Phase 3 step 1) — shared with
    // the in-app boss-direct path. null ⇒ invalid snapshot (same guard as before).
    const ctx = buildChallengeCtx(data, { deserializeRoster, validateRosterSnapshot });
    if (!ctx) {
      setError("Invalid challenge data. It may have expired.");
      return;
    }
    track("challenges", "challenge_accept", { challenge_id: challengeId, sport });
    track("challenges", "challenge_attempt_start", { challenge_id: challengeId, sport });
    onAccept(ctx);
  }

  const cards: any[] = (data?.initial_roster as any)?.cards ?? [];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "linear-gradient(180deg, #070A12 0%, #0D1628 60%, #070A12 100%)",
      color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex", flexDirection: "column", overflowY: "auto",
      padding: "24px 20px 40px",
    }}>
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          alignSelf: "flex-start", background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
          padding: "5px 12px", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer",
          marginBottom: 24,
        }}
      >← Back</button>

      {loading && <div style={{ textAlign: "center", opacity: 0.5, marginTop: 80 }}>Loading challenge…</div>}
      {error && <div style={{ textAlign: "center", color: "#EF4444", marginTop: 80 }}>{error}</div>}

      {data && (() => {
        const statsLine = challengeStatsLine(data);
        // Self-match: only triggers for signed-in users whose uid matches
        // data.created_by. Anonymous viewers fall through to the normal
        // accept flow (the server's anti-self-farm guard catches them).
        const isSelfMatch = !!(currentUserId && data.created_by && currentUserId === data.created_by);

        if (isSelfMatch) {
          return (
            <SelfMatchView
              data={data}
              cards={cards}
              statsLine={statsLine}
              challengeId={challengeId}
              sport={sport}
              onBack={onClose}
            />
          );
        }

        // Consolidation Phase 3 step 2 (2026-06-26): boss CONVERGES onto the
        // unified take-card framework. The shell no longer dispatches boss to a
        // separate BossLandingView (retired) — boss and player both render
        // ChallengeTakeCardLanding, which branches INTERNALLY on data.sender_kind
        // (authored name verbatim / authored flavor / neutral cards / eyebrow +
        // marquee / revisit). A boss has created_by null, so isSelfMatch above is
        // always false for it; senderKind on the accepted ctx is unchanged
        // (buildChallengeCtx), so downstream Reveal/Play/App readers don't move.
        return (
          <ChallengeTakeCardLanding
            data={data}
            statsLine={statsLine}
            alreadyAttempted={alreadyAttempted}
            calculateWinTier={calculateWinTier}
            onAccept={handleAccept}
            renderBossCard={renderBossCard}
            attemptRef={attemptRef}
          />
        );
      })()}
    </div>
  );
}

// ── Self-match surface ────────────────────────────────────────────────────
//
// Rendered when the current viewer is the challenge's original creator.
// No "Accept" path — the user can't play their own challenge from the
// UI. The server's anti-self-farm guard remains as belt-and-suspenders;
// this UI prevents reaching that path in the first place.

interface SelfMatchProps {
  data: ChallengeData;
  cards: any[];
  statsLine: string | null;
  challengeId: string;
  sport: string;
  onBack: () => void;
}

function SelfMatchView({ data, cards, statsLine, challengeId, sport, onBack }: SelfMatchProps) {
  const [copied, setCopied] = useState(false);
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/${sport}/challenge/${challengeId}`
    : "";
  const realBestName = isRealName(data.best_user_name) ? data.best_user_name : null;
  // Custom stats line for the self-match: lead with attempts + defenses,
  // not the "be the first" framing. winner_count = attackers who beat
  // the target; "defenses" = attempts that didn't beat the target.
  const defenses = Math.max(0, (data.attempt_count ?? 0) - (data.winner_count ?? 0));
  const composedStats = `${data.attempt_count} attempt${data.attempt_count === 1 ? "" : "s"} · ${defenses} defense${defenses === 1 ? "" : "s"}`;
  const bestLine = data.best_score != null
    ? ` · best ${data.best_score.toFixed(1)} FP by ${realBestName ?? "anonymous"}`
    : "";

  function handleReshare() {
    if (typeof navigator === "undefined") return;
    track("challenges", "self_match_reshare", { challenge_id: challengeId, sport });
    if (navigator.share) {
      navigator
        .share({
          title: "ReplayIFS Challenge",
          text: `I put up ${data.target_score.toFixed(1)} FP. Same starting lineup. Beat me.`,
          url: shareUrl,
        })
        .catch((err: any) => {
          if (err?.name === "AbortError") return;
          // Fall back to clipboard
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(shareUrl)
              .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })
              .catch(() => { /* ignore */ });
          }
        });
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareUrl)
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })
        .catch(() => { /* ignore */ });
    }
  }

  return (
    <>
      <div style={{
        fontSize: 14, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
        color: "rgba(255,177,74,0.85)", marginBottom: 8,
      }}>Your Challenge</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: "#EAF0FF", marginBottom: 6, lineHeight: 1.2 }}>
        This is your challenge.
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 18, lineHeight: 1.4 }}>
        {composedStats}{bestLine || (statsLine ? ` · ${statsLine}` : "")}
      </div>

      {/* Score callout — your target */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 22 }}>
        <span style={{ fontSize: 58, fontWeight: 950, color: "#FFB14A", lineHeight: 1, fontStyle: "italic" }}>
          {data.target_score.toFixed(1)}
        </span>
        <span style={{ fontSize: 18, color: "rgba(255,255,255,0.45)", fontWeight: 700 }}>FP</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>— your target</span>
      </div>

      {/* Card spread (same visual as accept flow) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24, justifyContent: "center" }}>
        {cards.map((card: any, i: number) => (
          <div key={i} style={{
            background: "rgba(255,255,255,0.04)", border: `1.5px solid ${TIER_ACCENT[card.tier] ?? "#9CA3AF"}`,
            borderRadius: 10, padding: "10px 14px", minWidth: 120, textAlign: "center",
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: TIER_ACCENT[card.tier] ?? "#9CA3AF", textTransform: "uppercase", marginBottom: 4 }}>{card.tier}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#EAF0FF" }}>{card.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{card.team} · ${card.salary}</div>
          </div>
        ))}
      </div>

      {/* Primary: re-share the same link */}
      <button
        onClick={handleReshare}
        style={{
          width: "100%", padding: "16px", borderRadius: 14,
          background: "#FFB14A", border: "none",
          color: "#070A12", fontSize: 17, fontWeight: 900, cursor: "pointer",
          marginBottom: 10,
        }}
      >{copied ? "Link Copied ✓" : "Share this challenge again"}</button>

      {/* Secondary: back to game home */}
      <button
        onClick={onBack}
        style={{
          width: "100%", padding: "13px", borderRadius: 12,
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.18)",
          color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}
      >Back to game</button>
    </>
  );
}
