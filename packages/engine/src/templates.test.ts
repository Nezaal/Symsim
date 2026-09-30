import { describe, expect, it } from 'vitest'
import { clampFieldValue, getComponentType } from './componentTypes.ts'
import { connectionError } from './graphRules.ts'
import { TEMPLATES, findTemplate, getTemplate } from './templates.ts'

describe('TEMPLATES', () => {
  it('ships the basic web app starter', () => {
    const template = getTemplate('basic-web-app')
    expect(template.nodes.map((n) => n.componentType)).toEqual([
      'client',
      'apiGateway',
      'loadBalancer',
      'appServer',
      'sqlDatabase',
    ])
    expect(template.edges).toHaveLength(4)
  })

  it('is frozen', () => {
    expect(Object.isFrozen(TEMPLATES)).toBe(true)
    expect(Object.isFrozen(TEMPLATES[0]?.nodes)).toBe(true)
  })

  describe.each(TEMPLATES.map((t) => [t.id, t] as const))('%s', (_id, template) => {
    const graphNodes = template.nodes.map((n) => ({
      id: n.key,
      data: { componentType: n.componentType },
    }))

    it('has unique node keys', () => {
      const keys = template.nodes.map((n) => n.key)
      expect(new Set(keys).size).toBe(keys.length)
    })

    it('has exactly one client', () => {
      expect(template.nodes.filter((n) => n.componentType === 'client')).toHaveLength(1)
    })

    it('only contains connections the editor would allow', () => {
      template.edges.forEach(([source, target], index) => {
        const earlierEdges = template.edges.slice(0, index).map(([s, t]) => ({ source: s, target: t }))
        expect(connectionError({ source, target }, graphNodes, earlierEdges), `${source}→${target}`).toBeNull()
      })
    })

    it('only overrides real fields with in-range values', () => {
      for (const node of template.nodes) {
        const fields = getComponentType(node.componentType).fields
        for (const [key, value] of Object.entries(node.config ?? {})) {
          const field = fields.find((f) => f.key === key)
          expect(field, `${node.key}.${key}`).toBeDefined()
          if (field) expect(clampFieldValue(field, value), `${node.key}.${key}`).toBe(value)
        }
      }
    })
  })
})

describe('findTemplate / getTemplate', () => {
  it('returns undefined or throws for unknown ids', () => {
    expect(findTemplate('nope')).toBeUndefined()
    expect(() => getTemplate('nope')).toThrow(/Unknown template/)
  })
})
