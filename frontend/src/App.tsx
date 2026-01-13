import React, { useState, useEffect } from 'react';
import { GameState, GameSession, Resolution, Projection } from './types/engine';
import { StartScreen } from './screens/StartScreen';
import { DealScreen } from './screens/DealScreen';
import { HoldScreen } from './screens/HoldScreen';
import { FinalDrawScreen } from './screens/FinalDrawScreen';
import { ResolutionScreen } from './screens/ResolutionScreen';
import { ResultScreen } from './screens/ResultScreen';

// Mock engine adapter - in production, this would connect to the backend API
// For MVP, we'll simulate the engine behavior
function createMockSession(): GameSession {
  return {
    sessionId: 'mock-' + Date.now(),
    sportId: 'basketball',
    seed: Math.floor(Math.random() * 1000000),
    state: GameState.IDLE,
    roster: [],
    remainingCap: 100,
    resolvedTeamFP: null,
    winResult: null,
  };
}

function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [projections, setProjections] = useState<Projection[]>([]);

  const handleStart = () => {
    const newSession = createMockSession();
    setSession(newSession);
    // Simulate INITIAL_DEAL state transition
    setTimeout(() => {
      setSession({
        ...newSession,
        state: GameState.INITIAL_DEAL,
        roster: [
          { index: 0, player: { id: '1', name: 'Player 1', position: 'PG', salary: 25, team: 'Team A' }, held: false },
          { index: 1, player: { id: '2', name: 'Player 2', position: 'SG', salary: 24, team: 'Team B' }, held: false },
          { index: 2, player: { id: '3', name: 'Player 3', position: 'SF', salary: 23, team: 'Team C' }, held: false },
          { index: 3, player: { id: '4', name: 'Player 4', position: 'PF', salary: 22, team: 'Team D' }, held: false },
          { index: 4, player: { id: '5', name: 'Player 5', position: 'C', salary: 26, team: 'Team E' }, held: false },
        ],
        remainingCap: 100 - (25 + 24 + 23 + 22 + 26),
      });
    }, 100);
  };

  const handleDealComplete = () => {
    if (session) {
      setSession({ ...session, state: GameState.HOLD_PHASE });
    }
  };

  const handleToggleHold = (slotIndex: number) => {
    if (session && session.state === GameState.HOLD_PHASE) {
      const updatedRoster = session.roster.map((slot) =>
        slot.index === slotIndex ? { ...slot, held: !slot.held } : slot
      );
      setSession({ ...session, roster: updatedRoster });
    }
  };

  const handleFinalDraw = () => {
    if (session) {
      setSession({ ...session, state: GameState.FINAL_DRAW });
    }
  };

  const handleDrawComplete = () => {
    if (session) {
      // Generate mock resolutions and projections
      const mockResolutions: Resolution[] = session.roster
        .filter((slot) => slot.player)
        .map((slot) => ({
          playerId: slot.player!.id,
          actualStats: {},
          fantasyPoints: Math.random() * 50 + 25,
        }));

      const mockProjections: Projection[] = session.roster
        .filter((slot) => slot.player)
        .map((slot) => ({
          playerId: slot.player!.id,
          projectedStats: {},
          projectedPoints: Math.random() * 50 + 25,
        }));

      setResolutions(mockResolutions);
      setProjections(mockProjections);
      setSession({ ...session, state: GameState.RESOLUTION });
    }
  };

  const handleResolutionComplete = () => {
    if (session) {
      const totalFP = resolutions.reduce((sum, res) => sum + res.fantasyPoints, 0);
      const winResult = totalFP >= 100; // Simple threshold for MVP
      setSession({
        ...session,
        state: GameState.RESULT,
        resolvedTeamFP: totalFP,
        winResult,
      });
    }
  };

  const handlePlayAgain = () => {
    setSession(null);
    setResolutions([]);
    setProjections([]);
  };

  // Render screen based on game state
  if (!session || session.state === GameState.IDLE) {
    return <StartScreen onStart={handleStart} />;
  }

  switch (session.state) {
    case GameState.INITIAL_DEAL:
      return <DealScreen session={session} onDealComplete={handleDealComplete} />;

    case GameState.HOLD_PHASE:
      return (
        <HoldScreen
          session={session}
          onToggleHold={handleToggleHold}
          onFinalDraw={handleFinalDraw}
        />
      );

    case GameState.FINAL_DRAW:
      return <FinalDrawScreen session={session} onDrawComplete={handleDrawComplete} />;

    case GameState.RESOLUTION:
      return (
        <ResolutionScreen
          session={session}
          resolutions={resolutions}
          projections={projections}
          onResolutionComplete={handleResolutionComplete}
        />
      );

    case GameState.RESULT:
      return <ResultScreen session={session} onPlayAgain={handlePlayAgain} />;

    default:
      return <StartScreen onStart={handleStart} />;
  }
}

export default App;
