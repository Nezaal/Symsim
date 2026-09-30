import { beforeEach, describe, expect, it } from 'vitest'
import { HISTORY_LIMIT, useArchitectureStore } from './architectureStore.js'
import { MAX_NODES } from '../lib/graphSnapshot.js'

const store = () => useArchitectureStore.getState()
const select = (ids) =>
  store().onNodesChange(ids.map((id) => ({ id, type: 'select', selected: true })))

beforeEach(() => {
  store().reset()
})

describe('addNode', () => {
  it('adds a node with default config and selects only it', () => {
    const first = store().addNode('cache', { x: 0, y: 0 })
    const second = store().addNode('appServer', { x: 10, y: 20 })

    const { nodes } = store()
    expect(nodes).toHaveLength(2)
    expect(nodes.find((n) => n.id === second).data).toMatchObject({
      componentType: 'appServer',
      label: 'App Server',
      config: { instances: 2 },
    })
    expect(nodes.find((n) => n.id === first).selected).toBe(false)
    expect(nodes.find((n) => n.id === second).selected).toBe(true)
  })

  it('deselects edges too, so Delete only removes what the panel shows', () => {
    const a = store().addNode('client', { x: 0, y: 0 })
    const b = store().addNode('appServer', { x: 0, y: 0 })
    store().onConnect({ source: a, target: b })
    const edgeId = store().edges[0].id
    store().onEdgesChange([{ id: edgeId, type: 'select', selected: true }])
    store().addNode('cache', { x: 0, y: 0 })
    expect(store().edges[0].selected).toBe(false)
  })

  it('rejects unknown component types without changing state', () => {
    expect(() => store().addNode('mainframe', { x: 0, y: 0 })).toThrow()
    expect(store().nodes).toHaveLength(0)
    expect(store().past).toHaveLength(0)
  })
})

describe('updateNodeConfig', () => {
  it('clamps values to the field range', () => {
    const id = store().addNode('appServer', { x: 0, y: 0 })
    store().updateNodeConfig(id, 'instances', 9999)
    expect(store().nodes[0].data.config.instances).toBe(100)
  })

  it('does not mutate the previous node object', () => {
    const id = store().addNode('appServer', { x: 0, y: 0 })
    const before = store().nodes[0]
    store().updateNodeConfig(id, 'instances', 4)
    expect(before.data.config.instances).toBe(2)
    expect(store().nodes[0]).not.toBe(before)
  })

  it('ignores unknown keys', () => {
    const id = store().addNode('cache', { x: 0, y: 0 })
    const before = store().nodes
    store().updateNodeConfig(id, 'bogus', 1)
    expect(store().nodes).toBe(before)
  })

  it('coalesces consecutive edits of the same field into one undo step', () => {
    const id = store().addNode('appServer', { x: 0, y: 0 })
    store().updateNodeConfig(id, 'instances', 3)
    store().updateNodeConfig(id, 'instances', 4)
    store().updateNodeConfig(id, 'instances', 5)
    store().undo()
    expect(store().nodes[0].data.config.instances).toBe(2)
  })

  it('starts a new undo step after endEdit (e.g. the field lost focus)', () => {
    const id = store().addNode('appServer', { x: 0, y: 0 })
    store().updateNodeConfig(id, 'instances', 3)
    store().endEdit()
    store().updateNodeConfig(id, 'instances', 4)
    store().undo()
    expect(store().nodes[0].data.config.instances).toBe(3)
  })
})

describe('updateNodeLabel', () => {
  it('trims and limits the label length', () => {
    const id = store().addNode('cache', { x: 0, y: 0 })
    store().updateNodeLabel(id, `  ${'x'.repeat(100)}  `)
    expect(store().nodes[0].data.label).toHaveLength(40)
  })
})

describe('onConnect', () => {
  it('adds a valid edge', () => {
    const a = store().addNode('client', { x: 0, y: 0 })
    const b = store().addNode('appServer', { x: 0, y: 0 })
    store().onConnect({ source: a, target: b })
    expect(store().edges).toHaveLength(1)
  })

  it('ignores invalid edges', () => {
    const a = store().addNode('client', { x: 0, y: 0 })
    const b = store().addNode('appServer', { x: 0, y: 0 })
    store().onConnect({ source: b, target: a })
    expect(store().edges).toHaveLength(0)
  })
})

