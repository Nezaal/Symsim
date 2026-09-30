import { Panel } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { Copy, Trash2, X } from 'lucide-react'
import { getComponentType } from '@systemsim/engine'
import { useArchitectureStore } from '../store/architectureStore.js'
import { categoryColor } from '../lib/categories.js'
import ComponentIcon from './ComponentIcon.jsx'
import NodeSettings from './NodeSettings.jsx'

// When the minimap is shown (bottom-right), stop above it; otherwise use the full height.
const PANEL_STYLE_WITH_MINIMAP = { maxHeight: 'calc(100% - 12rem)' }
const PANEL_STYLE_FULL = { maxHeight: 'calc(100% - 2rem)' }

/**
 * Floating settings card in the canvas's top-right corner, the right-hand
 * twin of the ☰ menu. It has no open/closed state of its own: it's visible
 * exactly while at least one component is selected. Click empty canvas (or ✕)
 * to deselect and it disappears.
 *
 * @param {{ minimapVisible: boolean }} props
 */
function ConfigPanel({ minimapVisible }) {
  // useShallow: filter() returns a new array every time; compare its items instead.
  const selectedNodes = useArchitectureStore(useShallow((s) => s.nodes.filter((n) => n.selected)))
  const duplicateSelected = useArchitectureStore((s) => s.duplicateSelected)
  const deleteSelected = useArchitectureStore((s) => s.deleteSelected)
  const deselectAll = useArchitectureStore((s) => s.deselectAll)

  if (selectedNodes.length === 0) return null

  const single = selectedNodes.length === 1 ? selectedNodes[0] : null

  return (
    <Panel
      position="top-right"
      className="flex flex-col"
      style={minimapVisible ? PANEL_STYLE_WITH_MINIMAP : PANEL_STYLE_FULL}
    >
      <section
        aria-label="Configuration"
        className="nowheel flex min-h-0 w-72 flex-col rounded-lg border border-line bg-surface shadow-lg"
      >
        <header className="flex items-center gap-2 border-b border-line py-2 pl-3 pr-1.5">
          {single ? <SingleTitle node={single} /> : (
            <h2 className="flex-1 text-sm font-medium text-ink">
              {selectedNodes.length} components selected
            </h2>
          )}
          <button
            type="button"
            onClick={deselectAll}
            aria-label="Close settings"
            title="Close (click empty canvas)"
            className="rounded-md p-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        {single && (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {/* key: a different node gets a fresh form (no leftover drafts or errors). */}
            <NodeSettings key={single.id} node={single} />
          </div>
        )}

        <footer className="flex gap-1.5 border-t border-line p-2">
          <button type="button" onClick={duplicateSelected} className={secondaryButton} title="Ctrl+D">
            <Copy size={14} aria-hidden="true" /> Duplicate
          </button>
          <button type="button" onClick={deleteSelected} className={dangerButton} title="Delete">
            <Trash2 size={14} aria-hidden="true" /> Delete
          </button>
        </footer>
      </section>
    </Panel>
  )
}

/** @param {{ node: { data: { componentType: string } } }} props */
function SingleTitle({ node }) {
  const def = getComponentType(node.data.componentType)
  return (
    <h2 className="flex flex-1 items-center gap-2 text-sm font-medium text-ink">
      <ComponentIcon type={def.type} color={categoryColor(def.category)} />
      {def.label}
    </h2>
  )
}

const buttonBase =
  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm'
const secondaryButton = `${buttonBase} text-ink hover:bg-surface-2`
const dangerButton = `${buttonBase} text-red-400 hover:bg-red-500/10`

export default ConfigPanel
