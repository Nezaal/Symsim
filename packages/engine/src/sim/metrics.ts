import { LatencyHistogram } from './histogram.ts'
import type { StationSample } from './stations.ts'
import type { Outcome } from './types.ts'

/** One second of simulated time, as shown in the live charts. */
export interface WindowSnapshot {
  /** End of the window, in simulated seconds. */
  readonly t: number
  readonly throughputRps: number
  readonly ok: number
  readonly rejected: number
  readonly timedOut: number
  readonly p50Ms: number
  readonly p95Ms: number
  readonly p99Ms: number
  /** Requests in flight at the end of the window. */
  readonly inFlight: number
  /** Per component: utilization (0..1) and queue length. */
  readonly stations: Readonly<Record<string, StationSample>>
}

const toMs = (sec: number): number => Math.round(sec * 1e6) / 1000 // 3 decimals

/**
 * Counts outcomes for user requests. Latency percentiles cover **successful**
 * requests only: a rejection "responds" instantly, and counting it would make
 * an overloaded system look fast.
 */
export class MetricsCollector {
  total = 0
  ok = 0
  /** Successes completed before traffic stopped (backlog drained later doesn't count as capacity). */
  okDuringTraffic = 0
  rejected = 0
  timedOut = 0
  readonly latency = new LatencyHistogram()
  readonly windows: WindowSnapshot[] = []

  private windowLatency = new LatencyHistogram()
  private windowOk = 0
  private windowRejected = 0
  private windowTimedOut = 0

  constructor(private readonly durationSec: number) {}

  onStart(): void {
    this.total += 1
  }

  onFinish(outcome: Outcome, latencySec: number, now: number): void {
    if (outcome === 'ok') {
      this.ok += 1
      if (now <= this.durationSec) this.okDuringTraffic += 1
      this.windowOk += 1
      this.latency.record(latencySec)
      this.windowLatency.record(latencySec)
    } else if (outcome === 'rejected') {
      this.rejected += 1
      this.windowRejected += 1
    } else {
      this.timedOut += 1
      this.windowTimedOut += 1
    }
  }

  closeWindow(t: number, windowSec: number, inFlight: number, stations: Record<string, StationSample>): void {
    const h = this.windowLatency
    this.windows.push({
      t,
      throughputRps: windowSec > 0 ? this.windowOk / windowSec : 0,
      ok: this.windowOk,
      rejected: this.windowRejected,
      timedOut: this.windowTimedOut,
      p50Ms: toMs(h.percentile(0.5)),
      p95Ms: toMs(h.percentile(0.95)),
      p99Ms: toMs(h.percentile(0.99)),
      inFlight,
      stations,
    })
    this.windowLatency = new LatencyHistogram()
    this.windowOk = 0
    this.windowRejected = 0
    this.windowTimedOut = 0
  }
}

export { toMs }
