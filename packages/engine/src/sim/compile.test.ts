import { describe, expect, it } from 'vitest'
import { getTemplate } from '../templates.ts'
import { compileSimulation } from './compile.ts'
import type { GraphInput } from './types.ts'

const options = { durationSec: 60, seed: 1 }

/** Builds editor-shaped graph input from a template (as the store would). */
function templateGraph(): GraphInput {
  const t = getTemplate('basic-web-app')
  return {
    nodes: t.nodes.map((n) => ({ id: n.key, data: { componentType: n.componentType, config: n.config } })),
    edges: t.edges.map(([source, target]) => ({ source, target })),
  }
}

const node = (id: string, componentType: string, config?: Record<string, number | string>) => ({
  id,
  data: { componentType, config },
})

describe('compileSimulation', () => {
  it('compiles the starter template', () => {
    const result = compileSimulation(templateGraph(), options)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.stations).toHaveLength(5)
    const app = result.model.stations.find((s) => s.id === 'app')!
    expect(app.downstream).toEqual(['db'])
    expect(app.config.instances).toBe(3) // template override kept
    expect(app.config.cpuCores).toBe(2) // default filled in
  })

  it('clamps out-of-range config values', () => {
    const result = compileSimulation(
      {
        nodes: [node('c', 'client', { requestsPerSecond: 10_000_000 }), node('a', 'appServer')],
        edges: [{ source: 'c', target: 'a' }],
      },
      options,
    )
    expect(result.ok && result.model.stations[0]?.config.requestsPerSecond).toBe(100_000)
  })

  it('requires at least one client', () => {
    const result = compileSimulation({ nodes: [node('a', 'appServer')], edges: [] }, options)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.message).toMatch(/Client/)
  })

  it('reports an empty canvas', () => {
    const result = compileSimulation({ nodes: [], edges: [] }, options)
    expect(!result.ok && result.errors[0]?.message).toMatch(/empty/i)
  })

  it('reports components that need somewhere to send traffic', () => {
    const result = compileSimulation(
      { nodes: [node('c', 'client'), node('lb', 'loadBalancer')], edges: [{ source: 'c', target: 'lb' }] },
      options,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContainEqual(expect.objectContaining({ nodeId: 'lb' }))
  })

  it('reports cycles with the nodes involved', () => {
    const result = compileSimulation(
      {
        nodes: [node('c', 'client'), node('a', 'appServer'), node('b', 'appServer')],
        edges: [
          { source: 'c', target: 'a' },
          { source: 'a', target: 'b' },
          { source: 'b', target: 'a' },
        ],
      },
      options,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    const cycle = result.errors.find((e) => /loop/i.test(e.message))
    expect(cycle).toBeDefined()
    expect(['a', 'b']).toContain(cycle?.nodeId)
  })

  it('reports invalid edges using the editor rules', () => {
    const result = compileSimulation(
      {
        nodes: [node('c', 'client'), node('db', 'sqlDatabase'), node('a', 'appServer')],
        edges: [
          { source: 'c', target: 'a' },
          { source: 'db', target: 'a' },
        ],
      },
      options,
    )
    expect(!result.ok && result.errors.some((e) => /cannot send/.test(e.message))).toBe(true)
  })

  it('reports unknown component types', () => {
    const result = compileSimulation({ nodes: [node('c', 'client'), node('x', 'mainframe')], edges: [] }, options)
    expect(!result.ok && result.errors.some((e) => e.nodeId === 'x')).toBe(true)
  })

  it('validates run options', () => {
    expect(compileSimulation(templateGraph(), { durationSec: 0, seed: 1 }).ok).toBe(false)
    expect(compileSimulation(templateGraph(), { durationSec: 4000, seed: 1 }).ok).toBe(false)
    expect(compileSimulation(templateGraph(), { durationSec: 60, seed: 1.5 }).ok).toBe(false)
  })
})
