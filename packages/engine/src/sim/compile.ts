import {
  clampFieldValue,
  findComponentType,
  type ComponentTypeId,
  type ConfigValue,
} from '../componentTypes.ts'
import { connectionError } from '../graphRules.ts'
import type {
  CompileResult,
  GraphInput,
  RunOptions,
  StationSpec,
  ValidationError,
} from './types.ts'

export const MAX_DURATION_SEC = 3600

/** Components that make no sense without somewhere to send traffic. */
const NEEDS_DOWNSTREAM: ReadonlySet<ComponentTypeId> = new Set<ComponentTypeId>([
  'client',
  'apiGateway',
  'loadBalancer',
  'messageQueue',
  'cdn',
])

/**
 * Validates the editor graph and turns it into a simulation model.
 * Collects every problem it finds (not just the first), each tied to a node
 * where possible so the UI can highlight it.
 */
export function compileSimulation(graph: GraphInput, options: RunOptions): CompileResult {
  const errors: ValidationError[] = [...validateOptions(options)]

  if (graph.nodes.length === 0) {
    return { ok: false, errors: [...errors, { message: 'The canvas is empty. Add a Client and some components.' }] }
  }

  const stations = new Map<string, StationSpec>()
  for (const node of graph.nodes) {
    const def = findComponentType(node.data.componentType)
    if (!def) {
      errors.push({ nodeId: node.id, message: `Unknown component type "${node.data.componentType}".` })
      continue
    }
    const config: Record<string, ConfigValue> = {}
    for (const field of def.fields) {
      config[field.key] = clampFieldValue(field, node.data.config?.[field.key] ?? field.default)
    }
    stations.set(node.id, {
      id: node.id,
      label: node.data.label || def.label,
      type: def.type,
      config,
      downstream: [],
    })
  }

  const downstream = new Map<string, string[]>()
  graph.edges.forEach((edge, index) => {
    const problem = connectionError(edge, graph.nodes, graph.edges.slice(0, index))
    if (problem) {
      errors.push({ nodeId: edge.source, message: problem })
      return
    }
    downstream.set(edge.source, [...(downstream.get(edge.source) ?? []), edge.target])
  })

  const specs = [...stations.values()].map((s) => ({ ...s, downstream: downstream.get(s.id) ?? [] }))

  if (!specs.some((s) => s.type === 'client')) {
    errors.push({ message: 'Add a Client: it generates the traffic for the simulation.' })
  }

  for (const spec of specs) {
    if (NEEDS_DOWNSTREAM.has(spec.type) && spec.downstream.length === 0) {
      errors.push({ nodeId: spec.id, message: `${spec.label} has nothing to send traffic to. Connect it to a component.` })
    }
  }

  const cycleNode = findCycle(specs)
  if (cycleNode) {
    errors.push({
      nodeId: cycleNode,
      message: 'Connections form a loop. Requests would circle forever, so remove one connection in the loop.',
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, model: { durationSec: options.durationSec, seed: options.seed, stations: specs } }
}

function validateOptions({ durationSec, seed }: RunOptions): ValidationError[] {
  const errors: ValidationError[] = []
  if (!Number.isInteger(durationSec) || durationSec < 1 || durationSec > MAX_DURATION_SEC) {
    errors.push({ message: `Duration must be a whole number of seconds between 1 and ${MAX_DURATION_SEC}.` })
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    errors.push({ message: 'Seed must be a whole number between 0 and 4294967295.' })
  }
  return errors
}

/** Returns a node on a cycle, or null. Iterative DFS (white/grey/black). */
function findCycle(specs: readonly StationSpec[]): string | null {
  const next = new Map(specs.map((s) => [s.id, s.downstream]))
  const state = new Map<string, 'visiting' | 'done'>()

  for (const start of specs) {
    if (state.has(start.id)) continue
    const stack: { id: string; childIndex: number }[] = [{ id: start.id, childIndex: 0 }]
    state.set(start.id, 'visiting')
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!
      const children = next.get(frame.id) ?? []
      const child = children[frame.childIndex]
      frame.childIndex += 1
      if (child === undefined) {
        state.set(frame.id, 'done')
        stack.pop()
      } else if (state.get(child) === 'visiting') {
        return child
      } else if (!state.has(child)) {
        state.set(child, 'visiting')
        stack.push({ id: child, childIndex: 0 })
      }
    }
  }
  return null
}
