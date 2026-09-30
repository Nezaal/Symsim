/**
 * Latency histogram with logarithmic buckets (each bucket is 1% wider than the
 * previous). Percentiles are accurate to about 1% while memory stays constant,
 * no matter how many samples are recorded, so a million requests cost the
 * same as a hundred.
 *
 * Values are in seconds. Bucket 0 holds everything at or below 1 microsecond.
 */
const MIN_VALUE = 1e-6
const GROWTH = 1.01
const LOG_GROWTH = Math.log(GROWTH)
const BUCKETS = 3000 // covers up to ~9 million seconds

export class LatencyHistogram {
  private readonly counts = new Uint32Array(BUCKETS)
  count = 0
  private sum = 0
  private min = Infinity
  private max = -Infinity

  record(seconds: number): void {
    const index =
      seconds <= MIN_VALUE
        ? 0
        : Math.min(BUCKETS - 1, Math.floor(Math.log(seconds / MIN_VALUE) / LOG_GROWTH) + 1)
    this.counts[index] = (this.counts[index] ?? 0) + 1
    this.count += 1
    this.sum += seconds
    if (seconds < this.min) this.min = seconds
    if (seconds > this.max) this.max = seconds
  }

  get mean(): number {
    return this.count === 0 ? 0 : this.sum / this.count
  }

  /** Value at quantile p (0..1), e.g. 0.95 for p95. 0 when empty. */
  percentile(p: number): number {
    if (this.count === 0) return 0
    const rank = Math.max(1, Math.ceil(p * this.count))
    let seen = 0
    for (let i = 0; i < BUCKETS; i += 1) {
      seen += this.counts[i] ?? 0
      if (seen >= rank) {
        const estimate = i === 0 ? MIN_VALUE : MIN_VALUE * GROWTH ** (i - 0.5)
        return Math.min(this.max, Math.max(this.min, estimate))
      }
    }
    return this.max
  }
}
