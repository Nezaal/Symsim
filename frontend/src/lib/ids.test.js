import { describe, expect, it } from 'vitest'
import { randomId } from './ids.js'

describe('randomId', () => {
  it('returns unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => randomId()))
    expect(ids.size).toBe(100)
  })

  it('falls back to getRandomValues outside secure contexts', () => {
    const insecureCrypto = { getRandomValues: (arr) => globalThis.crypto.getRandomValues(arr) }
    expect(randomId(insecureCrypto)).toMatch(/^[0-9a-f]{32}$/)
  })
})
