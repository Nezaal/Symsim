import { useEffect } from 'react'
import { useArchitectureStore } from '../store/architectureStore.js'
import { useAuthStore } from '../store/authStore.js'
import { useProjectStore } from '../store/projectStore.js'
import { useSimulationStore } from '../store/simulationStore.js'
import { projectsApi } from '../lib/projectsApi.js'
import { runSaveState } from '../lib/runPersistence.js'

/** Current inputs for runSaveState, read straight from the stores. */
export function readRunSaveInputs() {
  return {
    sim: useSimulationStore.getState(),
    auth: useAuthStore.getState(),
    project: useProjectStore.getState(),
    revision: useArchitectureStore.getState().revision,
  }
}

/**
 * Stores finished runs of saved versions automatically. Re-checks whenever the
 * run, the sign-in state or the project changes. So "Save version & keep this
 * run" works too: saving makes the run match the new version, and it's stored.
 */
export function useRunPersistence(api = projectsApi) {
  useEffect(() => {
    const check = () => {
      const inputs = readRunSaveInputs()
      const decision = runSaveState(inputs)
      if (decision.kind !== 'save') return

      const { runId, runOptions, result, runWorkload, startedAt, finishedAt, setRunSave } = inputs.sim
      const versionNumber = inputs.project.version.number
      setRunSave(runId, { status: 'saving' })
      api
        .saveRun(decision.versionId, { options: runOptions, result, workload: runWorkload, startedAt, finishedAt })
        .then(() => setRunSave(runId, { status: 'saved', versionNumber }))
        .catch((error) => setRunSave(runId, { status: 'error', message: error.message }))
    }

    const unsubscribers = [
      useSimulationStore.subscribe(check),
      useProjectStore.subscribe(check),
      useAuthStore.subscribe(check),
    ]
    check()
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [api])
}
