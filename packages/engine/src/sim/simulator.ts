import { EventQueue } from './eventQueue.ts'
import { MetricsCollector } from './metrics.ts'
import { createRng, type Rng } from './random.ts'
import { RoundRobin } from './resources.ts'
import {
  ClientStation,
  createStation,
  type Station,
  type StationSample,
  type StationTotals,
} from './stations.ts'
import type { Outcome, Reply, RequestKind, SimContext, SimModel, SimRequest, StationSpec } from './types.ts'

/** Clients give up on a request after this long (a typical HTTP client timeout). */
export const CLIENT_TIMEOUT_SEC = 30
/** After traffic stops, keep simulating so in-flight requests can finish. */
export const DRAIN_SEC = CLIENT_TIMEOUT_SEC
/** Burst pattern: 3× traffic for the last 10 s of every 30 s cycle. */
const BURST_CYCLE_SEC = 30
const BURST_LENGTH_SEC = 10
const BURST_MULTIPLIER = 3

export interface SimLimits {
  readonly maxEvents: number
  readonly maxInFlight: number
}

export const LIMITS: SimLimits = Object.freeze({
  maxEvents: 50_000_000,
  maxInFlight: 200_000,
})

export class LimitExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LimitExceededError'
  }
}

/**
 * Discrete-event simulator. Time jumps from one scheduled event to the next;
 * nothing happens "between" events. Events are closures, executed in
 * (time, insertion) order, so a run is fully determined by model + seed.
 */
export class Simulator implements SimContext {
  now = 0
  readonly rng: Rng
  readonly metrics = new MetricsCollector()
  readonly stations = new Map<string, Station>()
  /** Hard stop: traffic duration plus drain time. */
  readonly horizon: number
  eventsProcessed = 0
  inFlight = 0
  /** Per-component totals captured when traffic stops (drain time excluded). */
  trafficTotals: StationTotals[] | null = null
  private backgroundInFlight = 0
  private nextRequestId = 0
  private finished = false
  private readonly events = new EventQueue<() => void>()

  constructor(
    readonly model: SimModel,
    private readonly limits: SimLimits = LIMITS,
  ) {
    this.rng = createRng(model.seed)
    this.horizon = model.durationSec + DRAIN_SEC
    for (const spec of model.stations) this.stations.set(spec.id, createStation(spec, this))
    for (const spec of model.stations) if (spec.type === 'client') this.startClient(spec)
    this.schedule(1, () => this.closeWindow())
    this.schedule(model.durationSec, () => {
      this.trafficTotals = [...this.stations.values()].map((s) => s.totals(model.durationSec))
    })
  }

  // ── SimContext ─────────────────────────────────────────────────────────────

  schedule(delaySec: number, fn: () => void): void {
    this.events.push(this.now + Math.max(0, delaySec), fn)
  }

  call(stationId: string, req: SimRequest, reply: Reply): void {
    const station = this.stations.get(stationId)
    if (!station) throw new Error(`Unknown station ${stationId}`)
    station.handle(req, reply)
  }

  tightenDeadline(req: SimRequest, deadline: number): void {
    if (deadline >= req.deadline) return
    req.deadline = deadline
    this.scheduleTimeout(req)
  }

  createBackgroundRequest(kind: RequestKind): SimRequest {
    this.backgroundInFlight += 1
    return { id: this.nextRequestId++, kind, start: this.now, deadline: Infinity, finished: false, background: true }
  }

  backgroundDone(): void {
    this.backgroundInFlight -= 1
  }

  // ── Running ────────────────────────────────────────────────────────────────

  get done(): boolean {
    return this.finished || this.events.peekTime() > this.horizon
  }

  /** Processes up to `maxEvents` events. Returns true once the run is complete. */
  advance(maxEvents: number): boolean {
    let processed = 0
    while (processed < maxEvents && !this.done) {
      const event = this.events.pop()!
      this.now = event.time
      event.payload()
      processed += 1
      this.eventsProcessed += 1
      if (this.eventsProcessed > this.limits.maxEvents) {
        throw new LimitExceededError(
          `Simulation stopped after ${this.limits.maxEvents.toLocaleString('en-US')} events. Try a shorter duration or less traffic.`,
        )
      }
    }
    return this.done
  }

  /** Simulated seconds covered so far (never beyond the horizon). */
  get elapsed(): number {
    return Math.min(this.now, this.horizon)
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private startClient(spec: StationSpec): void {
    const station = this.stations.get(spec.id) as ClientStation
    const rate = Number(spec.config.requestsPerSecond)
    const pattern = String(spec.config.pattern)
    const readShare = Number(spec.config.readPercent) / 100
    const duration = this.model.durationSec
    const router = new RoundRobin(spec.downstream)
    const maxRate = pattern === 'burst' ? rate * BURST_MULTIPLIER : rate

    const rateAt = (t: number): number => {
      if (pattern === 'burst') {
        return t % BURST_CYCLE_SEC >= BURST_CYCLE_SEC - BURST_LENGTH_SEC ? rate * BURST_MULTIPLIER : rate
      }
      if (pattern === 'ramp') {
        const half = duration / 2
        return t >= half ? rate : rate * (0.1 + (0.9 * t) / half)
      }
      return rate
    }

    // Poisson arrivals at the peak rate, thinned to the current rate
    // (a non-homogeneous Poisson process).
    const arrive = (): void => {
      if (this.now >= duration) return
      if (this.rng.chance(rateAt(this.now) / maxRate)) {
        station.handled += 1
        this.startRequest(router.next(), this.rng.chance(readShare) ? 'read' : 'write')
      }
      this.schedule(this.rng.exponential(1 / maxRate), arrive)
    }
    this.schedule(this.rng.exponential(1 / maxRate), arrive)
  }

  private startRequest(target: string, kind: RequestKind): void {
    this.inFlight += 1
    if (this.inFlight > this.limits.maxInFlight) {
      throw new LimitExceededError(
        `More than ${this.limits.maxInFlight.toLocaleString('en-US')} requests in flight at once. The system is far past saturation; reduce traffic.`,
      )
    }
    const req: SimRequest = {
      id: this.nextRequestId++,
      kind,
      start: this.now,
      deadline: this.now + CLIENT_TIMEOUT_SEC,
      finished: false,
      background: false,
    }
    this.metrics.onStart()
    this.scheduleTimeout(req)
    this.call(target, req, (outcome) => this.finish(req, outcome))
  }

  private scheduleTimeout(req: SimRequest): void {
    this.events.push(req.deadline, () => {
      if (!req.finished && this.now >= req.deadline) this.finish(req, 'timed_out')
    })
  }

  /** Records a request's outcome once; later replies (after a timeout) are ignored. */
  private finish(req: SimRequest, outcome: Outcome): void {
    if (req.finished) return
    req.finished = true
    this.inFlight -= 1
    this.metrics.onFinish(outcome, this.now - req.start)
  }

  private closeWindow(): void {
    const samples: Record<string, StationSample> = {}
    for (const [id, station] of this.stations) samples[id] = station.sample(1)
    this.metrics.closeWindow(this.now, 1, this.inFlight, samples)

    const idle = this.inFlight === 0 && this.backgroundInFlight === 0
    if (this.now >= this.model.durationSec && idle) {
      this.finished = true
      return
    }
    this.schedule(1, () => this.closeWindow())
  }
}
