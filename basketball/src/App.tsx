import { useEffect, useState } from "react";
import { LandingPage } from "./components/LandingPage";

// Dev-only mock route. Static import + import.meta.env.DEV guard at the
// usage site below. Production builds dead-code-eliminate the branch
// (Vite constant-folds DEV → false), which leaves H2HRevealMockRoute
// unreferenced; Rollup tree-shakes it out of the production bundle.
//
// Why not lazy(): the original attempt at code-splitting via lazy() +
// Suspense kept the bundle clean but introduced a fragility — under a
// stale Vite dev-server state (regenerated optimizeDeps with a new ?v=
// hash, HMR boundary mismatch after the dev/ directory landed mid-
// session, browser-cached chunk URLs that no longer exist), the dynamic
// chunk fetch 404s and the Suspense boundary hangs with no surfaced
// error. Phase 2 smoke surfaced exactly this on the user's session.
// Static import sidesteps the entire dynamic-chunk surface; the dev
// route is too narrow to justify the lazy mechanism's failure modes.
import H2HRevealMockRoute from "./dev/H2HRevealMockRoute";
import H2HPlayMockRoute from "./dev/H2HPlayMockRoute";
import ChallengeLandingMockRoute from "./dev/ChallengeLandingMockRoute";
import HeadlineMockRoute from "./dev/HeadlineMockRoute";
import BossLandingMockRoute from "./dev/BossLandingMockRoute";
import BossClaimMockRoute from "./dev/BossClaimMockRoute";
import BossHubMockRoute from "./dev/BossHubMockRoute";
import GameView from "./views/GameView";
import { DailySeasonReelGate } from "./components/DailySeasonReelGate";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "@shared/auth/AuthProvider";
import { useAuth } from "@shared/auth/useAuth";
import { isSoloFtueFirstRun } from "@shared/utils/soloFtue";
import { RegisterModal } from "@shared/components/RegisterModal";
import { ResumeShareSurface } from "@shared/components/ResumeShareSurface";
import { ChallengeSentConfirmation } from "@shared/components/ChallengeSentConfirmation";
import { readSentChallenge, hasSentChallenge } from "@shared/utils/sentChallengePersist";
import { PasswordResetSurface } from "@shared/components/PasswordResetSurface";
import { ProfileScreen } from "@shared/components/ProfileScreen";
import { getPlayerUid, getNickname } from "@shared/utils/playerIdentity";
import { AchievementWall } from "@shared/components/AchievementWall";
import { useAchievements } from "@shared/hooks/useAchievements";
import { ChallengeLandingScreen, buildChallengeCtx, type ChallengeData } from "@shared/components/ChallengeLandingScreen";
import { track } from "@shared/analytics/analytics";
import { H2HRecipientPlay } from "@shared/components/H2HRecipientPlay";
import type { ChallengeCtx, ChallengeBackCtx } from "@shared/adapters/challengeTypes";
import { sportAdapter } from "./adapters/SportAdapter";
// Phase 5b piece 2b+2c (2026-05-30): challenge-link tap routes to the
// H2H surface directly (P1). Renderers + adapters previously lived only
// inside the basketball GameView wrapper; they're now imported here so
// the App can mount H2HRecipientPlay without going through GameView.
import { h2hArcRenderer, h2hOverlayRenderer } from "./views/GameView";
import { redrawRoster, resolveRoster, dealFreshRoster } from "./adapters/gameAdapter";
import { calculateWinTier } from "./utils/payoutLogic";

// ?debug=1 overlay. Eager import (not lazy) so a chunk-load failure
// can't silently hide it behind a null Suspense fallback. Mounted at
// the app shell level so it renders on every route — chooser landing,
// challenge landing, FTUE, game view.
import { ChallengeDebugPanel } from "@shared/components/ChallengeDebugPanel";
import { chDebug } from "@shared/lib/chDebug";
import { retryWithBackoff } from "@shared/lib/retryWithBackoff";

const SPORT = "basketball";
const SKIP_LANDING_KEY = "replay_skip_landing_basketball";

/** Extract target userId from /basketball/profile/:userId path.
 *  Returns null for all other paths. */
function getProfileUserId(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/\/basketball\/profile\/([0-9a-f-]{36})/);
  return match ? match[1] : null;
}

/** Walk the rm_challenge_attempted_<uuid> markers in localStorage and
 *  return one of them. Order is insertion-order on most browsers, so
 *  this surfaces a recent attempt — good enough for the debug panel to
 *  show stats on the home route without a challenge URL. */
function mostRecentAttemptedChallengeId(): string | null {
  try {
    const PREFIX = "rm_challenge_attempted_";
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) return k.slice(PREFIX.length);
    }
  } catch { /* localStorage may be unavailable */ }
  return null;
}

function getChallengeId(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/\/basketball\/challenge\/([0-9a-f-]{36})/);
  return match ? match[1] : null;
}

