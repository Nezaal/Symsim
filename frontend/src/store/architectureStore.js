import { create } from 'zustand'
import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react'
import {
  clampFieldValue,
  connectionError,
  defaultConfig,
  getComponentType,
  getTemplate,
} from '@systemsim/engine'
import { randomId } from '../lib/ids.js'
import { pushSnapshot, stepBack, stepForward } from './history.js'

export { HISTORY_LIMIT } from './history.js'

export const MAX_LABEL_LENGTH = 40
const DUPLICATE_OFFSET = 40

const INITIAL_STATE = {
  nodes: [],
  edges: [],
  /** Undo stack of { nodes, edges } snapshots, oldest first. */
  past: [],
  /** Redo stack, next-to-redo first. */
  future: [],
  /** `${nodeId}:${key}` of the last settings edit, so typing coalesces into one undo step. */
  lastEditKey: null,
  /**
   * Bumped on every change to the design itself (not selection or moving
   * nodes). Simulation results remember the revision they ran on, so the UI
   * can tell when they describe an older design.
   */
  revision: 0,
}

/** Node/edge change types that alter the design (vs. select/position/dimensions). */
const STRUCTURAL_CHANGES = new Set(['add', 'remove', 'replace'])
const isStructural = (changes) => changes.some((c) => STRUCTURAL_CHANGES.has(c.type))

const newId = (prefix) => `${prefix}-${randomId()}`

/** State patch for a design edit: an undo step plus a new revision. */
function recordEdit(state) {
  return { ...record(state), revision: state.revision + 1 }
}

/** State patch that saves the current graph as an undo step. */
function record(state) {
  return {
    past: pushSnapshot(state.past, { nodes: state.nodes, edges: state.edges }),
    future: [],
    lastEditKey: null,
  }
}

const deselect = (item) => (item.selected ? { ...item, selected: false } : item)

function replaceNode(nodes, id, update) {
  return nodes.map((n) => (n.id === id ? update(n) : n))
}

/** Turns engine template data into React Flow nodes/edges with fresh ids. */
function instantiateTemplate(template) {
  const idByKey = new Map(template.nodes.map((n) => [n.key, newId(n.componentType)]))
  const nodes = template.nodes.map((n) => ({
    id: idByKey.get(n.key),
    type: 'component',
    position: { ...n.position },
    data: {
      componentType: n.componentType,
      label: n.label ?? getComponentType(n.componentType).label,
      config: { ...defaultConfig(n.componentType), ...n.config },
    },
  }))
  const edges = template.edges.map(([sourceKey, targetKey]) => ({
    id: newId('edge'),
    source: idByKey.get(sourceKey),
    target: idByKey.get(targetKey),
  }))
  return { nodes, edges }
}

/**
 * The architecture graph plus its undo history.
 *
 * Nodes look like: { id, type: 'component', position, data: { componentType, label, config } }
 * `type: 'component'` tells React Flow which renderer to use; `data.componentType`
 * is which of the 10 engine definitions it is.
 */
