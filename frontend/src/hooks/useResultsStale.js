import { useArchitectureStore } from '../store/architectureStore.js'
import { useSimulationStore } from '../store/simulationStore.js'

/** True when the design changed after the latest run started, so its results describe an older design. */
export function useResultsStale() {
  const runRevision = useSimulationStore((s) => s.runRevision)
  const revision = useArchitectureStore((s) => s.revision)
  return runRevision !== null && runRevision !== revision
}
