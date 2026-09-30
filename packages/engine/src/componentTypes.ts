/**
 * Component definitions: the single source of truth for the palette, the
 * settings panel, and the simulation engine.
 *
 * Units used by every field (documented once so the engine can rely on them):
 *   time        → milliseconds (ms)
 *   rates       → per second (req/s, ops/s)
 *   memory      → megabytes (MB)
 *   bandwidth   → megabits per second (Mbps)
 *   percentages → 0–100
 */

import { deepFreeze } from './freeze.ts'

export type ComponentTypeId =
  | 'client'
  | 'apiGateway'
  | 'loadBalancer'
  | 'appServer'
  | 'cache'
  | 'sqlDatabase'
  | 'nosqlDatabase'
  | 'messageQueue'
  | 'objectStorage'
  | 'cdn'

export type Category = 'traffic' | 'network' | 'compute' | 'data' | 'messaging'

export interface NumberField {
  readonly key: string
  readonly label: string
  readonly kind: 'number'
  readonly unit: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly default: number
}

export interface SelectOption {
  readonly value: string
  readonly label: string
}

export interface SelectField {
  readonly key: string
  readonly label: string
  readonly kind: 'select'
  readonly options: readonly SelectOption[]
  readonly default: string
}

export type FieldDef = NumberField | SelectField
export type ConfigValue = number | string
export type ComponentConfig = Readonly<Record<string, ConfigValue>>

export interface ComponentTypeDef {
  readonly type: ComponentTypeId
  readonly label: string
  readonly category: Category
  readonly description: string
  /** Can traffic flow into this component? */
  readonly acceptsInput: boolean
  /** Can traffic flow out of this component to another one? */
  readonly emitsOutput: boolean
  readonly fields: readonly FieldDef[]
  /** One-line summary shown on the canvas node. */
  readonly summary: (config: ComponentConfig) => string
}

// ── Field builders: keep the definitions below compact and readable ─────────

function num(
  key: string,
  label: string,
  min: number,
  max: number,
  defaultValue: number,
  { unit = '', step = 1 }: { unit?: string; step?: number } = {},
): NumberField {
  return { key, label, kind: 'number', unit, min, max, step, default: defaultValue }
}

function select(
  key: string,
  label: string,
  options: readonly SelectOption[],
  defaultValue: string,
): SelectField {
  return { key, label, kind: 'select', options, default: defaultValue }
}

const fmt = (value: ConfigValue | undefined): string =>
  typeof value === 'number' ? value.toLocaleString('en-US') : String(value ?? '')

// ── The 10 component types ───────────────────────────────────────────────────