/** Layer C, delta-b/c capture: the sender-stable referral token off a forwarded
 *  boss link's ?ref param (BESIDE the single global boss id in the path). Read
 *  alongside getChallengeId; the strip in the mount effect preserves ?ref
 *  (only signin/play/profile are removed), so it survives to accept time. Null
 *  when absent → the recipient attempt carries no token (byte-identical path). */
function getRefToken(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("ref");
  return raw && raw.length > 0 ? raw : null;
}

/** Dev-only route detector. Matches /basketball/dev/<slug> paths and
 *  returns the slug. Production users have no entry point here.
 *
 *  Currently used by the H2H reveal arc phase 2 mock at
 *  /basketball/dev/h2h-reveal-mock. New dev routes append a case to
 *  the switch below. See docs/h2h-reveal-arc-design.md "Phase 2
 *  integration anchors" for the locked dev-route convention. */
function getDevRouteSlug(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/\/basketball\/dev\/([a-z0-9-]+)$/);
  // Layer-C glass harness — DEV-gated dev-route trace. Retained (not throwaway):
  // diagnoses dev-mock routing for the rest of layer C. Pruned from prod by the
  // import.meta.env.DEV guard.
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[dev-route] pathname=", window.location.pathname, "| slug=", match ? match[1] : null, "| DEV=", import.meta.env.DEV);
  }
  return match ? match[1] : null;
}

