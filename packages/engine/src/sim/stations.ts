import { RoundRobin, ServerPool, TokenBucket } from './resources.ts'
import type { Reply, SimContext, SimRequest, StationSpec } from './types.ts'

/**
 * Component models. Each station receives calls (`handle`) and eventually
 * answers each one exactly once through `reply`, always from a scheduled event
 * (never synchronously).
 *
 * Latency conventions:
 *   - "added latency" settings (gateway, LB, cache, CDN, queue) are constant
 *   - processing times (app compute, DB, storage) are exponential with that mean
 */

export interface StationSample {
  /** Busy fraction in the last window (0..1+, token buckets can't exceed 1). */
  readonly utilization: number
  readonly queue: number
}

export interface StationTotals {
  readonly id: string
  readonly label: string
  readonly type: StationSpec['type']
  readonly downstream: readonly string[]
  /** Calls received (for a Client: requests generated). */
  readonly handled: number
  /** Calls this station refused (full queue, rate limit, connection limit). */
  readonly rejected: number
  /** Overall busy fraction of its limiting resource. */
  readonly utilization: number
  readonly maxQueue: number
  readonly avgWaitMs: number
  /** Type-specific numbers used by the bottleneck explainer. */
  readonly detail: Readonly<Record<string, number>>
}

export interface Station {
  readonly spec: StationSpec
  handle(req: SimRequest, reply: Reply): void
  sample(windowSec: number): StationSample
  totals(elapsedSec: number): StationTotals
}

const sec = (ms: unknown): number => Number(ms) / 1000
const num = (value: unknown): number => Number(value)

abstract class BaseStation implements Station {
  handled = 0
  protected rejectedCalls = 0

  constructor(
    readonly spec: StationSpec,
    protected readonly ctx: SimContext,
  ) {}

  abstract handle(req: SimRequest, reply: Reply): void
  abstract sample(windowSec: number): StationSample
  abstract totals(elapsedSec: number): StationTotals

  protected reject(reply: Reply): void {
    this.rejectedCalls += 1
    this.ctx.schedule(0, () => reply('rejected'))
  }

  protected makeTotals(
    elapsedSec: number,
    utilization: number,
    extra: Partial<Pick<StationTotals, 'maxQueue' | 'avgWaitMs'>> & { detail?: Record<string, number> } = {},
  ): StationTotals {
    return {
      id: this.spec.id,
      label: this.spec.label,
      type: this.spec.type,
      downstream: this.spec.downstream,
      handled: this.handled,
      rejected: this.rejectedCalls,
      utilization,
      maxQueue: extra.maxQueue ?? 0,
      avgWaitMs: extra.avgWaitMs ?? 0,
      detail: { offeredRps: elapsedSec > 0 ? this.handled / elapsedSec : 0, ...extra.detail },
    }
  }
}

/** Traffic source. Arrivals are driven by the simulator; this only holds counters. */
export class ClientStation extends BaseStation {
  handle(): void {
    throw new Error('Clients do not accept traffic')
  }
  sample(): StationSample {
    return { utilization: 0, queue: 0 }
  }
  totals(elapsedSec: number): StationTotals {
    return this.makeTotals(elapsedSec, 0)
  }
}

/** Token-bucket rate limit, constant added latency, end-to-end timeout. */
class ApiGatewayStation extends BaseStation {
  private readonly bucket = new TokenBucket(this.ctx, num(this.spec.config.rateLimitRps))
  private readonly router = new RoundRobin(this.spec.downstream)
  private readonly latency = sec(this.spec.config.latencyMs)
  private readonly timeout = sec(this.spec.config.timeoutMs)

  handle(req: SimRequest, reply: Reply): void {
    this.handled += 1
    if (!this.bucket.tryTake()) return this.reject(reply)
    if (!req.background) this.ctx.tightenDeadline(req, this.ctx.now + this.timeout)
    this.ctx.schedule(this.latency, () => this.ctx.call(this.router.next(), req, reply))
  }

  sample(windowSec: number): StationSample {
    return { utilization: this.bucket.sampleUtilization(windowSec), queue: 0 }
  }

  totals(elapsedSec: number): StationTotals {
    return this.makeTotals(elapsedSec, this.bucket.utilization(elapsedSec), {
      detail: { capacityRps: this.bucket.rate },
    })
  }
}

/** Connection-limited balancer with round-robin / least-connections / random. */
class LoadBalancerStation extends BaseStation {
  private readonly connections = new ServerPool(this.ctx, num(this.spec.config.maxConnections), 0)
  private readonly router = new RoundRobin(this.spec.downstream)
  private readonly active = new Map(this.spec.downstream.map((id) => [id, 0]))
  private readonly latency = sec(this.spec.config.latencyMs)
  private readonly strategy = String(this.spec.config.strategy)