const DEFINITIONS: ComponentTypeDef[] = [
  {
    type: 'client',
    label: 'Client',
    category: 'traffic',
    description: 'Generates synthetic requests. The entry point of every simulation.',
    acceptsInput: false,
    emitsOutput: true,
    fields: [
      num('requestsPerSecond', 'Requests per second', 1, 100_000, 100, { unit: 'req/s' }),
      select(
        'pattern',
        'Traffic pattern',
        [
          { value: 'constant', label: 'Constant' },
          { value: 'burst', label: 'Burst' },
          { value: 'ramp', label: 'Gradual ramp' },
        ],
        'constant',
      ),
      num('readPercent', 'Read share', 0, 100, 80, { unit: '%' }),
    ],
    summary: (c) => `${fmt(c.requestsPerSecond)} req/s · ${fmt(c.pattern)}`,
  },
  {
    type: 'apiGateway',
    label: 'API Gateway',
    category: 'network',
    description: 'Single front door: rate-limits requests and enforces timeouts.',
    acceptsInput: true,
    emitsOutput: true,
    fields: [
      num('rateLimitRps', 'Rate limit', 1, 100_000, 1000, { unit: 'req/s' }),
      num('latencyMs', 'Added latency', 0, 1000, 5, { unit: 'ms' }),
      num('timeoutMs', 'Timeout', 100, 60_000, 5000, { unit: 'ms', step: 100 }),
    ],
    summary: (c) => `limit ${fmt(c.rateLimitRps)} req/s`,
  },
  {
    type: 'loadBalancer',
    label: 'Load Balancer',
    category: 'network',
    description: 'Spreads requests across the components it connects to.',
    acceptsInput: true,
    emitsOutput: true,
    fields: [
      select(
        'strategy',
        'Strategy',
        [
          { value: 'round-robin', label: 'Round robin' },
          { value: 'least-connections', label: 'Least connections' },
          { value: 'random', label: 'Random' },
        ],
        'round-robin',
      ),
      num('maxConnections', 'Max connections', 1, 100_000, 10_000),
      num('latencyMs', 'Added latency', 0, 1000, 1, { unit: 'ms' }),
    ],
    summary: (c) => fmt(c.strategy),
  },
  {
    type: 'appServer',
    label: 'App Server',
    category: 'compute',
    description: 'Runs application logic. Limited by instances, concurrency and queue size.',
    acceptsInput: true,
    emitsOutput: true,
    fields: [
      num('instances', 'Instances', 1, 100, 2),
      num('cpuCores', 'CPU cores per instance', 1, 64, 2, { unit: 'cores' }),
      num('maxConcurrency', 'Max concurrent requests', 1, 10_000, 50),
      num('queueCapacity', 'Queue size', 0, 100_000, 100),
      num('serviceTimeMs', 'Processing time', 1, 10_000, 20, { unit: 'ms' }),
    ],
    summary: (c) => `${fmt(c.instances)} × ${fmt(c.cpuCores)} vCPU`,
  },
  {
    type: 'cache',
    label: 'Cache',
    category: 'data',
    description: 'In-memory key-value store (Redis-like). Hits skip the database.',
    acceptsInput: true,
    emitsOutput: true,
    fields: [
      num('memoryMb', 'Memory', 64, 65_536, 1024, { unit: 'MB', step: 64 }),
      num('hitRatePct', 'Expected hit rate', 0, 100, 80, { unit: '%' }),
      num('latencyMs', 'Latency', 0, 100, 1, { unit: 'ms' }),
      num('maxOpsPerSec', 'Max operations', 1, 1_000_000, 50_000, { unit: 'ops/s' }),
    ],
    summary: (c) => `${fmt(c.hitRatePct)}% hit · ${fmt(c.memoryMb)} MB`,
  },
  {
    type: 'sqlDatabase',
    label: 'Relational Database',
    category: 'data',
    description: 'SQL database with a connection pool and optional read replicas.',
    acceptsInput: true,
    emitsOutput: false,
    fields: [
      num('connectionPool', 'Connection pool', 1, 10_000, 100),
      num('readLatencyMs', 'Read latency', 1, 10_000, 10, { unit: 'ms' }),
      num('writeLatencyMs', 'Write latency', 1, 10_000, 25, { unit: 'ms' }),
      num('readReplicas', 'Read replicas', 0, 15, 0),
    ],
    summary: (c) => `pool ${fmt(c.connectionPool)} · ${fmt(c.readReplicas)} replicas`,
  },
  {
    type: 'nosqlDatabase',
    label: 'NoSQL Database',
    category: 'data',
    description: 'Partitioned document/key-value database that scales horizontally.',
    acceptsInput: true,
    emitsOutput: false,
    fields: [
      num('partitions', 'Partitions', 1, 1024, 4),
      num('readLatencyMs', 'Read latency', 1, 10_000, 5, { unit: 'ms' }),
      num('writeLatencyMs', 'Write latency', 1, 10_000, 8, { unit: 'ms' }),
      num('maxOpsPerSec', 'Max operations', 1, 1_000_000, 20_000, { unit: 'ops/s' }),
    ],
    summary: (c) => `${fmt(c.partitions)} partitions`,
  },
  {
    type: 'messageQueue',
    label: 'Message Queue',
    category: 'messaging',
    description: 'Buffers work between producers and consumers.',
    acceptsInput: true,
    emitsOutput: true,
    fields: [
      num('maxDepth', 'Max queue depth', 1, 1_000_000, 10_000),
      num('consumers', 'Consumers', 1, 1000, 4),
      num('latencyMs', 'Latency', 0, 1000, 2, { unit: 'ms' }),
    ],
    summary: (c) => `${fmt(c.consumers)} consumers`,
  },
  {
    type: 'objectStorage',
    label: 'Object Storage',
    category: 'data',
    description: 'S3-like blob storage for images, video and files.',
    acceptsInput: true,
    emitsOutput: false,
    fields: [
      num('bandwidthMbps', 'Bandwidth', 1, 100_000, 1000, { unit: 'Mbps' }),
      num('latencyMs', 'Latency', 1, 5000, 50, { unit: 'ms' }),
      num('maxRps', 'Max requests', 1, 100_000, 3500, { unit: 'req/s' }),
    ],
    summary: (c) => `${fmt(c.bandwidthMbps)} Mbps`,
  },
  {
    type: 'cdn',
    label: 'CDN',
    category: 'network',
    description: 'Edge cache close to users. Hits never reach your servers.',
    acceptsInput: true,
    emitsOutput: true,
    fields: [
      num('hitRatePct', 'Expected hit rate', 0, 100, 90, { unit: '%' }),
      num('edgeLatencyMs', 'Edge latency', 0, 1000, 15, { unit: 'ms' }),
      num('bandwidthMbps', 'Bandwidth', 1, 100_000, 10_000, { unit: 'Mbps' }),
    ],
    summary: (c) => `${fmt(c.hitRatePct)}% hit`,
  },
]

export const COMPONENT_TYPES: readonly ComponentTypeDef[] = deepFreeze(DEFINITIONS)

const BY_TYPE: ReadonlyMap<string, ComponentTypeDef> = new Map(
  COMPONENT_TYPES.map((def) => [def.type, def]),
)

/** Returns the definition, or undefined for an unknown type. */
export function findComponentType(type: string): ComponentTypeDef | undefined {
  return BY_TYPE.get(type)
}

/** Returns the definition, or throws for an unknown type. */
export function getComponentType(type: string): ComponentTypeDef {
  const def = findComponentType(type)
  if (!def) throw new Error(`Unknown component type: "${type}"`)
  return def
}

/** A fresh config object holding every field's default value. */
export function defaultConfig(type: string): Record<string, ConfigValue> {
  return Object.fromEntries(getComponentType(type).fields.map((f) => [f.key, f.default]))
}

function decimalPlaces(step: number): number {
  const text = String(step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return Number.NaN
}

/**
 * Coerces user input into a valid value for the field.
 * Numbers are clamped to [min, max] and snapped to the step grid (counted from
 * min); anything unparseable, or an unknown select option, becomes the default.
 */
export function clampFieldValue(field: FieldDef, value: unknown): ConfigValue {
  if (field.kind === 'select') {
    return field.options.some((o) => o.value === value) ? (value as string) : field.default
  }

  const n = toNumber(value)
  if (!Number.isFinite(n)) return field.default

  const clamped = Math.min(field.max, Math.max(field.min, n))
  const snapped = field.min + Math.round((clamped - field.min) / field.step) * field.step
  // toFixed removes float noise such as 99.95000000000002.
  const rounded = Number(snapped.toFixed(decimalPlaces(field.step)))
  return Math.min(field.max, rounded)
}

export function summarizeConfig(type: string, config: ComponentConfig): string {
  return getComponentType(type).summary(config)
}
