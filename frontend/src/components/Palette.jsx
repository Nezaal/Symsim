import { useCallback } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import { COMPONENT_TYPES } from '@systemsim/engine'
import { useArchitectureStore } from '../store/architectureStore.js'
import { CATEGORY_META, CATEGORY_ORDER, categoryColor } from '../lib/categories.js'
import { COMPONENT_DRAG_MIME } from '../lib/dragAndDrop.js'

const GROUPS = CATEGORY_ORDER.map((category) => ({
  category,
  types: COMPONENT_TYPES.filter((def) => def.category === category),
})).filter((group) => group.types.length > 0)

// Approximate node size, used to center click-added nodes.
const NODE_HALF_WIDTH = 88
const NODE_HALF_HEIGHT = 25
// Nudge each click-added node so repeated clicks don't stack exactly.
const CASCADE_STEP = 24
const CASCADE_COUNT = 5

function onDragStart(event, type) {
  event.dataTransfer.setData(COMPONENT_DRAG_MIME, type)
  event.dataTransfer.effectAllowed = 'move'
}

/**
 * Left sidebar listing the components you can add. Drag onto the canvas, or
 * click (or press Enter) to add at the center of the current view.
 * @param {{ open: boolean }} props
 */
function Palette({ open }) {
  const addNode = useArchitectureStore((s) => s.addNode)
  const nodeCount = useArchitectureStore((s) => s.nodes.length)
  const { getViewport } = useReactFlow()
  const paneWidth = useStore((s) => s.width)
  const paneHeight = useStore((s) => s.height)

  const addAtCenter = useCallback(
    (type) => {
      const { x, y, zoom } = getViewport()
      const nudge = (nodeCount % CASCADE_COUNT) * CASCADE_STEP
      addNode(type, {
        x: (paneWidth / 2 - x) / zoom - NODE_HALF_WIDTH + nudge,
        y: (paneHeight / 2 - y) / zoom - NODE_HALF_HEIGHT + nudge,
      })
    },
    [getViewport, addNode, nodeCount, paneWidth, paneHeight],
  )

  if (!open) return null

  return (
    <aside aria-label="Components" className="w-56 shrink-0 overflow-y-auto border-r border-line bg-surface p-3">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
        Components
      </h2>
      {GROUPS.map(({ category, types }) => (
        <section key={category} className="mb-4">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: categoryColor(category) }}
            />
            {CATEGORY_META[category].label}
          </h3>
          <ul className="space-y-1">
            {types.map((def) => (
              <li key={def.type}>
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => onDragStart(event, def.type)}
                  onClick={() => addAtCenter(def.type)}
                  title={def.description}
                  className="w-full cursor-grab rounded-md border border-line bg-surface-2 px-3 py-1.5 text-left text-sm hover:border-ink-muted active:cursor-grabbing"
                >
                  {def.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  )
}

export default Palette
