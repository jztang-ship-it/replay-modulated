import GameView from "./views/GameView";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <GameView />
    </ErrorBoundary>
  );
}
