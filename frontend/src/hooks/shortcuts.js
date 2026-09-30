const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * True when the key press belongs to a text field, so the browser's own
 * undo/redo inside that field should win over the editor's shortcuts.
 * @param {EventTarget | null} target
 */
export function isTypingTarget(target) {
  return Boolean(target && (target.isContentEditable || TYPING_TAGS.has(target.tagName)))
}

/**
 * Maps a keydown event to an editor command.
 * @param {{ key: string, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean, altKey?: boolean, repeat?: boolean, target: EventTarget | null }} event
 * @param {{ enabled?: boolean }} [options] enabled: false while the canvas is hidden (results open)
 * @returns {'undo' | 'redo' | 'duplicate' | null}
 */
export function shortcutFor(event, { enabled = true } = {}) {
  if (!enabled || isTypingTarget(event.target)) return null
  if (!event.ctrlKey && !event.metaKey) return null // Ctrl on Windows/Linux, Cmd on macOS
  if (event.altKey) return null // AltGr arrives as Ctrl+Alt on Windows; it's for typing characters

  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo' // holding undo/redo to step repeatedly is fine
  if (key === 'y') return 'redo'
  if (key === 'd') return event.repeat ? null : 'duplicate' // but holding D would spray copies
  return null
}
