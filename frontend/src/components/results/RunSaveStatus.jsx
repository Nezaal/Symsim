import { CheckCircle2, CloudOff, Loader2, Save } from 'lucide-react'
import { useArchitectureStore } from '../../store/architectureStore.js'
import { useAuthStore } from '../../store/authStore.js'
import { useProjectStore } from '../../store/projectStore.js'
import { useSimulationStore } from '../../store/simulationStore.js'
import { runSaveState } from '../../lib/runPersistence.js'
import { requestSave } from '../../lib/requestSave.js'
import { STATUS } from '../../lib/vizTokens.js'

/**
 * One line under the verdict saying whether this run was kept, and what to do
 * if it wasn't: sign in, or save the design as a version first.
 */
function RunSaveStatus() {
  const sim = useSimulationStore()
  const auth = useAuthStore()
  const project = useProjectStore()
  const revision = useArchitectureStore((s) => s.revision)

  if (sim.status !== 'done') return null
  const { runSave } = sim

  if (runSave.status === 'saving') {
    return <Line icon={<Loader2 size={14} className="animate-spin" aria-hidden="true" />}>Saving this run…</Line>
  }
  if (runSave.status === 'saved') {
    return (
      <Line icon={<CheckCircle2 size={14} color={STATUS.good} aria-hidden="true" />}>
        Saved to the run history of version {runSave.versionNumber}.
      </Line>
    )
  }
  if (runSave.status === 'error') {
    return <Line icon={<CloudOff size={14} aria-hidden="true" />}>{runSave.message}</Line>
  }

  const decision = runSaveState({ sim, auth, project, revision })
  if (decision.kind === 'signIn') {
    return (
      <Line icon={<CloudOff size={14} aria-hidden="true" />}>
        Not saved.{' '}
        <button type="button" onClick={auth.openSignIn} className="text-accent underline">
          Sign in
        </button>{' '}
        to keep a history of your runs.
      </Line>
    )
  }
  if (decision.kind === 'offerSaveVersion') {
    return (
      <Line icon={<CloudOff size={14} aria-hidden="true" />}>
        This run used unsaved changes.{' '}
        <button type="button" onClick={requestSave} className="inline-flex items-center gap-1 text-accent underline">
          <Save size={12} aria-hidden="true" /> Save version &amp; keep this run
        </button>
      </Line>
    )
  }
  if (decision.kind === 'stale') {
    return (
      <Line icon={<CloudOff size={14} aria-hidden="true" />}>
        Not saved: the design has changed since this run. Run again to keep results.
      </Line>
    )
  }
  return null
}

function Line({ icon, children }) {
  return <p className="flex items-center gap-2 text-sm text-ink-muted">{icon}<span>{children}</span></p>
}

export default RunSaveStatus
