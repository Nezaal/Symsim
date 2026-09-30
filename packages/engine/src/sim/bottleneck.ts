import type { StationTotals } from './stations.ts'

export interface BottleneckReport {
  readonly nodeId: string
  readonly label: string
  /** saturated: at its limit (or rejecting); strained: busy enough to hurt latency. */
  readonly severity: 'saturated' | 'strained'
  readonly utilization: number
  readonly explanation: string
  /** Other components that are also saturated, if any. */
  readonly alsoSaturated: readonly string[]
}

const SATURATED = 0.95
const STRAINED = 0.8
/** Refusing at least this share of calls counts as saturated, even at low utilization. */
const REJECTED_SHARE = 0.02

const rejectedShare = (s: StationTotals): number => (s.handled > 0 ? s.rejected / s.handled : 0)

const fmt = (n: number, digits = 0): string =>
  n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
const pct = (x: number): string => `${fmt(x * 100)}%`

/**
 * Finds the component that limits throughput.
 *
 * When several components are saturated, the **deepest** one (furthest from
 * the client) is reported. Upstream saturation is usually either its own
 * policy limit or back-pressure from below (blocking threads waiting on it).
 * The deepest saturated component is what caps successful throughput.
 */
export function findBottleneck(stations: readonly StationTotals[]): BottleneckReport | null {
  const depth = computeDepths(stations)
  const byId = new Map(stations.map((s) => [s.id, s]))
  const candidates = stations.filter((s) => s.type !== 'client')

  const saturated = candidates.filter((s) => s.utilization >= SATURATED || rejectedShare(s) >= REJECTED_SHARE)
  if (saturated.length > 0) {
    const worst = [...saturated].sort(
      (a, b) => (depth.get(b.id) ?? 0) - (depth.get(a.id) ?? 0) || b.utilization - a.utilization,
    )[0]!
    return {
      nodeId: worst.id,
      label: worst.label,
      severity: 'saturated',
      utilization: worst.utilization,
      explanation: explain(worst, byId, stations),
      alsoSaturated: saturated.filter((s) => s.id !== worst.id).map((s) => s.label),
    }
  }

  const busiest = [...candidates].sort((a, b) => b.utilization - a.utilization)[0]
  if (!busiest || busiest.utilization < STRAINED) return null
  return {
    nodeId: busiest.id,
    label: busiest.label,
    severity: 'strained',
    utilization: busiest.utilization,
    explanation: `${explain(busiest, byId, stations)} It is at ${pct(busiest.utilization)}, so queues grow quickly with any extra traffic.`,
    alsoSaturated: [],
  }
}

/** Longest distance from any client (the graph is a DAG, checked by the compiler). */
function computeDepths(stations: readonly StationTotals[]): Map<string, number> {
  const byId = new Map(stations.map((s) => [s.id, s]))
  const depth = new Map<string, number>()
  const visit = (id: string, d: number): void => {
    if ((depth.get(id) ?? -1) >= d) return
    depth.set(id, d)
    for (const child of byId.get(id)?.downstream ?? []) visit(child, d + 1)
  }
  for (const s of stations) if (s.type === 'client') visit(s.id, 0)
  return depth
}

function upstreamOf(id: string, stations: readonly StationTotals[]): StationTotals[] {
  return stations.filter((s) => s.downstream.includes(id))
}

function rejectedNote(s: StationTotals): string {
  return s.rejected > 0 ? ` ${fmt(s.rejected)} requests were rejected here.` : ''
}

function explain(s: StationTotals, byId: Map<string, StationTotals>, all: readonly StationTotals[]): string {
  const d = s.detail
  const offered = fmt(d.offeredRps ?? 0)

  switch (s.type) {
    case 'appServer': {
      const threadUtil = d.threadUtil ?? 0
      const coreUtil = d.coreUtil ?? 0
      if (coreUtil >= SATURATED * 0.95 || coreUtil >= threadUtil * 0.9) {
        return (
          `${s.label}: CPU-bound. ${fmt(d.cores ?? 0)} cores ÷ processing time gives about ` +
          `${fmt(d.computeCapacityRps ?? 0)} req/s of compute, but ${offered} req/s arrived.` +
          `${rejectedNote(s)} Add instances or cores, or reduce processing time.`
        )
      }
      const deps = s.downstream.map((id) => byId.get(id)?.label ?? id).join(', ')
      return (
        `${s.label}: all ${fmt(d.threads ?? 0)} threads busy, but the CPU is only ${pct(coreUtil)} used. ` +
        `Threads are blocked waiting on ${deps || 'downstream calls'}.${rejectedNote(s)} ` +
        `Raise max concurrency or add instances, or make those dependencies faster.`
      )
    }
    case 'sqlDatabase': {
      const waiting = upstreamOf(s.id, all).filter(
        (u) => u.type === 'appServer' && (u.detail.threadUtil ?? 0) >= SATURATED,
      )
      const cascade =
        waiting.length > 0
          ? ` Upstream, ${waiting.map((u) => u.label).join(', ')} threads are stuck waiting on it (blocking calls), so the slowdown spreads.`
          : ''
      return (
        `${s.label}: all ${fmt(d.connectionPool ?? 0)} connections busy. It can handle about ` +
        `${fmt(d.writeCapacityRps ?? 0)} writes/s or ${fmt(d.readCapacityRps ?? 0)} reads/s, and ${offered} req/s arrived.` +
        `${cascade} Add a cache or read replicas for reads; writes need a bigger pool or faster queries.`
      )
    }
    case 'apiGateway':
      return (
        `${s.label}: enforcing its ${fmt(d.capacityRps ?? 0)} req/s rate limit; ${offered} req/s arrived.` +
        `${rejectedNote(s)} Raise the limit only if the services behind it can take more.`
      )
    case 'loadBalancer':
      return (
        `${s.label}: reached its ${fmt(d.maxConnections ?? 0)}-connection limit, because requests stay connected while the backends are slow.` +
        `${rejectedNote(s)} Speed up or add backends, or raise max connections.`
      )
    case 'messageQueue':
      return (
        `${s.label}: ${fmt(d.consumers ?? 0)} consumers can't keep up, and the backlog reached ${fmt(s.maxQueue)} messages.` +
        `${rejectedNote(s)} Add consumers or speed up the workers behind the queue.`
      )
    case 'cache':
    case 'nosqlDatabase':
    case 'objectStorage':
      return (
        `${s.label}: hit its throughput limit of about ${fmt(d.capacityRps ?? 0)} ops/s; ${offered} req/s arrived.` +
        `${rejectedNote(s)} Raise its capacity or reduce the traffic reaching it.`
      )
    default:
      return `${s.label}: ${pct(s.utilization)} utilization.${rejectedNote(s)}`
  }
}
