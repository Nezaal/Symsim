import { describe, expect, it } from 'vitest'
import { parseNumberInput } from './parseNumberInput.js'

const field = { min: 1, max: 100 }

describe('parseNumberInput', () => {
  it('accepts numbers in range', () => {
    expect(parseNumberInput(field, ' 42 ')).toEqual({ value: 42, error: null })
  })

  it('accepts thousands separators, matching how values are displayed', () => {
    expect(parseNumberInput({ min: 1, max: 100_000 }, '1,024')).toEqual({ value: 1024, error: null })
  })

  it('rejects empty and non-numeric text', () => {
    expect(parseNumberInput(field, '')).toEqual({ value: null, error: 'Enter a number.' })
    expect(parseNumberInput(field, '12abc').error).toBe('Enter a number.')
  })

  it('returns the parsed value with an error when out of range', () => {
    expect(parseNumberInput(field, '9999')).toEqual({
      value: 9999,
      error: 'Must be between 1 and 100.',
    })
    expect(parseNumberInput(field, '0').error).toMatch(/between/)
  })
})
