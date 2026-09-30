import { create } from 'zustand'
import { projectsApi, ApiError } from '../lib/projectsApi.js'
import { deserializeGraph, GraphSnapshotError, serializeGraph } from '../lib/graphSnapshot.js'
import { useArchitectureStore } from './architectureStore.js'

const DEFAULT_NAME = 'Untitled design'
const MAX_NAME_LENGTH = 100
const MAX_MESSAGE_LENGTH = 500

const cleanName = (name) => String(name ?? '').trim().slice(0, MAX_NAME_LENGTH) || DEFAULT_NAME
const cleanMessage = (message) => String(message ?? '').trim().slice(0, MAX_MESSAGE_LENGTH)
const friendly = (error, fallback) =>
  error instanceof ApiError || error instanceof GraphSnapshotError ? error.message : fallback
const toVersion = (row) => (row ? { id: row.id, number: row.version_number } : null)
const toProject = (row) => ({ id: row.id, name: row.name, visibility: row.visibility })

/**
 * The saved project the editor is working on (if any).
 *
 * `savedRevision` is the architecture revision that matches `version`. When the
 * design's current revision differs, there are unsaved changes. null means
 * "doesn't match any saved version" (e.g. restored unsaved edits).
 *
 * @param {{ api?: ReturnType<typeof import('../lib/projectsApi.js').createProjectsApi>, architecture?: typeof useArchitectureStore }} deps injectable for tests
 */
export function createProjectStore({ api = projectsApi, architecture = useArchitectureStore } = {}) {
  return create((set, get) => ({
    project: null,
    version: null,
    savedRevision: null,
    busy: false,
    error: null,
    saveDialogOpen: false,
    projects: [],
    projectsStatus: 'idle',

    /** Saves the current design as a new version, creating the project first if needed. */
    saveVersion: async ({ name, message } = {}) => {
      // Capture the design now: edits made while the request is in flight stay "unsaved".
      const { nodes, edges, revision } = architecture.getState()
      set({ busy: true, error: null })
      try {
        const project = get().project ?? toProject(await api.createProject(cleanName(name)))
        const version = await api.saveVersion(project.id, serializeGraph(nodes, edges), cleanMessage(message))
        set({ project, version: toVersion(version), savedRevision: revision, busy: false, saveDialogOpen: false })
        return true
      } catch (error) {
        set({ busy: false, error: friendly(error, "Couldn't save. Check your connection and try again.") })
        return false
      }
    },

    /**
     * Loads a project's newest version into the editor. If `draft` holds
     * unsaved edits made on top of that same version, those are restored instead.
     */
    openProject: async (projectId, { draft = null } = {}) => {
      set({ busy: true, error: null })
      try {
        const { project, version } = await api.openProject(projectId)
        const useDraft = Boolean(draft && draft.projectId === project.id && draft.versionId === (version?.id ?? null))
        const graph = useDraft
          ? deserializeGraph(draft.graph)
          : version
            ? deserializeGraph(version.graph)
            : { nodes: [], edges: [] }
        architecture.getState().replaceGraph(graph.nodes, graph.edges)
        set({
          project: toProject(project),
          version: toVersion(version),
          savedRevision: useDraft ? null : architecture.getState().revision,
          busy: false,
        })
        return true
      } catch (error) {
        set({ busy: false, error: friendly(error, "Couldn't open the project.") })
        return false
      }
    },

    newDesign: () => {
      architecture.getState().replaceGraph([], [])
      set({ project: null, version: null, savedRevision: null, error: null })
    },

    loadMyProjects: async (userId) => {
      set({ projectsStatus: 'loading' })
      try {
        set({ projects: await api.listMyProjects(userId), projectsStatus: 'ready' })
      } catch (error) {
        set({ projectsStatus: 'error', error: friendly(error, "Couldn't load your projects.") })
      }
    },

    /** Signed out: forget the project association, keep whatever is on the canvas. */
    reset: () => set({ project: null, version: null, savedRevision: null, projects: [], projectsStatus: 'idle' }),

    openSaveDialog: () => set({ saveDialogOpen: true, error: null }),
    closeSaveDialog: () => set({ saveDialogOpen: false }),
    clearError: () => set({ error: null }),
  }))
}

export const useProjectStore = createProjectStore()

/** True when the canvas differs from the last saved version (or was never saved). */
export function useHasUnsavedChanges() {
  const savedRevision = useProjectStore((s) => s.savedRevision)
  const hasProject = useProjectStore((s) => s.project !== null)
  const revision = useArchitectureStore((s) => s.revision)
  const empty = useArchitectureStore((s) => s.nodes.length === 0)
  return hasProject ? savedRevision !== revision : !empty
}
