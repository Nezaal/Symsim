/**
 * Prebuilt starter architectures. Pure data: the editor turns a template into
 * real nodes/edges (with fresh ids) when a user loads it.
 *
 * Tests check every template against the same connection rules and field
 * ranges the editor enforces, so a template can never be invalid.
 */
import type { ComponentTypeId, ConfigValue } from './componentTypes.ts'
import { deepFreeze } from './freeze.ts'

export interface TemplateNode {
  /** Local name used by `edges`; replaced by a real id when loaded. */
  readonly key: string
  readonly componentType: ComponentTypeId
  /** Defaults to the component type's label. */
  readonly label?: string
  readonly position: { readonly x: number; readonly y: number }
  /** Only the fields that differ from the defaults. */
  readonly config?: Readonly<Record<string, ConfigValue>>
}

export interface ArchitectureTemplate {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly nodes: readonly TemplateNode[]
  /** [sourceKey, targetKey] pairs: traffic flows from source to target. */
  readonly edges: readonly (readonly [string, string])[]
}

/** Horizontal distance between columns: node width (176px) plus room for the arrow. */
const COLUMN = 240

const DEFINITIONS: ArchitectureTemplate[] = [
  {
    id: 'basic-web-app',
    name: 'Basic web app',
    description:
      'Users reach app servers through an API gateway and a load balancer; the app servers read and write one relational database.',
    nodes: [
      {
        key: 'users',
        componentType: 'client',
        label: 'Users',
        position: { x: 0, y: 0 },
        config: { requestsPerSecond: 200 },
      },
      { key: 'gateway', componentType: 'apiGateway', position: { x: COLUMN, y: 0 } },
      { key: 'lb', componentType: 'loadBalancer', position: { x: COLUMN * 2, y: 0 } },
      {
        key: 'app',
        componentType: 'appServer',
        label: 'App servers',
        position: { x: COLUMN * 3, y: 0 },
        config: { instances: 3 },
      },
      {
        key: 'db',
        componentType: 'sqlDatabase',
        label: 'Primary DB',
        position: { x: COLUMN * 4, y: 0 },
      },
    ],
    edges: [
      ['users', 'gateway'],
      ['gateway', 'lb'],
      ['lb', 'app'],
      ['app', 'db'],
    ],
  },
]

export const TEMPLATES: readonly ArchitectureTemplate[] = deepFreeze(DEFINITIONS)

export function findTemplate(id: string): ArchitectureTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

export function getTemplate(id: string): ArchitectureTemplate {
  const template = findTemplate(id)
  if (!template) throw new Error(`Unknown template: "${id}"`)
  return template
}
