import { useArchitectureStore } from '../store/architectureStore.js'
import { ghostButton } from '../lib/buttonStyles.js'
import TemplatesMenu from './TemplatesMenu.jsx'

/**
 * @param {{ onToggleMetrics: () => void }} props
 */
function Toolbar({ onToggleMetrics }) {
  const canUndo = useArchitectureStore((s) => s.past.length > 0)
  const canRedo = useArchitectureStore((s) => s.future.length > 0)
  const undo = useArchitectureStore((s) => s.undo)
  const redo = useArchitectureStore((s) => s.redo)

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
      <h1 className="text-sm font-semibold tracking-tight">SystemSim</h1>

      <div className="ml-4 flex items-center gap-1">
        <TemplatesMenu />
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        {/* aria-disabled, not disabled: clicking Undo right after typing first blurs the
            field, which commits the edit and makes undo possible mid-click. */}
        <button type="button" onClick={undo} aria-disabled={!canUndo} className={ghostButton} title="Undo (Ctrl+Z)">
          ↶ Undo
        </button>
        <button type="button" onClick={redo} aria-disabled={!canRedo} className={ghostButton} title="Redo (Ctrl+Shift+Z)">
          ↷ Redo
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onToggleMetrics} className={ghostButton}>
          Metrics
        </button>
        {/* Wired up in the engine phase, once the simulation runs in a Web Worker. */}
        <button
          type="button"
          disabled
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          ▶ Run
        </button>
      </div>
    </header>
  )
}

export default Toolbar