  handle(req: SimRequest, reply: Reply): void {
    this.handled += 1
    this.connections.acquire(
      req,
      () =>
        this.ctx.schedule(this.latency, () => {
          const target = this.pickTarget()
          this.active.set(target, (this.active.get(target) ?? 0) + 1)
          this.ctx.call(target, req, (outcome) => {
            this.active.set(target, (this.active.get(target) ?? 1) - 1)
            this.connections.release()
            reply(outcome)
          })
        }),
      () => this.reject(reply),
      () => reply('timed_out'),
    )
  }

  private pickTarget(): string {
    const targets = this.spec.downstream
    if (this.strategy === 'random') return targets[this.ctx.rng.pick(targets.length)]!
    if (this.strategy === 'least-connections') {
      let best = targets[0]!
      for (const t of targets) if ((this.active.get(t) ?? 0) < (this.active.get(best) ?? 0)) best = t
      return best
    }
    return this.router.next()
  }

  sample(windowSec: number): StationSample {
    return { utilization: this.connections.sampleUtilization(windowSec), queue: 0 }
  }

  totals(elapsedSec: number): StationTotals {
    return this.makeTotals(elapsedSec, this.connections.utilization(elapsedSec), {
      detail: { maxConnections: this.connections.size },
    })
  }
}

/**
 * Blocking app server with two resources:
 *   threads = instances × maxConcurrency (FIFO queue of queueCapacity)
 *   cores   = instances × cpuCores
 * A request holds a thread for its whole life: waiting for a core, computing,
 * then calling each downstream dependency in turn. So slow dependencies use up
 * threads even while the CPU sits idle.
 */
class AppServerStation extends BaseStation {
  private readonly threads = new ServerPool(
    this.ctx,
    num(this.spec.config.instances) * num(this.spec.config.maxConcurrency),
    num(this.spec.config.queueCapacity),
  )
  private readonly cores = new ServerPool(
    this.ctx,
    num(this.spec.config.instances) * num(this.spec.config.cpuCores),
    Infinity,
  )
  private readonly serviceTime = sec(this.spec.config.serviceTimeMs)

  handle(req: SimRequest, reply: Reply): void {
    this.handled += 1
    this.threads.acquire(
      req,
      () =>
        this.cores.acquire(
          req,
          () =>
            this.ctx.schedule(this.ctx.rng.exponential(this.serviceTime), () => {
              this.cores.release()
              this.callDependencies(req, 0, (outcome) => {
                this.threads.release()
                reply(outcome)
              })
            }),
          () => this.finishWithoutWork(reply, 'rejected'),
          () => this.finishWithoutWork(reply, 'timed_out'),
        ),
      () => this.reject(reply),
      () => reply('timed_out'),
    )
  }

  private finishWithoutWork(reply: Reply, outcome: 'rejected' | 'timed_out'): void {
    this.threads.release()
    reply(outcome)
  }

  /** Calls each downstream in order; stops at the first failure. */
  private callDependencies(req: SimRequest, index: number, done: Reply): void {
    const target = this.spec.downstream[index]
    if (target === undefined) return this.ctx.schedule(0, () => done('ok'))
    if (req.finished && !req.background) return this.ctx.schedule(0, () => done('timed_out'))
    this.ctx.call(target, req, (outcome) =>
      outcome === 'ok' ? this.callDependencies(req, index + 1, done) : done(outcome),
    )
  }

  sample(windowSec: number): StationSample {
    const threadUtil = this.threads.sampleUtilization(windowSec)
    const coreUtil = this.cores.sampleUtilization(windowSec)
    return { utilization: Math.max(threadUtil, coreUtil), queue: this.threads.queueLength }
  }

  totals(elapsedSec: number): StationTotals {
    const threadUtil = this.threads.utilization(elapsedSec)
    const coreUtil = this.cores.utilization(elapsedSec)
    const threadAvg = this.threads.averages(elapsedSec)
    return this.makeTotals(elapsedSec, Math.max(threadUtil, coreUtil), {
      maxQueue: this.threads.maxQueue,
      avgWaitMs: this.threads.averageWaitSec * 1000,
      detail: {
        threadUtil,
        coreUtil,
        threads: this.threads.size,
        cores: this.cores.size,
        computeCapacityRps: this.cores.size / this.serviceTime,
        avgInSystem: threadAvg.busy + threadAvg.queue,
        rejectedQueueFull: this.threads.rejected,
      },
    })
  }
}

/**
 * Cache or CDN: constant latency; reads hit with the configured probability.
 * Misses and writes (write-through) continue downstream. With no downstream, a
 * miss simply completes.
 */
