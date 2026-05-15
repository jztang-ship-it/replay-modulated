import { useEffect, useState } from "react";
import { LandingPage } from "./components/LandingPage";
import GameView from "./views/GameView";
import { DailySeasonReelGate } from "./components/DailySeasonReelGate";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useFTUE } from "@shared/hooks/useFTUE";
import { AuthProvider } from "@shared/auth/AuthProvider";
import { useAuth } from "@shared/auth/useAuth";
import { RegisterModal } from "@shared/components/RegisterModal";
import { ProfileScreen } from "@shared/components/ProfileScreen";
import { getPlayerUid, getNickname } from "@shared/utils/playerIdentity";
import { AchievementWall } from "@shared/components/AchievementWall";
import { useAchievements } from "@shared/hooks/useAchievements";
import { ChallengeLandingScreen } from "@shared/components/ChallengeLandingScreen";
import type { ChallengeCtx, ChallengeBackCtx } from "@shared/adapters/challengeTypes";
import { sportAdapter } from "./adapters/SportAdapter";

// ?debug=1 overlay. Eager import (not lazy) so a chunk-load failure
// can't silently hide it behind a null Suspense fallback. Mounted at
// the app shell level so it renders on every route — chooser landing,
// challenge landing, FTUE, game view.
import { ChallengeDebugPanel } from "@shared/components/ChallengeDebugPanel";

const SPORT = "basketball";
const SKIP_LANDING_KEY = "replay_skip_landing_basketball";

/** Extract target userId from /basketball/profile/:userId path.
 *  Returns null for all other paths. */
function getProfileUserId(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/\/basketball\/profile\/([0-9a-f-]{36})/);
  return match ? match[1] : null;
}

const FTUE_INTRO_FOLLOWUP_KEY = "replaymod_ftue_intro_followup_seen_basketball";

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

