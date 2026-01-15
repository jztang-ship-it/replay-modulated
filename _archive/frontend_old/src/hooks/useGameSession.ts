import { useState, useCallback } from 'react';
import { GameSession, GameState } from '../types/engine';

/**
 * Hook to manage game session state
 * Mirrors backend GameState strictly
 */
export function useGameSession() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [resolutions, setResolutions] = useState<any[]>([]);
  const [projections, setProjections] = useState<any[]>([]);

  const createSession = useCallback((sessionId: string, sportId: string, seed?: number) => {
    // This would call the backend engine
    // For now, placeholder
  }, []);

  const resetSession = useCallback(() => {
    setSession(null);
    setResolutions([]);
    setProjections([]);
  }, []);

  return {
    session,
    resolutions,
    projections,
    setSession,
    setResolutions,
    setProjections,
    createSession,
    resetSession,
  };
}