class CachingStation extends BaseStation {
  private readonly bucket: TokenBucket | null
  private readonly router = new RoundRobin(this.spec.downstream)
  private readonly latency: number
  private readonly hitRate: number
  private hits = 0
  private reads = 0

  constructor(spec: StationSpec, ctx: SimContext) {
    super(spec, ctx)
    const isCdn = spec.type === 'cdn'
    this.bucket = isCdn ? null : new TokenBucket(ctx, num(spec.config.maxOpsPerSec))
    this.latency = sec(isCdn ? spec.config.edgeLatencyMs : spec.config.latencyMs)
    this.hitRate = num(spec.config.hitRatePct) / 100
  }

  handle(req: SimRequest, reply: Reply): void {
    this.handled += 1
    if (this.bucket && !this.bucket.tryTake()) return this.reject(reply)
    this.ctx.schedule(this.latency, () => {
      if (req.kind === 'read') {
        this.reads += 1
        if (this.ctx.rng.chance(this.hitRate)) {
          this.hits += 1
          return reply('ok')
        }
      }
      if (this.spec.downstream.length === 0) return reply('ok')
      this.ctx.call(this.router.next(), req, reply)
    })
  }

  sample(windowSec: number): StationSample {
    return { utilization: this.bucket?.sampleUtilization(windowSec) ?? 0, queue: 0 }
  }

  totals(elapsedSec: number): StationTotals {
    return this.makeTotals(elapsedSec, this.bucket?.utilization(elapsedSec) ?? 0, {
      detail: {
        hitRatio: this.reads > 0 ? this.hits / this.reads : 0,
        ...(this.bucket ? { capacityRps: this.bucket.rate } : {}),
      },
    })
  }
}

/**
 * Relational DB: each node (primary + read replicas) has its own connection
 * pool. Writes go to the primary; reads round-robin over all nodes. Requests
 * wait for a connection until served (or their deadline passes).
 */
class SqlDatabaseStation extends BaseStation {
  private readonly pools: ServerPool[]
  private readonly readRouter: RoundRobin
  private readonly readLatency = sec(this.spec.config.readLatencyMs)
  private readonly writeLatency = sec(this.spec.config.writeLatencyMs)

  constructor(spec: StationSpec, ctx: SimContext) {
    super(spec, ctx)
    const nodes = 1 + num(spec.config.readReplicas)
    this.pools = Array.from({ length: nodes }, () => new ServerPool(ctx, num(spec.config.connectionPool), Infinity))
    this.readRouter = new RoundRobin(this.pools.map((_, i) => String(i)))
  }

  handle(req: SimRequest, reply: Reply): void {
    this.handled += 1
    const pool = req.kind === 'write' ? this.pools[0]! : this.pools[Number(this.readRouter.next())]!
    const mean = req.kind === 'write' ? this.writeLatency : this.readLatency
    pool.acquire(
      req,
      () =>
        this.ctx.schedule(this.ctx.rng.exponential(mean), () => {
          pool.release()
          reply('ok')
        }),
      () => this.reject(reply),
      () => reply('timed_out'),
    )
  }

  sample(windowSec: number): StationSample {
    const utils = this.pools.map((p) => p.sampleUtilization(windowSec))
    return {
      utilization: Math.max(...utils),
      queue: this.pools.reduce((sum, p) => sum + p.queueLength, 0),
    }
  }

  totals(elapsedSec: number): StationTotals {
    const primary = this.pools[0]!
    const pool = primary.size
    return this.makeTotals(elapsedSec, Math.max(...this.pools.map((p) => p.utilization(elapsedSec))), {
      maxQueue: Math.max(...this.pools.map((p) => p.maxQueue)),
      avgWaitMs: primary.averageWaitSec * 1000,
      detail: {
        primaryUtil: primary.utilization(elapsedSec),
        connectionPool: pool,
        replicas: this.pools.length - 1,
        writeCapacityRps: pool / this.writeLatency,
        readCapacityRps: (pool * this.pools.length) / this.readLatency,
      },
    })
  }
}

/** Partitioned store: throughput limit split evenly across partitions. */
class NoSqlDatabaseStation extends BaseStation {
  private readonly partitions: TokenBucket[]
  private readonly readLatency = sec(this.spec.config.readLatencyMs)
  private readonly writeLatency = sec(this.spec.config.writeLatencyMs)
  private readonly maxOps = num(this.spec.config.maxOpsPerSec)

  constructor(spec: StationSpec, ctx: SimContext) {
    super(spec, ctx)
    const count = num(spec.config.partitions)
    const perPartition = num(spec.config.maxOpsPerSec) / count
    this.partitions = Array.from({ length: count }, () => new TokenBucket(ctx, perPartition))
  }