function AppInner() {
  const { isFTUE } = useFTUE(SPORT);
  const challengeIdFromUrl = getChallengeId();
  const [showFtueIntroFollowup] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      // QA bypass — same params as useFTUE. When a tester is on
      // `?skipFtue=1` / `?skip_ftue=1` / `?debug=1`, suppress the
      // followup prompt this session too. We deliberately don't
      // touch FTUE_INTRO_FOLLOWUP_KEY here — the persistence happens
      // in the QA-shortcut effect below so all writes live in one
      // place.
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("skipFtue") === "1" || sp.get("skip_ftue") === "1" || sp.get("debug") === "1") {
        return false;
      }
      // Challenge acceptors don't see the followup THIS session — but leave
      // the seen flag alone so a fresh non-challenge hand later still fires it.
      if (challengeIdFromUrl) return false;
      const ftueDone = localStorage.getItem("replaymod_ftue_basketball") === "1";
      const followupSeen = localStorage.getItem(FTUE_INTRO_FOLLOWUP_KEY) === "1";
      if (ftueDone && !followupSeen) {
        localStorage.setItem(FTUE_INTRO_FOLLOWUP_KEY, "1");
        return true;
      }
    } catch { /* ignore */ }
    return false;
  });
  const { user, uid, isAuthenticated, isAnonymous, signUp, linkGoogle, signIn, signInGoogle } = useAuth();
  const profileUserId = getProfileUserId();
  const [challengeCtx, setChallengeCtx] = useState<ChallengeCtx | null>(null);
  // Rivalry-continuation context. Set when a recipient wins a challenge
  // and taps "Send It Back" — they're routed to a fresh normal hand and
  // the share prompt auto-fires at RESULTS framed as a back-challenge.
  // Cleared once the user dismisses or shares the resulting challenge.
  const [challengeBackCtx, setChallengeBackCtx] = useState<ChallengeBackCtx | null>(null);
  const [showChallengeLanding, setShowChallengeLanding] = useState(!!challengeIdFromUrl);
  const { unlockedIds: ownUnlockedIds } = useAchievements();
  const skipFTUE = isAuthenticated && !isAnonymous;
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

  // First-timers see the landing page. Veterans skip straight to game.
  // Challenge URL visitors always skip landing — the ChallengeLandingScreen
  // overlay is their accept surface; the marketing landing has no role.
  const [view, setView] = useState<"landing" | "game">(
    challengeIdFromUrl
      ? "game"
      : (isFTUE && !skipFTUE && !skipLanding) ? "landing" : "game"
  );

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

  // QA shortcut: any of `?skipFtue=1`, `?skip_ftue=1`, or `?debug=1`
  // marks the basketball FTUE flags done in localStorage, dropping
  // straight into normal play on this load and on every subsequent
  // reload from the same browser — even without the param. Bypasses
  // both the main FTUE flow (CoachLayer overlays, tutorial state,
  // payout adjustments via useFTUE) AND the "Look who decided to
  // play for real" intro followup. `?debug=1` is bundled because
  // testers always want the debug panel + FTUE-off together.
  //
  // Use `?ftue=1` to reset: clears both flags so the next load runs
  // the full FTUE again. Symmetric with the bypass.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const skip = sp.get("skipFtue") === "1" || sp.get("skip_ftue") === "1" || sp.get("debug") === "1";
    if (skip) {
      try {
        localStorage.setItem(`replaymod_ftue_${SPORT}`, "1");
        localStorage.setItem(FTUE_INTRO_FOLLOWUP_KEY, "1");
      } catch { /* ignore */ }
    }
    if (sp.get("ftue") === "1") {
      try {
        localStorage.removeItem(`replaymod_ftue_${SPORT}`);
        localStorage.removeItem(FTUE_INTRO_FOLLOWUP_KEY);
      } catch { /* ignore */ }
    }
  }, []);

  const handlePlay = () => {
    try { localStorage.setItem(SKIP_LANDING_KEY, "1"); } catch { /* ignore */ }
    setView("game");
  };

  return (
    <>
      {showDebug && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100000,
          background: "rgba(0,0,0,0.85)", color: "#7FFF00", fontFamily: "monospace",
          fontSize: 10, padding: "6px 8px", lineHeight: 1.4, wordBreak: "break-all",
          pointerEvents: "none",
        }}>
          isAnon={String(isAnonymous)} | view={view} | skipFTUE={String(skipFTUE)} | skipLanding={String(skipLanding)} | isFTUE={String(isFTUE)}<br/>
          uid={uid?.slice(0, 16) || "none"} | email={user?.email || "none"} | confirmed={user?.email_confirmed_at ? "Y" : "N"} | provider={(user?.app_metadata as any)?.provider || "none"}<br/>
          stickyFlag={typeof window !== "undefined" ? localStorage.getItem(SKIP_LANDING_KEY) || "unset" : "ssr"} | ftueDone={typeof window !== "undefined" ? localStorage.getItem("replaymod_ftue_basketball") || "unset" : "ssr"}
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
      {view === "landing" ? (
        <LandingPage
          onPlay={handlePlay}
          onShowProfile={() => setShowProfile(true)}
          onShowSignIn={() => setShowSignIn(true)}
        />
      ) : (
        <DailySeasonReelGate
          bypass={isFTUE || !!challengeCtx}
          /* Recipients of a challenge link skip the reel for the whole
             session — pre-Accept they're on the landing screen which has
             its own era caption (data.share_headline above the score),
             post-Accept challengeCtx kicks in (covered by bypass above),
             and after dismiss skipReel keeps the bypass from flipping
             off mid-session so the reel doesn't surprise-fire. Resolved
             via the normal manifest path so today's daily season is
             still pinned for any later non-challenge hands they play. */
          skipReel={!!challengeIdFromUrl}
          showFtueIntroFollowup={showFtueIntroFollowup}
        >
          <GameView
            challengeCtx={challengeCtx ?? undefined}
            challengeBackCtx={challengeBackCtx ?? undefined}
            clearChallengeCtx={() => setChallengeCtx(null)}
            setChallengeBackCtx={(ctx) => setChallengeBackCtx(ctx)}
            clearChallengeBackCtx={() => setChallengeBackCtx(null)}
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
          onAccept={(ctx) => {
            setChallengeCtx(ctx);
            setShowChallengeLanding(false);
            try { localStorage.setItem(SKIP_LANDING_KEY, "1"); } catch {}
            setView("game");
          }}
          onClose={() => { setShowChallengeLanding(false); window.history.pushState({}, "", "/basketball/"); }}
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
