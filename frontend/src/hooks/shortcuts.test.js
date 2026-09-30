import { describe, expect, it } from 'vitest'
import { isTypingTarget, shortcutFor } from './shortcuts.js'

const press = (key, mods = {}, target = { tagName: 'DIV' }) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  target,
  ...mods,
})

describe('shortcutFor', () => {
  it('maps Ctrl/Cmd+Z to undo', () => {
    expect(shortcutFor(press('z', { ctrlKey: true }))).toBe('undo')
    expect(shortcutFor(press('z', { metaKey: true }))).toBe('undo')
  })

  it('maps Ctrl+Shift+Z and Ctrl+Y to redo', () => {
    expect(shortcutFor(press('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo')
    expect(shortcutFor(press('y', { ctrlKey: true }))).toBe('redo')
  })

  it('maps Ctrl+S to save', () => {
    expect(shortcutFor(press('s', { ctrlKey: true }))).toBe('save')
  })

  it('maps Ctrl+D to duplicate', () => {
    expect(shortcutFor(press('d', { ctrlKey: true }))).toBe('duplicate')
  })

  it('does not repeat duplicate while the key is held', () => {
    expect(shortcutFor(press('d', { ctrlKey: true, repeat: true }))).toBeNull()
    expect(shortcutFor(press('z', { ctrlKey: true, repeat: true }))).toBe('undo')
  })

  it('ignores AltGr combinations (reported as Ctrl+Alt on Windows)', () => {
    expect(shortcutFor(press('z', { ctrlKey: true, altKey: true }))).toBeNull()
  })

  it('is disabled while the canvas is hidden behind the results', () => {
    expect(shortcutFor(press('z', { ctrlKey: true }), { enabled: false })).toBeNull()
  })

  it('ignores keys without a modifier', () => {
    expect(shortcutFor(press('z'))).toBeNull()
  })

  it('ignores shortcuts while typing in a field', () => {
    expect(shortcutFor(press('z', { ctrlKey: true }, { tagName: 'INPUT' }))).toBeNull()
  })
})

describe('isTypingTarget', () => {
  it('detects inputs, selects, textareas and contenteditable', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
