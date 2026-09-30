import { useAuthStore } from '../store/authStore.js'
import { useProjectStore } from '../store/projectStore.js'
import { useSimulationStore } from '../store/simulationStore.js'
import { clearDraft } from './draftStorage.js'

/**
 * Explicit "Sign out": removes the account's work from this browser too,
 * the canvas, the autosaved draft and the last run's results. On a shared
 * computer, the next person must not see (or save into their own account)
 * the previous user's private design.
 */
export async function signOutAndClear() {
  await useAuthStore.getState().signOut()
  clearDraft()
  useSimulationStore.getState().clearRun()
  useProjectStore.getState().newDesign()
}
