import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { createProjectStore } from './projectStore.js'
import { serializeGraph } from '../lib/graphSnapshot.js'

/** Minimal stand-in for the architecture store. */
function fakeArchitecture() {
  return create((set) => ({
    nodes: [{ id: 'c', type: 'component', position: { x: 0, y: 0 }, data: { componentType: 'client', label: 'Users', config: {} } }],
    edges: [],
    revision: 7,
    layoutRevision: 11,
    replaceGraph: (nodes, edges) =>
      set((s) => ({ nodes, edges, revision: s.revision + 1, layoutRevision: s.layoutRevision + 1 })),
  }))
}

function fakeApi() {
  let versionNumber = 0
  return {
    createProject: vi.fn(async (name) => ({ id: 'p1', name, visibility: 'private' })),
    saveVersion: vi.fn(async () => ({ id: `v${++versionNumber}`, version_number: versionNumber })),
    openProject: vi.fn(async () => ({
      project: { id: 'p9', name: 'Opened', visibility: 'private' },
      version: { id: 'v9', version_number: 3, graph: serializeGraph([], []) },
    })),
    listMyProjects: vi.fn(async () => [{ id: 'p1', name: 'A' }]),
    createShareLink: vi.fn(async () => ({ id: 'link1', token: 'abc123' })),
    getActiveShareLink: vi.fn(async () => null),
    revokeShareLink: vi.fn(async () => {}),
  }
}

let api
let architecture
let store

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  api = fakeApi()
  architecture = fakeArchitecture()
  store = createProjectStore({ api, architecture })
})

describe('project store', () => {
  it('creates the project on first save, then adds versions to it', async () => {
    await store.getState().saveVersion({ name: '  My shop ', message: 'first' })
    expect(api.createProject).toHaveBeenCalledWith('My shop')
    expect(store.getState()).toMatchObject({
      project: { id: 'p1' },
      version: { id: 'v1', number: 1 },
      savedRevision: 7,
      savedLayoutRevision: 11,
    })

    await store.getState().saveVersion({ message: 'second' })
    expect(api.createProject).toHaveBeenCalledTimes(1)
    expect(store.getState().version).toEqual({ id: 'v2', number: 2 })
  })

  it('names untitled projects', async () => {
    await store.getState().saveVersion({ name: '   ' })
    expect(api.createProject).toHaveBeenCalledWith('Untitled design')
  })

  it('reports a friendly error and stays usable when saving fails', async () => {
    api.saveVersion.mockRejectedValueOnce(new Error('network down'))
    const ok = await store.getState().saveVersion({ name: 'X' })
    expect(ok).toBe(false)
    expect(store.getState().error).toMatch(/couldn't/i)
    expect(store.getState().busy).toBe(false)
  })

  it('opens a project into the editor and marks it as saved', async () => {
    await store.getState().openProject('p9')
    const { project, version, savedRevision } = store.getState()
    expect(project.name).toBe('Opened')
    expect(version).toEqual({ id: 'v9', number: 3 })
    expect(savedRevision).toBe(architecture.getState().revision)
  })

  it('restores unsaved edits from a draft based on the same version', async () => {
    const draft = { projectId: 'p9', versionId: 'v9', graph: serializeGraph(architecture.getState().nodes, []) }
    await store.getState().openProject('p9', { draft })
    expect(architecture.getState().nodes).toHaveLength(1) // the draft's node, not the empty saved version
    expect(store.getState().savedRevision).toBeNull() // shows as unsaved
    expect(store.getState().savedLayoutRevision).toBeNull()
  })

  it('ignores a draft from another project or an older version', async () => {
    const draft = { projectId: 'p9', versionId: 'v-old', graph: serializeGraph(architecture.getState().nodes, []) }
    await store.getState().openProject('p9', { draft })
    expect(architecture.getState().nodes).toHaveLength(0)
  })

  it('starts a new design', async () => {
    await store.getState().saveVersion({ name: 'X' })
    store.getState().newDesign()
    expect(store.getState()).toMatchObject({ project: null, version: null, savedRevision: null })
    expect(architecture.getState().nodes).toHaveLength(0)
  })

  it('creates a share link for the saved version', async () => {
    await store.getState().saveVersion({ name: 'X' })
    const url = await store.getState().createShareLink('https://systemsim.app')
    expect(api.createShareLink).toHaveBeenCalledWith('v1')
    expect(url).toBe('https://systemsim.app/s/abc123')
    expect(store.getState().share).toEqual({ id: 'link1', url })
  })

  it('reuses the active link for a version instead of creating another', async () => {
    await store.getState().saveVersion({ name: 'X' })
    api.getActiveShareLink.mockResolvedValueOnce({ id: 'old', token: 'existing' })
    const url = await store.getState().createShareLink('https://s')
    expect(url).toBe('https://s/s/existing')
    expect(api.createShareLink).not.toHaveBeenCalled()
  })

  it('turns a share link off', async () => {
    await store.getState().saveVersion({ name: 'X' })
    await store.getState().createShareLink('https://s')
    await store.getState().revokeShareLink()
    expect(api.revokeShareLink).toHaveBeenCalledWith('link1')
    expect(store.getState().share).toBeNull()
  })

  it('ignores a slow response once a newer request has started', async () => {
    let finishSave
    api.saveVersion.mockImplementationOnce(() => new Promise((resolve) => (finishSave = resolve)))
    const saving = store.getState().saveVersion({ name: 'A' })
    await store.getState().openProject('p9') // user opened another project meanwhile
    finishSave({ id: 'late', version_number: 1 })
    await saving
    expect(store.getState().project.id).toBe('p9')
    expect(store.getState().version.id).toBe('v9')
  })

  it('remembers a newly created project even if its first version fails', async () => {
    api.saveVersion.mockRejectedValueOnce(new Error('network'))
    await store.getState().saveVersion({ name: 'A' })
    expect(store.getState().project.id).toBe('p1')
    await store.getState().saveVersion({})
    expect(api.createProject).toHaveBeenCalledTimes(1) // retry doesn't create a second project
  })

  it('falls back to the saved version when the draft is unreadable', async () => {
    const draft = { projectId: 'p9', versionId: 'v9', graph: { broken: true } }
    const ok = await store.getState().openProject('p9', { draft })
    expect(ok).toBe(true)
    expect(store.getState().savedRevision).toBe(architecture.getState().revision)
  })

  it('cannot share before anything is saved', async () => {
    expect(await store.getState().createShareLink('https://x')).toBeNull()
    expect(api.createShareLink).not.toHaveBeenCalled()
  })

  it('forgets the project on sign-out but keeps the canvas', async () => {
    await store.getState().saveVersion({ name: 'X' })
    store.getState().reset()
    expect(store.getState().project).toBeNull()
    expect(architecture.getState().nodes).toHaveLength(1)
  })
})
