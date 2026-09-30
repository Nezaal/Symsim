import { describe, expect, it } from 'vitest'
import { Box } from 'lucide-react'
import { COMPONENT_TYPES } from '@systemsim/engine'
import { COMPONENT_ICONS, componentIcon } from './componentIcons.js'

describe('componentIcons', () => {
  it('has a distinct icon for every component type', () => {
    for (const def of COMPONENT_TYPES) {
      expect(COMPONENT_ICONS[def.type], def.type).toBeDefined()
    }
    const icons = COMPONENT_TYPES.map((def) => COMPONENT_ICONS[def.type])
    expect(new Set(icons).size).toBe(icons.length)
  })

  it('falls back to a generic icon for unknown types', () => {
    expect(componentIcon('mainframe')).toBe(Box)
  })
})
