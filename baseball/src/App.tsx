import { useState } from "react";
import { LandingPage } from "./components/LandingPage";
import GameView from "./views/GameView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useFTUE } from "@shared/hooks/useFTUE";
import { AuthProvider } from "@shared/auth/AuthProvider";
import { useAuth } from "@shared/auth/useAuth";

function AppInner() {
  const { isFTUE } = useFTUE("baseball");
  const { isAuthenticated, isAnonymous } = useAuth();
  const skipFTUE = isAuthenticated && !isAnonymous;

  // First-timers see the landing page. Veterans skip straight to game.
  const [view, setView] = useState<"landing" | "game">(
    (isFTUE && !skipFTUE) ? "landing" : "game"
  );

  return view === "landing" ? (
    <LandingPage onPlay={() => setView("game")} />
  ) : (
    <GameView />
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
