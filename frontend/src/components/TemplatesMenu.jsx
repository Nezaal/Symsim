import { useEffect, useRef, useState } from 'react'
import { TEMPLATES } from '@systemsim/engine'
import { useLoadTemplate } from '../hooks/useLoadTemplate.js'
import { ghostButton } from '../lib/buttonStyles.js'

/**
 * Toolbar dropdown for loading a template at any time. Loading replaces the
 * canvas, but it's a normal undo step, so no confirmation dialog is needed.
 */
function TemplatesMenu() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const loadTemplate = useLoadTemplate()

  // Close on outside click or Escape, only while open.
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function pick(templateId) {
    loadTemplate(templateId)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={ghostButton}
      >
        Templates ▾
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 w-80 rounded-md border border-line bg-surface p-1 shadow-lg"
        >
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              role="menuitem"
              onClick={() => pick(template.id)}
              className="block w-full rounded px-3 py-2 text-left hover:bg-surface-2"
            >
              <span className="block text-sm text-ink">{template.name}</span>
              <span className="block text-xs text-ink-muted">{template.description}</span>
            </button>
          ))}
          <p className="border-t border-line px-3 pb-1 pt-2 text-xs text-ink-muted">
            Replaces the canvas. Undo with Ctrl+Z.
          </p>
        </div>
      )}
    </div>
  )
}

export default TemplatesMenu
