import { useEffect, useState } from "react";
import { LandingPage } from "./components/LandingPage";
import GameView from "./views/GameView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useFTUE } from "@shared/hooks/useFTUE";
import { AuthProvider } from "@shared/auth/AuthProvider";
import { useAuth } from "@shared/auth/useAuth";
import { RegisterModal } from "@shared/components/RegisterModal";

function AppInner() {
  const { isFTUE } = useFTUE("basketball");
  const { isAuthenticated, isAnonymous, signUp, linkGoogle, signIn, signInGoogle } = useAuth();
  const skipFTUE = isAuthenticated && !isAnonymous;

  // The flippable-card landing is a marketing-direct-link surface only.
  // The chooser appends ?play=1 to bypass it, and we set a sticky flag so
  // the user never sees that page again on direct visits either.
  const skipLanding = (() => {
    if (typeof window === "undefined") return false;
    const fromChooser = new URLSearchParams(window.location.search).get("play") === "1";
    if (fromChooser) {
      try { localStorage.setItem("replay_skip_landing_basketball", "1"); } catch { /* ignore */ }
      return true;
    }
    try { return localStorage.getItem("replay_skip_landing_basketball") === "1"; } catch { return false; }
  })();

  // First-timers see the landing page. Veterans skip straight to game.
  const [view, setView] = useState<"landing" | "game">(
    (isFTUE && !skipFTUE && !skipLanding) ? "landing" : "game"
  );

  // ?signin=1 (from chooser sign-in icon) → open the existing sign-in modal
  // overlaying whichever view is active. Strip the query so refresh doesn't
  // re-fire it.
  const [showSignIn, setShowSignIn] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("signin") === "1"
  );
  useEffect(() => {
    if (typeof window !== "undefined") {
      const search = window.location.search;
      if (search.includes("signin=1") || search.includes("play=1")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  return (
    <>
      {view === "landing" ? (
        <LandingPage onPlay={() => setView("game")} />
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
