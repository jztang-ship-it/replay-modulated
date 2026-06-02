// shared/components/ChallengeSharePrompt.tsx
import { useContext, useMemo, useState } from "react";
import type { GeneratedCard } from "@shared/types/index";
import type { WinTierMap } from "@shared/utils/payoutLogic";
import type { TriggerResult } from "@shared/utils/triggerEvaluation";
import { useChallengeShare } from "@shared/hooks/useChallengeShare";
import { getNickname, setNickname } from "@shared/utils/playerIdentity";
import { isRealName } from "@shared/utils/isRealName";
import { track } from "@shared/analytics/analytics";
import { selectChallengeInitiation } from "@shared/commentary/chadChallenge";
import { NameCaptureModal, type NameCaptureMode } from "@shared/components/NameCaptureModal";
import { RegisterModal } from "@shared/components/RegisterModal";
import { writePendingChallengeShare } from "@shared/components/ResumeShareSurface";
import { AuthContext } from "@shared/auth/AuthProvider";
import { enrichInitialRosterForChallenge } from "@shared/utils/enrichInitialRosterForChallenge";

interface Props {
  sport: string;
  season: string;
  totalFp: number;
  winTier: string;
  roster: GeneratedCard[];
  initialRoster: GeneratedCard[];
  badges: Array<{ id: string; icon: string; label: string; fp: number }>;
  winTiersMap: WinTierMap;
  serializeRoster: (cards: GeneratedCard[]) => Record<string, unknown>;
  triggerResult: TriggerResult;
  /** Caption stored on the challenge (big-game or season-reel copy).
   *  Rendered on the landing page and the share-card PNG. */
  shareHeadline?: string;
  /** When set, the prompt is in rivalry-continuation mode (the player
   *  just beat a challenge and is sending a back-fire from a fresh
   *  hand). Surfaces "Send to {name}" framing instead of generic
   *  trigger labels. null → use existing trigger-driven copy. */
  rivalryTargetName?: string | null;
  /** The audit handId that logHandToDb just persisted to
   *  hand_log.hand_id for this hand. Threaded from GameView via
   *  _useSharedGameState.currentHandIdRef. Reusing it here makes
   *  shared_challenges.hand_id point at the actual hand_log row,
   *  which is what the H2H sender-hand endpoint joins on.
   *
   *  Omitting (or passing undefined) falls back to a fresh UUID —
   *  shouldn't happen under normal flow since RESULTS state is only
   *  entered after logHandToDb has set the ref, but the fallback
   *  keeps the prompt mountable without a hard dependency. Challenges
   *  created via the fallback path will surface as legacy on the
   *  sender-hand endpoint (no matching hand_log row → routed to the
   *  legacy fallback). */
  handId?: string;
  onDismiss?: () => void;
}

