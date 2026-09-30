import { serializeGraph } from './graphSnapshot.js'

const KEY = 'systemsim:draft:v1'

/** localStorage, or null where it's unavailable (private mode, blocked, tests). */
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * The working design, autosaved in the browser so a refresh never loses work
 * (for guests and signed-in users alike). It remembers which project/version
 * it was based on, so unsaved edits to a project can be restored too.
 */
export function saveDraft({ projectId = null, versionId = null, nodes, edges }, storage = defaultStorage()) {
  if (!storage) return
  try {
    storage.setItem(KEY, JSON.stringify({ projectId, versionId, graph: serializeGraph(nodes, edges), savedAt: Date.now() }))
  } catch (error) {
    // Quota exceeded or storage blocked: autosave is a convenience, not critical.
    console.warn('Could not autosave the design in this browser', error)
  }
}

/** @returns {{ projectId: string|null, versionId: string|null, graph: object } | null} */
export function loadDraft(storage = defaultStorage()) {
  if (!storage) return null
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object' || typeof parsed.graph !== 'object') return null
    return {
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : null,
      versionId: typeof parsed.versionId === 'string' ? parsed.versionId : null,
      graph: parsed.graph,
    }
  } catch (error) {
    console.warn('Ignoring an unreadable autosaved design', error)
    return null
  }
}

export function clearDraft(storage = defaultStorage()) {
  try {
    storage?.removeItem(KEY)
  } catch (error) {
    console.warn('Could not clear the autosaved design', error)
  }
}
