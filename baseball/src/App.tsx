import { useEffect, useState } from "react";
import { LandingPage } from "./components/LandingPage";
import GameView from "./views/GameView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useFTUE } from "@shared/hooks/useFTUE";
import { AuthProvider } from "@shared/auth/AuthProvider";
import { useAuth } from "@shared/auth/useAuth";
import { RegisterModal } from "@shared/components/RegisterModal";
import { ProfileScreen } from "@shared/components/ProfileScreen";
import { getPlayerUid } from "@shared/utils/playerIdentity";

const SPORT = "baseball";
const SKIP_LANDING_KEY = "replay_skip_landing_baseball";

function AppInner() {
  const { isFTUE } = useFTUE(SPORT);
  const { user, uid, isAuthenticated, isAnonymous, signUp, linkGoogle, signIn, signInGoogle } = useAuth();
  const skipFTUE = isAuthenticated && !isAnonymous;
  const showDebug = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";

  // ?sentry-test=1 → throws a controlled error so we can verify Sentry is
  // capturing events end-to-end. Remove this and the symmetrical handler in
  // basketball/src/App.tsx after launch verification.
  if (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("sentry-test") === "1") {
    throw new Error("Sentry verification — baseball App.tsx (intentional test)");
  }

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
          stickyFlag={typeof window !== "undefined" ? localStorage.getItem(SKIP_LANDING_KEY) || "unset" : "ssr"} | ftueDone={typeof window !== "undefined" ? localStorage.getItem("replaymod_ftue_baseball") || "unset" : "ssr"}
        </div>
      )}
      {view === "landing" ? (
        <LandingPage
          onPlay={handlePlay}
          onShowProfile={() => setShowProfile(true)}
          onShowSignIn={() => setShowSignIn(true)}
        />
      ) : (
        <GameView />
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
