/**
 * iReplay Fantasy Sports Engine
 * Main entry point
 */

export * from './models';
export * from './engine';
export * from './sports';
export * from './data';

// Example usage
import { FantasyEngine } from './engine';
import { BasketballConfig } from './sports';
import { BasketballPlayers, BasketballGameLogs } from './data';

/**
 * Create a fantasy engine instance for basketball
 */
export function createBasketballEngine(seed?: number): FantasyEngine {
  // For backward compatibility, use EngineContext
  // DataProvider can be optionally passed in the future
  return new FantasyEngine({
    sportConfig: BasketballConfig,
    players: BasketballPlayers,
    gameLogs: BasketballGameLogs,
    seed,
  });
}

// Example usage (commented out - uncomment to run)
/*
import { GameState } from './models';

const engine = createBasketballEngine(12345);

try {
  // Create session and play complete game
  const session = engine.playCompleteGame('session-1', 'basketball', 12345);
  
  console.log('Game Session Result:');
  console.log(`Session ID: ${session.sessionId}`);
  console.log(`State: ${session.state}`);
  console.log(`Team FP: ${session.resolvedTeamFP}`);
  console.log(`Win Result: ${session.winResult}`);
  
  console.log('\nFinal Roster:');
  session.roster.forEach((slot, idx) => {
    if (slot.player) {
      console.log(`  Slot ${idx}: ${slot.player.name} (${slot.player.position}) - $${slot.player.salary} ${slot.held ? '[HELD]' : ''}`);
    }
  });
  
  const resolutions = engine.getResolutions();
  console.log('\nPlayer Resolutions:');
  resolutions.forEach(r => {
    const player = session.roster.find(s => s.player?.id === r.playerId)?.player;
    console.log(`  ${player?.name}: ${r.fantasyPoints.toFixed(2)} FP`);
  });
} catch (error) {
  console.error('Error:', error);
}
*/
