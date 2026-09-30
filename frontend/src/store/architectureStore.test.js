import { beforeEach, describe, expect, it } from 'vitest'
import { HISTORY_LIMIT, useArchitectureStore } from './architectureStore.js'

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
