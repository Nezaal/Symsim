import { create } from 'zustand'
import { MAX_DURATION_SEC, randomSeed } from '@systemsim/engine'
import { workloadFromGraph } from '../lib/projectsApi.js'

const DEFAULT_DURATION_SEC = 60
const MAX_SEED = 0xffffffff
const WORKER_FAILED = 'The simulation stopped unexpectedly (the background worker failed). Try running again.'
const isActive = (status) => status === 'running' || status === 'paused'

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/** Only what the engine needs: drops React Flow UI state (selection, size…). */
export function toGraphInput(nodes, edges) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      data: { componentType: n.data.componentType, label: n.data.label, config: n.data.config },
    })),
    edges: edges.map((e) => ({ source: e.source, target: e.target })),
  }
}

const createWorker = () =>
  new Worker(new URL('../worker/simulation.worker.js', import.meta.url), { type: 'module' })

/**
 * Simulation state for the UI. The engine runs in a Web Worker; this store
 * sends it commands and turns its messages into state. Every run gets a new
 * runId, and messages from older runs are ignored, so a restart can never mix
 * results from two runs.
 *
 * status: idle | running | paused | done | stopped | invalid | error
 *
 * @param {() => Pick<Worker, 'postMessage' | 'onmessage'>} workerFactory injectable for tests
 */
export function createSimulationStore(workerFactory = createWorker) {
  let worker = null

  return create((set, get) => {
    const send = (message) => {
      if (!worker) {
        worker = workerFactory()
        worker.onmessage = (event) => get().handleMessage(event.data)
        // A worker that fails to load or crashes would otherwise leave the
        // UI on "Running…" forever. Drop it so the next run starts a fresh one.
        worker.onerror = () => {
          worker = null
          if (isActive(get().status)) set({ status: 'error', errorMessage: WORKER_FAILED })
        }
        worker.onmessageerror = worker.onerror
      }
      worker.postMessage(message)
    }

    return {
      status: 'idle',
      runId: 0,
      options: { durationSec: DEFAULT_DURATION_SEC, seed: randomSeed() },
      /** Latest progress (fraction, totals…) without the windows. */
      progress: null,
      /** Every 1-second chart window received so far. */
      windows: [],
      result: null,
      errors: [],
      errorNodeIds: [],
      errorMessage: null,
      drawerOpen: false,
      /** Design revision (architecture store) the latest run was started for. */
      runRevision: null,
      /** Options, workload and timing of the latest run, kept for saving it. */
      runOptions: null,
      runWorkload: null,
      startedAt: null,
      finishedAt: null,
      /** Saving the latest run: idle | saving | saved | error. */
      runSave: { status: 'idle' },

      /** @param {number} [revision] design revision being simulated (for staleness checks) */
      start: (nodes, edges, revision = null) => {
        const runId = get().runId + 1
        set({
          status: 'running',
          runId,
          runRevision: revision,
          runOptions: get().options,
          runWorkload: workloadFromGraph({ nodes }),
          startedAt: new Date().toISOString(),
          finishedAt: null,
          runSave: { status: 'idle' },
          progress: null,
          windows: [],
          result: null,
          errors: [],
          errorNodeIds: [],
          errorMessage: null,
          drawerOpen: true,
        })
        send({ type: 'start', runId, graph: toGraphInput(nodes, edges), options: get().options })
      },

      pause: () => {
        if (get().status !== 'running') return
        send({ type: 'pause', runId: get().runId })
        set({ status: 'paused' })
      },

      resume: () => {
        if (get().status !== 'paused') return
        send({ type: 'resume', runId: get().runId })
        set({ status: 'running' })
      },

      stop: () => {
        const { status, runId } = get()
        if (status !== 'running' && status !== 'paused') return
        send({ type: 'cancel', runId })
        set({ status: 'stopped' })
      },

      setOptions: (partial) =>
        set((state) => ({
          options: {
            durationSec: clampInt(partial.durationSec ?? state.options.durationSec, 1, MAX_DURATION_SEC, state.options.durationSec),
            seed: clampInt(partial.seed ?? state.options.seed, 0, MAX_SEED, state.options.seed),
          },
        })),

      newSeed: () => set((state) => ({ options: { ...state.options, seed: randomSeed() } })),

      /** Forgets the current run entirely (stopping it if active). Used on sign-out. */
      clearRun: () => {
        const { status, runId } = get()
        if (isActive(status)) send({ type: 'cancel', runId })
        set({
          status: 'idle',
          runId: runId + 1, // late messages from the old run are ignored
          runRevision: null,
          runOptions: null,
          runWorkload: null,
          startedAt: null,
          finishedAt: null,
          runSave: { status: 'idle' },
          progress: null,
          windows: [],
          result: null,
          errors: [],
          errorNodeIds: [],
          errorMessage: null,
          drawerOpen: false,
        })
      },

      /** Updates the save state, unless a newer run has started meanwhile. */
      setRunSave: (runId, runSave) => {
        if (runId === get().runId) set({ runSave })
      },

      openDrawer: () => set({ drawerOpen: true }),
      closeDrawer: () => set({ drawerOpen: false }),

      handleMessage: (message) => {
        // Only the current, still-active run may change state: messages from an
        // older run, or ones that were in flight when the user pressed Stop, are dropped.
        if (!message || message.runId !== get().runId || !isActive(get().status)) return
        switch (message.type) {
          case 'progress': {
            const { windows, ...progress } = message.progress
            set((state) => ({ progress, windows: windows.length ? [...state.windows, ...windows] : state.windows }))
            break
          }
          case 'done':
            set({ status: 'done', result: message.result, finishedAt: new Date().toISOString() })
            break
          case 'invalid':
            set({
              status: 'invalid',
              errors: message.errors,
              errorNodeIds: message.errors.filter((e) => e.nodeId).map((e) => e.nodeId),
            })
            break
          case 'error':
            set({ status: 'error', errorMessage: message.message })
            break
          default:
            break
        }
      },
    }
  })
}

export const useSimulationStore = createSimulationStore()
