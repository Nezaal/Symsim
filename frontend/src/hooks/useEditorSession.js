import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useArchitectureStore } from '../store/architectureStore.js'
import { useAuthStore } from '../store/authStore.js'
import { useProjectStore } from '../store/projectStore.js'
import { clearDraft, loadDraft, saveDraft } from '../lib/draftStorage.js'
import { deserializeGraph } from '../lib/graphSnapshot.js'

const AUTOSAVE_DELAY_MS = 400

// Module-level: survive StrictMode's double effects and in-app navigation, so
// the browser draft is restored once per page load and a project isn't opened twice.
let draftRestored = false
let openingProjectId = null

/**
 * Connects the editor to saved state:
 *  1. /app: restore the design autosaved in this browser (once per page load)
 *  2. /app/p/:id: open that project (restoring unsaved edits if the draft matches)
 *  3. after the first save, move the URL to /app/p/:id
 *  4. on sign-out, drop the project association (the canvas stays)
 *  5. autosave the working design to the browser on every change
 */
export function useEditorSession(routeProjectId) {
  const navigate = useNavigate()
  const authStatus = useAuthStore((s) => s.status)
  const routeRef = useRef(routeProjectId)
  useEffect(() => {
    routeRef.current = routeProjectId
  }, [routeProjectId])
  const projectId = useProjectStore((s) => s.project?.id ?? null)

  // 1. Restore the browser draft on a plain /app visit.
  useEffect(() => {
    if (routeProjectId || authStatus === 'loading' || draftRestored) return
    draftRestored = true
    // Something is already on the canvas (e.g. "Open a copy" from a share link): keep it.
    if (useArchitectureStore.getState().nodes.length > 0) return
    const draft = loadDraft()
    if (!draft) return
    if (draft.projectId && authStatus === 'signedIn') {
      navigate(`/app/p/${draft.projectId}`, { replace: true })
      return
    }
    try {
      const graph = deserializeGraph(draft.graph)
      useArchitectureStore.getState().replaceGraph(graph.nodes, graph.edges)
    } catch (error) {
      console.warn('Discarding an autosaved design that could not be restored', error)
      clearDraft()
    }
  }, [routeProjectId, authStatus, navigate])

  // 2. Open the project named in the URL.
  useEffect(() => {
    if (!routeProjectId || authStatus === 'loading') return
    if (useProjectStore.getState().project?.id === routeProjectId || openingProjectId === routeProjectId) return
    draftRestored = true
    openingProjectId = routeProjectId
    useProjectStore
      .getState()
      .openProject(routeProjectId, { draft: loadDraft() })
      .then((ok) => {
        openingProjectId = null
        if (ok) return
        // Private project while signed out (or an expired session): offer sign-in.
        if (useAuthStore.getState().status !== 'signedIn') useAuthStore.getState().openSignIn()
        // Only leave if the user is still on this project's URL.
        if (routeRef.current === routeProjectId) navigate('/app', { replace: true })
      })
  }, [routeProjectId, authStatus, navigate])

  // 3. First save created a project: reflect it in the URL.
  useEffect(() => {
    if (projectId && projectId !== routeProjectId) navigate(`/app/p/${projectId}`, { replace: true })
    // Only react to the project changing, not to route changes (handled above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // 4. Signed out: projects belong to the account, the canvas stays as a guest draft.
  useEffect(() => {
    if (authStatus !== 'signedOut' || !useProjectStore.getState().project) return
    useProjectStore.getState().reset()
    navigate('/app', { replace: true })
  }, [authStatus, navigate])

  // 5. Autosave the working design to this browser (moving nodes counts too).
  useEffect(() => {
    let timer = null
    const writeDraft = () => {
      timer = null
      const { nodes, edges } = useArchitectureStore.getState()
      const { project, version } = useProjectStore.getState()
      saveDraft({ projectId: project?.id ?? null, versionId: version?.id ?? null, nodes, edges })
    }
    // Leaving the page with an autosave still pending: write it now.
    const flush = () => {
      if (timer === null) return
      clearTimeout(timer)
      writeDraft()
    }
    const unsubscribe = useArchitectureStore.subscribe((state, previous) => {
      if (state.layoutRevision === previous.layoutRevision) return
      clearTimeout(timer)
      timer = setTimeout(writeDraft, AUTOSAVE_DELAY_MS)
    })
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
      unsubscribe()
    }
  }, [])
}
