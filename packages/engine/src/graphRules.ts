import { findComponentType } from './componentTypes.ts'

/** The minimum a node needs for the rules. React Flow nodes satisfy this. */
export interface GraphNodeLike {
  readonly id: string
  readonly data: { readonly componentType: string }
}

export interface GraphEdgeLike {
  readonly source: string
  readonly target: string
}

export interface ConnectionLike {
  readonly source: string | null
  readonly target: string | null
}

/**
 * Checks whether a new connection (source → target) is allowed.
 * Returns a human-readable reason when it is not, or null when it is valid.
 *
 * Lives in the engine (not the UI) so that saved or imported graphs can be
 * validated with exactly the same rules the editor enforces.
 */
export function connectionError(
  connection: ConnectionLike,
  nodes: readonly GraphNodeLike[],
  edges: readonly GraphEdgeLike[],
): string | null {
  const { source, target } = connection
  if (!source || !target) return 'Connection is missing an endpoint.'
  if (source === target) return 'A component cannot connect to itself.'

  const sourceNode = nodes.find((n) => n.id === source)
  const targetNode = nodes.find((n) => n.id === target)
  if (!sourceNode || !targetNode) return 'Unknown component in connection.'

  if (edges.some((e) => e.source === source && e.target === target)) {
    return 'These components are already connected.'
  }

  const sourceDef = findComponentType(sourceNode.data.componentType)
  const targetDef = findComponentType(targetNode.data.componentType)
  if (!sourceDef || !targetDef) return 'Unknown component type in connection.'

  if (!sourceDef.emitsOutput) return `${sourceDef.label} cannot send traffic onward.`
  if (!targetDef.acceptsInput) return `${targetDef.label} cannot receive traffic.`

  return null
}
