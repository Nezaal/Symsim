import { describe, expect, it } from 'vitest'
import { runSimulation, startSimulation } from './run.ts'
import { LimitExceededError } from './simulator.ts'
import type { GraphInput } from './types.ts'

const graph: GraphInput = {
  nodes: [
    { id: 'c', data: { componentType: 'client', config: { requestsPerSecond: 200 } } },
    { id: 'app', data: { componentType: 'appServer' } },
    { id: 'db', data: { componentType: 'sqlDatabase' } },
  ],
  edges: [
    { source: 'c', target: 'app' },
    { source: 'app', target: 'db' },
  ],
}
const options = { durationSec: 20, seed: 5 }

/** A fake clock that jumps past any budget, so each slice processes exactly one batch. */
const steppingClock = () => {
  let t = 0
  return () => (t += 1_000)
}

describe('SimulationRun', () => {
  it('gives the same result in many slices as in one go', () => {
    const whole = runSimulation(graph, options)
    const started = startSimulation(graph, options)
    if (!whole.ok || !started.ok) throw new Error('should compile')
    const clock = steppingClock()
    let slices = 0
    while (!started.run.runSlice(1, clock)) slices += 1
    expect(slices).toBeGreaterThan(1)
    expect(started.run.result()).toEqual(whole.result)
  })

  it('streams each chart window exactly once', () => {
    const started = startSimulation(graph, options)
    if (!started.ok) throw new Error('should compile')
    const clock = steppingClock()
    const seen: number[] = []
    let done = false
    while (!done) {
      done = started.run.runSlice(1, clock)
      seen.push(...started.run.takeProgress().windows.map((w) => w.t))
    }
    expect(seen).toEqual([...new Set(seen)])
    expect(seen.length).toBeGreaterThanOrEqual(20)
    expect(started.run.takeProgress().fraction).toBe(1)
  })

  it('returns validation errors instead of a run', () => {
    const started = startSimulation({ nodes: [], edges: [] }, options)
    expect(started.ok).toBe(false)
  })

  it('stops with a clear error when a safety limit is hit', () => {
    expect(() => runSimulation(graph, options, { maxEvents: 1_000, maxInFlight: 200_000 })).toThrow(LimitExceededError)
    expect(() => runSimulation(graph, options, { maxEvents: 1e9, maxInFlight: 1 })).toThrow(/in flight/)
  })
})
