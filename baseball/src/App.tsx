import { useState } from "react";
import { LandingPage } from "./components/LandingPage";
import GameView from "./views/GameView";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  // Landing page is the default entry. Tap "Play IFS" hands off to GameView.
  const [view, setView] = useState<"landing" | "game">("landing");

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
