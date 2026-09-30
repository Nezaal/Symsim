import { describe, expect, it } from 'vitest'
import { createRng } from './random.ts'
import { EventQueue } from './eventQueue.ts'
import { LatencyHistogram } from './histogram.ts'

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 5 }, () => a.next())
    const seqB = Array.from({ length: 5 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('gives different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next())
  })

  it('stays within [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 10_000; i += 1) {
      const x = rng.next()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('draws exponential values with the requested mean', () => {
    const rng = createRng(123)
    const n = 200_000
    let sum = 0
    for (let i = 0; i < n; i += 1) sum += rng.exponential(0.02)
    expect(sum / n).toBeCloseTo(0.02, 3)
  })

  it('returns 0 for a zero mean', () => {
    expect(createRng(1).exponential(0)).toBe(0)
  })

  it('picks indexes uniformly-ish', () => {
    const rng = createRng(9)
    const counts = [0, 0, 0, 0]
    for (let i = 0; i < 40_000; i += 1) counts[rng.pick(4)]! += 1
    for (const c of counts) expect(c).toBeGreaterThan(9_500)
  })
})

describe('EventQueue', () => {
  it('pops events in time order', () => {
    const q = new EventQueue<string>()
    q.push(3, 'c')
    q.push(1, 'a')
    q.push(2, 'b')
    expect([q.pop()?.payload, q.pop()?.payload, q.pop()?.payload]).toEqual(['a', 'b', 'c'])
    expect(q.pop()).toBeUndefined()
  })

  it('breaks ties by insertion order (deterministic)', () => {
    const q = new EventQueue<number>()
    for (let i = 0; i < 100; i += 1) q.push(5, i)
    const out = Array.from({ length: 100 }, () => q.pop()?.payload)
    expect(out).toEqual(Array.from({ length: 100 }, (_, i) => i))
  })

  it('stays ordered under random pushes', () => {
    const rng = createRng(3)
    const q = new EventQueue<null>()
    for (let i = 0; i < 5_000; i += 1) q.push(rng.next() * 100, null)
    let last = -Infinity
    while (q.size > 0) {
      const e = q.pop()!
      expect(e.time).toBeGreaterThanOrEqual(last)
      last = e.time
    }
  })

  it('reports the next event time', () => {
    const q = new EventQueue<null>()
    expect(q.peekTime()).toBe(Infinity)
    q.push(4, null)
    q.push(2, null)
    expect(q.peekTime()).toBe(2)
  })
})

describe('LatencyHistogram', () => {
  it('computes percentiles within ~1%', () => {
    const h = new LatencyHistogram()
    for (let ms = 1; ms <= 1000; ms += 1) h.record(ms / 1000)
    expect(h.percentile(0.5)).toBeCloseTo(0.5, 2)
    expect(Math.abs(h.percentile(0.95) - 0.95) / 0.95).toBeLessThan(0.011)
    expect(Math.abs(h.percentile(0.99) - 0.99) / 0.99).toBeLessThan(0.011)
    expect(h.count).toBe(1000)
    expect(h.mean).toBeCloseTo(0.5005, 6)
  })

  it('clamps percentiles to observed min/max', () => {
    const h = new LatencyHistogram()
    h.record(0.25)
    expect(h.percentile(0.5)).toBe(0.25)
    expect(h.percentile(0.99)).toBe(0.25)
  })

  it('returns 0 when empty', () => {
    const h = new LatencyHistogram()
    expect(h.percentile(0.5)).toBe(0)
    expect(h.mean).toBe(0)
  })

  it('handles zero and tiny values', () => {
    const h = new LatencyHistogram()
    h.record(0)
    h.record(1e-9)
    expect(h.percentile(0.99)).toBeLessThanOrEqual(1e-6)
  })
})
