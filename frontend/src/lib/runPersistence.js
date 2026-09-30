/**
 * Decides what should happen with a finished run. Pure: the stores' state goes
 * in, a decision comes out.
 *
 *   save              the run was made on a saved version → store it there
 *   offerSaveVersion  it ran on unsaved changes that are still on the canvas
 *                     → offer "Save version & keep this run"
 *   stale             it ran on unsaved changes that have since been edited
 *                     away → nothing to attach it to
 *   signIn            a guest → suggest signing in to keep runs
 *   none              not finished, nothing to do, or already handled
 *
 * A run is "of" a version when the design revision it started with equals the
 * revision that version was saved at.
 */
export function runSaveState({ sim, auth, project, revision }) {
  if (sim.status !== 'done' || !sim.result || sim.runSave.status !== 'idle') return { kind: 'none' }
  if (auth.status === 'signedOut') return { kind: 'signIn' }
  if (auth.status !== 'signedIn') return { kind: 'none' }
  if (project.version && project.savedRevision === sim.runRevision) {
    return { kind: 'save', versionId: project.version.id }
  }
  return revision === sim.runRevision ? { kind: 'offerSaveVersion' } : { kind: 'stale' }
}
