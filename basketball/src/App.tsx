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

  // First-timers see the landing page. Veterans skip straight to game.
  const [view, setView] = useState<"landing" | "game">(
    (isFTUE && !skipFTUE) ? "landing" : "game"
  );

  // ?signin=1 (from chooser sign-in icon) → open the existing sign-in modal
  // overlaying whichever view is active. Strip the query so refresh doesn't
  // re-fire it.
  const [showSignIn, setShowSignIn] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("signin") === "1"
  );
  useEffect(() => {
    if (showSignIn && typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [showSignIn]);

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
