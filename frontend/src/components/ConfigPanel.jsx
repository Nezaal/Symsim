import { useShallow } from 'zustand/react/shallow'
import { useArchitectureStore } from '../store/architectureStore.js'
import NodeSettings from './NodeSettings.jsx'

/**
 * Right sidebar. Shows settings for exactly one selected component, and
 * bulk actions (duplicate / delete) for any selection.
 */
function ConfigPanel() {
  // useShallow: filter() returns a new array every time; compare its items instead.
  const selectedNodes = useArchitectureStore(useShallow((s) => s.nodes.filter((n) => n.selected)))
  const selectedEdgeCount = useArchitectureStore((s) => s.edges.filter((e) => e.selected).length)
  const duplicateSelected = useArchitectureStore((s) => s.duplicateSelected)
  const deleteSelected = useArchitectureStore((s) => s.deleteSelected)

  const hasSelection = selectedNodes.length > 0 || selectedEdgeCount > 0

  return (
    <aside aria-label="Configuration" className="flex w-72 shrink-0 flex-col border-l border-line bg-surface">
      <h2 className="px-3 pt-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
        Configuration
      </h2>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selectedNodes.length === 1 ? (
          // key: a different node gets a fresh form (no leftover drafts or errors).
          <NodeSettings key={selectedNodes[0].id} node={selectedNodes[0]} />
        ) : (
          <p className="text-sm text-ink-muted">{selectionMessage(selectedNodes.length, selectedEdgeCount)}</p>
        )}
      </div>

      {hasSelection && (
        <footer className="flex gap-2 border-t border-line p-3">
          {selectedNodes.length > 0 && (
            <button type="button" onClick={duplicateSelected} className={secondaryButton} title="Ctrl+D">
              Duplicate
            </button>
          )}
          <button type="button" onClick={deleteSelected} className={dangerButton} title="Delete">
            Delete
          </button>
        </footer>
      )}
    </aside>
  )
}

function selectionMessage(nodeCount, edgeCount) {
  if (nodeCount > 1) return `${nodeCount} components selected.`
  if (edgeCount > 0) return edgeCount === 1 ? 'Connection selected.' : `${edgeCount} connections selected.`
  return 'Select a component to edit its settings.'
}

const secondaryButton =
  'flex-1 rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:bg-surface-2'
const dangerButton =
  'flex-1 rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10'

export default ConfigPanel
