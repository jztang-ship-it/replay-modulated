// shared/components/BossOutwardEnding.tsx
//
// Phase 2-mount Step 5 — the outward ending that seats the invariant: every VIEW
// of a boss result terminates outward, never a bare Play Again.
//
// ONE READ, BOTH SURFACES: this component is the single source. On the post-play
// surface it records the fresh result, then ALWAYS renders from
// getBossResult(bossChallengeId) — so the post-play render and the revisit
// render (BossLandingView, which passes no freshResult) are byte-identical from
// one source.
//
// Copy (locked, decision 3 — enemy-referential, never self-referential):
//   win  → "I beat today's boss." / loss → "The boss got me. Think you survive them?"
// Structure (locked, decision 4): Challenge Someone / Copy Link ABOVE the line,
// Play Again BELOW — Play Again never alone, never deleted. Share = the boss URL
// (recipients fight the SAME boss — the shared-daily mechanism). Share mechanics
// mirror SelfMatchView.handleReshare (navigator.share → clipboard fallback).
//
// Layout is plain in-flow flex (glass-safe scaffold). Device glass at the Gate.

import { useEffect, useState, type CSSProperties } from "react";
import { recordBossResult, getBossResult, type BossResult } from "@shared/utils/bossResultMemory";
import { track } from "@shared/analytics/analytics";
import { getOrMintReferrerToken } from "@shared/utils/referrerToken";

// Layer C, delta-a: the loss "near-miss" return-arc threshold. A loss within
// this many FP of the boss target reads as a near-miss ("run it back") rather
// than a plain retry. Single source of truth for the close-vs-far loss split.
const NEAR_MISS_MARGIN = 5;

// boss-winscreen-cta (direction A): WIN-action button tiers. Exactly one amber
// primary per state. Presentation only — handlers/labels/testids unchanged.
const WIN_PRIMARY_BTN: CSSProperties = {
  width: "100%", maxWidth: 420, padding: "14px", borderRadius: 12, border: "none",
  background: "#FFB14A", color: "#070A12", fontSize: 15, fontWeight: 900, cursor: "pointer",
};
const WIN_OUTLINE_BTN: CSSProperties = {
  width: "100%", maxWidth: 420, padding: "14px", borderRadius: 12,
  background: "transparent", border: "1px solid rgba(255,255,255,0.25)",
  color: "#EAF0FF", fontSize: 15, fontWeight: 800, cursor: "pointer",
};
const WIN_TEXT_BTN: CSSProperties = {
  background: "transparent", border: "none", color: "rgba(255,255,255,0.6)",
  fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "8px 12px",
};

interface Props {
  sport: string;
  bossChallengeId: string;
  /** Post-play only: the just-played result to record. Omitted on revisit
   *  (the component then renders purely from memory). */
  freshResult?: BossResult;
  /** Play Again — clears the boss + deals a fresh normal hand. */
  onPlayAgain: () => void;
  /** Phase 2-mount Step 4 — two-tier framing. These are boss-STATIC (same at
   *  the post-play and revisit surfaces, so both pass them → byte-identical
   *  render). marquee → the loss copy is margin-based ("came within N of the
   *  X — the near-miss is the draw"); beatable (default) → enemy-referential.
   *  Both WIN copies terminate outward unchanged. targetScore + bossName feed
   *  the marquee margin line; absent (beatable / older callers) → generic. */
  marquee?: boolean;
  targetScore?: number;
  bossName?: string;
  /** 2026-06-23 boss-result unification. "full" (default) = the standalone
   *  outward ending — headline + score + sub + CTAs — used by the REVISIT
   *  landing (BossLandingView) and the dev mock, where there is NO results
   *  board to carry the verdict. "cta-only" = JUST the share/replay CTA block,
   *  for the unified results overlay's CTA slot: the human results board now
   *  renders the verdict (center line) and both totals (ZoneHeaders), so the
   *  headline/score/sub would duplicate it. Same share + result-memory
   *  machinery in both modes — only the verdict chrome is dropped. */
  variant?: "full" | "cta-only";
  /** boss-winscreen-cta (direction A): WIN-action emphasis. "primary" (default,
   *  SOCIAL state) = Challenge someone is the single amber primary. "secondary"
   *  (CLAIM state) = the claim card owns the amber, so Challenge demotes to
   *  outline and Copy link demotes to a text link. Presentation only — no
   *  handler/gate/label change. Revisit landing leaves the default (SOCIAL). */
  challengeTier?: "primary" | "secondary";
  /** boss-winscreen-cta DELTA (Lever B): leanest WIN footer for the unified
   *  results overlay — Copy Link renders as a TEXT link (not an outline button)
   *  and Play Again is DROPPED. Used only by the cta-only overlay slot to claw
   *  back the height the reveal→results no-snap hero costs. The "full" revisit
   *  landing leaves lean=false (keeps Copy outline + Play Again). Presentation
   *  only — handlers/labels/testids unchanged. */
  lean?: boolean;
  /** boss-result-share-payload (Option B): the sharer's just-played attempt uuid.
   *  When present, appended to the forwarded link as &attempt={id} so the
   *  recipient can read this exact attempt (picks + cap + score) for the taunt
   *  overlay / OG card. Opaque uuid (gen_random_uuid), safe in a URL. Additive
   *  to ?ref — absent ⇒ byte-identical bare link. */
  attemptRef?: string;
}

