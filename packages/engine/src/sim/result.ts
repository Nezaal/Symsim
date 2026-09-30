import { findBottleneck, type BottleneckReport } from './bottleneck.ts'
import { toMs, type WindowSnapshot } from './metrics.ts'
import type { Simulator } from './simulator.ts'
import type { StationSample, StationTotals } from './stations.ts'

/** Max chart points kept in a saved result (one per second is kept live). */
export const MAX_TIMESERIES_POINTS = 300

/**
 * Final outcome of a run. The top-level numbers mirror the
 * `simulation_results` table columns, so saving it later is a direct mapping.
 */
export interface SimulationResult {
  readonly durationSec: number
  readonly seed: number
  readonly totalRequests: number
  readonly successfulRequests: number
  /** Reserved for the failure-injection feature; always 0 for now. */
  readonly failedRequests: number
  readonly rejectedRequests: number
  readonly timedOutRequests: number
  readonly throughputRps: number
  /** (rejected + timed out + failed) / total, 0..1. */
  readonly errorRate: number
  readonly latencyMeanMs: number
  readonly latencyP50Ms: number
  readonly latencyP95Ms: number
  readonly latencyP99Ms: number
  readonly bottleneck: BottleneckReport | null
  /** One-sentence verdict for the UI. */
  readonly summary: string
  readonly stations: readonly StationTotals[]
  readonly timeseries: readonly WindowSnapshot[]
  readonly simulatedSec: number
  readonly eventsProcessed: number
}

export function buildResult(sim: Simulator): SimulationResult {
  const m = sim.metrics
  const { durationSec, seed } = sim.model
  const stations = sim.trafficTotals ?? [...sim.stations.values()].map((s) => s.totals(sim.elapsed))
  const bottleneck = findBottleneck(stations)
  const errors = m.rejected + m.timedOut
  const throughputRps = m.ok / durationSec
  // Percentiles are monotonic by construction; enforce it against rounding.
  const p50 = toMs(m.latency.percentile(0.5))
  const p95 = Math.max(p50, toMs(m.latency.percentile(0.95)))
  const p99 = Math.max(p95, toMs(m.latency.percentile(0.99)))

  return {
    durationSec,
    seed,
    totalRequests: m.total,
    successfulRequests: m.ok,
    failedRequests: 0,
    rejectedRequests: m.rejected,
    timedOutRequests: m.timedOut,
    throughputRps,
    errorRate: m.total > 0 ? errors / m.total : 0,
    latencyMeanMs: toMs(m.latency.mean),
    latencyP50Ms: p50,
    latencyP95Ms: p95,
    latencyP99Ms: p99,
    bottleneck,
    summary: summarize(throughputRps, p95, m.total > 0 ? errors / m.total : 0, bottleneck, stations),
    stations,
    timeseries: downsample(m.windows, MAX_TIMESERIES_POINTS),
    simulatedSec: sim.elapsed,
    eventsProcessed: sim.eventsProcessed,
  }
}

function summarize(
  throughput: number,
  p95Ms: number,
  errorRate: number,
  bottleneck: BottleneckReport | null,
  stations: readonly StationTotals[],
): string {
  const served = `${Math.round(throughput).toLocaleString('en-US')} req/s served, p95 ${p95Ms.toLocaleString('en-US', { maximumFractionDigits: 1 })} ms`
  if (bottleneck?.severity === 'saturated') {
    return `Overloaded: ${served}, ${(errorRate * 100).toFixed(1)}% errors. Bottleneck: ${bottleneck.label}.`
  }
  if (bottleneck) return `Near capacity: ${served}. ${bottleneck.label} is under strain.`
  const busiest = stations
    .filter((s) => s.type !== 'client')
    .sort((a, b) => b.utilization - a.utilization)[0]
  const note = busiest ? ` Busiest component: ${busiest.label} at ${Math.round(busiest.utilization * 100)}%.` : ''
  return `Healthy: ${served}.${note}`
}

/** Merges consecutive windows so a long run keeps at most `maxPoints` chart points. */
export function downsample(windows: readonly WindowSnapshot[], maxPoints: number): WindowSnapshot[] {
  if (windows.length <= maxPoints) return [...windows]
  const size = Math.ceil(windows.length / maxPoints)
  const out: WindowSnapshot[] = []
  for (let i = 0; i < windows.length; i += size) {
    const group = windows.slice(i, i + size)
    const last = group[group.length - 1]!
    const avg = (pick: (w: WindowSnapshot) => number): number =>
      group.reduce((sum, w) => sum + pick(w), 0) / group.length
    const sum = (pick: (w: WindowSnapshot) => number): number => group.reduce((s, w) => s + pick(w), 0)
    const stations: Record<string, StationSample> = {}
    for (const id of Object.keys(last.stations)) {
      stations[id] = {
        utilization: avg((w) => w.stations[id]?.utilization ?? 0),
        queue: Math.max(...group.map((w) => w.stations[id]?.queue ?? 0)),
      }
    }
    out.push({
      t: last.t,
      throughputRps: avg((w) => w.throughputRps),
      ok: sum((w) => w.ok),
      rejected: sum((w) => w.rejected),
      timedOut: sum((w) => w.timedOut),
      p50Ms: avg((w) => w.p50Ms),
      p95Ms: avg((w) => w.p95Ms),
      p99Ms: avg((w) => w.p99Ms),
      inFlight: last.inFlight,
      stations,
    })
  }
  return out
}
