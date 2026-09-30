import { describe, expect, it } from 'vitest'
import { runSaveState } from './runPersistence.js'

const base = {
  sim: { status: 'done', result: { summary: 'x' }, runRevision: 5, runSave: { status: 'idle' } },
  auth: { status: 'signedIn' },
  project: { version: { id: 'v3', number: 3 }, savedRevision: 5 },
  revision: 5,
}
const state = (overrides = {}) => runSaveState({ ...base, ...overrides })

describe('runSaveState', () => {
  it('saves automatically when the run matches a saved version', () => {
    expect(state()).toEqual({ kind: 'save', versionId: 'v3' })
  })

  it('still saves if the design was edited after the run started', () => {
    expect(state({ revision: 9 })).toEqual({ kind: 'save', versionId: 'v3' })
  })

  it('offers "save version & keep run" when the run used unsaved changes', () => {
    expect(state({ project: { version: { id: 'v3' }, savedRevision: 4 } }).kind).toBe('offerSaveVersion')
    expect(state({ project: { version: null, savedRevision: null } }).kind).toBe('offerSaveVersion')
  })

  it('cannot keep a run of unsaved changes once the design has moved on', () => {
    expect(state({ project: { version: null, savedRevision: null }, revision: 6 }).kind).toBe('stale')
  })

  it('asks guests to sign in', () => {
    expect(state({ auth: { status: 'signedOut' } }).kind).toBe('signIn')
  })

  it('does nothing when saving is impossible or already handled', () => {
    expect(state({ auth: { status: 'unavailable' } }).kind).toBe('none')
    expect(state({ sim: { ...base.sim, status: 'running' } }).kind).toBe('none')
    expect(state({ sim: { ...base.sim, runSave: { status: 'saved' } } }).kind).toBe('none')
  })
})
