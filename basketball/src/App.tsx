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
import { getPlayerUid } from "@shared/utils/playerIdentity";
import { AchievementWall } from "@shared/components/AchievementWall";
import { useAchievements } from "@shared/hooks/useAchievements";
import { ChallengeLandingScreen } from "@shared/components/ChallengeLandingScreen";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";
import { sportAdapter } from "./adapters/SportAdapter";

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
      // Challenge acceptors never see the followup — silently flip the seen
      // flag so it stays hidden on their next non-challenge hand too.
      if (challengeIdFromUrl) {
        localStorage.setItem(FTUE_INTRO_FOLLOWUP_KEY, "1");
        return false;
      }
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
  // We do NOT auto-promote landing→game when auth resolves — signing in
  // from landing should keep the user on landing (so they can read the
  // marketing copy and tap "Play IFS" intentionally). The sticky flag
  // (set when they tap Play IFS) is what carries them past landing on
  // future visits.
  const [view, setView] = useState<"landing" | "game">(
    (isFTUE && !skipFTUE && !skipLanding) ? "landing" : "game"
  );

  // Modal/overlay state lifted to App level so it overlays both landing
  // and game views, AND so query-param entry points (?signin=1 from the
  // chooser sign-in icon, ?profile=1 from the chooser nickname tap) can
  // open the right surface on mount.
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const [showSignIn, setShowSignIn] = useState(() => params?.get("signin") === "1");
  const [showProfile, setShowProfile] = useState(() => params?.get("profile") === "1");

  // Strip handoff params after mount so refresh doesn't re-fire them.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search;
    if (search.includes("signin=1") || search.includes("play=1") || search.includes("profile=1")) {
      window.history.replaceState({}, "", window.location.pathname);
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
      {view === "landing" ? (
        <LandingPage
          onPlay={handlePlay}
          onShowProfile={() => setShowProfile(true)}
          onShowSignIn={() => setShowSignIn(true)}
        />
      ) : (
        <DailySeasonReelGate bypass={isFTUE || !!challengeCtx} showFtueIntroFollowup={showFtueIntroFollowup}>
          <GameView challengeCtx={challengeCtx ?? undefined} />
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
