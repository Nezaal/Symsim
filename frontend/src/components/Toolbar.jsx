import TemplatesMenu from './TemplatesMenu.jsx'
import RunControls from './RunControls.jsx'

/** Slim top bar. Canvas tools (zoom, undo/redo) live on the canvas itself. */
function Toolbar() {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <h1 className="text-sm font-semibold tracking-tight">SystemSim</h1>
      <TemplatesMenu />
      <RunControls />
    </header>
  )
}

export default Toolbar
