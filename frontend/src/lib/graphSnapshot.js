import { clampFieldValue, connectionError, findComponentType } from '@systemsim/engine'

/** Format version stored with every snapshot, so the shape can evolve later. */
export const SNAPSHOT_VERSION = 1
export const MAX_NODES = 500
export const MAX_EDGES = 2000
const MAX_LABEL_LENGTH = 40
const MAX_ID_LENGTH = 200

export class GraphSnapshotError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GraphSnapshotError'
  }
}

/**
 * What gets saved for a design: ids, positions and component settings.
 * UI state (selection, measured sizes, dragging) is left out.
 */
export function serializeGraph(nodes, edges) {
  return {
    v: SNAPSHOT_VERSION,
    nodes: nodes.map((n) => ({
      id: n.id,
      position: { x: n.position.x, y: n.position.y },
      data: { componentType: n.data.componentType, label: n.data.label, config: n.data.config },
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isId = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
const finiteOr = (value, fallback) => (Number.isFinite(value) ? value : fallback)

/**
 * Turns stored JSON back into editor nodes and edges. The input is untrusted
 * (it comes from the database or a share link), so everything is checked:
 * - a malformed structure throws GraphSnapshotError
 * - unknown component types and invalid connections are dropped
 * - settings are clamped to their valid ranges, labels trimmed
 */
export function deserializeGraph(raw) {
  if (!isObject(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
    throw new GraphSnapshotError('This design is damaged and cannot be opened.')
  }
  if (raw.nodes.length > MAX_NODES || raw.edges.length > MAX_EDGES) {
    throw new GraphSnapshotError('This design is too large to open.')
  }

  const nodes = []
  const nodeIds = new Set()
  for (const item of raw.nodes) {
    if (!isObject(item) || !isId(item.id) || !isObject(item.data)) {
      throw new GraphSnapshotError('This design is damaged and cannot be opened.')
    }
    const def = findComponentType(item.data.componentType)
    if (!def || nodeIds.has(item.id)) continue // unknown type, or a duplicate id
    nodeIds.add(item.id)
    const storedConfig = isObject(item.data.config) ? item.data.config : {}
    const config = Object.fromEntries(
      def.fields.map((f) => [f.key, clampFieldValue(f, storedConfig[f.key] ?? f.default)]),
    )
    const label = typeof item.data.label === 'string' ? item.data.label.trim().slice(0, MAX_LABEL_LENGTH) : ''
    nodes.push({
      id: item.id,
      type: 'component',
      position: { x: finiteOr(item.position?.x, 0), y: finiteOr(item.position?.y, 0) },
      data: { componentType: def.type, label: label || def.label, config },
    })
  }

  const edges = []
  const edgeIds = new Set()
  for (const item of raw.edges) {
    if (!isObject(item) || !isId(item.source) || !isId(item.target)) continue
    const base = isId(item.id) ? item.id : 'edge'
    let id = base
    for (let n = 1; edgeIds.has(id); n += 1) id = `${base}-${n}`
    const edge = { id, source: item.source, target: item.target }
    if (connectionError(edge, nodes, edges) === null) {
      edgeIds.add(id)
      edges.push(edge)
    }
  }

  return { nodes, edges }
}
