import { beforeEach, describe, expect, it } from 'vitest'
import { createSimulationStore, toGraphInput } from './simulationStore.js'

/** Stands in for the Web Worker: records posted messages, lets tests reply. */
function fakeWorker() {
  const worker = {
    sent: [],
    onmessage: null,
    postMessage: (message) => worker.sent.push(message),
    reply: (data) => worker.onmessage?.({ data }),
  }
  return worker
}

let worker
let store

beforeEach(() => {
  worker = fakeWorker()
  store = createSimulationStore(() => worker)
})

const graph = { nodes: [{ id: 'c', type: 'component', selected: true, position: { x: 0, y: 0 }, data: { componentType: 'client', label: 'Users', config: {} } }], edges: [{ id: 'e', source: 'c', target: 'a', selected: false }] }

describe('toGraphInput', () => {
  it('strips React Flow UI state and keeps only what the engine needs', () => {
    expect(toGraphInput(graph.nodes, graph.edges)).toEqual({
      nodes: [{ id: 'c', data: { componentType: 'client', label: 'Users', config: {} } }],
      edges: [{ source: 'c', target: 'a' }],
    })
  })
})

describe('simulation store', () => {
  it('starts a run: posts to the worker and opens the drawer', () => {
    store.getState().start(graph.nodes, graph.edges)
    const { status, drawerOpen, runId } = store.getState()
    expect(status).toBe('running')
    expect(drawerOpen).toBe(true)
    expect(worker.sent[0]).toMatchObject({ type: 'start', runId, options: { durationSec: 60 } })
  })

  it('accumulates progress windows and finishes with a result', () => {
    store.getState().start(graph.nodes, graph.edges)
    const { runId } = store.getState()
    worker.reply({ type: 'progress', runId, progress: { fraction: 0.5, windows: [{ t: 1 }], totals: {} } })
    worker.reply({ type: 'progress', runId, progress: { fraction: 1, windows: [{ t: 2 }], totals: {} } })
    worker.reply({ type: 'done', runId, result: { summary: 'Healthy' } })
    const state = store.getState()
    expect(state.windows.map((w) => w.t)).toEqual([1, 2])
    expect(state.status).toBe('done')
    expect(state.result.summary).toBe('Healthy')
  })

  it('ignores messages from an older run', () => {
    store.getState().start(graph.nodes, graph.edges)
    const oldRun = store.getState().runId
    store.getState().start(graph.nodes, graph.edges)
    worker.reply({ type: 'done', runId: oldRun, result: { summary: 'stale' } })
    expect(store.getState().result).toBeNull()
  })

  it('shows validation errors and remembers which nodes are affected', () => {
    store.getState().start(graph.nodes, graph.edges)
    const { runId } = store.getState()
    worker.reply({ type: 'invalid', runId, errors: [{ nodeId: 'lb', message: 'x' }, { message: 'y' }] })
    expect(store.getState().status).toBe('invalid')
    expect(store.getState().errorNodeIds).toEqual(['lb'])
  })

  it('pauses, resumes and stops the current run', () => {
    store.getState().start(graph.nodes, graph.edges)
    const { runId } = store.getState()
    store.getState().pause()
    expect(store.getState().status).toBe('paused')
    store.getState().resume()
    expect(store.getState().status).toBe('running')
    store.getState().stop()
    expect(store.getState().status).toBe('stopped')
    expect(worker.sent.map((m) => m.type)).toEqual(['start', 'pause', 'resume', 'cancel'])
    expect(worker.sent.every((m) => m.runId === runId)).toBe(true)
  })

  it('reports worker errors', () => {
    store.getState().start(graph.nodes, graph.edges)
    worker.reply({ type: 'error', runId: store.getState().runId, message: 'too big' })
    expect(store.getState()).toMatchObject({ status: 'error', errorMessage: 'too big' })
  })

  it('ignores late worker messages after the user stopped the run', () => {
    store.getState().start(graph.nodes, graph.edges)
    const { runId } = store.getState()
    store.getState().stop()
    worker.reply({ type: 'done', runId, result: { summary: 'late' } })
    worker.reply({ type: 'progress', runId, progress: { fraction: 1, windows: [{ t: 9 }], totals: {} } })
    expect(store.getState()).toMatchObject({ status: 'stopped', result: null, windows: [] })
  })

  it('surfaces a crashed or unloadable worker instead of spinning forever', () => {
    store.getState().start(graph.nodes, graph.edges)
    worker.onerror?.({ message: 'boom' })
    expect(store.getState().status).toBe('error')
    expect(store.getState().errorMessage).toMatch(/simulation/i)
  })

  it('remembers which design revision a run was for', () => {
    store.getState().start(graph.nodes, graph.edges, 42)
    expect(store.getState().runRevision).toBe(42)
  })

  it('validates run options before storing them', () => {
    store.getState().setOptions({ durationSec: 99999, seed: -5 })
    expect(store.getState().options).toEqual({ durationSec: 3600, seed: 0 })
    store.getState().setOptions({ durationSec: 12.7 })
    expect(store.getState().options.durationSec).toBe(13)
  })
})
