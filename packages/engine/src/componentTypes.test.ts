import { describe, expect, it } from 'vitest'
import {
  COMPONENT_TYPES,
  clampFieldValue,
  defaultConfig,
  getComponentType,
  summarizeConfig,
  type NumberField,
  type SelectField,
} from './componentTypes.ts'

describe('COMPONENT_TYPES', () => {
  it('defines the ten component types from the spec', () => {
    expect(COMPONENT_TYPES.map((t) => t.type)).toEqual([
      'client',
      'apiGateway',
      'loadBalancer',
      'appServer',
      'cache',
      'sqlDatabase',
      'nosqlDatabase',
      'messageQueue',
      'objectStorage',
      'cdn',
    ])
  })

  it('has defaults that lie inside every field range', () => {
    for (const def of COMPONENT_TYPES) {
      for (const field of def.fields) {
        if (field.kind === 'number') {
          expect(field.default, `${def.type}.${field.key}`).toBeGreaterThanOrEqual(field.min)
          expect(field.default, `${def.type}.${field.key}`).toBeLessThanOrEqual(field.max)
        } else {
          expect(field.options.map((o) => o.value)).toContain(field.default)
        }
      }
    }
  })

  it('uses unique field keys within each type', () => {
    for (const def of COMPONENT_TYPES) {
      const keys = def.fields.map((f) => f.key)
      expect(new Set(keys).size, def.type).toBe(keys.length)
    }
  })

  it('is frozen so nothing can mutate the shared definitions', () => {
    expect(Object.isFrozen(COMPONENT_TYPES)).toBe(true)
    expect(Object.isFrozen(COMPONENT_TYPES[0]?.fields)).toBe(true)
  })
})

describe('getComponentType', () => {
  it('returns the definition for a known type', () => {
    expect(getComponentType('cache').label).toBe('Cache')
  })

  it('throws for an unknown type', () => {
    expect(() => getComponentType('mainframe')).toThrow(/Unknown component type/)
  })
})

describe('defaultConfig', () => {
  it('builds a config object from field defaults', () => {
    const config = defaultConfig('appServer')
    expect(config.instances).toBe(2)
    expect(Object.keys(config)).toEqual(getComponentType('appServer').fields.map((f) => f.key))
  })

  it('returns a fresh object each call', () => {
    expect(defaultConfig('cache')).not.toBe(defaultConfig('cache'))
  })
})

describe('clampFieldValue', () => {
  const field: NumberField = {
    key: 'n',
    label: 'N',
    kind: 'number',
    unit: '',
    min: 1,
    max: 10,
    step: 1,
    default: 5,
  }

  it('clamps numbers into range and rounds to the step', () => {
    expect(clampFieldValue(field, 0)).toBe(1)
    expect(clampFieldValue(field, 99)).toBe(10)
    expect(clampFieldValue(field, 3.6)).toBe(4)
  })

  it('falls back to the default for non-numeric input', () => {
    expect(clampFieldValue(field, Number.NaN)).toBe(5)
    expect(clampFieldValue(field, 'abc')).toBe(5)
  })

  it('keeps fractional steps precise', () => {
    const pct: NumberField = { ...field, min: 90, max: 100, step: 0.01, default: 99.9 }
    expect(clampFieldValue(pct, 99.999)).toBe(100)
    expect(clampFieldValue(pct, 99.951)).toBe(99.95)
  })

  it('only accepts listed options for select fields', () => {
    const select: SelectField = {
      key: 's',
      label: 'S',
      kind: 'select',
      default: 'a',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    }
    expect(clampFieldValue(select, 'b')).toBe('b')
    expect(clampFieldValue(select, 'z')).toBe('a')
  })
})

describe('summarizeConfig', () => {
  it('produces a short one-line summary for each type', () => {
    for (const def of COMPONENT_TYPES) {
      const summary = summarizeConfig(def.type, defaultConfig(def.type))
      expect(typeof summary).toBe('string')
      expect(summary.length).toBeGreaterThan(0)
    }
  })
})
