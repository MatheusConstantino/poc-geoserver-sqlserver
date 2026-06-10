// =============================================================================
// Seeded pseudo-random number generator
// Uses a simple LCG (Linear Congruential Generator) for full reproducibility.
// @faker-js/faker also uses this seed internally.
//
// Why not Math.random()? It's not seedable in Node.js without external libs.
// This ensures SEED_RANDOM_SEED=42 always produces the same dataset.
// =============================================================================

export class SeededRng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0  // ensure unsigned 32-bit int
  }

  /** Returns a float in [0, 1) */
  next(): number {
    // LCG parameters from Numerical Recipes
    this.state = (this.state * 1664525 + 1013904223) >>> 0
    return this.state / 0x100000000
  }

  /** Returns a float in [min, max) */
  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** Returns an integer in [min, max] */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1))
  }

  /** Picks a random element from an array */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)]
  }
}
