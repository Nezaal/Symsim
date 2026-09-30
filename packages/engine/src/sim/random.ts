/**
 * Seeded pseudo-random numbers (mulberry32). The same seed always produces the
 * same sequence, which is what makes simulation runs reproducible.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Exponentially distributed with the given mean (0 for mean <= 0). */
  exponential(mean: number): number
  /** Uniform integer in [0, n). */
  pick(n: number): number
  /** True with probability p. */
  chance(p: number): boolean
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    // Inverse transform sampling; 1 - u is in (0, 1], so log never sees 0.
    exponential: (mean) => (mean <= 0 ? 0 : -mean * Math.log(1 - next())),
    pick: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
  }
}

/** A fresh seed for a new run (not reproducible by itself; store it to replay). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}
