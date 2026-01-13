/**
 * Data exports
 */

import { Player, GameLog } from '../models';
import basketballPlayers from './basketball-players.json';
import basketballGameLogs from './basketball-game-logs.json';

// Ensure all game logs have events field
const rawGameLogs = basketballGameLogs as any[];
const normalizedGameLogs: GameLog[] = rawGameLogs.map((log) => ({
  ...log,
  events: log.events || {},
}));

export const BasketballPlayers: Player[] = basketballPlayers as Player[];
export const BasketballGameLogs: GameLog[] = normalizedGameLogs;

export { DataProvider } from './DataProvider';
export { LocalJsonProvider, createBasketballDataProvider } from './LocalJsonProvider';
