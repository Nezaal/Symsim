/**
 * Runs the projects API against the REAL local Supabase (RLS, triggers,
 * constraints). Needs `npx supabase start` and frontend/.env.local.
 * Run with: npm run test:integration --workspace frontend
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getTemplate, runSimulation } from '@systemsim/engine'
import { createProjectsApi } from './projectsApi.js'
import { serializeGraph, deserializeGraph } from './graphSnapshot.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

const newClient = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

/** Signs up a throwaway user (local Supabase doesn't require email confirmation). */
async function signedInClient(name) {
  const client = newClient()
  const email = `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`
  const { data, error } = await client.auth.signUp({ email, password: 'integration-test-password-123' })
  if (error || !data.session) throw new Error(`Sign-up failed: ${error?.message ?? 'no session'}`)
  return { client, userId: data.user.id }
}

function templateSnapshot() {
  const t = getTemplate('basic-web-app')
  const nodes = t.nodes.map((n) => ({
    id: n.key,
    position: n.position,
    data: { componentType: n.componentType, label: n.label ?? n.componentType, config: n.config ?? {} },
  }))
  const edges = t.edges.map(([source, target], i) => ({ id: `e${i}`, source, target }))
  return serializeGraph(nodes, edges)
}

describe('projects API against local Supabase', () => {
  let ada
  let bob
  let adaApi
  let bobApi
  let anonApi

  beforeAll(async () => {
    if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local')
    ada = await signedInClient('ada')
    bob = await signedInClient('bob')
    adaApi = createProjectsApi(ada.client)
    bobApi = createProjectsApi(bob.client)
    anonApi = createProjectsApi(newClient())
  })

  it('creates a profile automatically on sign-up', async () => {
    const { data } = await ada.client.from('profiles').select('username').eq('id', ada.userId).single()
    expect(data.username).toMatch(/^user_/)
  })

  it('saves versions with database-assigned numbers and opens the newest', async () => {
    const project = await adaApi.createProject('Integration test')
    const snapshot = templateSnapshot()
    const v1 = await adaApi.saveVersion(project.id, snapshot, 'first')
    const v2 = await adaApi.saveVersion(project.id, snapshot, 'second')
    expect([v1.version_number, v2.version_number]).toEqual([1, 2])

    const opened = await adaApi.openProject(project.id)
    expect(opened.version.id).toBe(v2.id)
    expect(deserializeGraph(opened.version.graph).nodes).toHaveLength(5)

    const mine = await adaApi.listMyProjects(ada.userId)
    expect(mine.map((p) => p.id)).toContain(project.id)
  })

  it('stores a real engine result for a version', async () => {
    const project = await adaApi.createProject('With a run')
    const snapshot = templateSnapshot()
    const version = await adaApi.saveVersion(project.id, snapshot)
    const options = { durationSec: 10, seed: 42 }
    const run = runSimulation({ nodes: snapshot.nodes, edges: snapshot.edges }, options)
    expect(run.ok).toBe(true)

    const now = new Date()
    const simulation = await adaApi.saveRun(version.id, {
      options,
      result: run.result,
      workload: { clients: [] },
      startedAt: new Date(now.getTime() - 1000).toISOString(),
      finishedAt: now.toISOString(),
    })
    const { data } = await ada.client
      .from('simulation_results')
      .select('successful_requests, latency_p99_ms')
      .eq('simulation_id', simulation.id)
      .single()
    expect(data.successful_requests).toBe(run.result.successfulRequests)
  })

  it("keeps a private project hidden from other users and signed-out visitors", async () => {
    const project = await adaApi.createProject('Private')
    await expect(bobApi.openProject(project.id)).rejects.toThrow(/access/)
    await expect(anonApi.openProject(project.id)).rejects.toThrow(/access/)
    expect(await bobApi.listMyProjects(ada.userId)).toEqual([])
  })

  it('shares a version through a token that works signed out', async () => {
    const project = await adaApi.createProject('Shared')
    const version = await adaApi.saveVersion(project.id, templateSnapshot())
    const link = await adaApi.createShareLink(version.id)
    expect(link.token).toHaveLength(64)

    const shared = await anonApi.getSharedVersion(link.token)
    expect(shared.project_name).toBe('Shared')
    expect(deserializeGraph(shared.graph).edges).toHaveLength(4)
    expect(await anonApi.getSharedVersion('not-a-real-token')).toBeNull()
  })

  it('does not let another user write into your project', async () => {
    const project = await adaApi.createProject('Mine only')
    await expect(bobApi.saveVersion(project.id, templateSnapshot())).rejects.toThrow()
  })
})
