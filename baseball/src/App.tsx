import { useState } from "react";
import { LandingPage } from "./components/LandingPage";
import GameView from "./views/GameView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useFTUE } from "@shared/hooks/useFTUE";

// TEMP: baseball FTUE choreography in GameView still references basketball-only
// identifiers (e.g. "ftue-booker") and there's no LandingPage→FTUE handoff for
// baseball yet. Force-complete the FTUE flag at module load so both App.tsx
// and GameView.tsx see isFTUE=false. Remove this block to re-enable landing
// page + FTUE flow once baseball FTUE is properly wired.
try {
  if (typeof window !== "undefined") {
    localStorage.setItem("replaymod_ftue_baseball", "1");
  }
} catch { /* ignore */ }

export default function App() {
  const { isFTUE } = useFTUE("baseball");

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
