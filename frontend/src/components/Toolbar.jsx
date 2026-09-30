import { Play } from 'lucide-react'
import TemplatesMenu from './TemplatesMenu.jsx'

/**
 * Slim top bar. Canvas tools (zoom, undo/redo) live on the canvas itself.
 * @param {{ onRun: () => void }} props
 */
function Toolbar({ onRun }) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <h1 className="text-sm font-semibold tracking-tight">SystemSim</h1>
      <TemplatesMenu />

      <button
        type="button"
        onClick={onRun}
        className="ml-auto flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
      >
        <Play size={14} aria-hidden="true" fill="currentColor" />
        Run
      </button>
    </header>
  )
}

export default Toolbar
