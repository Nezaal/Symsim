import { describe, expect, it } from 'vitest'
import { getTemplate } from '../templates.ts'
import { compileSimulation } from './compile.ts'
import { buildResult, downsample, MAX_TIMESERIES_POINTS } from './result.ts'
import { Simulator } from './simulator.ts'
import type { GraphInput, RunOptions } from './types.ts'

type Config = Record<string, number | string>
const node = (id: string, componentType: string, config: Config = {}) => ({ id, data: { componentType, config } })
const edge = (source: string, target: string) => ({ source, target })

function run(graph: GraphInput, options: RunOptions) {
  const compiled = compileSimulation(graph, options)
  if (!compiled.ok) throw new Error(compiled.errors.map((e) => e.message).join('\n'))
  const sim = new Simulator(compiled.model)
  while (!sim.advance(100_000));
  return buildResult(sim)
}

/** The starter template with the client rate overridden. */
function template(rps: number): GraphInput {
  const t = getTemplate('basic-web-app')
  return {
    nodes: t.nodes.map((n) => ({
      id: n.key,
      data: {
        componentType: n.componentType,
        label: n.label,
        config: n.componentType === 'client' ? { ...n.config, requestsPerSecond: rps } : n.config,
      },
    })),
    edges: t.edges.map(([s, t2]) => edge(s, t2)),
  }
}

describe('buildResult', () => {
  it('reports the starter template at its default 200 req/s as healthy', () => {
    const result = run(template(200), { durationSec: 60, seed: 1 })
    expect(result.bottleneck).toBeNull()
    expect(result.errorRate).toBe(0)
    expect(result.throughputRps).toBeGreaterThan(180)
    expect(result.summary).toMatch(/^Healthy/)
  })

  it('finds the app servers as the bottleneck of the template at 20,000 req/s', () => {
    const result = run(template(20_000), { durationSec: 20, seed: 1 })
    expect(result.bottleneck?.nodeId).toBe('app')
    expect(result.bottleneck?.severity).toBe('saturated')
    expect(result.bottleneck?.explanation).toMatch(/CPU-bound/)
    expect(result.bottleneck?.alsoSaturated).toContain('API Gateway')
    expect(result.summary).toMatch(/^Overloaded/)
  })

  it('blames the database, not the app, when blocked threads wait on it', () => {
    const result = run(
      {
        nodes: [
          node('c', 'client', { requestsPerSecond: 400, readPercent: 0 }),
          node('app', 'appServer', { instances: 1, maxConcurrency: 50, cpuCores: 8, serviceTimeMs: 5, queueCapacity: 200 }),
          node('db', 'sqlDatabase', { connectionPool: 10, writeLatencyMs: 50 }),
        ],
        edges: [edge('c', 'app'), edge('app', 'db')],
      },
      { durationSec: 30, seed: 4 },
    )
    expect(result.bottleneck?.nodeId).toBe('db')
    expect(result.bottleneck?.explanation).toMatch(/stuck waiting/)
  })

  it('blames a thread-starved app server whose dependency is slow but not saturated', () => {
    const result = run(
      {
        nodes: [
          node('c', 'client', { requestsPerSecond: 300, readPercent: 100 }),
          node('app', 'appServer', { instances: 1, maxConcurrency: 10, cpuCores: 8, serviceTimeMs: 2, queueCapacity: 50 }),
          node('db', 'sqlDatabase', { connectionPool: 1000, readLatencyMs: 100 }),
        ],
        edges: [edge('c', 'app'), edge('app', 'db')],
      },
      { durationSec: 30, seed: 4 },
    )
    expect(result.bottleneck?.nodeId).toBe('app')
    expect(result.bottleneck?.explanation).toMatch(/blocked waiting on/)
  })

  it('produces DB-compatible numbers', () => {
    const r = run(template(5_000), { durationSec: 10, seed: 3 })
    expect(r.successfulRequests + r.failedRequests + r.rejectedRequests + r.timedOutRequests).toBeLessThanOrEqual(
      r.totalRequests,
    )
    expect(r.errorRate).toBeGreaterThanOrEqual(0)
    expect(r.errorRate).toBeLessThanOrEqual(1)
    expect(r.latencyP50Ms).toBeLessThanOrEqual(r.latencyP95Ms)
    expect(r.latencyP95Ms).toBeLessThanOrEqual(r.latencyP99Ms)
  })

  it('keeps long runs to a bounded number of chart points', () => {
    const r = run(template(20), { durationSec: 900, seed: 1 })
    expect(r.timeseries.length).toBeLessThanOrEqual(MAX_TIMESERIES_POINTS)
  })
})

describe('downsample', () => {
  it('leaves short series untouched', () => {
    const windows = [{ t: 1, throughputRps: 1, ok: 1, rejected: 0, timedOut: 0, p50Ms: 1, p95Ms: 1, p99Ms: 1, inFlight: 0, stations: {} }]
    expect(downsample(windows, 10)).toEqual(windows)
  })
})