export function ChallengeSharePrompt({
  sport, season, totalFp, winTier, roster, initialRoster,
  badges, winTiersMap, serializeRoster, triggerResult, shareHeadline,
  rivalryTargetName, handId, onDismiss,
}: Props) {
  // Phase 5b piece 1 auth-surface unification (2026-05-29, doc lock
  // 2caa7a3). Anonymous users see the share surface (R1) but tapping
  // Challenge a Friend routes directly to RegisterModal in challenge
  // context — no intermediate NameCaptureModal anon mode. signUp /
  // linkGoogle / signIn / signInGoogle pulled from AuthContext to feed
  // the unified RegisterModal.
  const { isAnonymous, signUp, linkGoogle, signIn, signInGoogle } = useContext(AuthContext);
  const [copied, setCopied] = useState(false);
  const { isCreating, challengeId, error, createChallenge, shareChallenge } = useChallengeShare(sport);

  // Rivalry-back mode forces the prominent prompt regardless of the
  // underlying trigger (default-trigger fresh hands would otherwise
  // render as the small corner icon).
  const isRivalryBack = !!rivalryTargetName || (triggerResult.trigger as string) === "rivalry_back";
  const isSpecial = isRivalryBack || triggerResult.trigger !== "default";

  // Rare-pull headline: when the trigger evaluator threaded anchor data
  // through (anchorBasePlayerId + topGameTier), look up the anchor card
  // in roster and ask selectChallengeInitiation for an anchor-aware line
  // from the INITIATION_RARE_PULL bank. Replaces the static
  // triggerResult.headline ("You pulled a legendary game...") that the
  // evaluator ships as a fallback for callers without this wiring.
  //
  // Anchor identity uses basePlayerId not cardId because topGameInfo's
  // star object (in GameView) only carries basePlayerId. A slate doesn't
  // double-up players, so this lookup is unambiguous.
  //
  // useMemo so the line is stable across re-renders within a single hand
  // — recomputing would change the picked line on every parent re-render,
  // which would burn the anti-repeat history and surface different copy
  // on each render of the same hand.
  const rarePullHeadline = useMemo(() => {
    if (triggerResult.trigger !== "rare_pull") return null;
    if (!triggerResult.anchorBasePlayerId || !triggerResult.topGameTier) return null;
    const anchor = roster.find(c => c.basePlayerId === triggerResult.anchorBasePlayerId);
    if (!anchor) return null;
    // lastName extraction matches the existing commentary-layer convention
    // (templateResolver.ts lastName(name) — split on whitespace, take last).
    const last = String(anchor.name ?? "").trim().split(/\s+/).pop() ?? anchor.name ?? "";
    return selectChallengeInitiation({
      winTier,
      roster: roster as Array<{ tier?: string; wasHeld?: boolean }>,
      topGameTier: triggerResult.topGameTier,
      starName: last,
      starHadMeaningfulPerformance: true,
      starAchievementType: triggerResult.topGameTier,
      starAnchorFp: anchor.actualFp,
      starProjectedFp: anchor.projectedFp,
    });
  }, [triggerResult.trigger, triggerResult.anchorBasePlayerId, triggerResult.topGameTier, roster, winTier]);

  const headlineText = rarePullHeadline ?? triggerResult.headline;

  // ── Name capture (Workstream 3 Part 3A) ──────────────────────────────
  // Gate the share on a name-confirmation step:
  //   - no stored real name → FRESH modal ("Who's challenging?")
  //   - stored real name    → CONFIRM modal ("That's you, right? {name}")
  //   - user cancels        → proceed with current localStorage state
  //                           (anonymous if auto-mint placeholder, named
  //                           if they had a real name and just dismissed)
  // The modal never blocks the send — every exit path leads to the
  // share continuing.
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameModalMode, setNameModalMode] = useState<NameCaptureMode>("fresh");
  const [storedName, setStoredName] = useState<string | null>(null);
  // Phase 5b piece 1 auth-surface unification (2026-05-29, doc lock
  // 2caa7a3): anonymous tap opens RegisterModal directly in challenge
  // context. No intermediate NameCaptureModal anon mode; that mode was
  // removed per U3 of the unification lock.
  const [authModalOpen, setAuthModalOpen] = useState(false);

  function onCtaTap() {
    // Anonymous user: unified auth surface in challenge context (U2/U4).
    // Path α (email): RegisterModal observes auth flip in-modal, swaps
    // to post-auth state with name input enabled. Path β (Google): the
    // onBeforeGoogleRedirect hook persists share state to sessionStorage,
    // OAuth redirects the tree, ResumeShareSurface re-mounts the post-
    // auth half on return.
    if (isAnonymous) {
      setAuthModalOpen(true);
      return;
    }
    // Signed-in user: existing NameCaptureModal confirm/edit flow (U6).
    const stored = getNickname();
    if (isRealName(stored)) {
      setStoredName(stored);
      setNameModalMode("confirm");
    } else {
      setStoredName(null);
      setNameModalMode("fresh");
    }
    setNameModalOpen(true);
  }

  // Continuation after the modal closes — fires the existing share path.
  // Pulled out of the original handleChallenge so both submit and cancel
  // routes converge here. getNickname() is re-read at this point so the
  // updated value (if user submitted) flows through automatically.
  //
  // Phase 5b piece 1 (2026-05-29): accepts an optional override so the
  // path-α (email) RegisterModal flow can pass the user's entered name
  // directly. When omitted, getNickname() is read at POST time as before.
  async function continueShareAfterName(nameOverride?: string) {
    track("challenges", "challenge_create", { sport, trigger: triggerResult.trigger });
    let cid = challengeId;
    if (!cid) {
      cid = await createChallenge({
        // Prefer the audit handId threaded through from GameView — it
        // matches the hand_log.hand_id logHandToDb just persisted, which
        // is what the H2H sender-hand endpoint joins on. Fresh UUID
        // fallback only kicks in if the ref wasn't populated (legacy
        // mount paths / future ChallengeSharePrompt callers without the
        // wiring); those challenges will surface as legacy on the
        // sender-hand endpoint per docs/h2h-reveal-arc-design.md
        // "Legacy fallback" origin (b).
        handId: handId ?? crypto.randomUUID(),
        sport, season, totalFp, winTier, roster, initialRoster, badges, winTiersMap,
        challengerName: nameOverride ?? getNickname() ?? "Anonymous",
        serializeRoster,
        shareHeadline,
        // Pass the pre-evaluated trigger through so the DB row's
        // trigger_type matches what fired on the prompt. Without this,
        // useChallengeShare's re-evaluation misses topGameTier and
        // rare_pull hands record as default.
        triggerResult,
      });
    }
    if (!cid) return;
    const url = `${window.location.origin}/${sport}/challenge/${cid}`;
    // Share text is the recipient-facing chad trash-talk (same string
    // stored as share_headline on the DB row, propagated to the landing
    // screen + OG card). Falls back to the poster-facing prompt
    // headline only when shareHeadline is missing — preserves
    // pre-trash-talk-wiring behavior for sports without
    // adapter.getShareHeadline implemented.
    await shareChallenge(shareHeadline ?? triggerResult.headline, url, "");
    if (!navigator.share) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  // Static labels for the fixed-text triggers. The miss trigger is
  // rendered dynamically below so the chip can carry the tier prefix
  // (e.g. "😤 ALL STAR MISS") sourced from triggerResult.nearMissNextTier.
  const TRIGGER_LABEL: Record<string, string> = {
    rare_pull: "⚡ RARE PULL", big_score: "🔥 BIG SCORE",
    bad_beat: "💀 BAD BEAT",
  };
  function missChipLabel(missTier?: string): string {
    const t = (missTier ?? "").replace(/_/g, " ").trim().toUpperCase();
    return t ? `😤 ${t} MISS` : "😤 MISS";
  }

  // Modal mount — same instance handles both CTA paths (corner icon
  // for default trigger, prominent strip for named triggers). Lives at
  // the top of the return tree so React doesn't unmount it when the
  // outer container switches shape.
  const nameModal = (
    <NameCaptureModal
      isOpen={nameModalOpen}
      mode={nameModalMode}
      currentName={storedName ?? undefined}
      // Challenge-specific copy overrides (modal defaults are generic).
      freshHeading="Who's challenging?"
      confirmHeading="That's you, right?"
      submitLabel="Send"
      editSubmitLabel="Save & send"
      confirmLabel="That's me"
      onSubmit={(name) => {
        setNickname(name);
        setNameModalOpen(false);
        void continueShareAfterName(name);
      }}
      onCancel={() => {
        // Signed-in user flow (NameCaptureModal is only mounted for
        // signed-in users post-unification). Cancel falls back to the
        // existing localStorage nickname.
        setNameModalOpen(false);
        void continueShareAfterName();
      }}
    />
  );

  // Phase 5b piece 1 auth-surface unification (2026-05-29, doc lock
  // 2caa7a3): anonymous tap path. Mounts RegisterModal in challenge
  // context. Path α (email) completes in-modal — onChallengeAuthComplete
  // fires the share-POST with the user's entered name. Path β (Google)
  // exits via onBeforeGoogleRedirect, which persists the full share-POST
  // payload to sessionStorage; ResumeShareSurface (mounted at App.tsx
  // level) picks up the resumed flow on return.
  const handlePersistBeforeGoogleRedirect = () => {
    // Phase 0 challenge-snapshot-enrichment (2026-06-02): mirror the
    // useChallengeShare create-path enrichment here. The sessionStorage
    // payload is restored post-redirect by ResumeShareSurface and POSTed
    // as-is to /api/challenge/create; if we don't enrich here too, path-β
    // (anonymous → Google → resume) would write snapshots with
    // holdsRecorded:true over all-false wasHeld, defeating the phase.
    const enrichedInitialRoster = enrichInitialRosterForChallenge(initialRoster, roster);
    // Phase 0 Commit 2 (2026-06-02): also capture the four Phase-5c-S1
    // trigger-detail fields so the resumed POST body matches the normal
    // useChallengeShare path exactly. Without these, OAuth-resumed
    // challenges landed with NULL trigger-detail and the recipient intro
    // selector fell back to generic per-trigger copy.
    writePendingChallengeShare({
      hand_id: handId ?? crypto.randomUUID(),
      sport,
      season,
      total_fp: totalFp,
      initial_roster_serialized: serializeRoster(enrichedInitialRoster),
      trigger_type: triggerResult.trigger,
      share_headline: shareHeadline ?? triggerResult.headline ?? "",
      near_miss_gap: triggerResult.nearMissGap ?? null,
      near_miss_next_tier: triggerResult.nearMissNextTier ?? null,
      anchor_base_player_id: triggerResult.anchorBasePlayerId ?? null,
      top_game_tier: triggerResult.topGameTier ?? null,
    });
  };
  const authModal = authModalOpen && (
    <RegisterModal
      context="challenge"
      onClose={() => setAuthModalOpen(false)}
      onSuccess={() => setAuthModalOpen(false)}
      signUp={signUp}
      linkGoogle={linkGoogle}
      signIn={signIn}
      signInGoogle={signInGoogle}
      onBeforeGoogleRedirect={handlePersistBeforeGoogleRedirect}
      onChallengeAuthComplete={async (displayName) => {
        // Path α (email): the user authed in-modal, entered/confirmed
        // a name, tapped Continue. Fire the share-POST with that name
        // (overrides getNickname). Persist to localStorage so future
        // shares skip the name capture.
        setNickname(displayName);
        setAuthModalOpen(false);
        await continueShareAfterName(displayName);
      }}
    />
  );

  // Default trigger: render a small corner icon only — discoverable for
  // users who want to share a mid hand, but not pushed on them. Named
  // triggers (rare_pull / big_score / miss / bad_beat) keep the
  // prominent share strip.
  if (!isSpecial) {
    return (
      <>
        {nameModal}
        {authModal}
        <button
          onClick={onCtaTap}
          disabled={isCreating}
          aria-label="Challenge a friend with this hand"
          style={{
            position: "fixed",
            right: 14,
            bottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
            zIndex: 9000,
            width: 40, height: 40, borderRadius: 20,
            background: "rgba(255,177,74,0.14)",
            border: "1px solid rgba(255,177,74,0.4)",
            color: "#FFB14A", fontSize: 18, fontWeight: 900,
            cursor: isCreating ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            lineHeight: 1,
          }}
        >
          {isCreating ? "…" : copied ? "✓" : "↗"}
        </button>
      </>
    );
  }

  return (
    <>
    {nameModal}
    {authModal}
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9000,
      background: "linear-gradient(0deg, #0D1628 0%, rgba(13,22,40,0.97) 100%)",
      borderTop: `1px solid rgba(255,177,74,0.3)`,
      padding: "14px 20px max(24px, env(safe-area-inset-bottom, 20px))",
    }}>
      {/* Header row: label + dismiss */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: isSpecial ? "#FFB14A" : "rgba(255,255,255,0.4)", letterSpacing: 0.5 }}>
          {isRivalryBack
            ? `↩ CHALLENGE ${(rivalryTargetName ?? "Your Friend").toUpperCase()} BACK`
            : isSpecial
              ? (triggerResult.trigger === "miss"
                  ? missChipLabel(triggerResult.nearMissNextTier)
                  : TRIGGER_LABEL[triggerResult.trigger] ?? "CHALLENGE")
              : "CHALLENGE A FRIEND"}
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              background: "none", border: "none", padding: "2px 4px",
              color: "rgba(255,255,255,0.35)", fontSize: 18, cursor: "pointer", lineHeight: 1,
            }}
            aria-label="Dismiss"
          >✕</button>
        )}
      </div>
      {isSpecial && (
        <div style={{ fontSize: 14, color: "#EAF0FF", marginBottom: 12, lineHeight: 1.4 }}>
          {isRivalryBack
            ? `${totalFp.toFixed(1)} FP on a fresh slate. Send it to ${rivalryTargetName ?? "your friend"}.`
            : headlineText}
        </div>
      )}
      {/* Phase 5b piece 1 R1 (2026-05-28, doc lock 3da7f02): placeholder
          commentary copy in the bottom-slot region. Hardcoded; phase 7
          (commentary engine) replaces with engine-driven copy that
          adapts per-challenge or per-context. Universal — renders for
          anonymous and signed-in users alike, gated only by isSpecial
          (the small corner-icon variant has no copy region to host it). */}
      {isSpecial && (
        <div
          data-h2h-share-bottom-slot="placeholder"
          style={{
            fontSize: 12,
            color: "rgba(234,240,255,0.65)",
            lineHeight: 1.45,
            marginBottom: 12,
          }}
        >
          the best part of our game is you can compete with your friends to see who can pull the best games
        </div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>
          Failed to create challenge — make sure you're signed in.
        </div>
      )}
      <button
        onClick={onCtaTap}
        disabled={isCreating}
        style={{
          width: "100%", padding: isSpecial ? "14px" : "10px", borderRadius: 12,
          background: isCreating ? "rgba(255,177,74,0.3)" : isSpecial ? "#FFB14A" : "rgba(255,177,74,0.12)",
          border: isSpecial ? "none" : "1px solid rgba(255,177,74,0.4)",
          color: isSpecial ? "#070A12" : "#FFB14A",
          fontSize: isSpecial ? 15 : 13, fontWeight: 900,
          cursor: isCreating ? "default" : "pointer", letterSpacing: 0.5,
        }}
      >
        {isCreating
          ? "Creating..."
          : copied
            ? "Link Copied! ✓"
            : isRivalryBack
              ? `Send to ${rivalryTargetName ?? "your friend"}`
              : "Challenge a Friend"}
      </button>
    </div>
    </>
  );
}
