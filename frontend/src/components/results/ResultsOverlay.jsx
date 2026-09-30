import { useEffect, useId, useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useSimulationStore } from '../../store/simulationStore.js'
import { useArchitectureStore } from '../../store/architectureStore.js'
import { useResultsStale } from '../../hooks/useResultsStale.js'
import { isTypingTarget } from '../../hooks/shortcuts.js'
import { formatMs, formatRps } from '../../lib/format.js'
import { SERIES } from '../../lib/vizTokens.js'
import RunControls from '../RunControls.jsx'
import TimeSeriesChart from './TimeSeriesChart.jsx'
import { KpiTiles, UtilizationList, Verdict } from './ResultPanels.jsx'

const STATUS_TEXT = {
  running: 'Running…',
  paused: 'Paused',
  done: 'Finished',
  stopped: 'Stopped',
  invalid: 'Fix these before running',
  error: 'Simulation error',
}

const LATENCY_SERIES = [
  { key: 'p50Ms', label: 'p50', color: SERIES[0] },
  { key: 'p95Ms', label: 'p95', color: SERIES[1] },
  { key: 'p99Ms', label: 'p99', color: SERIES[2] },
]
const THROUGHPUT_SERIES = [{ key: 'throughputRps', label: 'Throughput', color: SERIES[0] }]

/**
 * Full-page results view. Opens when a run starts and covers the whole app
 * (including the toolbar), so the charts get real space. Run controls are
 * repeated in its header. ✕ or Escape closes it; the toolbar's Results
 * button brings it back.
 */
function ResultsOverlay() {
  const { status, drawerOpen, closeDrawer, progress, windows, result, errors, errorMessage } = useSimulationStore(
    useShallow((s) => ({
      status: s.status,
      drawerOpen: s.drawerOpen,
      closeDrawer: s.closeDrawer,
      progress: s.progress,
      windows: s.windows,
      result: s.result,
      errors: s.errors,
      errorMessage: s.errorMessage,
    })),
  )
  const titleId = useId()
  const closeRef = useRef(null)
  useDialogBehavior(drawerOpen, closeDrawer, closeRef)

  if (!drawerOpen) return null

  const active = status === 'running' || status === 'paused'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="overlay-enter fixed inset-0 z-50 flex flex-col bg-canvas"
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <h2 id={titleId} className="text-sm font-semibold text-ink">
          Simulation results
        </h2>
        <span className="text-xs text-ink-muted" aria-live="polite">
          {STATUS_TEXT[status] ?? ''}
        </span>
        {progress && active && (
          <div
            className="h-1 w-48 rounded-full bg-line"
            role="progressbar"
            aria-label="Simulation progress"
            aria-valuenow={Math.round(progress.fraction * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-1 rounded-full bg-accent" style={{ width: `${progress.fraction * 100}%` }} />
          </div>
        )}
        <RunControls />
        <button
          ref={closeRef}
          type="button"
          onClick={closeDrawer}
          aria-label="Close results (Escape)"
          title="Close (Esc)"
          className="rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
          <StaleNotice status={status} />
          {status === 'invalid' && <ErrorList errors={errors} />}
          {status === 'error' && <p className="text-sm text-red-400">{errorMessage}</p>}
          {status !== 'invalid' && status !== 'error' && (
            <ResultsBody windows={windows} progress={progress} result={result} />
          )}
        </div>
      </div>
    </div>
  )
}

function ResultsBody({ windows, progress, result }) {
  const utilizationRows = useUtilizationRows(windows, result)

  if (windows.length === 0 && !result) {
    return <p className="text-sm text-ink-muted">Starting simulation…</p>
  }

  return (
    <>
      <KpiTiles totals={progress?.totals} result={result} />
      {result && <Verdict result={result} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-80">
          <TimeSeriesChart title="Throughput (successful req/s)" data={windows} series={THROUGHPUT_SERIES} formatValue={formatRps} />
        </Card>
        <Card className="h-80">
          <TimeSeriesChart title="Latency of successful requests" data={windows} series={LATENCY_SERIES} formatValue={formatMs} />
        </Card>
      </div>
      <Card>
        <UtilizationList rows={utilizationRows} />
      </Card>
    </>
  )
}

function Card({ className = '', children }) {
  return <section className={`flex flex-col rounded-lg border border-line bg-surface p-4 ${className}`}>{children}</section>
}

/**
 * Escape closes (unless typing in a field), focus moves into the dialog on
 * open and goes back to whatever was focused before when it closes.
 */
function useDialogBehavior(open, close, initialFocusRef) {
  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement
    initialFocusRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !isTypingTarget(event.target)) close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [open, close, initialFocusRef])
}

/** Final totals when finished, otherwise the latest one-second sample. */
function useUtilizationRows(windows, result) {
  // Only labels and types matter here; useShallow keeps node edits elsewhere from re-rendering.
  const nodeInfo = useArchitectureStore(
    useShallow((s) => Object.fromEntries(s.nodes.map((n) => [n.id, `${n.data.componentType}|${n.data.label}`]))),
  )
  const latest = windows[windows.length - 1]
  return useMemo(() => {
    if (result) {
      return result.stations
        .filter((s) => s.type !== 'client')
        .map((s) => ({ id: s.id, label: s.label, utilization: s.utilization }))
        .sort((a, b) => b.utilization - a.utilization)
    }
    if (!latest) return []
    const info = (id) => {
      const value = nodeInfo[id]
      const split = value ? value.indexOf('|') : -1
      return split === -1 ? { type: '', label: id } : { type: value.slice(0, split), label: value.slice(split + 1) }
    }
    return Object.entries(latest.stations)
      .filter(([id]) => info(id).type !== 'client')
      .map(([id, sample]) => ({ id, label: info(id).label, utilization: sample.utilization }))
      .sort((a, b) => b.utilization - a.utilization)
  }, [result, latest, nodeInfo])
}

/** Results describe the design as it was when the run started. */
function StaleNotice({ status }) {
  const stale = useResultsStale()
  if (!stale || status === 'running' || status === 'paused') return null
  return (
    <p className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-muted">
      You've changed the design since this run, so these results describe the earlier version. Press Run to update them.
    </p>
  )
}

function ErrorList({ errors }) {
  return (
    <ul className="list-disc space-y-1 rounded-lg border border-line bg-surface py-3 pl-8 pr-4 text-sm text-ink">
      {errors.map((e, i) => (
        <li key={`${e.nodeId ?? 'general'}-${i}`}>{e.message}</li>
      ))}
    </ul>
  )
}

export default ResultsOverlay
