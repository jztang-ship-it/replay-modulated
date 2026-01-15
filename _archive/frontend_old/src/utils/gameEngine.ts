/**
 * Engine adapter - connects UI to backend engine
 * In a real app, this would be an API client
 * For MVP, we'll import directly from the backend
 */

// For MVP, we'll create a mock adapter that can be replaced with API calls
// In production, this would make HTTP requests to the backend

export interface EngineAdapter {
  createSession(sessionId: string, sportId: string, seed?: number): Promise<any>;
  initialDeal(): Promise<any>;
  toggleHold(slotIndex: number): Promise<any>;
  finalDraw(): Promise<any>;
  resolve(opponentFP?: number): Promise<any>;
  getResolutions(): Promise<any[]>;
}

// Placeholder - in production, replace with actual API calls
export const mockEngineAdapter: EngineAdapter = {
  async createSession(sessionId: string, sportId: string, seed?: number) {
    // Would call: POST /api/sessions
    throw new Error('Not implemented - use backend engine directly');
  },
  async initialDeal() {
    throw new Error('Not implemented - use backend engine directly');
  },
  async toggleHold(slotIndex: number) {
    throw new Error('Not implemented - use backend engine directly');
  },
  async finalDraw() {
    throw new Error('Not implemented - use backend engine directly');
  },
  async resolve(opponentFP?: number) {
    throw new Error('Not implemented - use backend engine directly');
  },
  async getResolutions() {
    throw new Error('Not implemented - use backend engine directly');
  },
};