function AppInner() {
  // Dev-route short-circuit. Renders before any app-shell work (auth,
  // FTUE, daily reel gate, GameView) so the dev surface is isolated
  // from production state. The `import.meta.env.DEV` guard ensures the
  // whole branch (and the H2HRevealMockRoute static import at the top
  // of this file) gets dead-code-eliminated in production builds.
  // Production users have no entry point to /dev/* paths regardless;
  // the guard is defense-in-depth + the mechanism Rollup uses to
  // prune the dev-only import from the prod bundle.
  const devSlug = getDevRouteSlug();
  if (import.meta.env.DEV && devSlug === "h2h-reveal-mock") {
    return <H2HRevealMockRoute />;
  }
  if (import.meta.env.DEV && devSlug === "boss-claim-mock") {
    return <BossClaimMockRoute />;
  }
  if (import.meta.env.DEV && devSlug === "boss-hub-mock") {
    return <BossHubMockRoute />;
  }
  if (import.meta.env.DEV && devSlug === "h2h-play-mock") {
    return <H2HPlayMockRoute />;
  }
  if (import.meta.env.DEV && devSlug === "challenge-landing-mock") {
    return <ChallengeLandingMockRoute />;
  }
  if (import.meta.env.DEV && devSlug === "headline-mock") {
    return <HeadlineMockRoute />;
  }
  if (import.meta.env.DEV && devSlug === "boss-outward-mock") {
    // Layer-C glass harness — retained DEV-only trace (inside the DEV guard).
    // eslint-disable-next-line no-console
    console.log("[boss-mock] case hit, slug=", devSlug);
    return <BossLandingMockRoute />;
  }

  const challengeIdFromUrl = getChallengeId();
  const { user, uid, isAuthenticated, isAnonymous, authReady, signUp, linkGoogle, signIn, signInGoogle } = useAuth();
  const profileUserId = getProfileUserId();
  const [challengeCtx, setChallengeCtx] = useState<ChallengeCtx | null>(null);
  // Rivalry-continuation context. Set when a recipient wins a challenge
  // and taps "Send It Back" — they're routed to a fresh normal hand and
  // the share prompt auto-fires at RESULTS framed as a back-challenge.
  // Cleared once the user dismisses or shares the resulting challenge.
  const [challengeBackCtx, setChallengeBackCtx] = useState<ChallengeBackCtx | null>(null);
  const [showChallengeLanding, setShowChallengeLanding] = useState(!!challengeIdFromUrl);
  // Phase 5b piece 2 (rework 2026-05-30, a6f158c + 874b6ad + Fix B/C2):
  // recipient-play surface gate. Set on challenge accept (P1) so
  // H2HRecipientPlay mounts instead of GameView. h2hPlayKey is bumped
  // on Try Again to force a clean re-mount of the playing surface
  // (state machine resets to pre_deal, fresh resolve).
  const [h2hPlayingMode, setH2hPlayingMode] = useState(false);
  const [h2hPlayKey, setH2hPlayKey] = useState(0);
  // OAuth-resume sender confirmation (build lock: docs/locks/
  // oauth-resume-sender-confirmation-lock.md, rev 2). Holds
  // {challengeId, shareUrl, sport, shareHeadline} once ResumeShareSurface
  // has posted the resumed challenge; ChallengeSentConfirmation
  // (consolidated modal — preview + link field + six destination
  // buttons + Copy link) renders over the IDLE tree until the user
  // dismisses. The signed-in path is byte-unchanged — it still relies
  // on the RESULTS-phase ChallengeSharePrompt's implicit
  // "Link Copied! ✓".
  const [resumeSent, setResumeSent] = useState<{
    challengeId: string;
    shareUrl: string;
    sport: string;
    shareHeadline: string;
  } | null>(null);
  // BUG 2: peek (no burn) at mount whether a sent-challenge restore is pending, so we can
  // SKIP the season reel for this boot — the reel shouldn't fire mid-restore and cover the
  // restored sheet. Stable for the session; a fresh boot re-peeks (burned/expired → false).
  const [restorePending] = useState(() => hasSentChallenge());
  // BUG 2: cold-boot restore. If an external-share round-trip discarded+reloaded the tab
  // while a minted challenge sheet was open, re-show the SAME sheet (same link) from the
  // localStorage cache so the challenge stays reachable. readSentChallenge burns-on-read
  // (consume-once) so a later unrelated boot never re-shows it. challengeId derived from
  // the URL (the sheet render uses only shareUrl/sport/shareHeadline).
  useEffect(() => {
    const s = readSentChallenge();
    if (!s) return;
    setResumeSent({
      challengeId: s.shareUrl.split("/").filter(Boolean).pop() ?? "",
      shareUrl: s.shareUrl, sport: s.sport, shareHeadline: s.shareHeadline,
    });
  }, []);
  const { unlockedIds: ownUnlockedIds } = useAchievements();
  const showDebug = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";

  // The flippable-card landing is a marketing-direct-link surface only.
  // The chooser appends ?play=1 to bypass it, and we set a sticky flag so
  // the user never sees that page again on direct visits either.
  const skipLanding = (() => {
    if (typeof window === "undefined") return false;
    const fromChooser = new URLSearchParams(window.location.search).get("play") === "1";
    if (fromChooser) {
      try { localStorage.setItem(SKIP_LANDING_KEY, "1"); } catch { /* ignore */ }
      return true;
    }
    try { return localStorage.getItem(SKIP_LANDING_KEY) === "1"; } catch { return false; }
  })();

  // FTUE removed (feat/kill-ftue-real-game): the marketing landing interstitial
  // was gated on the first-time-user flag (anon first-timers). With FTUE gone, the daily season
  // reel is the front door for everyone, so the initial view is always "game"
  // (the reel gate renders inside it). The `view === "landing"` branch +
  // LandingPage are left intact for a possible future re-enable; nothing
  // auto-routes to them now.
  const [view, setView] = useState<"landing" | "game">("game");

  // Modal/overlay state lifted to App level so it overlays both landing
  // and game views, AND so query-param entry points (?signin=1 from the
  // chooser sign-in icon, ?profile=1 from the chooser nickname tap) can
  // open the right surface on mount.
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const [showSignIn, setShowSignIn] = useState(() => params?.get("signin") === "1");
  const [showProfile, setShowProfile] = useState(() => params?.get("profile") === "1");

  // Strip handoff params after mount so refresh doesn't re-fire them.
  // SURGICAL: remove ONLY the handoff params (signin, play, profile).
  // Preserve everything else — particularly `?debug=1`, `?skipFtue=1`,
  // `?skip_ftue=1`, and `?ftue=1` which testers need to survive across
  // mount cycles. Replacing the whole search string with empty (the
  // previous behavior) was nuking `?debug=1` whenever the user arrived
  // via the chooser's `?play=1`, which is exactly when QA most wants
  // the debug panel visible.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const HANDOFF = ["signin", "play", "profile"];
    let dirty = false;
    for (const k of HANDOFF) if (sp.has(k)) { sp.delete(k); dirty = true; }
    if (!dirty) return;
    const remaining = sp.toString();
    const next = remaining ? `${window.location.pathname}?${remaining}` : window.location.pathname;
    window.history.replaceState({}, "", next);
  }, []);

  const handlePlay = () => {
    try { localStorage.setItem(SKIP_LANDING_KEY, "1"); } catch { /* ignore */ }
    setView("game");
  };

  // Boss replay (rule 1: fully replayable). Re-drafts a FRESH five excluding the
  // boss five (from resolvedSenderHand — initialRoster was overwritten by the
  // first draft) and re-mounts H2HRecipientPlay with it. Reuses the existing
  // dealFreshRoster seam; resolvedSenderHand (the boss opponent) is preserved so
  // the reveal still races the same boss. Boss-only — wired into onTryAgain
  // below for the boss path; humans keep the same-five key-bump retake.
  const replayBossFreshDraft = () => {
    const ctx = challengeCtx;
    if (!ctx || ctx.senderKind !== "boss") return;
    const bossFive = ctx.resolvedSenderHand?.cards ?? [];
    const excludeBaseIds = new Set(
      bossFive
        .map((bc) => String((bc as { basePlayerId?: string }).basePlayerId ?? "").trim())
        .filter(Boolean),
    );
    chDebug("bossReplay:start", { challengeId: ctx.challengeId, season: ctx.season, exclude: excludeBaseIds.size });
    dealFreshRoster(ctx.season, excludeBaseIds)
      .then(({ roster }) => {
        chDebug("bossReplay:dealt", { challengeId: ctx.challengeId, dealt: roster.length });
        setChallengeCtx({
          ...ctx,
          startMode: "draft-fresh",
          initialRoster: roster as unknown as import("@shared/types/index").GeneratedCard[],
        });
        setH2hPlayKey((k) => k + 1);
      })
      .catch((e) => {
        // Degrade — never block the user. Replay the existing five (key bump).
        console.error("[boss] replay draft-fresh failed; replaying current five:", e);
        setH2hPlayKey((k) => k + 1);
      });
  };

  // [ch-debug] render-gate tripwire. Fires on every transition of the
  // gate inputs. `branch` names what the JSX would mount next render —
  // the primary signal for the ripe-challenge "drops to fresh deal"
  // investigation: a transition where challengeCtx flips to null and
  // branch lands on GameView is the bug. !!challengeCtx in the dep
  // array (not challengeCtx itself) avoids re-firing on identity
  // changes that don't flip presence.
  useEffect(() => {
    const branch = h2hPlayingMode && challengeCtx
      ? "H2HRecipientPlay"
      : view === "landing"
        ? "LandingPage"
        : "GameView";
    chDebug("gate transition", {
      h2hPlayingMode,
      challengeCtx: challengeCtx?.challengeId ?? null,
      view,
      branch,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h2hPlayingMode, !!challengeCtx, view]);

  // Consolidation Phase 3 step 1 — the challenge-accept handler, LIFTED from the
  // ChallengeLandingScreen.onAccept inline arrow so it is reachable by both the
  // cold landing (onAccept={handleChallengeAccept}) AND the in-app boss-direct
  // path (handleTakeBossInApp below). Body is byte-identical to the prior inline
  // arrow — acceptProceed tail + boss draft-fresh branch unchanged — so the human
  // and self-match cold paths are behaviorally untouched.
  const handleChallengeAccept = (ctx: ChallengeCtx) => {
            const acceptProceed = (c: ChallengeCtx) => {
            chDebug("setChallengeCtx", {
              from: "onAccept",
              prev: { challengeId: challengeCtx?.challengeId ?? null, h2hPlayingMode },
              next: { challengeId: c.challengeId, h2hPlayingMode: true },
            });
            // Layer C, delta-b/c: stamp the forwarded ?ref token onto the ctx
            // at the single accept point (covers boss draft-fresh, its fallback,
            // and the human path). Optional — undefined when no ?ref, so
            // non-forwarded attempts are byte-identical.
            const __refToken = getRefToken() ?? undefined;
            if (import.meta.env.DEV) {
              // Layer-C glass harness — confirms capture on the real recipient
              // flow (DEV-only). Read this in the console while glassing a
              // /basketball/challenge/<id>?ref=<token> link.
              // eslint-disable-next-line no-console
              console.log("[ref-capture] challengeId=", c.challengeId, "refToken=", __refToken ?? "(none)");
            }
            setChallengeCtx({ ...c, refToken: __refToken });
            setShowChallengeLanding(false);
            try { localStorage.setItem(SKIP_LANDING_KEY, "1"); } catch {}
            setView("game");
            // P1 (2b+2c): challenge-link tap routes to H2H surface
            // directly, not the normal game UI. setView("game") stays
            // above so the post-H2H flow (Send It Back / Play Own Hand
            // / Dismiss) drops back into GameView without re-routing.
            //
            // Phase 2-mount Step 2 (routing — supersedes Step 5): the boss now
            // flows through H2HRecipientPlay like any sender. The empty-
            // battlefield problem is gone: resolvedSenderHand carries the boss
            // five (sender-hand boss branch) as the OPPONENT, and the
            // recipient's own hand is the fresh draft (Step 1). At results,
            // H2HRecipientReveal swaps in BossOutwardEnding (Step 3) so the boss
            // terminates OUTWARD. So h2hPlayingMode is unconditionally true —
            // human and boss share one path; the boss is separated at accept
            // (fresh draft + outward ending), never branched inside the surface.
            setH2hPlayingMode(true);
            setH2hPlayKey(k => k + 1);

            // Dev affordance — phase 5a commit 3 (2026-05-27).
            // When `?mockSenderHand=1` is in the URL AND we're in a
            // dev build, populate resolvedSenderHand from the mock
            // fixture instead of hitting the real endpoint. Lets us
            // verify the full H2H wrapper chain locally until the
            // phase-1 endpoint deploys. `import.meta.env.DEV` causes
            // Rollup to dead-code-eliminate this branch + the
            // dynamic import in production builds.
            try {
              const sp = new URLSearchParams(window.location.search);
              if (import.meta.env.DEV && sp.get("mockSenderHand") === "1") {
                // eslint-disable-next-line no-console
                console.warn("[h2h] DEV: using mock fixture via ?mockSenderHand=1");
                import("./dev/h2hMockFixture").then(({ SENDER_HAND }) => {
                  setChallengeCtx((prev) => {
                    const match = !!(prev && prev.challengeId === c.challengeId);
                    const next = match
                      ? {
                          ...prev!,
                          resolvedSenderHand: {
                            handId: "dev-mock",
                            totalFp: SENDER_HAND.totalFp,
                            tier: SENDER_HAND.tier,
                            cards: SENDER_HAND.cards as unknown as import("@shared/types/index").GeneratedCard[],
                          },
                        }
                      : prev;
                    chDebug("setChallengeCtx", {
                      from: "mockFixture",
                      prev: prev ? { challengeId: prev.challengeId } : null,
                      next: next ? { challengeId: next.challengeId, resolvedSenderHand: !!next.resolvedSenderHand } : null,
                      match,
                    });
                    return next;
                  });
                }).catch(() => { /* dev-only path; failure is non-fatal — fallback to ChallengeComparisonScreen */ });
                return; // skip the real fetch
              }
            } catch { /* URL parse failure — fall through to real fetch */ }

            // Phase 5a commit 2 (2026-05-27): non-blocking sender-hand
            // prefetch. The existing flow proceeds unchanged
            // (auto-deal → HOLD → DEAL → reveal → results). Commit 3's
            // H2H wrapper reads challengeCtx.resolvedSenderHand to
            // decide whether to mount the H2H reveal arc or fall back
            // to ChallengeComparisonScreen. Failure modes — network,
            // 4xx/5xx, legacy `sender_resolved:false` — all leave
            // resolvedSenderHand undefined, which commit 3 treats as
            // the fallback signal.
            //
            // Boss (Phase 2-mount Step 1): the sender-hand endpoint's boss
            // branch returns the baked five → resolvedSenderHand, so the boss
            // is the OPPONENT here. The recipient's own hand is the fresh
            // draft already swapped onto c.initialRoster above. Distinct.
            const __chDebugPrefetchUrl = `/api/challenge/${c.challengeId}/sender-hand`;
            const __chDebugPrefetchStart = Date.now();
            chDebug("senderHand:start", { url: __chDebugPrefetchUrl });
            // Fail-open path-split (docs: "Missing opponent hand: fail-open
            // floor"). TRANSIENT failures (network / 4xx / 5xx) throw → retry
            // with bounded backoff, then degrade to the fail-open floor. LEGACY
            // (sender_resolved:false, hand never stored) resolves WITHOUT
            // throwing → no retry, immediate fail-open. Either way a missing
            // resolvedSenderHand never blanks — H2HRecipientPlay routes the arc
            // to the visible no-opponent floor.
            retryWithBackoff(
              async (attempt) => {
                const r = await fetch(__chDebugPrefetchUrl);
                chDebug("senderHand:response", {
                  url: __chDebugPrefetchUrl,
                  status: r.status,
                  ok: r.ok,
                  attempt,
                  ms: Date.now() - __chDebugPrefetchStart,
                });
                if (!r.ok) throw new Error(`http_${r.status}`); // transient → retry
                return r.json();
              },
              { attempts: 3, backoffMs: [400, 900] },
            )
              .then((d) => {
                if (d.sender_resolved === false) {
                  chDebug("senderHand:legacyFallback", {
                    reason: d.reason,
                    resolvedSenderHandUndefined: true,
                  });
                  // eslint-disable-next-line no-console
                  console.warn("[h2h] sender hand legacy fallback:", d.reason);
                  return;
                }
                // Functional setState guards against re-navigation
                // races: if the user cleared/replaced challengeCtx
                // between prefetch start and resolve, drop the
                // response.
                setChallengeCtx((prev) => {
                  const match = !!(prev && prev.challengeId === c.challengeId);
                  const next = match
                    ? { ...prev!, resolvedSenderHand: d.sender }
                    : prev;
                  chDebug("setChallengeCtx", {
                    from: "senderHandFetch",
                    prev: prev ? { challengeId: prev.challengeId } : null,
                    next: next ? { challengeId: next.challengeId, resolvedSenderHand: !!next.resolvedSenderHand } : null,
                    match,
                    resolvedSenderHandUndefined: !next || !next.resolvedSenderHand,
                  });
                  return next;
                });
              })
              .catch((err) => {
                // TRANSIENT EXHAUSTED — retries failed. Fail open (leave
                // resolvedSenderHand undefined → no-opponent floor).
                chDebug("senderHand:catch", {
                  url: __chDebugPrefetchUrl,
                  error: String(err),
                  ms: Date.now() - __chDebugPrefetchStart,
                  resolvedSenderHandUndefined: true,
                });
                // eslint-disable-next-line no-console
                console.warn("[h2h] sender hand prefetch failed after retries:", err);
              });
            };

            // Boss → draft-fresh (async); human → proceed immediately.
            if (ctx.senderKind === "boss") {
              const bossFive = ctx.initialRoster ?? [];
              const excludeBaseIds = new Set(
                bossFive
                  .map((bc) => String((bc as { basePlayerId?: string }).basePlayerId ?? "").trim())
                  .filter(Boolean),
              );
              chDebug("bossDraftFresh:start", {
                challengeId: ctx.challengeId,
                season: ctx.season,
                exclude: excludeBaseIds.size,
              });
              dealFreshRoster(ctx.season, excludeBaseIds)
                .then(({ roster }) => {
                  chDebug("bossDraftFresh:dealt", { challengeId: ctx.challengeId, dealt: roster.length });
                  acceptProceed({
                    ...ctx,
                    startMode: "draft-fresh",
                    initialRoster: roster as unknown as import("@shared/types/index").GeneratedCard[],
                  });
                })
                .catch((e) => {
                  // Degrade — never block the user. Fall back to the inherited
                  // five (pre-Step-1 behavior); the challenge still plays and
                  // terminates outward. Not the locked mechanic, but safe.
                  // eslint-disable-next-line no-console
                  console.error("[boss] draft-fresh deal failed; falling back to inherited five:", e);
                  chDebug("bossDraftFresh:error", { challengeId: ctx.challengeId, error: String(e) });
                  acceptProceed({ ...ctx, startMode: "draft-fresh" });
                });
              return;
            }
            acceptProceed(ctx);
  };

  // Consolidation Phase 3 step 1 — in-app boss-direct accept. The hub (BossScreen,
  // inside GameView) already fetched this row for its lineup/target; here we build
  // the SAME ctx the cold landing builds and run handleChallengeAccept directly —
  // NO landing render, NO refetch. Telemetry: the cold path fires link_open on the
  // landing mount + accept/attempt_start in handleAccept; the in-app path has no
  // landing mount, so fire the same trio here (same args, same boundary).
  const handleTakeBossInApp = (raw: unknown) => {
    const data = raw as ChallengeData;
    if (!data || !data.challenge_id) return;
    track("challenges", "challenge_link_open", { challenge_id: data.challenge_id, sport: SPORT });
    track("challenges", "challenge_accept", { challenge_id: data.challenge_id, sport: SPORT });
    track("challenges", "challenge_attempt_start", { challenge_id: data.challenge_id, sport: SPORT });
    const ctx = buildChallengeCtx(data, {
      deserializeRoster: (snap) => sportAdapter.deserializeRoster(snap),
      validateRosterSnapshot: (snap) => sportAdapter.validateRosterSnapshot(snap),
    });
    if (!ctx) return; // invalid/expired baked data — abort (hub stays up, never blanks)
    handleChallengeAccept(ctx);
  };

  return (
    <>
      {/* Phase 5b piece 1 auth-surface unification (2026-05-29, doc lock
          2caa7a3): path-β resume controller. Anonymous user → Challenge a
          Friend → Google → redirect → tree rebuilds → this surface picks
          up the persisted share state and renders the post-auth half of
          the unified modal. Silent no-op when there's no pending share. */}
      <ResumeShareSurface onResumeChallengeCreated={setResumeSent} />
      {/* Phase 5b piece 1 U4-g (2026-05-28, doc lock 8004211): password
          recovery surface. Self-managed state machine: email-entry
          (triggered by RegisterModal's Forgot password link via
          AuthContext counter), confirmation, recovery-landing (triggered
          by Supabase PASSWORD_RECOVERY event). Silent no-op otherwise. */}
      <PasswordResetSurface />
      {showDebug && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100000,
          background: "rgba(0,0,0,0.85)", color: "#7FFF00", fontFamily: "monospace",
          fontSize: 10, padding: "6px 8px", lineHeight: 1.4, wordBreak: "break-all",
          pointerEvents: "none",
        }}>
          isAnon={String(isAnonymous)} | view={view} | skipLanding={String(skipLanding)}<br/>
          uid={uid?.slice(0, 16) || "none"} | email={user?.email || "none"} | confirmed={user?.email_confirmed_at ? "Y" : "N"} | provider={(user?.app_metadata as any)?.provider || "none"}<br/>
          stickyFlag={typeof window !== "undefined" ? localStorage.getItem(SKIP_LANDING_KEY) || "unset" : "ssr"}
        </div>
      )}
      {/* ?debug=1 challenge overlay — renders on every route, not just
          in-game. challengeId resolves to:
            1. challengeCtx after Accept (in-game)
            2. otherwise the URL slug if the user is on a /challenge/:id
               path (pre-accept landing screen)
            3. otherwise the most recently attempted challenge id from
               localStorage so the panel still surfaces "what was I
               testing" even on the home/chooser route.
          When all three miss, the panel hides the Current Challenge
          section and shows identity + last API call only. */}
      {showDebug && (
        <ChallengeDebugPanel
          challengeId={
            challengeCtx?.challengeId
            ?? challengeIdFromUrl
            ?? (typeof window !== "undefined" ? mostRecentAttemptedChallengeId() : undefined)
            ?? undefined
          }
          userId={uid || undefined}
          userName={getNickname() || "anonymous"}
        />
      )}
      {h2hPlayingMode && challengeCtx ? (
        /* Phase 5b piece 2b+2c (2026-05-30): recipient-play surface.
           Replaces GameView for the entire challenge play through
           reveal + overlay. The inner H2HRecipientReveal mounts after
           the 800ms slot-6-fill hold + resolveRoster. CTA handlers
           drop back to GameView with appropriate state (clear ctx +
           h2hPlayingMode for Dismiss/PlayOwnHand; set challengeBackCtx
           for Send It Back; key bump for Try Again). */
        <H2HRecipientPlay
          key={h2hPlayKey}
          challengeCtx={challengeCtx}
          sport={SPORT}
          /* 4a SWAP: the recipient inherits the sender's five and runs the full
             3 rounds (docs §"Score-Is-The-Object + 3-round universal"). Mirrors
             the basketball GameAdapter's maxRounds:3 (basketball/src/views/
             GameView.tsx:241); default in the component is 1 (single-shot). */
          maxRounds={3}
          redrawRoster={redrawRoster}
          resolveRoster={resolveRoster}
          calculateWinTier={calculateWinTier as (totalFp: number) => string}
          /* h2hArcRenderer's pre-reveal branch (revealed=false →
             isRevealing=true on AthleteCard) is exactly the rich
             pre-reveal visual the playing-mode strip wants — photo,
             salary, position, AVG, no FP. Reusing it avoids a
             second strip renderer on the basketball side. */
          renderPlayingStripCard={h2hArcRenderer}
          renderBattlefieldCard={h2hArcRenderer}
          renderOverlayCard={h2hOverlayRenderer}
          onSendItBack={() => {
            // Mirror GameView.handleSendItBack: set rivalry context
            // so the fresh-hand RESULTS share prompt frames as
            // challenge-back. challengeCtx clears so the next IDLE
            // deal is a fresh hand, not a snapshot replay.
            chDebug("setChallengeCtx", {
              from: "onSendItBack",
              prev: { challengeId: challengeCtx.challengeId, h2hPlayingMode },
              next: { challengeId: null, h2hPlayingMode: false },
            });
            setChallengeBackCtx({
              challengerUserId: null,
              challengerName: challengeCtx.challengerName ?? null,
              originatingChallengeId: challengeCtx.challengeId,
            });
            setChallengeCtx(null);
            setH2hPlayingMode(false);
          }}
          onTryAgain={() => {
            // Rule 1 (boss fully replayable): a BOSS "Play Again" re-drafts a
            // FRESH five (draft-fresh re-entry) rather than replaying the same
            // hand. HUMAN challenges keep the same-five key-bump retake — gated
            // on senderKind so human behavior is unchanged.
            if (challengeCtx?.senderKind === "boss") {
              replayBossFreshDraft();
              return;
            }
            // Key bump re-mounts H2HRecipientPlay with fresh state
            // (state machine resets to loading → deal_in per the
            // Layout A/B restructure; pre_deal was killed). The
            // recipient plays the same challenge snapshot again.
            setH2hPlayKey(k => k + 1);
          }}
          onPlayOwnHand={() => {
            // Drop into normal game with a fresh deal (no challenge).
            chDebug("setChallengeCtx", {
              from: "onPlayOwnHand",
              prev: { challengeId: challengeCtx?.challengeId ?? null, h2hPlayingMode },
              next: { challengeId: null, h2hPlayingMode: false },
            });
            setChallengeCtx(null);
            setH2hPlayingMode(false);
          }}
          onDismiss={() => {
            // Exit H2H entirely. challengeCtx clears; user lands in
            // normal game-view IDLE state.
            chDebug("setChallengeCtx", {
              from: "onDismiss",
              prev: { challengeId: challengeCtx?.challengeId ?? null, h2hPlayingMode },
              next: { challengeId: null, h2hPlayingMode: false },
            });
            setChallengeCtx(null);
            setH2hPlayingMode(false);
          }}
        />
      ) : view === "landing" ? (
        <LandingPage
          onPlay={handlePlay}
          onShowProfile={() => setShowProfile(true)}
          onShowSignIn={() => setShowSignIn(true)}
        />
      ) : (
        <DailySeasonReelGate
          /* bypass = pin a specific season + skip the reel. TRUE for challenge
             replay (pins the challenge's season) AND for the scripted-FTUE first
             run (bypassSeasonKey null → FTUE_SEASON_KEY = 2526, which the ceremony
             wall + season context need). Without the FTUE arm here the gate fell
             through to the daily boss season and the ceremony found 0 of its five
             2526 cards. skipReel below is the weaker "skip reel, keep today's
             season" flag; bypass wins when both are true. */
          bypass={!!challengeCtx || (isSoloFtueFirstRun() && authReady && isAnonymous)}
          /* Recipients of a challenge link skip the reel for the whole
             session — pre-Accept they're on the landing screen which has
             its own era caption (data.share_headline above the score),
             post-Accept challengeCtx kicks in (covered by bypass above),
             and after dismiss skipReel keeps the bypass from flipping
             off mid-session so the reel doesn't surprise-fire. Resolved
             via the normal manifest path so today's daily season is
             still pinned for any later non-challenge hands they play. */
          /* NEW B / L1: on the scripted-FTUE first run (resolved cold-anon),
             skip the daily season reel so the user lands STRAIGHT in the FTUE
             deal. Same gate as GameView's ftueActive (first-run + authReady +
             isAnonymous — glass-round-2 truth table). authReady also passed
             below so the gate WAITS for auth resolution before deciding (else a
             cold-anon reel could fire before the FTUE is determined). After the
             FTUE completes the flag flips and the reel shows normally next entry. */
          authReady={authReady}
          skipReel={!!challengeIdFromUrl || restorePending || (isSoloFtueFirstRun() && authReady && isAnonymous)}
          /* When the bypass is fired by challengeCtx (recipient accepted
             a challenge), pin the data engine to the CHALLENGE'S season,
             not FTUE_SEASON_KEY. Without this, retired players in the
             snapshot (e.g. Aldridge in a 1617 challenge) score 0 FP
             because logsByKey only contains 2025-26 entries. FTUE
             bypass passes null here so the gate falls back to its
             FTUE_SEASON_KEY default. */
          bypassSeasonKey={challengeCtx?.season ?? null}
        >
          <GameView
            challengeCtx={challengeCtx ?? undefined}
            challengeBackCtx={challengeBackCtx ?? undefined}
            clearChallengeCtx={() => {
              chDebug("setChallengeCtx", {
                from: "GameView.clearChallengeCtx",
                prev: { challengeId: challengeCtx?.challengeId ?? null, h2hPlayingMode },
                next: { challengeId: null, h2hPlayingMode },
              });
              setChallengeCtx(null);
            }}
            setChallengeBackCtx={(ctx) => setChallengeBackCtx(ctx)}
            clearChallengeBackCtx={() => setChallengeBackCtx(null)}
            onTakeBoss={handleTakeBossInApp}
          />
        </DailySeasonReelGate>
      )}
      {showSignIn && (
        <RegisterModal
          signInMode
          onClose={() => setShowSignIn(false)}
          onSuccess={() => setShowSignIn(false)}
          signUp={signUp}
          linkGoogle={linkGoogle}
          signIn={signIn}
          signInGoogle={signInGoogle}
        />
      )}
      {showProfile && (
        <ProfileScreen
          currentUid={uid || getPlayerUid()}
          sport={SPORT}
          economyEnabled={false} // basketball F2P layer: economy off (matches the adapter); hides the money_won rank
          onClose={() => setShowProfile(false)}
          isAnonymous={isAnonymous}
          onSaveAccount={() => { setShowProfile(false); setShowSignIn(true); }}
          onOpenFeedback={() => { window.location.href = "mailto:wayzztoai@gmail.com"; }}
        />
      )}
      {showChallengeLanding && challengeIdFromUrl && (
        <ChallengeLandingScreen
          challengeId={challengeIdFromUrl}
          sport={SPORT}
          currentUserId={isAuthenticated && !isAnonymous ? (uid ?? null) : null}
          deserializeRoster={(snap) => sportAdapter.deserializeRoster(snap)}
          validateRosterSnapshot={(snap) => sportAdapter.validateRosterSnapshot(snap)}
          calculateWinTier={calculateWinTier as (totalFp: number) => string}
          onAccept={handleChallengeAccept}
          onClose={() => { setShowChallengeLanding(false); window.history.pushState({}, "", "/basketball/"); }}
          /* Phase 3 step 3 — real boss cards on the cold-link surface (same
             renderer the hub uses; headshot resolved inside AthleteCard). */
          renderBossCard={h2hArcRenderer}
        />
      )}
      {/* OAuth-resume sender confirmation. Mounted at App level so it
          overlays the IDLE GameView that re-mounts post-redirect. State
          fires from ResumeShareSurface.onResumeChallengeCreated. */}
      {resumeSent && (
        <ChallengeSentConfirmation
          shareUrl={resumeSent.shareUrl}
          sport={resumeSent.sport}
          shareHeadline={resumeSent.shareHeadline}
          onDismiss={() => setResumeSent(null)}
        />
      )}
      {/* Other user's achievement wall — rendered when visiting /basketball/profile/:userId */}
      {profileUserId && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "linear-gradient(180deg, #070A12 0%, #0A1020 60%, #070A12 100%)",
          color: "#EAF0FF",
          fontFamily: "'Inter', system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Back button */}
          <div style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 16px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <button
              onClick={() => window.history.back()}
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                padding: "5px 10px",
                color: "rgba(255,255,255,0.5)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >← Back</button>
          </div>
          <AchievementWall
            sport={SPORT}
            isSelf={false}
            targetUserId={profileUserId}
            ownUnlockedIds={ownUnlockedIds}
          />
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ErrorBoundary>
  );
}
