import { useEffect, useId, useState } from 'react'
import { Panel } from '@xyflow/react'
import { Menu, X } from 'lucide-react'
import { useArchitectureStore } from '../store/architectureStore.js'
import { isTypingTarget } from '../hooks/shortcuts.js'
import Palette from './Palette.jsx'

// Leave room at the bottom for React Flow's zoom controls (bottom-left).
const PANEL_STYLE = { maxHeight: 'calc(100% - 8rem)' }

/**
 * Excalidraw-style menu: a small ☰ button in the canvas corner that reveals
 * the component list right below it.
 *
 * Rendered inside <ReactFlow> as a <Panel>: panels float above the canvas but
 * outside its pan/zoom layer, so dragging or scrolling here never moves the view.
 *
 * Stays open until ☰ or Escape (so you can add several components in a row).
 * Starts open when the canvas is empty, to guide first-time users.
 */
function ComponentMenu() {
  const [open, setOpen] = useState(() => useArchitectureStore.getState().nodes.length === 0)
  const listId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !isTypingTarget(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <Panel position="top-left" className="flex flex-col" style={PANEL_STYLE}>
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-label="Components"
        aria-expanded={open}
        aria-controls={listId}
        title="Components"
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg border shadow-md hover:bg-surface-2 ${
          open ? 'border-accent bg-surface-2 text-ink' : 'border-line bg-surface text-ink-muted'
        }`}
      >
        {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
      </button>

      {open && (
        <div
          id={listId}
          className="nowheel mt-2 min-h-0 w-52 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-lg"
        >
          <Palette />
        </div>
      )}
    </Panel>
  )
}

export default ComponentMenu
