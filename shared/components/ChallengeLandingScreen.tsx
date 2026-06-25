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
import { getBossResult } from "@shared/utils/bossResultMemory";
import { BossOutwardEnding } from "./BossOutwardEnding";

interface ChallengeData {
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

interface Props {
  challengeId: string;
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

export function ChallengeLandingScreen({ challengeId, sport, currentUserId, deserializeRoster, validateRosterSnapshot, calculateWinTier, onAccept, onClose }: Props) {
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
    if (!validateRosterSnapshot(data.initial_roster)) {
      setError("Invalid challenge data. It may have expired.");
      return;
    }
    const initialRoster = deserializeRoster(data.initial_roster);
    track("challenges", "challenge_accept", { challenge_id: challengeId, sport });
    track("challenges", "challenge_attempt_start", { challenge_id: challengeId, sport });
    onAccept({
      challengeId: data.challenge_id,
      initialRoster,
      targetScore: data.target_score,
      challengerName: data.challenger_name,
      sport: data.sport,
      season: data.season,
      // Phase 5c S1 (2026-05-31): thread trigger-detail through to the
      // recipient flow. All optional/null-safe — the recipient intro
      // selector handles null values via per-trigger generic fallback.
      //
      // Phase 1 trigger split (2026-06-03): legacy stored rows say
      // "bad_beat"; normalizeTriggerType aliases that to "choke" at this
      // single read boundary so every recipient-side branch downstream
      // sees the renamed key. See challengeTypes.normalizeTriggerType.
      triggerType: normalizeTriggerType(data.trigger_type),
      nearMissGap: data.near_miss_gap ?? null,
      nearMissNextTier: data.near_miss_next_tier ?? null,
      anchorBasePlayerId: data.anchor_base_player_id ?? null,
      topGameTier: data.top_game_tier ?? null,
      // Phase 2 boss delivery (2026-06-21): thread the sender marker through
      // so the play/comparison flow knows this is a boss target. Normalized
      // at this single read boundary, same pattern as triggerType.
      senderKind: normalizeSenderKind(data.sender_kind),
      // Boss claim-prompt (2026-06-26): thread the boss bank id (already on the
      // GET response) to the reveal surface so the post-win claim card has its
      // {team} token. Additive, no migration — same boundary as senderKind.
      bossIdentityId: data.boss_identity_id ?? undefined,
      // Phase 2-mount Step 4: thread the baked two-tier marquee flag (jsonb,
      // no migration) from initial_roster so the result flow can branch the
      // loss copy. Boss-only in practice; humans carry no marquee.
      marquee: (data.initial_roster as { marquee?: boolean } | null)?.marquee === true,
    });
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

        // Phase 2 boss delivery (2026-06-21): a boss is an ownerless
        // challenge presented with an AUTHORED identity (name + flavor),
        // not a human take. Branch here on the normalized sender_kind and
        // render the dedicated boss surface — the player take-card
        // hierarchy (trigger banks, isRealName "your friend" downgrade,
        // pickHeadlineAndCta) stays UNTOUCHED below for sender_kind
        // "player". A boss has created_by null, so isSelfMatch above is
        // always false for it.
        if (normalizeSenderKind(data.sender_kind) === "boss") {
          return (
            <BossLandingView
              data={data}
              cards={cards}
              statsLine={statsLine}
              alreadyAttempted={alreadyAttempted}
              onAccept={handleAccept}
              sport={sport}
              onClose={onClose}
            />
          );
        }

        // Phase 2b: V2 hierarchy lives in ChallengeTakeCardLanding.
        // This shell only routes data + accept-click; the score-first
        // anti-pattern (giant 68px FP at the top, "Think you can beat
        // it?") is gone — replaced by the take-card hierarchy.
        return (
          <ChallengeTakeCardLanding
            data={data}
            statsLine={statsLine}
            alreadyAttempted={alreadyAttempted}
            calculateWinTier={calculateWinTier}
            onAccept={handleAccept}
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

// ── Boss landing surface ───────────────────────────────────────────────────
//
// Phase 2 boss delivery (2026-06-21). A boss is an ownerless challenge with an
// AUTHORED identity: challenger_name carries the boss display ("Banner 18"),
// share_headline carries the authored flavor ("Tatum and Brown finish it").
// This surface presents that identity directly — it does NOT route through the
// player take-card hierarchy (no isRealName "your friend" downgrade, no
// trigger banks, no pickHeadlineAndCta). isRealName is deliberately untouched:
// it remains the player-name gate; the boss name is distinguished only by
// sender_kind === "boss".
//
// Layout reuses the SelfMatchView card-spread scaffold verbatim (plain
// flex-wrap flow, no transforms / scale / absolute positioning) per the
// reuse-working-scaffolds rule. Real-browser bounding-box verification is
// pending device glass at review (this is a hold-for-review build).

interface BossLandingProps {
  data: ChallengeData;
  cards: any[];
  statsLine: string | null;
  alreadyAttempted: boolean;
  onAccept: () => void;
  sport: string;
  onClose: () => void;
}

function BossLandingView({ data, cards, statsLine, alreadyAttempted, onAccept, sport, onClose }: BossLandingProps) {
  // Phase 2-mount Step 5 — REVISIT reconstruction (build-flag 1: the outward
  // ending is owned by the result view, so it must rebuild whenever the result
  // is viewed, not only at resolution). When the user already has a boss result
  // for today (getBossResult — the SAME single source the post-play
  // ChallengeComparisonScreen boss branch reads), the landing reconstructs the
  // outward ending instead of re-offering the accept CTA. Fresh and revisited
  // are byte-identical (both render BossOutwardEnding from getBossResult).
  const priorResult = getBossResult(data.challenge_id);
  // Phase 2-mount Step 4 — two-tier framing. The baked marquee flag rides on
  // initial_roster (jsonb). marquee → a "brutal by design" label pre-play (the
  // impossible tier; the near-miss is the draw) + margin-based loss copy in the
  // outward ending. Beatable bosses carry neither.
  const marquee = (data.initial_roster as { marquee?: boolean } | null)?.marquee === true;
  return (
    <div data-testid="boss-landing">
      {/* Eyebrow — marks the surface as the daily boss. */}
      <div style={{
        fontSize: 14, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
        color: "rgba(255,177,74,0.85)", marginBottom: 8,
      }}>Daily Boss{data.tough_day ? " · Tough Day" : ""}</div>

      {/* Marquee tier — "brutal by design" (Step 4). Shown pre-play so the
          impossible boss is framed before the attempt. */}
      {marquee && (
        <div data-testid="boss-marquee-label" style={{
          display: "inline-block", fontSize: 12, fontWeight: 900, letterSpacing: 1.2,
          textTransform: "uppercase", color: "#FF5A5A",
          border: "1px solid rgba(255,90,90,0.5)", borderRadius: 6,
          padding: "3px 8px", marginBottom: 12,
        }}>Brutal by Design</div>
      )}

      {/* Boss name — the authored identity, verbatim (no real-name gate). */}
      <div data-testid="boss-name" style={{
        fontSize: 30, fontWeight: 900, color: "#EAF0FF", marginBottom: 6, lineHeight: 1.2,
      }}>{data.challenger_name}</div>

      {/* Flavor — the authored one-liner, as the take. Omitted when empty. */}
      {data.share_headline && (
        <div data-testid="boss-flavor" style={{
          fontSize: 15, color: "rgba(234,240,255,0.8)", fontStyle: "italic",
          marginBottom: 16, lineHeight: 1.4, maxWidth: 560,
        }}>{data.share_headline}</div>
      )}

      {statsLine && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 18 }}>{statsLine}</div>
      )}

      {/* Card spread — same visual scaffold as SelfMatchView. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24, justifyContent: "center" }}>
        {cards.map((card: any, i: number) => (
          <div key={i} style={{
            background: "rgba(255,255,255,0.04)", border: `1.5px solid ${TIER_ACCENT[card.tier] ?? "#9CA3AF"}`,
            borderRadius: 10, padding: "10px 14px", minWidth: 120, textAlign: "center",
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: TIER_ACCENT[card.tier] ?? "#9CA3AF", textTransform: "uppercase", marginBottom: 4 }}>{card.tier}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#EAF0FF" }}>{card.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{card.team}{card.salary != null ? ` · $${card.salary}` : ""}</div>
          </div>
        ))}
      </div>

      {priorResult ? (
        /* REVISIT — already played today: reconstruct the outward ending
           (terminates outward; no re-accept CTA). Same single source as the
           post-play sheet. */
        <BossOutwardEnding
          sport={sport}
          bossChallengeId={data.challenge_id}
          marquee={marquee}
          targetScore={data.target_score}
          bossName={data.challenger_name}
          /* Rule 1 (boss fully replayable): the revisit ending's "Play Again"
             RE-ACCEPTS (onAccept → App boss branch → dealFreshRoster → a FRESH
             draft) instead of closing to solo. Same fresh-draft replay as the
             live ending (App.onTryAgain boss branch). The result screen still
             shows on revisit (Option B) — only its action is rewired. */
          onPlayAgain={onAccept}
        />
      ) : (
        <>
          {/* Target line — the score to beat. */}
          <div style={{
            fontSize: 14, fontWeight: 700, color: "rgba(234,240,255,0.85)",
            letterSpacing: 0.6, textAlign: "center", textTransform: "uppercase", marginBottom: 12,
          }}>Target to beat: {data.target_score.toFixed(1)} FP</div>

          {/* Accept CTA. */}
          <button
            data-testid="boss-accept-cta"
            onClick={onAccept}
            style={{
              width: "100%", padding: "16px", borderRadius: 14,
              background: "#FFB14A", border: "none",
              color: "#070A12", fontSize: 17, fontWeight: 900, cursor: "pointer",
              textTransform: "uppercase", letterSpacing: 0.5,
            }}
          >{alreadyAttempted ? "Play Again" : "Take the Boss"}</button>
        </>
      )}
    </div>
  );
}
