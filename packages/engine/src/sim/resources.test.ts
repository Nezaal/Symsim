import { describe, expect, it } from 'vitest'
import { EventQueue } from './eventQueue.ts'
import { createRng } from './random.ts'
import { ServerPool } from './resources.ts'
import type { SimContext, SimRequest } from './types.ts'

/** Minimal context: a clock and a queue of scheduled callbacks. */
function fakeContext() {
  const events = new EventQueue<() => void>()
  const ctx: SimContext & { flush(): void; now: number } = {
    now: 0,
    rng: createRng(1),
    schedule: (delay, fn) => events.push(ctx.now + delay, fn),
    call: () => {},
    tightenDeadline: () => {},
    createBackgroundRequest: () => request(),
    backgroundDone: () => {},
    flush: () => {
      while (events.size > 0) events.pop()!.payload()
    },
  }
  return ctx
}

let nextId = 0
const request = (): SimRequest => ({
  id: nextId++,
  kind: 'read',
  start: 0,
  deadline: Infinity,
  finished: false,
  background: false,
})

describe('ServerPool', () => {
  it('clears timed-out waiters from the front so they do not take queue capacity', () => {
    const ctx = fakeContext()
    const pool = new ServerPool(ctx, 1, 1)
    const log: string[] = []
    const a = request()
    const b = request()
    const c = request()
    pool.acquire(a, () => log.push('a start'), () => log.push('a rejected'), () => log.push('a dropped'))
    pool.acquire(b, () => log.push('b start'), () => log.push('b rejected'), () => log.push('b dropped'))
    b.finished = true // b's client gave up while it waited
    pool.acquire(c, () => log.push('c start'), () => log.push('c rejected'), () => log.push('c dropped'))
    ctx.flush()
    expect(log).toEqual(['a start', 'b dropped'])
    expect(pool.queueLength).toBe(1) // c took b's place instead of being rejected
    pool.release()
    expect(log).toContain('c start')
  })

  it('averages waiting time over every started request (0 for immediate starts)', () => {
    const ctx = fakeContext()
    const pool = new ServerPool(ctx, 1, 10)
    pool.acquire(request(), () => {}, () => {}, () => {})
    pool.acquire(request(), () => {}, () => {}, () => {})
    ctx.now = 2
    pool.release()
    expect(pool.averageWaitSec).toBe(1) // (0 + 2) / 2
  })
})
