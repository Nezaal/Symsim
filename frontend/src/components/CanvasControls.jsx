import { Panel, useReactFlow, useStore } from '@xyflow/react'
import { Map as MapIcon, Maximize, Minus, Plus, Redo2, Undo2 } from 'lucide-react'
import { useArchitectureStore } from '../store/architectureStore.js'

const ANIMATION = { duration: 150 }
const zoomSelector = (s) => s.transform[2] // transform = [x, y, zoom]

/**
 * Excalidraw-style bottom-left bar: zoom controls and undo/redo, side by side.
 * Replaces React Flow's default <Controls /> so everything matches our style.
 *
 * @param {{ minimapVisible: boolean, onToggleMinimap: () => void }} props
 */
function CanvasControls({ minimapVisible, onToggleMinimap }) {
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow()
  const zoom = useStore(zoomSelector)
  const canUndo = useArchitectureStore((s) => s.past.length > 0)
  const canRedo = useArchitectureStore((s) => s.future.length > 0)
  const undo = useArchitectureStore((s) => s.undo)
  const redo = useArchitectureStore((s) => s.redo)

  return (
    <Panel position="bottom-left" className="flex items-center gap-2">
      <div className={group}>
        <IconButton label="Zoom out" onClick={() => zoomOut(ANIMATION)}>
          <Minus size={16} aria-hidden="true" />
        </IconButton>
        <button
          type="button"
          onClick={() => zoomTo(1, ANIMATION)}
          title="Reset zoom to 100%"
          className="h-8 w-12 rounded-md text-xs tabular-nums text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="Zoom in" onClick={() => zoomIn(ANIMATION)}>
          <Plus size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Fit to screen" onClick={() => fitView({ ...ANIMATION, padding: 0.2, maxZoom: 1 })}>
          <Maximize size={15} aria-hidden="true" />
        </IconButton>
        <IconButton label="Minimap" onClick={onToggleMinimap} pressed={minimapVisible}>
          <MapIcon size={15} aria-hidden="true" />
        </IconButton>
      </div>

      <div className={group}>
        {/* aria-disabled, not disabled: clicking Undo right after typing first blurs the
            field, which commits the edit and makes undo possible mid-click. */}
        <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2 size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <Redo2 size={16} aria-hidden="true" />
        </IconButton>
      </div>
    </Panel>
  )
}

/** @param {{ label: string, onClick: () => void, disabled?: boolean, pressed?: boolean, children: React.ReactNode }} props */
function IconButton({ label, onClick, disabled = false, pressed, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-disabled={disabled}
      aria-pressed={pressed}
      title={label}
      className="flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-muted aria-pressed:bg-surface-2 aria-pressed:text-accent"
    >
      {children}
    </button>
  )
}

const group = 'flex items-center rounded-lg border border-line bg-surface p-0.5 shadow-md'

export default CanvasControls
