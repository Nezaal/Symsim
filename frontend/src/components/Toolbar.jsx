/**
 * @param {{ onTogglePalette: () => void, onToggleMetrics: () => void }} props
 */
function Toolbar({ onTogglePalette, onToggleMetrics }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
      <button type="button" onClick={onTogglePalette} className={ghostButton} title="Toggle components">
        ☰
      </button>
      <h1 className="text-sm font-semibold tracking-tight">SystemSim</h1>

      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onToggleMetrics} className={ghostButton}>
          Metrics
        </button>
        {/* Wired up in milestone 5, once the simulation runs in a Web Worker. */}
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

const ghostButton =
  'rounded-md px-2 py-1.5 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink'

export default Toolbar
