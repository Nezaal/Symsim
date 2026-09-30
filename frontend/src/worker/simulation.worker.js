/**
 * Runs simulations off the main thread, so the UI never freezes.
 *
 * Protocol (every message carries the runId it belongs to):
 *   in:  start { runId, graph, options } | pause | resume | cancel
 *   out: invalid { errors } | progress { progress } | done { result } | error { message }
 *
 * The run advances in ~20 ms slices. Between slices the worker yields
 * (setTimeout 0), which is when pause/cancel messages get processed.
 * Progress is posted at most ~5× per second: often enough to feel live,
 * rare enough that the charts aren't re-rendered 50× per second.
 */
import { LimitExceededError, startSimulation } from '@systemsim/engine'

const SLICE_MS = 20
const PROGRESS_INTERVAL_MS = 200

/** @type {{ runId: number, run: import('@systemsim/engine').SimulationRun, paused: boolean } | null} */
let current = null
/** The single pending tick. There is never more than one, so a run can't be advanced twice. */
let timer = null
let lastProgressAt = 0

const post = (message) => self.postMessage(message)

self.onmessage = (event) => {
  const message = event.data ?? {}
  switch (message.type) {
    case 'start':
      start(message)
      break
    case 'pause':
      if (current?.runId === message.runId) {
        current.paused = true
        cancelTick()
      }
      break
    case 'resume':
      if (current?.runId === message.runId && current.paused) {
        current.paused = false
        scheduleTick()
      }
      break
    case 'cancel':
      if (current?.runId === message.runId) {
        current = null
        cancelTick()
      }
      break
    default:
      post({ type: 'error', runId: message.runId, message: `Unknown message type "${message.type}".` })
  }
}

function start({ runId, graph, options }) {
  // A new run always replaces the old one, whatever happens next.
  current = null
  cancelTick()

  let started
  try {
    started = startSimulation(graph, options)
  } catch (error) {
    fail(runId, error)
    return
  }
  if (!started.ok) {
    post({ type: 'invalid', runId, errors: started.errors })
    return
  }
  current = { runId, run: started.run, paused: false }
  lastProgressAt = 0
  scheduleTick()
}

function scheduleTick() {
  if (timer !== null) return
  timer = setTimeout(() => {
    timer = null
    tick()
  }, 0)
}

function cancelTick() {
  if (timer !== null) clearTimeout(timer)
  timer = null
}

function tick() {
  const job = current
  if (!job || job.paused) return
  try {
    const done = job.run.runSlice(SLICE_MS, () => performance.now())
    const now = performance.now()
    if (done || now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
      post({ type: 'progress', runId: job.runId, progress: job.run.takeProgress() })
      lastProgressAt = now
    }
    if (done) {
      post({ type: 'done', runId: job.runId, result: job.run.result() })
      current = null
    } else {
      scheduleTick()
    }
  } catch (error) {
    current = null
    fail(job.runId, error)
  }
}

function fail(runId, error) {
  if (error instanceof LimitExceededError) {
    post({ type: 'error', runId, message: error.message })
    return
  }
  // Unexpected: keep the details in the console for debugging, show a clean message.
  console.error('Simulation worker crashed', error)
  post({ type: 'error', runId, message: 'The simulation stopped unexpectedly. Try again, or simplify the design.' })
}
