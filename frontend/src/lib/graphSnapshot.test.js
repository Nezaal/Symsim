import { describe, expect, it } from 'vitest'
import { deserializeGraph, GraphSnapshotError, serializeGraph } from './graphSnapshot.js'

const node = (id, componentType, extra = {}) => ({
  id,
  type: 'component',
  position: { x: 10, y: 20 },
  selected: true,
  measured: { width: 176, height: 60 },
  data: { componentType, label: 'Name', config: { instances: 3 } },
  ...extra,
})

describe('serializeGraph', () => {
  it('keeps only what defines the design (no selection or measured sizes)', () => {
    const snapshot = serializeGraph([node('a', 'appServer')], [{ id: 'e', source: 'a', target: 'b', selected: true }])
    expect(snapshot).toEqual({
      v: 1,
      nodes: [{ id: 'a', position: { x: 10, y: 20 }, data: { componentType: 'appServer', label: 'Name', config: { instances: 3 } } }],
      edges: [{ id: 'e', source: 'a', target: 'b' }],
    })
  })
})

describe('deserializeGraph', () => {
  it('round-trips a valid design into editor nodes and edges', () => {
    const snapshot = serializeGraph([node('c', 'client'), node('a', 'appServer')], [{ id: 'e1', source: 'c', target: 'a' }])
    const { nodes, edges } = deserializeGraph(snapshot)
    expect(nodes).toHaveLength(2)
    expect(nodes[1]).toMatchObject({ id: 'a', type: 'component', position: { x: 10, y: 20 } })
    expect(nodes[1].data.config.instances).toBe(3)
    expect(nodes[1].data.config.cpuCores).toBe(2) // missing fields get defaults
    expect(edges).toEqual([{ id: 'e1', source: 'c', target: 'a' }])
  })

  it('clamps out-of-range settings and trims labels', () => {
    const snapshot = serializeGraph([node('a', 'appServer', { data: { componentType: 'appServer', label: 'x'.repeat(99), config: { instances: 1e9 } } })], [])
    const [a] = deserializeGraph(snapshot).nodes
    expect(a.data.config.instances).toBe(100)
    expect(a.data.label).toHaveLength(40)
  })

  it('drops nodes of unknown types and edges that break the rules', () => {
    const { nodes, edges } = deserializeGraph({
      v: 1,
      nodes: [
        { id: 'c', position: { x: 0, y: 0 }, data: { componentType: 'client' } },
        { id: 'x', position: { x: 0, y: 0 }, data: { componentType: 'mainframe' } },
        { id: 'db', position: { x: 0, y: 0 }, data: { componentType: 'sqlDatabase' } },
      ],
      edges: [
        { id: 'ok', source: 'c', target: 'db' },
        { id: 'bad', source: 'db', target: 'c' },
        { id: 'ghost', source: 'c', target: 'x' },
      ],
    })
    expect(nodes.map((n) => n.id)).toEqual(['c', 'db'])
    expect(edges.map((e) => e.id)).toEqual(['ok'])
  })

  it('rejects things that are not a design at all', () => {
    expect(() => deserializeGraph(null)).toThrow(GraphSnapshotError)
    expect(() => deserializeGraph({ nodes: 'nope', edges: [] })).toThrow(GraphSnapshotError)
    expect(() => deserializeGraph({ nodes: [{ id: 1 }], edges: [] })).toThrow(GraphSnapshotError)
  })

  it('rejects oversized designs', () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ id: `n${i}`, position: { x: 0, y: 0 }, data: { componentType: 'cache' } }))
    expect(() => deserializeGraph({ v: 1, nodes: many, edges: [] })).toThrow(/too large/)
  })
})
