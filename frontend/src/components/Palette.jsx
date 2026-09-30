import { useCallback } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import { COMPONENT_TYPES } from '@systemsim/engine'
import { useArchitectureStore } from '../store/architectureStore.js'
import { CATEGORY_META, CATEGORY_ORDER, categoryColor } from '../lib/categories.js'
import { COMPONENT_DRAG_MIME } from '../lib/dragAndDrop.js'
import ComponentIcon from './ComponentIcon.jsx'

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
 * The list of components you can add, shown inside the floating ComponentMenu.
 * Drag a row onto the canvas, or click it (or press Enter) to add it at the
 * center of the current view.
 */
function Palette() {
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

  return (
    <div>
      {GROUPS.map(({ category, types }) => (
        <section key={category}>
          <h3 className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            {CATEGORY_META[category].label}
          </h3>
          <ul>
            {types.map((def) => (
              <li key={def.type}>
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => onDragStart(event, def.type)}
                  onClick={() => addAtCenter(def.type)}
                  title={def.description}
                  className="flex w-full cursor-grab items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-ink hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none active:cursor-grabbing"
                >
                  <ComponentIcon type={def.type} color={categoryColor(category)} />
                  {def.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default Palette
