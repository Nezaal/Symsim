import { X } from 'lucide-react'

/**
 * Bottom drawer for live simulation results. Hidden (zero height) until the
 * user presses Run, so the canvas stays free; it slides up and the canvas
 * shrinks above it, so nothing on the canvas is covered.
 *
 * `inert` while closed keeps its buttons out of the Tab order.
 *
 * @param {{ open: boolean, onClose: () => void }} props
 */
function MetricsDrawer({ open, onClose }) {
  return (
    <section
      aria-label="Simulation results"
      inert={!open}
      className={`shrink-0 overflow-hidden bg-surface transition-[height] duration-200 ease-out ${
        open ? 'h-64 border-t border-line' : 'h-0'
      }`}
    >
      <header className="flex items-center justify-between px-3 pt-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-muted">Simulation</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close results"
          className="rounded-md p-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      {/* Placeholder until the simulation engine phase fills this with live charts. */}
      <div className="flex h-48 items-center justify-center">
        <p className="max-w-sm text-center text-sm text-ink-muted">
          The simulation engine is the next phase. Throughput, latency percentiles and
          bottlenecks will appear here when you press Run.
        </p>
      </div>
    </section>
  )
}

export default MetricsDrawer