export const useArchitectureStore = create((set, get) => ({
  ...INITIAL_STATE,

  // ── React Flow change handlers (controlled mode) ─────────────────────────

  /** Selection, drag frames and removals from React Flow. Not recorded: callers snapshot first. */
  onNodesChange: (changes) =>
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
      lastEditKey: changes.some((c) => c.type === 'select') ? null : state.lastEditKey,
      revision: isStructural(changes) ? state.revision + 1 : state.revision,
    })),

  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      lastEditKey: changes.some((c) => c.type === 'select') ? null : state.lastEditKey,
      revision: isStructural(changes) ? state.revision + 1 : state.revision,
    })),

  onConnect: (connection) => {
    const { nodes, edges } = get()
    if (connectionError(connection, nodes, edges) !== null) return
    set((state) => ({
      ...recordEdit(state),
      edges: addEdge({ ...connection, id: newId('edge') }, state.edges),
    }))
  },

  // ── Editing actions (each one is a single undo step) ─────────────────────

  /** Saves the current graph as an undo step. Call before a multi-event gesture such as a drag. */
  snapshot: () => set(record),

  /** @returns {string} the new node's id */
  addNode: (componentType, position) => {
    const def = getComponentType(componentType) // throws before any state change
    const node = {
      id: newId(componentType),
      type: 'component',
      position,
      selected: true,
      data: { componentType, label: def.label, config: defaultConfig(componentType) },
    }
    set((state) => ({
      ...recordEdit(state),
      nodes: [...state.nodes.map(deselect), node],
      edges: state.edges.map(deselect), // otherwise Delete would also remove a hidden selected edge
    }))
    return node.id
  },

  /** Clears the selection (closes the settings panel). Selection isn't undoable, so not recorded. */
  deselectAll: () =>
    set((state) => ({
      nodes: state.nodes.map(deselect),
      edges: state.edges.map(deselect),
      lastEditKey: null,
    })),

  /** Ends the current editing session, so the next edit of the same field is a new undo step. */
  endEdit: () => set({ lastEditKey: null }),

  /** Replaces the whole graph with a starter template (undoable). */
  loadTemplate: (templateId) => {
    const graph = instantiateTemplate(getTemplate(templateId)) // throws before any state change
    set((state) => ({ ...recordEdit(state), ...graph }))
  },

  updateNodeConfig: (id, key, value) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === id)
    const field = node && getComponentType(node.data.componentType).fields.find((f) => f.key === key)
    if (!field) return

    const nextValue = clampFieldValue(field, value)
    if (nextValue === node.data.config[key]) return

    const editKey = `${id}:${key}`
    set({
      ...(state.lastEditKey === editKey ? {} : record(state)),
      revision: state.revision + 1,
      lastEditKey: editKey,
      nodes: replaceNode(state.nodes, id, (n) => ({
        ...n,
        data: { ...n.data, config: { ...n.data.config, [key]: nextValue } },
      })),
    })
  },

  /** Empty labels fall back to the component's type name. */
  updateNodeLabel: (id, label) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === id)
    if (!node) return

    const trimmed = String(label ?? '').trim().slice(0, MAX_LABEL_LENGTH)
    const nextLabel = trimmed || getComponentType(node.data.componentType).label
    if (nextLabel === node.data.label) return

    const editKey = `${id}:label`
    set({
      ...(state.lastEditKey === editKey ? {} : record(state)),
      revision: state.revision + 1,
      lastEditKey: editKey,
      nodes: replaceNode(state.nodes, id, (n) => ({ ...n, data: { ...n.data, label: nextLabel } })),
    })
  },

  /** Removes selected nodes, selected edges, and any edge attached to a removed node. */
  deleteSelected: () => {
    const { nodes, edges } = get()
    const removedIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
    const hasSelectedEdge = edges.some((e) => e.selected)
    if (removedIds.size === 0 && !hasSelectedEdge) return

    set((state) => ({
      ...recordEdit(state),
      nodes: state.nodes.filter((n) => !removedIds.has(n.id)),
      edges: state.edges.filter(
        (e) => !e.selected && !removedIds.has(e.source) && !removedIds.has(e.target),
      ),
    }))
  },

  /** Copies selected nodes plus the edges between them, offset slightly, and selects the copies. */
  duplicateSelected: () => {
    const selected = get().nodes.filter((n) => n.selected)
    if (selected.length === 0) return

    const idMap = new Map(selected.map((n) => [n.id, newId(n.data.componentType)]))
    // `data` can be shared between original and copy: nothing ever mutates it.
    const copies = selected.map((n) => ({
      id: idMap.get(n.id),
      type: n.type,
      position: { x: n.position.x + DUPLICATE_OFFSET, y: n.position.y + DUPLICATE_OFFSET },
      data: n.data,
      selected: true,
    }))

    set((state) => {
      const copiedEdges = state.edges
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e) => ({
          ...e,
          id: newId('edge'),
          source: idMap.get(e.source),
          target: idMap.get(e.target),
          selected: false,
        }))
      return {
        ...recordEdit(state),
        nodes: [...state.nodes.map(deselect), ...copies],
        edges: [...state.edges.map(deselect), ...copiedEdges],
      }
    })
  },

  // ── History ──────────────────────────────────────────────────────────────

  undo: () =>
    set((state) => {
      const step = stepBack(state, { nodes: state.nodes, edges: state.edges })
      if (!step) return {}
      return {
        ...step.present,
        past: step.past,
        future: step.future,
        lastEditKey: null,
        revision: state.revision + 1,
      }
    }),

  redo: () =>
    set((state) => {
      const step = stepForward(state, { nodes: state.nodes, edges: state.edges })
      if (!step) return {}
      return {
        ...step.present,
        past: step.past,
        future: step.future,
        lastEditKey: null,
        revision: state.revision + 1,
      }
    }),

  /** Clears the graph and history (used by tests, later by "New project"). */
  reset: () => set(INITIAL_STATE),
}))
