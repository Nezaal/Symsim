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

/** Restores unsaved edits from the browser draft if they sit on top of `version`; null otherwise. */
function draftGraphFor(draft, project, version) {
  if (!draft || draft.projectId !== project.id || draft.versionId !== (version?.id ?? null)) return null
  try {
    return deserializeGraph(draft.graph)
  } catch (error) {
    console.warn('Ignoring an unreadable autosaved draft; opening the saved version', error)
    return null
  }
}

/**
 * The saved project the editor is working on (if any).
 *
 * `savedRevision` / `savedLayoutRevision` are the architecture counters that
 * match `version`. When the current counters differ there are unsaved
 * changes. null means "doesn't match any saved version" (e.g. restored edits).
 *
 * Requests are sequenced: each save/open/share takes a ticket, and a response
 * is applied only if no newer request started meanwhile. So a slow save can't
 * overwrite a project the user has since opened, and a fast double click on
 * two projects ends on the second one.
 *
 * @param {{ api?: ReturnType<typeof import('../lib/projectsApi.js').createProjectsApi>, architecture?: typeof useArchitectureStore }} deps injectable for tests
 */
export function createProjectStore({ api = projectsApi, architecture = useArchitectureStore } = {}) {
  let latestTicket = 0

  return create((set, get) => {
    const begin = () => {
      latestTicket += 1
      set({ busy: true, error: null })
      return latestTicket
    }
    const isCurrent = (ticket) => ticket === latestTicket
    const fail = (ticket, error, fallback) => {
      if (isCurrent(ticket)) set({ busy: false, error: friendly(error, fallback) })
    }

    return {
      project: null,
      version: null,
      savedRevision: null,
      savedLayoutRevision: null,
      busy: false,
      error: null,
      saveDialogOpen: false,
      projects: [],
      projectsStatus: 'idle',
      /** Active share link for the current version: { id, url } */
      share: null,

      /** Saves the current design as a new version, creating the project first if needed. */
      saveVersion: async ({ name, message } = {}) => {
        // Capture the design now: edits made while the request is in flight stay "unsaved".
        const { nodes, edges, revision, layoutRevision } = architecture.getState()
        const ticket = begin()
        try {
          let project = get().project
          if (!project) {
            project = toProject(await api.createProject(cleanName(name)))
            // Remember it at once: if the version save fails, a retry must not create another project.
            if (isCurrent(ticket)) set({ project })
          }
          const version = await api.saveVersion(project.id, serializeGraph(nodes, edges), cleanMessage(message))
          if (!isCurrent(ticket)) return false
          set({
            project,
            version: toVersion(version),
            savedRevision: revision,
            savedLayoutRevision: layoutRevision,
            share: null,
            busy: false,
            saveDialogOpen: false,
          })
          return true
        } catch (error) {
          fail(ticket, error, "Couldn't save. Check your connection and try again.")
          return false
        }
      },

      /**
       * Loads a project's newest version into the editor. If `draft` holds
       * unsaved edits made on top of that same version, those are restored.
       */
      openProject: async (projectId, { draft = null } = {}) => {
        const ticket = begin()
        try {
          const { project, version } = await api.openProject(projectId)
          if (!isCurrent(ticket)) return false
          const restored = draftGraphFor(draft, project, version)
          const graph = restored ?? (version ? deserializeGraph(version.graph) : { nodes: [], edges: [] })
          architecture.getState().replaceGraph(graph.nodes, graph.edges)
          const { revision, layoutRevision } = architecture.getState()
          set({
            project: toProject(project),
            version: toVersion(version),
            savedRevision: restored ? null : revision,
            savedLayoutRevision: restored ? null : layoutRevision,
            share: null,
            busy: false,
          })
          return true
        } catch (error) {
          fail(ticket, error, "Couldn't open the project.")
          return false
        }
      },

      /** Read-only public link to the latest saved version (reuses an active one). Returns the URL or null. */
      createShareLink: async (origin) => {
        const version = get().version
        if (!version) return null
        const ticket = begin()
        try {
          const link = (await api.getActiveShareLink(version.id)) ?? (await api.createShareLink(version.id))
          if (!isCurrent(ticket)) return null
          const share = { id: link.id, url: `${origin}/s/${link.token}` }
          set({ busy: false, share })
          return share.url
        } catch (error) {
          fail(ticket, error, "Couldn't create a share link.")
          return null
        }
      },

      /** Turns the current share link off; anyone opening it sees "link turned off". */
      revokeShareLink: async () => {
        const share = get().share
        if (!share) return
        const ticket = begin()
        try {
          await api.revokeShareLink(share.id)
          if (isCurrent(ticket)) set({ busy: false, share: null })
        } catch (error) {
          fail(ticket, error, "Couldn't turn off the share link.")
        }
      },

      newDesign: () => {
        latestTicket += 1 // anything still in flight belongs to the previous design
        architecture.getState().replaceGraph([], [])
        set({
          project: null,
          version: null,
          savedRevision: null,
          savedLayoutRevision: null,
          share: null,
          busy: false,
          error: null,
        })
      },

      loadMyProjects: async (userId) => {
        set({ projectsStatus: 'loading' })
        try {
          set({ projects: await api.listMyProjects(userId), projectsStatus: 'ready' })
        } catch (error) {
          set({ projectsStatus: 'error', error: friendly(error, "Couldn't load your projects.") })
        }
      },

      /** Signed out (session ended): forget the project association, keep the canvas. */
      reset: () => {
        latestTicket += 1
        set({
          project: null,
          version: null,
          savedRevision: null,
          savedLayoutRevision: null,
          share: null,
          busy: false,
          projects: [],
          projectsStatus: 'idle',
        })
      },

      openSaveDialog: () => set({ saveDialogOpen: true, error: null }),
      closeSaveDialog: () => set({ saveDialogOpen: false }),
      clearError: () => set({ error: null }),
    }
  })
}

export const useProjectStore = createProjectStore()

/**
 * True when the canvas differs from the last saved version (or was never
 * saved). Uses the layout counter, so moving nodes counts as a change.
 */
export function useHasUnsavedChanges() {
  const savedLayoutRevision = useProjectStore((s) => s.savedLayoutRevision)
  const hasProject = useProjectStore((s) => s.project !== null)
  const layoutRevision = useArchitectureStore((s) => s.layoutRevision)
  const empty = useArchitectureStore((s) => s.nodes.length === 0)
  return hasProject ? savedLayoutRevision !== layoutRevision : !empty
}