describe('deselectAll', () => {
  it('clears node and edge selection without creating an undo step', () => {
    const a = store().addNode('client', { x: 0, y: 0 })
    const b = store().addNode('appServer', { x: 0, y: 0 })
    store().onConnect({ source: a, target: b })
    store().onEdgesChange([{ id: store().edges[0].id, type: 'select', selected: true }])
    select([a])
    const pastLength = store().past.length

    store().deselectAll()

    expect(store().nodes.some((n) => n.selected)).toBe(false)
    expect(store().edges.some((e) => e.selected)).toBe(false)
    expect(store().past).toHaveLength(pastLength)
  })
})

describe('deleteSelected', () => {
  it('removes selected nodes and their edges', () => {
    const a = store().addNode('client', { x: 0, y: 0 })
    const b = store().addNode('appServer', { x: 0, y: 0 })
    store().onConnect({ source: a, target: b })
    select([b])
    store().deleteSelected()
    expect(store().nodes.map((n) => n.id)).toEqual([a])
    expect(store().edges).toHaveLength(0)
  })
})

describe('duplicateSelected', () => {
  it('copies selected nodes, their internal edges, and selects the copies', () => {
    const a = store().addNode('loadBalancer', { x: 0, y: 0 })
    const b = store().addNode('appServer', { x: 100, y: 0 })
    store().onConnect({ source: a, target: b })
    select([a, b])
    store().duplicateSelected()

    const { nodes, edges } = store()
    expect(nodes).toHaveLength(4)
    expect(edges).toHaveLength(2)
    const copies = nodes.filter((n) => n.selected)
    expect(copies).toHaveLength(2)
    expect(copies.map((n) => n.id)).not.toContain(a)
    expect(copies[0].position).toEqual({ x: 40, y: 40 })
    const copyIds = new Set(copies.map((n) => n.id))
    expect(edges.some((e) => copyIds.has(e.source) && copyIds.has(e.target))).toBe(true)
  })

  it('does nothing when nothing is selected', () => {
    store().addNode('cache', { x: 0, y: 0 })
    select([])
    store().onNodesChange([{ id: store().nodes[0].id, type: 'select', selected: false }])
    const pastLength = store().past.length
    store().duplicateSelected()
    expect(store().nodes).toHaveLength(1)
    expect(store().past).toHaveLength(pastLength)
  })
})

describe('loadTemplate', () => {
  it('builds nodes and edges from the template', () => {
    store().loadTemplate('basic-web-app')
    const { nodes, edges } = store()
    expect(nodes).toHaveLength(5)
    expect(edges).toHaveLength(4)
    expect(nodes.every((n) => n.type === 'component' && !n.selected)).toBe(true)
    const ids = new Set(nodes.map((n) => n.id))
    expect(edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true)
  })

  it('merges config overrides into the defaults and applies labels', () => {
    store().loadTemplate('basic-web-app')
    const app = store().nodes.find((n) => n.data.componentType === 'appServer')
    expect(app.data.label).toBe('App servers')
    expect(app.data.config).toMatchObject({ instances: 3, cpuCores: 2, serviceTimeMs: 20 })
    const gateway = store().nodes.find((n) => n.data.componentType === 'apiGateway')
    expect(gateway.data.label).toBe('API Gateway')
  })

  it('uses fresh ids every time it is loaded', () => {
    store().loadTemplate('basic-web-app')
    const firstIds = store().nodes.map((n) => n.id)
    store().loadTemplate('basic-web-app')
    expect(store().nodes.map((n) => n.id)).not.toEqual(firstIds)
  })

  it('replaces the current graph as one undoable step', () => {
    const id = store().addNode('cache', { x: 0, y: 0 })
    store().loadTemplate('basic-web-app')
    expect(store().nodes.some((n) => n.id === id)).toBe(false)
    store().undo()
    expect(store().nodes.map((n) => n.id)).toEqual([id])
    expect(store().edges).toHaveLength(0)
  })

  it('throws for an unknown template without changing state', () => {
    store().addNode('cache', { x: 0, y: 0 })
    const before = store().nodes
    expect(() => store().loadTemplate('nope')).toThrow(/Unknown template/)
    expect(store().nodes).toBe(before)
  })
})

describe('replaceGraph', () => {
  it('loads a design, clears undo history and bumps the revision', () => {
    store().addNode('cache', { x: 0, y: 0 })
    const before = store().revision
    const nodes = [{ id: 'n1', type: 'component', position: { x: 1, y: 2 }, data: { componentType: 'cdn', label: 'CDN', config: {} } }]
    store().replaceGraph(nodes, [])
    expect(store().nodes).toBe(nodes)
    expect(store().past).toHaveLength(0)
    expect(store().future).toHaveLength(0)
    expect(store().revision).toBeGreaterThan(before)
  })
})