  handle(req: SimRequest, reply: Reply): void {
    this.handled += 1
    const partition = this.partitions[this.ctx.rng.pick(this.partitions.length)]!
    if (!partition.tryTake()) return this.reject(reply)
    const mean = req.kind === 'write' ? this.writeLatency : this.readLatency
    this.ctx.schedule(this.ctx.rng.exponential(mean), () => reply('ok'))
  }

  sample(windowSec: number): StationSample {
    const utils = this.partitions.map((p) => p.sampleUtilization(windowSec))
    return { utilization: Math.max(...utils), queue: 0 }
  }

  totals(elapsedSec: number): StationTotals {
    const accepted = this.partitions.reduce((sum, p) => sum + p.accepted, 0)
    return this.makeTotals(elapsedSec, elapsedSec > 0 ? accepted / (this.maxOps * elapsedSec) : 0, {
      detail: { capacityRps: this.maxOps, partitions: this.partitions.length },
    })
  }
}

/** Blob storage: request-rate limit plus exponential latency. */
class ObjectStorageStation extends BaseStation {
  private readonly bucket = new TokenBucket(this.ctx, num(this.spec.config.maxRps))
  private readonly latency = sec(this.spec.config.latencyMs)

  handle(_req: SimRequest, reply: Reply): void {
    this.handled += 1
    if (!this.bucket.tryTake()) return this.reject(reply)
    this.ctx.schedule(this.ctx.rng.exponential(this.latency), () => reply('ok'))
  }

  sample(windowSec: number): StationSample {
    return { utilization: this.bucket.sampleUtilization(windowSec), queue: 0 }
  }

  totals(elapsedSec: number): StationTotals {
    return this.makeTotals(elapsedSec, this.bucket.utilization(elapsedSec), {
      detail: { capacityRps: this.bucket.rate },
    })
  }
}

/**
 * Async hand-off: the caller is answered as soon as the message is stored
 * (after `latencyMs`). `consumers` workers then process messages by calling
 * downstream. That background work never counts toward user-facing latency.
 */
class MessageQueueStation extends BaseStation {
  private readonly consumers = new ServerPool(
    this.ctx,
    num(this.spec.config.consumers),
    num(this.spec.config.maxDepth),
  )
  private readonly router = new RoundRobin(this.spec.downstream)
  private readonly latency = sec(this.spec.config.latencyMs)
  private processed = 0
  private failed = 0

  handle(req: SimRequest, reply: Reply): void {
    this.handled += 1
    const job = this.ctx.createBackgroundRequest(req.kind)
    let accepted = true
    this.consumers.acquire(
      job,
      () =>
        this.ctx.call(this.router.next(), job, (outcome) => {
          if (outcome === 'ok') this.processed += 1
          else this.failed += 1
          job.finished = true
          this.consumers.release()
          this.ctx.backgroundDone()
        }),
      () => {
        accepted = false
        this.rejectedCalls += 1
        this.ctx.backgroundDone()
        reply('rejected')
      },
      () => this.ctx.backgroundDone(),
    )
    // acquire() defers rejections by one event, so `accepted` is still true
    // here even for a full queue; decide at reply time instead.
    this.ctx.schedule(this.latency, () => {
      if (accepted) reply('ok')
    })
  }

  sample(windowSec: number): StationSample {
    return { utilization: this.consumers.sampleUtilization(windowSec), queue: this.consumers.queueLength }
  }

  totals(elapsedSec: number): StationTotals {
    return this.makeTotals(elapsedSec, this.consumers.utilization(elapsedSec), {
      maxQueue: this.consumers.maxQueue,
      avgWaitMs: this.consumers.averageWaitSec * 1000,
      detail: {
        consumers: this.consumers.size,
        processed: this.processed,
        failedBackground: this.failed,
        backlog: this.consumers.queueLength,
      },
    })
  }
}

export function createStation(spec: StationSpec, ctx: SimContext): Station {
  switch (spec.type) {
    case 'client':
      return new ClientStation(spec, ctx)
    case 'apiGateway':
      return new ApiGatewayStation(spec, ctx)
    case 'loadBalancer':
      return new LoadBalancerStation(spec, ctx)
    case 'appServer':
      return new AppServerStation(spec, ctx)
    case 'cache':
    case 'cdn':
      return new CachingStation(spec, ctx)
    case 'sqlDatabase':
      return new SqlDatabaseStation(spec, ctx)
    case 'nosqlDatabase':
      return new NoSqlDatabaseStation(spec, ctx)
    case 'objectStorage':
      return new ObjectStorageStation(spec, ctx)
    case 'messageQueue':
      return new MessageQueueStation(spec, ctx)
  }
}
