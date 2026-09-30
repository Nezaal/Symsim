import type { ComponentTypeId, ConfigValue } from '../componentTypes.ts'
import type { Rng } from './random.ts'

// ── Input: the editor graph plus run options ─────────────────────────────────

export interface GraphNodeInput {
  readonly id: string
  readonly data: {
    readonly componentType: string
    readonly label?: string
    readonly config?: Readonly<Record<string, ConfigValue>>
  }
}

export interface GraphEdgeInput {
  readonly source: string
  readonly target: string
}

export interface GraphInput {
  readonly nodes: readonly GraphNodeInput[]
  readonly edges: readonly GraphEdgeInput[]
}

export interface RunOptions {
  /** Simulated seconds of traffic (1..3600). */
  readonly durationSec: number
  /** Integer seed; the same seed + graph reproduces the same run. */
  readonly seed: number
}

// ── Compiled model ───────────────────────────────────────────────────────────

export interface StationSpec {
  readonly id: string
  readonly label: string
  readonly type: ComponentTypeId
  /** Every field present, clamped to its valid range (units as in the editor: ms, %, …). */
  readonly config: Readonly<Record<string, ConfigValue>>
  /** Ids of the components this one sends traffic to, in a stable order. */
  readonly downstream: readonly string[]
}

export interface SimModel {
  readonly durationSec: number
  readonly seed: number
  readonly stations: readonly StationSpec[]
}

export interface ValidationError {
  readonly nodeId?: string
  readonly message: string
}

export type CompileResult =
  | { readonly ok: true; readonly model: SimModel }
  | { readonly ok: false; readonly errors: readonly ValidationError[] }

// ── Runtime ──────────────────────────────────────────────────────────────────

export type Outcome = 'ok' | 'rejected' | 'timed_out'
export type RequestKind = 'read' | 'write'
export type Reply = (outcome: Outcome) => void

/** One logical request. Mutable runtime state, owned by the simulator. */
export interface SimRequest {
  readonly id: number
  readonly kind: RequestKind
  readonly start: number
  /** Absolute simulated time after which the client gives up. */
  deadline: number
  /** Outcome already decided (completed or timed out). Queued work for it is dropped. */
  finished: boolean
  /** Async work created by a message queue: never times out, not counted as a user request. */
  readonly background: boolean
}

/** What stations can do: read the clock, schedule work, call other stations. */
export interface SimContext {
  readonly now: number
  readonly rng: Rng
  schedule(delaySec: number, fn: () => void): void
  call(stationId: string, req: SimRequest, reply: Reply): void
  tightenDeadline(req: SimRequest, deadline: number): void
  createBackgroundRequest(kind: RequestKind): SimRequest
  /** A background request created with createBackgroundRequest has finished (or was refused). */
  backgroundDone(): void
}
