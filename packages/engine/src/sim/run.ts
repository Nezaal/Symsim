import { compileSimulation } from './compile.ts'
import type { WindowSnapshot } from './metrics.ts'
import { buildResult, type SimulationResult } from './result.ts'
import { LIMITS, Simulator, type SimLimits } from './simulator.ts'
import type { GraphInput, RunOptions, SimModel, ValidationError } from './types.ts'

/** Events processed between clock checks inside a slice. */
const EVENT_BATCH = 5_000

export interface ProgressUpdate {
  /** Simulated seconds reached so far. */
  readonly simTime: number
  readonly durationSec: number
  /** Share of the traffic period simulated, 0..1 (drain time not included). */
  readonly fraction: number
  /** Chart windows completed since the previous update. */
  readonly windows: readonly WindowSnapshot[]
  readonly totals: {
    readonly total: number
    readonly ok: number
    readonly rejected: number
    readonly timedOut: number
  }
  readonly eventsProcessed: number
}

/**
 * Drives a simulation in time-boxed slices, so a Web Worker can stay
 * responsive to pause/cancel messages between slices and stream progress.
 * Slicing never changes the result: the event order is the same whether the
 * run happens in one go or in a thousand slices.
 */
export class SimulationRun {
  private readonly sim: Simulator
  private windowsSent = 0

  constructor(model: SimModel, limits: SimLimits = LIMITS) {
    this.sim = new Simulator(model, limits)
  }

  get done(): boolean {
    return this.sim.done
  }

  /**
   * Runs for about `budgetMs` of wall-clock time (or until finished).
   * Returns true when the run is complete. Throws LimitExceededError when a
   * safety limit is hit.
   */
  runSlice(budgetMs: number, clock: () => number): boolean {
    const deadline = clock() + budgetMs
    do {
      if (this.sim.advance(EVENT_BATCH)) return true
    } while (clock() < deadline)
    return false
  }

  /** Progress since the last call (new chart windows only). */
  takeProgress(): ProgressUpdate {
    const { metrics, model } = this.sim
    const windows = metrics.windows.slice(this.windowsSent)
    this.windowsSent = metrics.windows.length
    return {
      simTime: this.sim.elapsed,
      durationSec: model.durationSec,
      fraction: Math.min(1, this.sim.elapsed / model.durationSec),
      windows,
      totals: { total: metrics.total, ok: metrics.ok, rejected: metrics.rejected, timedOut: metrics.timedOut },
      eventsProcessed: this.sim.eventsProcessed,
    }
  }

  result(): SimulationResult {
    return buildResult(this.sim)
  }
}

export type StartResult =
  | { readonly ok: true; readonly run: SimulationRun }
  | { readonly ok: false; readonly errors: readonly ValidationError[] }

/** Validates the graph and prepares a run (does not simulate anything yet). */
export function startSimulation(graph: GraphInput, options: RunOptions, limits: SimLimits = LIMITS): StartResult {
  const compiled = compileSimulation(graph, options)
  return compiled.ok ? { ok: true, run: new SimulationRun(compiled.model, limits) } : compiled
}

export type RunResult =
  | { readonly ok: true; readonly result: SimulationResult }
  | { readonly ok: false; readonly errors: readonly ValidationError[] }

/** Runs a whole simulation synchronously (tests, scripts, future server use). */
export function runSimulation(graph: GraphInput, options: RunOptions, limits: SimLimits = LIMITS): RunResult {
  const started = startSimulation(graph, options, limits)
  if (!started.ok) return started
  while (!started.run.runSlice(Infinity, () => 0));
  return { ok: true, result: started.run.result() }
}
