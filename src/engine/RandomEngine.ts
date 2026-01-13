/**
 * RandomEngine - Seeded random number generator for deterministic gameplay
 * Uses a simple Linear Congruential Generator (LCG) for predictable randomness
 */

export class RandomEngine {
  private seed: number;
  private current: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed;
    this.current = seed;
  }

  /**
   * Generate a random number between 0 (inclusive) and 1 (exclusive)
   */
  random(): number {
    // LCG parameters (same as used in many systems)
    this.current = (this.current * 1664525 + 1013904223) % 2 ** 32;
    return this.current / 2 ** 32;
  }

  /**
   * Generate a random integer between min (inclusive) and max (exclusive)
   */
  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min)) + min;
  }

  /**
   * Generate a random integer between min (inclusive) and max (inclusive)
   */
  randomIntInclusive(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /**
   * Select a random element from an array
   */
  randomChoice<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    return array[this.randomInt(0, array.length)];
  }

  /**
   * Shuffle an array in place using Fisher-Yates algorithm
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Reset the generator to the original seed
   */
  reset(): void {
    this.current = this.seed;
  }

  /**
   * Get the current seed value
   */
  getSeed(): number {
    return this.seed;
  }
}