export function BossOutwardEnding({ sport, bossChallengeId, freshResult, onPlayAgain, marquee, targetScore, bossName, variant = "full", challengeTier = "primary", lean = false, attemptRef }: Props) {
  const [result, setResult] = useState<BossResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Single source: record the fresh result (post-play), then render from
  // getBossResult — guarantees fresh === revisited.
  useEffect(() => {
    if (freshResult) recordBossResult(bossChallengeId, freshResult);
    setResult(getBossResult(bossChallengeId));
  }, [bossChallengeId, freshResult?.score, freshResult?.won]);

  if (!result) return null; // revisit with no memory → caller gates; safety net

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/${sport}/challenge/${bossChallengeId}` : "";
  const headline = result.won ? "YOU BEAT TODAY'S BOSS" : "TODAY'S BOSS GOT YOU";

  // Phase 2-mount Step 4 — two-tier loss framing. MARQUEE losses are
  // margin-based: the near-miss is the draw ("came within N of the X"). The
  // margin reads from the boss-static targetScore + the result score (single
  // source) so fresh === revisit. Beatable losses keep the locked enemy-
  // referential line. Both WIN copies terminate outward unchanged.
  const enemy = bossName ?? "the boss";
  const marqueeLoss = marquee === true && !result.won && targetScore != null;
  const margin = marqueeLoss ? Math.max(0, Math.round(targetScore - result.score)) : 0;
  // Enemy-referential / margin-based share text (locked copy).
  const shareText = result.won
    ? "I beat today's boss."
    : marqueeLoss
      ? `I came within ${margin} of ${enemy} — closer than you'll get.`
      : "The boss got me. Think you survive them?";
  // Layer C, delta-a: a LOSS never forwards (beat-to-send is win-only). It runs
  // it back instead — replaying TODAY'S boss via onPlayAgain (App wires it to
  // onTryAgain → re-mount with this same boss snapshot, a fresh draft vs the
  // same target; it is NOT a normal-hand deal in the boss flow). A near-miss
  // (within NEAR_MISS_MARGIN of target) earns the urgent return-arc framing; a
  // far loss gets the plain retry. targetScore absent (older/beatable callers)
  // → treated as a far loss (no margin to claim).
  const lostMargin =
    !result.won && targetScore != null
      ? Math.max(0, Math.round(targetScore - result.score))
      : null;
  const isNearMiss = lostMargin != null && lostMargin <= NEAR_MISS_MARGIN;
  const sub = result.won
    ? "Can your friends?"
    : isNearMiss
      ? lostMargin! <= 1
        ? "One point away."
        : `${lostMargin} away.`
      : "The boss held.";

  // Layer C, delta-b: the forwarded URL carries the sender-stable ?ref={token}
  // BESIDE the single global boss row (bossChallengeId is unchanged — never a new
  // instance). The token is minted ONLY here, at forward time (first Challenge
  // Someone / Copy Link), then reused forever on this device. Pure client; no DB.
  function buildForwardUrl(): string {
    if (!shareUrl) return "";
    const ref = getOrMintReferrerToken();
    let url = `${shareUrl}?ref=${encodeURIComponent(ref)}`;
    // boss-result-share-payload (Option B): carry the sharer's attempt uuid so
    // the recipient lands on the same boss seeing this exact result as the taunt.
    // Additive — absent ⇒ unchanged bare link.
    if (attemptRef) url += `&attempt=${encodeURIComponent(attemptRef)}`;
    if (import.meta.env.DEV) {
      // Layer-C glass harness — surfaces the produced forward URL (with ?ref) so
      // it's readable on a forward. DEV-only.
      // eslint-disable-next-line no-console
      console.log("[boss-forward] share url=", url);
    }
    return url;
  }

  function challengeSomeone() {
    if (typeof navigator === "undefined") return;
    track("challenges", "boss_outward_share", { challenge_id: bossChallengeId, sport, won: result!.won });
    const forwardUrl = buildForwardUrl();
    if (navigator.share) {
      navigator.share({ title: "ReplayIFS — Today's Boss", text: shareText, url: forwardUrl }).catch((err: any) => {
        if (err?.name === "AbortError") return;
        copyLink();
      });
      return;
    }
    copyLink();
  }

  function copyLink() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    track("challenges", "boss_outward_copy", { challenge_id: bossChallengeId, sport, won: result!.won });
    navigator.clipboard
      .writeText(buildForwardUrl())
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })
      .catch(() => { /* ignore */ });
  }

  // cta-only (unified results overlay slot): the board above carries the
  // verdict (center line) + both totals (ZoneHeaders), so headline/score/sub
  // are dropped to avoid duplicating it. "full" keeps them for the standalone
  // surfaces (revisit landing + dev mock) that have no board.
  const ctaOnly = variant === "cta-only";

  return (
    <div
      data-testid="boss-outward-ending"
      data-won={result.won ? "true" : "false"}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 6 }}
    >
      {!ctaOnly && (
        <div style={{ fontSize: 22, fontWeight: 950, color: "#EAF0FF", letterSpacing: 0.4, textTransform: "uppercase" }}>
          {headline}
        </div>
      )}
      {!ctaOnly && (
        <div data-testid="boss-outward-score" style={{ fontSize: 14, color: "rgba(234,240,255,0.7)", fontWeight: 700 }}>
          You scored {result.score.toFixed(1)}
        </div>
      )}
      {!ctaOnly && <div style={{ fontSize: 15, color: "#FFB14A", fontWeight: 800, marginBottom: 6 }}>{sub}</div>}

      {/* Outward branch — ABOVE the line. Layer C, delta-a: BEAT-TO-SEND —
          the forward affordance (Challenge Someone / Copy Link) renders ONLY on
          a win, so every shared boss carries a proof-of-beatability. A loss
          shows NO forward affordance; it offers run-it-back (replay the same
          boss) instead. */}
      {result.won ? (
        // boss-winscreen-cta (direction A, LEAN): exactly one amber primary per
        // state, and the CLAIM moment shows only its true peak.
        //  • SOCIAL (challengeTier="primary"): Challenge amber → Copy link outline
        //    → Play again text. The full share block.
        //  • CLAIM (challengeTier="secondary"): the claim card owns the amber, so
        //    ONLY Challenge (outline) renders here — Copy link + Play again are
        //    NOT composed (they live in SOCIAL, one "Maybe later" tap away). This
        //    is the lean swap that supersedes the full-vertical stack (251→~170).
        // Divider dropped; handlers/labels/testids unchanged.
        <>
          <button
            data-testid="boss-challenge-someone"
            onClick={challengeSomeone}
            style={challengeTier === "primary" ? WIN_PRIMARY_BTN : WIN_OUTLINE_BTN}
          >
            Challenge Someone
          </button>
          {challengeTier === "primary" && (
            <>
              {/* DELTA Lever B: Copy Link is a TEXT link when lean (overlay),
                  an outline button otherwise (revisit landing). */}
              <button
                data-testid="boss-copy-link"
                onClick={copyLink}
                style={lean ? WIN_TEXT_BTN : WIN_OUTLINE_BTN}
              >
                {copied ? "Link Copied ✓" : "Copy Link"}
              </button>
              {/* Play Again — tertiary text. DROPPED when lean (overlay footer
                  budget, Lever B); kept on the revisit landing (full variant). */}
              {!lean && (
                <button
                  data-testid="boss-play-again"
                  onClick={onPlayAgain}
                  style={WIN_TEXT_BTN}
                >
                  Play Again
                </button>
              )}
            </>
          )}
        </>
      ) : (
        // LOSS — untouched. Single run-it-back CTA is the whole affordance
        // (it already replays via onPlayAgain); no Play Again, no share.
        <button
          data-testid="boss-run-it-back"
          onClick={onPlayAgain}
          style={{
            width: "100%", maxWidth: 420, padding: "14px", borderRadius: 12, border: "none",
            background: "#FFB14A", color: "#070A12", fontSize: 15, fontWeight: 900, cursor: "pointer",
          }}
        >
          {isNearMiss ? "Run it back" : "Try again"}
        </button>
      )}
    </div>
  );
}
