import { describe, expect, it } from 'vitest'
import { compileSimulation } from './compile.ts'
import { Simulator } from './simulator.ts'
import type { GraphInput, RunOptions } from './types.ts'

type Config = Record<string, number | string>
const node = (id: string, componentType: string, config: Config = {}) => ({ id, data: { componentType, config } })
const edge = (source: string, target: string) => ({ source, target })

function simulate(graph: GraphInput, options: RunOptions = { durationSec: 300, seed: 7 }): Simulator {
  const compiled = compileSimulation(graph, options)
  if (!compiled.ok) throw new Error(compiled.errors.map((e) => e.message).join('\n'))
  const sim = new Simulator(compiled.model)
  while (!sim.advance(100_000));
  return sim
}

const totals = (sim: Simulator, id: string) => sim.stations.get(id)!.totals(sim.elapsed)

/** Erlang C: probability an arrival waits in an M/M/c queue. */
function erlangC(c: number, lambda: number, mu: number): number {
  const a = lambda / mu
  const rho = a / c
  let sum = 0
  let term = 1
  for (let k = 0; k < c; k += 1) {
    if (k > 0) term *= a / k
    sum += term
  }
  const top = (term * a) / c / (1 - rho) // a^c / c! / (1 - rho)
  return top / (sum + top)
}

/** A single app server behaving as an M/M/c station: no downstream, huge queue. */
function mmc(c: number, lambda: number, serviceMs: number): GraphInput {
  return {
    nodes: [
      node('c', 'client', { requestsPerSecond: lambda, readPercent: 100 }),
      node('app', 'appServer', {
        instances: 1,
        maxConcurrency: c,
        cpuCores: c,
        queueCapacity: 100_000,
        serviceTimeMs: serviceMs,
      }),
    ],
    edges: [edge('c', 'app')],
  }
}

describe('Simulator: agreement with queueing theory', () => {
  it('matches M/M/1 mean response time 1/(μ-λ)', () => {
    // λ = 50/s, μ = 100/s (10 ms), ρ = 0.5 → W = 1/(100-50) = 20 ms
    const sim = simulate(mmc(1, 50, 10), { durationSec: 600, seed: 11 })
    const meanMs = sim.metrics.latency.mean * 1000
    expect(meanMs).toBeGreaterThan(20 * 0.92)
    expect(meanMs).toBeLessThan(20 * 1.08)
    expect(totals(sim, 'app').utilization).toBeCloseTo(0.5, 1)
  })

  it('matches M/M/c (Erlang C) mean response time', () => {
    // c = 4, μ = 25/s (40 ms), λ = 80/s → ρ = 0.8
    const c = 4
    const mu = 25
    const lambda = 80
    const expectedSec = erlangC(c, lambda, mu) / (c * mu - lambda) + 1 / mu
    const sim = simulate(mmc(c, lambda, 40), { durationSec: 900, seed: 5 })
    const mean = sim.metrics.latency.mean
    expect(Math.abs(mean - expectedSec) / expectedSec).toBeLessThan(0.1)
  })

  it("satisfies Little's law (L = λW)", () => {
    const sim = simulate(mmc(2, 60, 25), { durationSec: 600, seed: 3 })
    const lambda = sim.metrics.ok / 600
    const w = sim.metrics.latency.mean
    const l = totals(sim, 'app').detail.avgInSystem!
    // avgInSystem is averaged over the whole run incl. drain, so scale to traffic time.
    const lDuringTraffic = (l * sim.elapsed) / 600
    expect(Math.abs(lDuringTraffic - lambda * w) / (lambda * w)).toBeLessThan(0.05)
  })
})

