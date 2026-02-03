/**
 * Seeded random number generator for deterministic dataset generation
 * Uses mulberry32 algorithm for simplicity and speed
 */

export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0; // Ensure unsigned 32-bit
  }

  /**
   * Returns random float in [0, 1)
   */
  random(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns random integer in [min, max]
   */
  int(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /**
   * Returns random float in [min, max)
   */
  float(min: number, max: number): number {
    return this.random() * (max - min) + min;
  }

  /**
   * Returns true with probability p
   */
  chance(p: number): boolean {
    return this.random() < p;
  }

  /**
   * Picks random element from array
   */
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /**
   * Shuffles array in place (Fisher-Yates)
   */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Samples from normal distribution (Box-Muller transform)
   */
  normal(mean: number, stdDev: number): number {
    const u1 = this.random();
    const u2 = this.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  }

  /**
   * Returns value from percentile distribution
   */
  percentile(spec: { p25: number; p50: number; p75: number; p90: number }): number {
    const r = this.random();
    if (r < 0.25) return this.float(spec.p25 * 0.8, spec.p25);
    if (r < 0.50) return this.float(spec.p25, spec.p50);
    if (r < 0.75) return this.float(spec.p50, spec.p75);
    if (r < 0.90) return this.float(spec.p75, spec.p90);
    return this.float(spec.p90, spec.p90 * 1.3);
  }

  /**
   * Weighted random choice
   */
  weightedPick<T>(items: T[], weights: number[]): T {
    const total = weights.reduce((sum, w) => sum + w, 0);
    let r = this.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}