describe('revision', () => {
  it('increments on design changes but not on selection or dragging', () => {
    const r0 = store().revision
    const id = store().addNode('appServer', { x: 0, y: 0 })
    const r1 = store().revision
    expect(r1).toBeGreaterThan(r0)

    store().onNodesChange([{ id, type: 'select', selected: false }])
    store().snapshot()
    store().onNodesChange([{ id, type: 'position', position: { x: 9, y: 9 }, dragging: false }])
    expect(store().revision).toBe(r1)

    store().updateNodeConfig(id, 'instances', 5)
    expect(store().revision).toBeGreaterThan(r1)
  })

  it('increments on undo, redo, template loads and removals', () => {
    const id = store().addNode('cache', { x: 0, y: 0 })
    const steps = [
      () => store().undo(),
      () => store().redo(),
      () => store().loadTemplate('basic-web-app'),
      () => store().onNodesChange([{ id: store().nodes[0].id, type: 'remove' }]),
    ]
    for (const step of steps) {
      const before = store().revision
      step()
      expect(store().revision).toBeGreaterThan(before)
    }
    expect(id).toBeDefined()
  })
})

describe('layoutRevision', () => {
  it('bumps when a drag ends, without touching the design revision', () => {
    const id = store().addNode('cache', { x: 0, y: 0 })
    const { revision, layoutRevision } = store()
    store().onNodesChange([{ id, type: 'position', position: { x: 5, y: 5 }, dragging: true }])
    expect(store().layoutRevision).toBe(layoutRevision) // mid-drag: not yet
    store().onNodesChange([{ id, type: 'position', position: { x: 9, y: 9 }, dragging: false }])
    expect(store().layoutRevision).toBe(layoutRevision + 1)
    expect(store().revision).toBe(revision)
  })

  it('also bumps on every design change', () => {
    const before = store().layoutRevision
    store().addNode('cache', { x: 0, y: 0 })
    expect(store().layoutRevision).toBe(before + 1)
  })
})

describe('size limits', () => {
  it('refuses to add components beyond the saveable maximum', () => {
    const nodes = Array.from({ length: MAX_NODES }, (_, i) => ({
      id: `n${i}`, type: 'component', position: { x: 0, y: 0 }, data: { componentType: 'cache', label: 'Cache', config: {} },
    }))
    store().replaceGraph(nodes, [])
    expect(store().addNode('cache', { x: 0, y: 0 })).toBeNull()
    expect(store().nodes).toHaveLength(MAX_NODES)
    store().onNodesChange([{ id: 'n0', type: 'select', selected: true }])
    store().duplicateSelected()
    expect(store().nodes).toHaveLength(MAX_NODES)
  })
})

describe('undo / redo', () => {
  it('walks back and forth through history', () => {
    store().addNode('cache', { x: 0, y: 0 })
    store().addNode('cdn', { x: 0, y: 0 })
    store().undo()
    expect(store().nodes).toHaveLength(1)
    store().undo()
    expect(store().nodes).toHaveLength(0)
    store().redo()
    store().redo()
    expect(store().nodes).toHaveLength(2)
  })

  it('clears the redo stack after a new change', () => {
    store().addNode('cache', { x: 0, y: 0 })
    store().undo()
    store().addNode('cdn', { x: 0, y: 0 })
    expect(store().future).toHaveLength(0)
  })

  it('is a no-op at the ends of history', () => {
    store().undo()
    store().redo()
    expect(store().nodes).toHaveLength(0)
  })

  it('does not record selection or drag-in-progress changes', () => {
    const id = store().addNode('cache', { x: 0, y: 0 })
    const pastLength = store().past.length
    store().onNodesChange([{ id, type: 'select', selected: false }])
    store().onNodesChange([{ id, type: 'position', position: { x: 5, y: 5 }, dragging: true }])
    expect(store().past).toHaveLength(pastLength)
  })

  it('records a drag as a single step when snapshotted at drag start', () => {
    const id = store().addNode('cache', { x: 0, y: 0 })
    store().snapshot()
    store().onNodesChange([{ id, type: 'position', position: { x: 5, y: 5 }, dragging: true }])
    store().onNodesChange([{ id, type: 'position', position: { x: 9, y: 9 }, dragging: false }])
    store().undo()
    expect(store().nodes[0].position).toEqual({ x: 0, y: 0 })
  })

  it(`keeps at most ${HISTORY_LIMIT} entries`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 10; i += 1) store().addNode('cache', { x: i, y: 0 })
    expect(store().past).toHaveLength(HISTORY_LIMIT)
  })
})
