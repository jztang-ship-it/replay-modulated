import { useState } from "react";
import { LandingPage } from "./components/LandingPage";
import GameView from "./views/GameView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useFTUE } from "@shared/hooks/useFTUE";

export default function App() {
  const { completeFTUE } = useFTUE("basketball");
  const isFTUE = false; // DEV: set true to test FTUE

  // Veterans skip straight to game. First-timers see landing first.
  const [view, setView] = useState<"landing" | "game">("game");

  return (
    <ErrorBoundary>
      {view === "landing" ? (
        <LandingPage onPlay={() => setView("game")} />
      ) : (
        <GameView
          isFTUE={isFTUE}
          onFTUEComplete={completeFTUE}
        />
      )}
    </ErrorBoundary>
  );
}