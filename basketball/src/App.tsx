import { useState } from "react";
import { LandingPage } from "./components/LandingPage";
import GameView from "./views/GameView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useFTUE } from "@shared/hooks/useFTUE";

export default function App() {
  const { isFTUE } = useFTUE("basketball");

  // First-timers see the landing page. Veterans skip straight to game.
  const [view, setView] = useState<"landing" | "game">(
    isFTUE ? "landing" : "game"
  );

  return (
    <ErrorBoundary>
      {view === "landing" ? (
        <LandingPage onPlay={() => setView("game")} />
      ) : (
        <GameView />
      )}
    </ErrorBoundary>
  );
}