import { describe, expect, it, vi } from 'vitest'
import { clearDraft, loadDraft, saveDraft } from './draftStorage.js'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }
}

const nodes = [{ id: 'a', position: { x: 1, y: 2 }, selected: true, data: { componentType: 'cache', label: 'Cache', config: {} } }]

describe('draftStorage', () => {
  it('round-trips the design with its project and version', () => {
    const storage = memoryStorage()
    saveDraft({ projectId: 'p1', versionId: 'v1', nodes, edges: [] }, storage)
    const draft = loadDraft(storage)
    expect(draft).toMatchObject({ projectId: 'p1', versionId: 'v1' })
    expect(draft.graph.nodes[0]).toEqual({ id: 'a', position: { x: 1, y: 2 }, data: nodes[0].data })
  })

  it('returns null for missing or corrupted drafts', () => {
    const storage = memoryStorage()
    expect(loadDraft(storage)).toBeNull()
    storage.setItem('systemsim:draft:v1', '{broken')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(loadDraft(storage)).toBeNull()
  })

  it('survives unavailable or full storage', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const full = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError') } }
    expect(() => saveDraft({ nodes, edges: [] }, full)).not.toThrow()
    expect(() => saveDraft({ nodes, edges: [] }, null)).not.toThrow()
    expect(loadDraft(null)).toBeNull()
  })

  it('clears the draft', () => {
    const storage = memoryStorage()
    saveDraft({ nodes, edges: [] }, storage)
    clearDraft(storage)
    expect(loadDraft(storage)).toBeNull()
  })
})
