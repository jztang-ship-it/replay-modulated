// shared/components/ChallengeLandingScreen.tsx
import { useEffect, useState } from "react";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import type { GeneratedCard } from "@shared/types/index";
import { track } from "@shared/analytics/analytics";
import { chDebug } from "@shared/lib/chDebug";
import { hasAttemptedChallenge } from "@shared/hooks/useChallengeShare";
// (replays are unlimited — hasAttemptedChallenge is still imported below as
//  a hint label for the CTA, never as a block.)
import { isRealName } from "@shared/utils/isRealName";

interface ChallengeData {
  challenge_id: string;
  /** Challenger's auth user_id. Used to detect self-match — when the
   *  current viewer is the original challenger, we render an alternate
   *  surface instead of the accept flow. */
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
  // Phase 5c S1 (2026-05-31): trigger-detail fields. Optional on the wire
  // for backward compat with legacy clients/responses; null on legacy
  // rows (pre-migration 012) and on rows where the trigger didn't emit
  // the field.
  near_miss_gap?: number | null;
  near_miss_next_tier?: string | null;
  anchor_base_player_id?: string | null;
  top_game_tier?: "record" | "career" | "season" | null;
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

export function ChallengeLandingScreen({ challengeId, sport, currentUserId, deserializeRoster, validateRosterSnapshot, onAccept, onClose }: Props) {
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
      triggerType: data.trigger_type as ChallengeCtx["triggerType"],
      nearMissGap: data.near_miss_gap ?? null,
      nearMissNextTier: data.near_miss_next_tier ?? null,
      anchorBasePlayerId: data.anchor_base_player_id ?? null,
      topGameTier: data.top_game_tier ?? null,
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
        const namedChallenger = isRealName(data.challenger_name);
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

        return (
        <>
          {/* Hierarchy (top → bottom):
              1. Big-game / season-reel caption (em-dashed italic) — leads
              2. Score callout: target FP "on this hand."
              3. Sub-question: "Think you can beat it?"
              4. Card spread
              5. Accept Challenge
              6. (optional) tiny stats line and "from {name}" attribution */}

          {data.share_headline && (
            <div style={{
              fontSize: 22, fontStyle: "italic", fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.35, marginBottom: 22, maxWidth: 540,
            }}>
              — {data.share_headline}
            </div>
          )}

          {/* Score callout */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 68, fontWeight: 950, color: "#FFB14A", lineHeight: 1, fontStyle: "italic" }}>
              {data.target_score.toFixed(1)}
            </span>
            <span style={{ fontSize: 22, color: "rgba(255,255,255,0.45)", fontWeight: 700 }}>FP</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#EAF0FF", marginBottom: 22 }}>
            Think you can beat it?
          </div>

          {/* Card spread */}
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

          {/* Accept CTA — replays are unlimited. When the user has played
              this challenge before, label the button "Play Again" so the
              context is clear, but never block. */}
          <button
            onClick={handleAccept}
            style={{
              width: "100%", padding: "16px", borderRadius: 14,
              background: "#FFB14A", border: "none",
              color: "#070A12", fontSize: 17, fontWeight: 900, cursor: "pointer",
              marginBottom: 10,
            }}
          >{alreadyAttempted ? "Play Again" : "Accept Challenge"}</button>

          {/* Small attribution + (optional) stats — minor below the CTA. */}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>
            {namedChallenger && <span>from {data.challenger_name}</span>}
            {namedChallenger && statsLine && <span> · </span>}
            {statsLine && <span>{statsLine}</span>}
          </div>
        </>
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