describe('Simulator: determinism', () => {
  it('produces identical results for the same seed', () => {
    const a = simulate(mmc(2, 80, 20), { durationSec: 60, seed: 99 })
    const b = simulate(mmc(2, 80, 20), { durationSec: 60, seed: 99 })
    expect([a.metrics.total, a.metrics.ok, a.metrics.latency.percentile(0.99)]).toEqual([
      b.metrics.total,
      b.metrics.ok,
      b.metrics.latency.percentile(0.99),
    ])
    expect(a.eventsProcessed).toBe(b.eventsProcessed)
  })

  it('produces different results for different seeds', () => {
    const a = simulate(mmc(2, 80, 20), { durationSec: 60, seed: 1 })
    const b = simulate(mmc(2, 80, 20), { durationSec: 60, seed: 2 })
    expect(a.metrics.latency.mean).not.toBe(b.metrics.latency.mean)
  })

  it('stops early once traffic ends and everything has drained', () => {
    const sim = simulate(mmc(4, 10, 10), { durationSec: 20, seed: 1 })
    expect(sim.elapsed).toBeLessThan(sim.horizon)
    expect(sim.metrics.total).toBe(sim.metrics.ok)
  })
})

describe('Simulator: component behaviors', () => {
  it('blocking: a slow DB saturates app threads while CPU stays idle', () => {
    const sim = simulate(
      {
        nodes: [
          node('c', 'client', { requestsPerSecond: 400, readPercent: 0 }),
          node('app', 'appServer', { instances: 1, maxConcurrency: 50, cpuCores: 8, serviceTimeMs: 5, queueCapacity: 200 }),
          node('db', 'sqlDatabase', { connectionPool: 10, writeLatencyMs: 50 }),
        ],
        edges: [edge('c', 'app'), edge('app', 'db')],
      },
      { durationSec: 60, seed: 4 },
    )
    const app = totals(sim, 'app')
    expect(app.detail.threadUtil).toBeGreaterThan(0.9)
    expect(app.detail.coreUtil).toBeLessThan(0.3)
    expect(totals(sim, 'db').utilization).toBeGreaterThan(0.9)
    expect(sim.metrics.rejected + sim.metrics.timedOut).toBeGreaterThan(0)
  })

  it('cache: misses reach the database at (1 - hit rate)', () => {
    const sim = simulate(
      {
        nodes: [
          node('c', 'client', { requestsPerSecond: 500, readPercent: 100 }),
          node('cache', 'cache', { hitRatePct: 80 }),
          node('db', 'sqlDatabase'),
        ],
        edges: [edge('c', 'cache'), edge('cache', 'db')],
      },
      { durationSec: 60, seed: 8 },
    )
    const ratio = totals(sim, 'db').handled / totals(sim, 'cache').handled
    expect(ratio).toBeGreaterThan(0.18)
    expect(ratio).toBeLessThan(0.22)
    expect(totals(sim, 'cache').detail.hitRatio).toBeCloseTo(0.8, 1)
  })

  it('writes pass through the cache to the database', () => {
    const sim = simulate(
      {
        nodes: [
          node('c', 'client', { requestsPerSecond: 100, readPercent: 0 }),
          node('cache', 'cache', { hitRatePct: 100 }),
          node('db', 'sqlDatabase'),
        ],
        edges: [edge('c', 'cache'), edge('cache', 'db')],
      },
      { durationSec: 30, seed: 8 },
    )
    expect(totals(sim, 'db').handled).toBe(totals(sim, 'cache').handled)
  })

  it('API gateway rate limit rejects sustained excess traffic', () => {
    const sim = simulate(
      {
        nodes: [
          node('c', 'client', { requestsPerSecond: 1000 }),
          node('gw', 'apiGateway', { rateLimitRps: 500 }),
          node('app', 'appServer', { instances: 20, maxConcurrency: 100, cpuCores: 16, serviceTimeMs: 1 }),
        ],
        edges: [edge('c', 'gw'), edge('gw', 'app')],
      },
      { durationSec: 60, seed: 2 },
    )
    const rejectedShare = sim.metrics.rejected / sim.metrics.total
    expect(rejectedShare).toBeGreaterThan(0.45)
    expect(rejectedShare).toBeLessThan(0.52)
  })

  it('a full app-server queue rejects requests', () => {
    const sim = simulate(
      {
        nodes: [
          node('c', 'client', { requestsPerSecond: 100 }),
          node('app', 'appServer', { instances: 1, maxConcurrency: 1, cpuCores: 1, queueCapacity: 10, serviceTimeMs: 100 }),
        ],
        edges: [edge('c', 'app')],
      },
      { durationSec: 30, seed: 2 },
    )
    expect(sim.metrics.rejected).toBeGreaterThan(0)
    expect(totals(sim, 'app').detail.rejectedQueueFull).toBe(sim.metrics.rejected)
    expect(totals(sim, 'app').maxQueue).toBe(10)
  })

  it('gateway timeout turns slow requests into timeouts', () => {
    const sim = simulate(
      {
        nodes: [
          node('c', 'client', { requestsPerSecond: 50 }),
          node('gw', 'apiGateway', { timeoutMs: 100 }),
          node('app', 'appServer', { instances: 1, maxConcurrency: 1, cpuCores: 1, queueCapacity: 100_000, serviceTimeMs: 30 }),
        ],
        edges: [edge('c', 'gw'), edge('gw', 'app')],
      },
      { durationSec: 30, seed: 6 },
    )
    expect(sim.metrics.timedOut).toBeGreaterThan(0)
    // No successful request may be slower than the timeout (+ gateway latency).
    expect(sim.metrics.latency.percentile(1)).toBeLessThanOrEqual(0.1 + 1e-9)
  })

  it('message queue answers callers immediately and processes work in the background', () => {
    const sim = simulate(
      {
        nodes: [
          node('c', 'client', { requestsPerSecond: 20 }),
          node('mq', 'messageQueue', { latencyMs: 2, consumers: 20 }),
          node('worker', 'appServer', { serviceTimeMs: 500, instances: 4, maxConcurrency: 10, cpuCores: 4 }),
        ],
        edges: [edge('c', 'mq'), edge('mq', 'worker')],
      },
      { durationSec: 30, seed: 3 },
    )
    expect(sim.metrics.latency.percentile(0.99)).toBeLessThan(0.0021)
    expect(totals(sim, 'mq').detail.processed).toBe(sim.metrics.ok)
  })

  it('load balancer round-robin splits traffic evenly', () => {
    const sim = simulate(
      {
        nodes: [
          node('c', 'client', { requestsPerSecond: 200 }),
          node('lb', 'loadBalancer'),
          node('a1', 'appServer'),
          node('a2', 'appServer'),
        ],
        edges: [edge('c', 'lb'), edge('lb', 'a1'), edge('lb', 'a2')],
      },
      { durationSec: 30, seed: 3 },
    )
    const diff = Math.abs(totals(sim, 'a1').handled - totals(sim, 'a2').handled)
    expect(diff).toBeLessThanOrEqual(1)
  })

  it('read replicas take read traffic off the primary', () => {
    const graph = (replicas: number): GraphInput => ({
      nodes: [
        node('c', 'client', { requestsPerSecond: 3000, readPercent: 100 }),
        node('db', 'sqlDatabase', { connectionPool: 20, readLatencyMs: 10, readReplicas: replicas }),
      ],
      edges: [edge('c', 'db')],
    })
    const without = simulate(graph(0), { durationSec: 20, seed: 1 })
    const withReplicas = simulate(graph(2), { durationSec: 20, seed: 1 })
    expect(totals(withReplicas, 'db').utilization).toBeLessThan(totals(without, 'db').utilization)
    expect(withReplicas.metrics.latency.percentile(0.95)).toBeLessThan(without.metrics.latency.percentile(0.95))
  })

  it('burst traffic peaks at 3× the base rate', () => {
    const sim = simulate(
      { nodes: [node('c', 'client', { requestsPerSecond: 100, pattern: 'burst' }), node('app', 'appServer', { instances: 10 })], edges: [edge('c', 'app')] },
      { durationSec: 60, seed: 1 },
    )
    const peak = Math.max(...sim.metrics.windows.map((w) => w.throughputRps))
    expect(peak).toBeGreaterThan(250)
  })

  it('records one window per simulated second', () => {
    const sim = simulate(mmc(1, 10, 5), { durationSec: 10, seed: 1 })
    expect(sim.metrics.windows.length).toBeGreaterThanOrEqual(10)
    expect(sim.metrics.windows[0]?.stations.app).toBeDefined()
  })
})
