export class SeededRng {
  private state: number;

  constructor(seed: number) {
    const normalized = Math.abs(Math.floor(seed)) || 1;
    this.state = normalized % 2147483647;
    if (this.state <= 0) this.state += 2147483646;
  }

  nextFloat(): number {
    this.state = (this.state * 48271) % 2147483647;
    return this.state / 2147483647;
  }

  int(minInclusive: number, maxInclusive: number): number {
    if (maxInclusive <= minInclusive) return minInclusive;
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(this.nextFloat() * span);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty list.");
    }
    const index = this.int(0, items.length - 1);
    return items[index];
  }

  chance(probability: number): boolean {
    const normalized = Math.max(0, Math.min(1, probability));
    return this.nextFloat() <= normalized;
  }
}

export function hashSeed(base: number, salt: string): number {
  let hash = Math.abs(Math.floor(base)) || 1;
  for (let i = 0; i < salt.length; i += 1) {
    hash = (hash * 31 + salt.charCodeAt(i)) % 2147483647;
  }
  return hash || 1;
}
