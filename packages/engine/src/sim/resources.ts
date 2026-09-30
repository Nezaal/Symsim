import type { SimContext, SimRequest } from './types.ts'

/**
 * `size` identical workers plus a FIFO waiting line of `queueCapacity`.
 * Models threads, CPU cores, DB connections, LB connection slots, and message
 * queue consumers.
 *
 * Tracks time-weighted busy and queue areas, so utilization and average queue
 * length are exact (not sampled).
 *
 * Callbacks for rejected or dropped work are deferred by one zero-delay event.
 * Callers never re-enter the pool from inside its own methods.
 */
interface Waiter {
  readonly req: SimRequest
  readonly enqueuedAt: number
  readonly onStart: () => void
  readonly onDrop: () => void
}

export class ServerPool {
  busy = 0
  started = 0
  rejected = 0
  dropped = 0
  maxQueue = 0
  private busyArea = 0
  private queueArea = 0
  private totalWait = 0
  private lastChange = 0
  private windowBusyArea = 0
  private waiting: (Waiter | undefined)[] = []
  private head = 0

  constructor(
    private readonly ctx: SimContext,
    readonly size: number,
    readonly queueCapacity: number,
  ) {}

  get queueLength(): number {
    return this.waiting.length - this.head
  }

  /**
   * Starts work now if a worker is free, queues it if there's room, otherwise
   * rejects it. Work for requests that already timed out is dropped instead.
   */
  acquire(req: SimRequest, onStart: () => void, onReject: () => void, onDrop: () => void): void {
    if (isAbandoned(req)) {
      this.dropped += 1
      this.ctx.schedule(0, onDrop)
      return
    }
    this.accumulate()
    this.dropAbandonedAtHead()
    if (this.busy < this.size) {
      this.busy += 1
      this.started += 1
      onStart()
      return
    }
    if (this.queueLength >= this.queueCapacity) {
      this.rejected += 1
      this.ctx.schedule(0, onReject)
      return
    }
    this.waiting.push({ req, enqueuedAt: this.ctx.now, onStart, onDrop })
    if (this.queueLength > this.maxQueue) this.maxQueue = this.queueLength
  }

  /** Frees a worker and hands it to the next live waiter, if any. */
  release(): void {
    this.accumulate()
    while (this.queueLength > 0) {
      const next = this.waiting[this.head]!
      this.waiting[this.head] = undefined
      this.head += 1
      this.compact()
      if (isAbandoned(next.req)) {
        this.dropped += 1
        this.ctx.schedule(0, next.onDrop)
        continue
      }
      this.totalWait += this.ctx.now - next.enqueuedAt
      this.started += 1
      next.onStart() // the worker passes straight to this waiter; busy is unchanged
      return
    }
    this.busy -= 1
  }

  /** True when acquire() would start or queue work instead of rejecting it. */
  hasRoom(): boolean {
    this.dropAbandonedAtHead()
    return this.busy < this.size || this.queueLength < this.queueCapacity
  }

  /**
   * Removes waiters whose requests already timed out from the front of the
   * line. Deadlines follow arrival order, so dead waiters gather at the front;
   * clearing them keeps them from using capacity meant for live requests.
   */
  private dropAbandonedAtHead(): void {
    while (this.queueLength > 0) {
      const head = this.waiting[this.head]!
      if (!isAbandoned(head.req)) return
      this.waiting[this.head] = undefined
      this.head += 1
      this.dropped += 1
      this.ctx.schedule(0, head.onDrop)
    }
    this.compact()
  }

  /** Busy fraction since the previous call (for per-second charts). */
  sampleUtilization(windowSec: number): number {
    this.accumulate()
    const delta = this.busyArea - this.windowBusyArea
    this.windowBusyArea = this.busyArea
    return windowSec > 0 ? delta / (this.size * windowSec) : 0
  }

  utilization(elapsedSec: number): number {
    this.accumulate()
    return elapsedSec > 0 ? this.busyArea / (this.size * elapsedSec) : 0
  }

  /** Time-averaged number of busy workers and waiting requests. */
  averages(elapsedSec: number): { busy: number; queue: number } {
    this.accumulate()
    return elapsedSec > 0
      ? { busy: this.busyArea / elapsedSec, queue: this.queueArea / elapsedSec }
      : { busy: 0, queue: 0 }
  }

  /**
   * Average time spent waiting for a worker, over every request that got one
   * (immediate starts count as 0). Requests that gave up while waiting are not
   * included.
   */
  get averageWaitSec(): number {
    return this.started > 0 ? this.totalWait / this.started : 0
  }

  private accumulate(): void {
    const dt = this.ctx.now - this.lastChange
    if (dt > 0) {
      this.busyArea += this.busy * dt
      this.queueArea += this.queueLength * dt
      this.lastChange = this.ctx.now
    }
  }

  private compact(): void {
    if (this.head > 1024 && this.head * 2 > this.waiting.length) {
      this.waiting = this.waiting.slice(this.head)
      this.head = 0
    }
  }
}

/**
 * Rate limiter: refills `rate` tokens per second, holds at most `burst`.
 * Burst defaults to one second's worth. That absorbs normal random bunching of
 * arrivals, so only sustained overload is rejected.
 */
export class TokenBucket {
  accepted = 0
  rejected = 0
  private tokens: number
  private last = 0
  private windowAccepted = 0

  constructor(
    private readonly ctx: SimContext,
    readonly rate: number,
    private readonly burst: number = Math.max(1, rate),
  ) {
    this.tokens = this.burst
  }

  tryTake(): boolean {
    const now = this.ctx.now
    this.tokens = Math.min(this.burst, this.tokens + (now - this.last) * this.rate)
    this.last = now
    if (this.tokens >= 1) {
      this.tokens -= 1
      this.accepted += 1
      return true
    }
    this.rejected += 1
    return false
  }

  sampleUtilization(windowSec: number): number {
    const delta = this.accepted - this.windowAccepted
    this.windowAccepted = this.accepted
    return windowSec > 0 ? delta / (this.rate * windowSec) : 0
  }

  utilization(elapsedSec: number): number {
    return elapsedSec > 0 ? this.accepted / (this.rate * elapsedSec) : 0
  }
}

/** Cycles through targets in order. */
export class RoundRobin {
  private index = 0

  constructor(readonly targets: readonly string[]) {}

  next(): string {
    const target = this.targets[this.index % this.targets.length]!
    this.index += 1
    return target
  }
}

function isAbandoned(req: SimRequest): boolean {
  return req.finished && !req.background
}
